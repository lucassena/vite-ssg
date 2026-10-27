import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

it.skipIf(process.platform !== 'linux')('packages a complete runtime with source provenance and verified bytes', async () => {
  const output = await fs.mkdtemp(join(tmpdir(), 'vite-ssg-release-test-'))
  try {
    execFileSync(process.execPath, ['scripts/package-release.mjs', output], { cwd: root })
    const provenance = JSON.parse(await fs.readFile(join(output, 'release-manifest.json'), 'utf8'))
    const source = JSON.parse(await fs.readFile(join(root, 'package.json'), 'utf8'))
    expect(provenance.version).toBe(source.version)
    expect(provenance.sourceCommit).toBe(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim())
    const bytes = await fs.readFile(join(output, provenance.artifact))
    const digest = createHash('sha256').update(bytes).digest('hex')
    expect(provenance.sha256).toBe(digest)
    expect(await fs.readFile(join(output, 'SHA256SUMS'), 'utf8')).toBe(`${digest}  ${provenance.artifact}\n`)
    execFileSync('tar', ['-xzf', join(output, provenance.artifact), '-C', output])
    const repeated = join(output, 'repeated')
    execFileSync(process.execPath, ['scripts/package-release.mjs', repeated], { cwd: root })
    expect(await fs.readFile(join(repeated, provenance.artifact))).toEqual(bytes)
    const packedRoot = join(output, 'package')
    const manifest = JSON.parse(await fs.readFile(join(packedRoot, 'package.json'), 'utf8'))
    expect(manifest.version).toBe(source.version)
    expect(manifest.sourceCommit).toBe(provenance.sourceCommit)
    expect(manifest.scripts).toBeUndefined()
    expect(manifest.devDependencies).toBeUndefined()
    expect(JSON.stringify(manifest)).not.toMatch(/catalog:|workspace:/)
    expect(manifest.peerDependencies.vite).toBe('^7.3.1 || ^8.0.0')
    for (const file of ['README.md', 'FORK.md', 'CONTRIBUTING.md', 'LICENSE', manifest.main, manifest.types, manifest.bin['vite-ssg']])
      expect((await fs.stat(join(packedRoot, file))).isFile()).toBe(true)
    expect((await fs.stat(join(packedRoot, manifest.bin['vite-ssg']))).mode & 0o111).not.toBe(0)
    for (const file of await fs.readdir(join(packedRoot, 'dist'), { recursive: true })) {
      if (!file.endsWith('.mjs'))
        continue
      const full = join(packedRoot, 'dist', file)
      const code = await fs.readFile(full, 'utf8')
      for (const match of code.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g))
        expect((await fs.stat(resolve(dirname(full), match[1]))).isFile()).toBe(true)
    }
  }
  finally {
    await fs.rm(output, { recursive: true, force: true })
  }
}, 30_000)
