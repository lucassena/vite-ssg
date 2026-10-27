import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveOutputFile } from '../src/node/output-path'

describe('output destinations', () => {
  let sandbox: string
  let out: string

  beforeEach(async () => {
    sandbox = await fs.mkdtemp(join(tmpdir(), 'vite-ssg-path-'))
    out = join(sandbox, 'dist')
    await fs.mkdir(out)
  })

  afterEach(async () => {
    await fs.rm(sandbox, { recursive: true, force: true })
  })

  it.each([
    '../outside.html',
    'blog/../../outside.html',
    '..\\outside.html',
    'blog\\..\\..\\outside.html',
    '../dist-sibling/page.html',
    '/absolute.html',
    '//server/share/page.html',
    '\\\\server\\share\\page.html',
    'C:/outside.html',
    'C:\\outside.html',
    'pages/.. /outside.html',
    'pages./index.html',
    'page.html ',
    '\\\\?\\C:\\outside.html',
    '.',
    'pages/..',
    '',
  ])('rejects unsafe filename %j', async (filename) => {
    await expect(resolveOutputFile(out, filename)).rejects.toThrow('output directory')
  })

  it.each([
    ['index.html', 'index.html'],
    ['bairro/água-branca.html', 'bairro/água-branca.html'],
    ['nested/page/index.html', 'nested/page/index.html'],
    ['pages\\home.html', 'pages/home.html'],
    ['pages/../home.html', 'home.html'],
  ])('preserves relative filename %j', async (filename, expected) => {
    expect(await resolveOutputFile(out, filename)).toBe(resolve(out, expected))
  })

  it.runIf(process.platform === 'win32').each([
    'alias.html:payload',
    'alias.html:payload:$DATA',
    'alias.html::$DATA',
    'nested/alias.html:payload',
    'nested\\alias.html:payload',
    'nested:payload/page.html',
  ])('rejects Windows stream filename %j', async (filename) => {
    await expect(resolveOutputFile(out, filename)).rejects.toThrow('output directory')
  })

  it.runIf(process.platform === 'win32').each(['payload', 'payload:$DATA'])(
    'rejects a new NTFS stream %j on an externally hard-linked file',
    async (stream) => {
      const target = join(sandbox, 'outside.html')
      const alias = join(out, 'alias.html')
      await fs.writeFile(target, 'preserved')
      await fs.link(target, alias)
      expect((await fs.stat(target)).nlink).toBeGreaterThan(1)

      // Establish native stream support and that both names address the same file.
      await fs.writeFile(`${alias}:control`, 'stream control')
      expect(await fs.readFile(`${target}:control`, 'utf8')).toBe('stream control')
      await expect(fs.stat(`${target}:${stream}`)).rejects.toMatchObject({ code: 'ENOENT' })

      await expect(resolveOutputFile(out, `alias.html:${stream}`)).rejects.toThrow('output directory')
      expect(await fs.readFile(target, 'utf8')).toBe('preserved')
      await expect(fs.stat(`${target}:${stream}`)).rejects.toMatchObject({ code: 'ENOENT' })
    },
  )

  it.runIf(process.platform === 'win32')('rejects drive-relative filenames on Windows', async () => {
    await expect(resolveOutputFile(out, 'C:outside.html')).rejects.toThrow('output directory')
  })

  it.runIf(process.platform !== 'win32')('preserves drive-like colon filenames on POSIX', async () => {
    for (const filename of ['a:b.html', 'C:outside.html']) {
      const destination = await resolveOutputFile(out, filename)
      expect(destination).toBe(join(out, filename))
    }
  })

  it.runIf(process.platform !== 'win32')('preserves literal colon filenames on POSIX', async () => {
    await fs.mkdir(join(out, 'nested'))
    const filename = 'nested/page.html:payload'
    const destination = await resolveOutputFile(out, filename)
    expect(destination).toBe(join(out, filename))
    await fs.writeFile(destination, 'literal filename')
    expect(await fs.readFile(join(out, filename), 'utf8')).toBe('literal filename')
  })

  it('rejects an existing directory alias before creating directories outside output', async () => {
    await fs.symlink(sandbox, join(out, 'alias'), 'junction')
    await expect(resolveOutputFile(out, 'alias/new/page.html')).rejects.toThrow('output directory')
    await expect(fs.stat(join(sandbox, 'new'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects an existing file alias without overwriting its target', async () => {
    const target = join(sandbox, 'outside.html')
    await fs.writeFile(target, 'preserved')
    await fs.symlink(target, join(out, 'alias.html'), 'file')
    await expect(resolveOutputFile(out, 'alias.html')).rejects.toThrow('output directory')
    expect(await fs.readFile(target, 'utf8')).toBe('preserved')
  })

  it('fails closed for dangling file aliases', async () => {
    await fs.symlink(join(sandbox, 'missing.html'), join(out, 'alias.html'), 'file')
    await expect(resolveOutputFile(out, 'alias.html')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects hard-linked files without modifying another name for the same inode', async () => {
    const target = join(sandbox, 'outside.html')
    await fs.writeFile(target, 'preserved')
    await fs.link(target, join(out, 'alias.html'))
    await expect(resolveOutputFile(out, 'alias.html')).rejects.toThrow('hard-linked output files')
    expect(await fs.readFile(target, 'utf8')).toBe('preserved')
    await fs.symlink(join(out, 'alias.html'), join(out, 'indirect.html'), 'file')
    await expect(resolveOutputFile(out, 'indirect.html')).rejects.toThrow('hard-linked output files')
  })

  it('explains hard-link rejection even when both names are inside output', async () => {
    const target = join(out, 'original.html')
    await fs.writeFile(target, 'preserved')
    await fs.link(target, join(out, 'alias.html'))
    await expect(resolveOutputFile(out, 'alias.html')).rejects.toThrow('hard-linked output files are not supported (link count: 2)')
    expect(await fs.readFile(target, 'utf8')).toBe('preserved')
  })

  it('allows internal directory aliases and a symlinked output root', async () => {
    await fs.mkdir(join(out, 'pages'))
    await fs.symlink(join(out, 'pages'), join(out, 'alias'), 'junction')
    expect(await resolveOutputFile(out, 'alias/home.html')).toBe(join(out, 'alias/home.html'))
    const linkedRoot = join(sandbox, 'linked-dist')
    await fs.symlink(out, linkedRoot, 'junction')
    expect(await resolveOutputFile(linkedRoot, 'index.html')).toBe(join(linkedRoot, 'index.html'))
  })
})
