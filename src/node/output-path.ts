import fs from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve, sep, win32 } from 'node:path'
import process from 'node:process'

function isContained(root: string, path: string) {
  const remainder = relative(root, path)
  return remainder !== '..' && !remainder.startsWith(`..${sep}`) && !isAbsolute(remainder)
}

export async function resolveOutputFile(out: string, filename: string, canonicalRoot?: string) {
  const normalized = filename.replace(/\\/g, '/')
  const root = resolve(out)
  const destination = resolve(root, normalized)
  const invalidPath = () => new Error(`Invalid output filename ${JSON.stringify(filename)}: must stay inside the output directory`)

  const hasWindowsAlias = normalized.split('/').some(part => part !== '.' && part !== '..' && /[. ]$/.test(part))
  if (!normalized || isAbsolute(normalized) || win32.isAbsolute(normalized)
    || (process.platform === 'win32' && normalized.includes(':'))
    || hasWindowsAlias || destination === root || !isContained(root, destination)) {
    throw invalidPath()
  }

  // Check existing filesystem aliases before mkdir can create anything outside out.
  let ancestor = destination
  while (true) {
    try {
      await fs.lstat(ancestor)
      break
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw error
      ancestor = dirname(ancestor)
    }
  }
  const realRoot = canonicalRoot ?? await fs.realpath(root)
  const realAncestor = ancestor === root ? realRoot : await fs.realpath(ancestor)
  if (!isContained(realRoot, realAncestor))
    throw invalidPath()
  const existing = await fs.stat(realAncestor)
  if (existing.isFile() && existing.nlink > 1)
    throw new Error(`Invalid output filename ${JSON.stringify(filename)}: hard-linked output files are not supported (link count: ${existing.nlink})`)

  return destination
}
