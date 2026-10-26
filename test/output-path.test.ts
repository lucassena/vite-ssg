import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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
    'C:outside.html',
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
    await expect(resolveOutputFile(out, 'alias.html')).rejects.toThrow('output directory')
    expect(await fs.readFile(target, 'utf8')).toBe('preserved')
    await fs.symlink(join(out, 'alias.html'), join(out, 'indirect.html'), 'file')
    await expect(resolveOutputFile(out, 'indirect.html')).rejects.toThrow('output directory')
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
