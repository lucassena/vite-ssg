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
const args = process.argv.slice(2)
const allowDirty = args.includes('--allow-dirty')
const paths = args.filter(value => value !== '--allow-dirty')
assert.ok(paths.length <= 1 && paths.every(value => !value.startsWith('--')), 'Invalid package arguments')
const output = resolve(paths[0] || join(root, 'release-output'))
const source = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
assert.match(source.version, /^\d+\.\d+\.\d+-fork\.\d+$/)
assert.equal(execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' }).trim(), root, 'Package from a Git checkout of this repository')
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: root, encoding: 'utf8' }).trim().length > 0
assert.ok(!dirty || allowDirty, 'Refusing to package a dirty checkout; --allow-dirty marks local previews only')
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
    'engines',
    'peerDependencies',
  ].map(key => [key, packed[key]]))
  manifest.sourceCommit = sourceCommit
  manifest.sourceDirty = dirty
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
    dirty,
    toolchain: { node: process.versions.node, zlib: process.versions.zlib, pnpm: execFileSync('pnpm', ['--version'], { cwd: root, encoding: 'utf8' }).trim() },
  }, null, 2)}\n`)
  console.log(JSON.stringify({ version: manifest.version, sourceCommit, artifact, sha256 }))
}
finally {
  rmSync(temporary, { recursive: true, force: true })
}
