import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = resolve(process.argv[2] || join(root, 'release-output'))
const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
assert.match(source.version, /^\d+\.\d+\.\d+-fork\.\d+$/)
assert.equal(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim(), root, 'Package from a Git checkout of this repository')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const timestamp = execFileSync('git', ['show', '-s', '--format=%ct', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
assert.ok(existsSync(join(root, 'dist/node.mjs')), 'Build the package before packaging a release')
const temporary = mkdtempSync(join(tmpdir(), 'vite-ssg-release-'))
try {
  const raw = join(temporary, 'raw')
  const stage = join(temporary, 'stage')
  mkdirSync(raw)
  mkdirSync(stage)
  execFileSync('pnpm', ['pack', '--pack-destination', raw], { cwd: root, stdio: 'pipe' })
  const archives = readdirSync(raw).filter(file => file.endsWith('.tgz'))
  assert.equal(archives.length, 1)
  execFileSync('tar', ['-xzf', join(raw, archives[0]), '-C', stage])
  const packageRoot = join(stage, 'package')
  const manifestPath = join(packageRoot, 'package.json')
  const packed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  assert.equal(packed.version, source.version)
  const manifest = Object.fromEntries([
    'name',
    'type',
    'version',
    'description',
    'author',
    'license',
    'funding',
    'homepage',
    'repository',
    'bugs',
    'sideEffects',
    'exports',
    'main',
    'module',
    'types',
    'typesVersions',
    'bin',
    'files',
    'peerDependenciesMeta',
    'dependencies',
  ].map(key => [key, packed[key]]))
  manifest.sourceCommit = sourceCommit
  // Preserve the tested runtime contract of the previous prebuilt distributions.
  manifest.engines = { node: '^20.19.0 || >=22.12.0' }
  manifest.peerDependencies = {
    'beasties': '^0.5.5',
    'prettier': '^3.3.0',
    'vite': '^7.3.1 || ^8.0.0',
    'vue': '>=3.5.18',
    'vue-router': '^4.0.1 || ^5.0.0',
  }
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`
  assert.ok(!/catalog:|workspace:/.test(serialized), 'All catalog ranges must be resolved')
  writeFileSync(manifestPath, serialized)
  for (const file of ['README.md', 'FORK.md', 'CONTRIBUTING.md', 'LICENSE', 'bin/vite-ssg.js'])
    assert.ok(existsSync(join(packageRoot, file)), `Missing package file: ${file}`)
  chmodSync(join(packageRoot, 'bin/vite-ssg.js'), 0o755)
  const tar = execFileSync('tar', [
    '--sort=name',
    `--mtime=@${timestamp}`,
    '--owner=0',
    '--group=0',
    '--numeric-owner',
    '--format=posix',
    '--pax-option=delete=atime,delete=ctime',
    '-cf',
    '-',
    '-C',
    stage,
    'package',
  ], { maxBuffer: 16 * 1024 * 1024 })
  const artifact = `vite-ssg-${manifest.version}.tgz`
  const bytes = gzipSync(tar, { level: 9 })
  const sha256 = createHash('sha256').update(bytes).digest('hex')
  mkdirSync(output, { recursive: true })
  writeFileSync(join(output, artifact), bytes)
  writeFileSync(join(output, 'SHA256SUMS'), `${sha256}  ${artifact}\n`)
  writeFileSync(join(output, 'release-manifest.json'), `${JSON.stringify({
    version: manifest.version,
    sourceCommit,
    artifact,
    sha256,
  }, null, 2)}\n`)
  console.log(JSON.stringify({ version: manifest.version, sourceCommit, artifact, sha256 }))
}
finally {
  rmSync(temporary, { recursive: true, force: true })
}
