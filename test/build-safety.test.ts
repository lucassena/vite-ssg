import fs from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { build } from '../src/node/build'
import { renderPreloadLinks } from '../src/node/preload-links'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

async function withProject(run: (root: string) => Promise<void>, container = '<div id="app"></div>') {
  const root = await fs.mkdtemp(join(repositoryRoot, '.vite-ssg-regression-'))
  try {
    await fs.writeFile(join(root, 'index.html'), `<!doctype html><html><head></head><body>${container}<script type="module" src="/main.ts"></script></body></html>`)
    await fs.writeFile(join(root, 'main.ts'), `
      import { createSSRApp, h } from 'vue'
      export function createApp() {
        return { app: createSSRApp({ render: () => h('p', 'Rendered safely') }), initialState: {} }
      }
    `)
    await run(root)
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}

describe('build output safety', () => {
  it.each(['flat', 'nested'] as const)('rejects API route traversal in %s mode', async (dirStyle) => {
    await withProject(async (root) => {
      let finished = false
      await expect(build({
        includedRoutes: () => ['/blog/../../escaped'],
        dirStyle,
        beastiesOptions: false,
        onFinished: () => { finished = true },
      }, { root, configFile: false, logLevel: 'silent' })).rejects.toThrow('output directory')
      expect(finished).toBe(false)
      await expect(fs.stat(join(root, dirStyle === 'flat' ? 'escaped.html' : 'escaped'))).rejects.toMatchObject({ code: 'ENOENT' })
    })
  }, 30_000)

  it('validates the filename returned by an asynchronous callback', async () => {
    await withProject(async (root) => {
      await expect(build({
        htmlFileName: async () => '../escaped.html',
        beastiesOptions: false,
      }, { root, configFile: false, logLevel: 'silent' })).rejects.toThrow('output directory')
      await expect(fs.stat(join(root, 'escaped.html'))).rejects.toMatchObject({ code: 'ENOENT' })
    })
  }, 30_000)

  it('preserves valid root attributes and writes relative custom filenames', async () => {
    await withProject(async (root) => {
      await build({
        htmlFileName: async () => 'pages/home.html',
        beastiesOptions: false,
      }, { root, configFile: false, logLevel: 'silent' })
      const html = await fs.readFile(join(root, 'dist/pages/home.html'), 'utf8')
      const { document } = new JSDOM(html).window
      const container = document.querySelector('#app')!
      expect(container.hasAttribute('hidden')).toBe(true)
      expect(container.getAttribute('data-label')).toBe('a" & b')
      expect(container.getAttribute('data-server-rendered')).toBe('true')
      expect(container.textContent).toBe('Rendered safely')
    }, `<main id='app' hidden data-label='a" &amp; b'></main>`)
  }, 30_000)

  it('supports absolute callback filenames inside the output directory', async () => {
    await withProject(async (root) => {
      await build({
        htmlFileName: async file => join(root, 'dist/pages', file),
        beastiesOptions: false,
      }, { root, configFile: false, logLevel: 'silent' })
      expect(await fs.readFile(join(root, 'dist/pages/index.html'), 'utf8')).toContain('Rendered safely')
    })
  }, 30_000)

  it('propagates page errors to the build caller', async () => {
    await withProject(async (root) => {
      await expect(build({
        beastiesOptions: false,
        onPageRendered: () => { throw new Error('Page hook failed') },
      }, { root, configFile: false, logLevel: 'silent' })).rejects.toThrow('Page hook failed')
      await expect(fs.stat(join(root, '.vite-ssg-temp'))).rejects.toMatchObject({ code: 'ENOENT' })
    })
  }, 30_000)

  it('reports every failed route after all page tasks settle and cleans temporary files', async () => {
    await withProject(async (root) => {
      let successfulPageCompleted = false
      let finished = false
      const error = await build({
        includedRoutes: () => ['/first', '/ok', '/second'],
        concurrency: 2,
        beastiesOptions: false,
        onPageRendered: async (route) => {
          if (route !== '/ok')
            throw new Error(`Failure for ${route}`)
          await new Promise(resolve => setTimeout(resolve, 20))
          successfulPageCompleted = true
        },
        onFinished: () => { finished = true },
      }, { root, configFile: false, logLevel: 'silent' }).catch(error => error)

      expect(error).toBeInstanceOf(AggregateError)
      expect(error.message).toBe('[vite-ssg] Failed to render 2 pages: /first, /second')
      expect(error.errors).toHaveLength(2)
      expect(error.errors[0].message).toContain('Failure for /first')
      expect(error.errors[1].message).toContain('Failure for /second')
      expect(successfulPageCompleted).toBe(true)
      expect(finished).toBe(false)
      expect(await fs.readFile(join(root, 'dist/ok.html'), 'utf8')).toContain('Rendered safely')
      await expect(fs.stat(join(root, '.vite-ssg-temp'))).rejects.toMatchObject({ code: 'ENOENT' })
    })
  }, 30_000)
})

describe('preload links', () => {
  it.each([
    { media: 'print', disabled: false },
    { media: 'screen', disabled: false },
    { media: 'not all', disabled: false },
    { media: '', disabled: true },
    { media: 'all', disabled: true },
  ])('preserves an unconditional stylesheet alongside $media / disabled=$disabled', ({ media, disabled }) => {
    const { document } = new JSDOM('<head></head>').window
    const existing = document.createElement('link')
    existing.setAttribute('rel', 'stylesheet')
    existing.setAttribute('href', '/style.css')
    existing.setAttribute('media', media)
    if (disabled)
      existing.setAttribute('disabled', '')
    document.head.appendChild(existing)

    const manifest = { entry: ['/style.css'] }
    renderPreloadLinks(document, new Set(['entry']), manifest)
    renderPreloadLinks(document, new Set(['entry']), manifest)

    const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
    expect(links.length).toBe(2)
    expect(existing.parentElement === document.head).toBe(true)
    const generated = links.find(link => link !== existing)!
    expect(generated.getAttribute('href')).toBe('/style.css')
    expect(generated.hasAttribute('media')).toBe(false)
    expect(generated.hasAttribute('disabled')).toBe(false)
  })

  it.each(['Stylesheet', 'STYLESHEET', ' stylesheet '])('recognizes stylesheet relation %j', (rel) => {
    const { document } = new JSDOM('<head><link href="/style.css"></head>').window
    document.querySelector('link')!.setAttribute('rel', rel)
    renderPreloadLinks(document, new Set(['entry']), { entry: ['/style.css'] })
    expect(document.querySelectorAll('link').length).toBe(1)
  })

  it('preserves unconditional CSS alongside a mixed-case conditional stylesheet', () => {
    const { document } = new JSDOM('<head><link rel="StyleSheet" href="/style.css" media="print"></head>').window
    renderPreloadLinks(document, new Set(['entry']), { entry: ['/style.css'] })
    expect(document.querySelectorAll('link').length).toBe(2)
    expect(document.querySelectorAll('link')[1].hasAttribute('media')).toBe(false)
  })

  it('does not suppress unconditional CSS for alternate stylesheets', () => {
    const { document } = new JSDOM('<head><link rel="alternate stylesheet" href="/style.css" title="Alternative"></head>').window
    renderPreloadLinks(document, new Set(['entry']), { entry: ['/style.css'] })
    expect(document.querySelectorAll('link').length).toBe(2)
  })

  it('recognizes mixed-case modulepreload relations', () => {
    const { document } = new JSDOM('<head><link rel="ModulePreload" href="/app.js"></head>').window
    renderPreloadLinks(document, new Set(['entry']), { entry: ['/app.js'] })
    expect(document.querySelectorAll('link').length).toBe(1)
  })

  it.each(['', 'all', ' ALL '])('deduplicates enabled unconditional CSS with media=%j', (media) => {
    const { document } = new JSDOM('<head><link rel="stylesheet" href="/style.css"></head>').window
    document.querySelector('link')!.setAttribute('media', media)
    renderPreloadLinks(document, new Set(['entry']), { entry: ['/style.css'] })
    expect(document.querySelectorAll('link[rel="stylesheet"]').length).toBe(1)
  })

  it('deduplicates existing links by both href and relation without selector interpolation', () => {
    const file = `/assets/it's[quoted].js`
    const { document } = new JSDOM('<head></head>', { url: 'https://example.test' }).window
    for (const [rel, href] of [['modulepreload', file], ['stylesheet', '/style.css'], ['prefetch', '/other.js']]) {
      const link = document.createElement('link')
      link.setAttribute('rel', rel)
      link.setAttribute('href', href)
      document.head.appendChild(link)
    }
    const manifest = { entry: [file, '/style.css', '/other.js', '/new.css'], shared: [file, '/new.css'] }
    renderPreloadLinks(document, new Set(['entry', 'shared']), manifest)
    renderPreloadLinks(document, new Set(['entry']), manifest)
    const links = [...document.querySelectorAll('link')]
    expect(links.filter(link => link.getAttribute('href') === file)).toHaveLength(1)
    expect(links.filter(link => link.getAttribute('href') === '/style.css')).toHaveLength(1)
    expect(links.filter(link => link.getAttribute('href') === '/new.css')).toHaveLength(1)
    expect(links.filter(link => link.getAttribute('href') === '/other.js')).toHaveLength(2)
  })
})
