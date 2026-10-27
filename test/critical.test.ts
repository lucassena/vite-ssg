import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getBeasties } from '../src/node/critical'

describe('critical CSS integration', () => {
  let root: string

  beforeEach(async () => {
    root = await fs.mkdtemp(join(tmpdir(), 'vite-ssg-critical-'))
    await fs.mkdir(join(root, 'assets'))
  })

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true })
  })

  it('isolates critical CSS across pages sharing one concurrent processor', async () => {
    const css = [
      ...Array.from({ length: 20 }, (_, index) => `.page-${index}{color:red}`),
      '.unused{display:none}',
    ].join('\n')
    await fs.writeFile(join(root, 'assets/app.css'), css)
    const processor = await getBeasties(root, { logLevel: 'silent' })
    expect(processor, 'critical CSS must not be silently skipped').toBeDefined()

    const outputs = await Promise.all(Array.from({ length: 20 }, (_, index) => processor!.process(
      `<!doctype html><html><head><link rel="stylesheet" href="/assets/app.css"></head><body class="page-${index}">Page ${index}</body></html>`,
    )))

    for (const [index, output] of outputs.entries()) {
      const dom = new JSDOM(output)
      try {
        const critical = [...dom.window.document.querySelectorAll('style')].map(style => style.textContent).join('\n')
        expect(critical.match(/\.page-\d+(?=\s*\{)/g), `page ${index}`).toEqual([`.page-${index}`])
        expect(critical).not.toContain('.unused')
      }
      finally {
        dom.window.close()
      }
    }
    expect(await fs.readFile(join(root, 'assets/app.css'), 'utf8')).toBe(css)
  })

  it('preserves fonts, custom-property keyframes, attribute entities, and asset URLs', async () => {
    const css = `
      @font-face{font-family:Sample;src:url('/assets/sample.woff2') format('woff2')}
      @keyframes pulse{from{opacity:0}to{opacity:1}}
      .used{font-family:Sample;--motion:pulse;animation:var(--motion) 1s;background:url('./image.svg?v=1#icon')}
      [data-value="a&b"]{border-color:blue}
      .unused{display:none}
    `
    await fs.writeFile(join(root, 'assets/app.css'), css)
    const processor = await getBeasties(root, { logLevel: 'silent' })
    expect(processor, 'critical CSS must not be silently skipped').toBeDefined()
    const output = await processor!.process(`<!doctype html><html><head>
      <link rel="stylesheet" href="/assets/app.css">
      <link rel="preload" as="font" href="/assets/sample.woff2" crossorigin>
      </head><body><div class="used" data-value="a&amp;b">Styled page</div></body></html>`)
    // Inert parsing avoids jsdom's CSSOM rejecting a valid '&' in an attribute selector.
    const document = JSDOM.fragment(output)
    const critical = [...document.querySelectorAll('style')].map(style => style.textContent).join('\n')
    expect(critical).toContain('.used{')
    expect(critical).not.toContain('.unused')
    expect(critical).toContain('@font-face')
    expect(critical).toContain('@keyframes pulse')
    expect(critical).toContain('[data-value="a&b"]')
    expect(critical).toContain('/assets/image.svg?v=1#icon')
    expect(document.querySelectorAll('link[rel="preload"][as="font"][href="/assets/sample.woff2"]')).toHaveLength(1)
    expect(document.querySelector('link[href="/assets/app.css"]')).not.toBeNull()
    expect(document.querySelector('.used')?.getAttribute('data-value')).toBe('a&b')
    expect(await fs.readFile(join(root, 'assets/app.css'), 'utf8')).toBe(css)
  })
})
