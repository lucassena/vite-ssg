import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import process from 'node:process'

const output = resolve(process.argv[2] || 'release-output')
const viteVersion = process.argv[3]
assert.ok(['7.3.7', '8.3.5'].includes(viteVersion), 'Choose a tested Vite version')
const provenance = JSON.parse(readFileSync(join(output, 'release-manifest.json'), 'utf8'))
assert.equal(provenance.dirty, false, 'Test a clean release artifact')
const archive = join(output, provenance.artifact)
assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'), provenance.sha256)
const fixture = mkdtempSync(join(tmpdir(), 'vite-ssg-installed-'))
const env = { ...process.env, NODE_PATH: '' }
function run(args, timeout = 180_000) {
  return execFileSync('pnpm', args, {
    cwd: fixture,
    env,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    stdio: 'pipe',
  })
}
try {
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({
    name: 'installed-release-smoke',
    private: true,
    type: 'module',
    packageManager: 'pnpm@10.28.2',
    dependencies: {
      'vite-ssg': `file:${archive}`,
      'vite': viteVersion,
      'vue': '3.5.27',
      'vue-router': '5.0.2',
      '@unhead/vue': '3.4.3',
      'beasties': '0.5.5',
    },
  }, null, 2))
  writeFileSync(join(fixture, '.npmrc'), `${[
    'strict-peer-dependencies=true',
    'engine-strict=true',
    'ignore-scripts=true',
    'link-workspace-packages=false',
    'node-linker=isolated',
    'enable-global-virtual-store=false',
  ].join('\n')}\n`)
  writeFileSync(join(fixture, 'index.html'), '<!doctype html><html><head></head><body><div id="app"></div><script type="module" src="/main.ts"></script></body></html>')
  writeFileSync(join(fixture, 'main.ts'), [
    'import { h } from \'vue\'',
    'import { RouterView } from \'vue-router\'',
    'import { useHead } from \'@unhead/vue\'',
    'import { ViteSSG } from \'vite-ssg\'',
    'import \'./style.css\'',
    'const Root = { setup() { useHead({ title: \'Installed artifact\', meta: [{ name: \'description\', content: \'Packed SSR metadata\' }] }); return () => h(RouterView) } }',
    'const routes = [\'/\', \'/about\'].map(path => ({ path, component: { render: () => h(\'h1\', { class: \'page-title\' }, path === \'/\' ? \'Packed home\' : \'Packed about\') } }))',
    'export const createApp = ViteSSG(Root, { routes }, ({ initialState }) => { initialState.packed = true })',
  ].join('\n'))
  writeFileSync(join(fixture, 'style.css'), '.page-title { color: red } .not-rendered { color: blue }')
  run(['install', '--prod'])
  const installed = realpathSync(join(fixture, 'node_modules/vite-ssg'))
  assert.ok(installed.startsWith(realpathSync(fixture) + sep), 'Resolve the installed tarball, never a workspace link')
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
  assert.equal(manifest.version, provenance.version)
  assert.equal(manifest.sourceCommit, provenance.sourceCommit)
  assert.equal(manifest.sourceDirty, false)
  const vite = JSON.parse(readFileSync(join(fixture, 'node_modules/vite/package.json'), 'utf8'))
  assert.equal(vite.version, viteVersion)
  assert.equal(manifest.scripts, undefined)
  assert.equal(manifest.devDependencies, undefined)
  const log = run(['exec', 'vite-ssg', 'build'], 120_000).toString()
  assert.ok(log.includes('Critical CSS generation enabled'), 'Use the installed Beasties peer')
  for (const [file, text] of [['index.html', 'Packed home'], ['about.html', 'Packed about']]) {
    const html = readFileSync(join(fixture, 'dist', file), 'utf8')
    assert.ok(html.includes(text), 'Render route content from the installed runtime')
    assert.match(html, /<title>Installed artifact<\/title>/)
    assert.ok(html.includes('Packed SSR metadata'), 'Render metadata through Unhead')
    assert.match(html, /<style[^>]*>[\s\S]*\.page-title[\s\S]*?<\/style>/)
    assert.ok(html.includes('data-server-rendered'), 'Retain the hydration marker')
    assert.ok(html.includes('packed'), 'Serialize the initial state')
  }
  assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'), provenance.sha256)
  console.log(JSON.stringify({ vite: vite.version, package: manifest.version, routes: 2, installedTarball: true, criticalCss: true }))
}
finally {
  rmSync(fixture, { recursive: true, force: true })
}
