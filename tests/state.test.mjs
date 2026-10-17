/**
 * Host-half tests: document storage, boot hint validation, boot injection and
 * route registration.
 *
 *   node tests/state.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  DEFAULT_BOOT,
  ROUTE_PREFIX,
  apply as applyHost,
  assetPath,
  assetsDir,
  bootInjections,
  documentFile,
  normalizeDocument,
  readDocument,
  resolveHarnessHome,
  saveAsset,
  sniffAsset,
  writeDocument,
} from '../lib/index.js'

function sampleDocument() {
  return {
    version: 1,
    boot: { light: '#fdf6e3', dark: '#2d353b', wallpaper: null },
    state: { version: 3, activeThemeId: 'everforest', themes: [{ id: 'everforest', name: 'Everforest' }] },
  }
}

test('a missing document file reads as null', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-theme-'))
  try {
    assert.equal(await readDocument({ DSH_HOME: home }), null)
    assert.equal(documentFile({ DSH_HOME: home }), join(home, 'theme-studio', 'theme.json'))
    assert.equal(resolveHarnessHome({ DSH_HOME: home }), home)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a document round-trips through the Host file', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-theme-'))
  try {
    const env = { DSH_HOME: home }
    const written = await writeDocument(sampleDocument(), env)
    assert.equal(written.boot.light, '#fdf6e3')
    assert.equal(written.state.activeThemeId, 'everforest')
    const loaded = await readDocument(env)
    assert.deepEqual(loaded, written)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('the envelope requires a state object and sanitizes the boot hint', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-theme-'))
  try {
    const env = { DSH_HOME: home }
    assert.equal(await writeDocument({ boot: { light: '#ffffff' } }, env), null)

    const normalized = normalizeDocument({
      boot: { light: 'red', dark: '#2d353b', wallpaper: { image: 'javascript:alert(1)' } },
      state: { version: 3 },
    })
    assert.equal(normalized.boot.light, DEFAULT_BOOT.light)
    assert.equal(normalized.boot.dark, '#2d353b')
    assert.equal(normalized.boot.wallpaper, null)

    const withWallpaper = normalizeDocument({
      boot: {
        light: '#fdf6e3',
        dark: '#2d353b',
        wallpaper: { image: 'https://example.com/a.png', blur: 999, brightness: 10, position: 'contain' },
      },
      state: { version: 3 },
    })
    assert.equal(withWallpaper.boot.wallpaper.blur, 40)
    assert.equal(withWallpaper.boot.wallpaper.brightness, 30)
    assert.equal(withWallpaper.boot.wallpaper.position, 'contain')
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('boot injections paint both backdrops and the wallpaper', () => {
  const plain = bootInjections(null)
  assert.equal(plain.length, 1)
  assert.match(plain[0].text, /html:not\(\[data-ts-ready\]\) body\{background-color:#fdf6e3\}/)
  assert.match(plain[0].text, /body\[data-ds-dark-theme\]\{background-color:#2d353b\}/)

  const withWallpaper = bootInjections(normalizeDocument({
    boot: {
      light: '#fdf6e3',
      dark: '#2d353b',
      wallpaper: { image: 'https://example.com/a.png', blur: 6, brightness: 80, position: 'cover' },
    },
    state: { version: 3 },
  }))
  assert.match(withWallpaper[0].text, /body::before\{/)
  assert.match(withWallpaper[0].text, /blur\(6px\) brightness\(80%\)/)
  assert.match(withWallpaper[0].text, /background-size:cover/)
})

test('asset sniffing recognizes images and audio', () => {
  assert.deepEqual(sniffAsset(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a])), { ext: 'png', mime: 'image/png' })
  assert.deepEqual(sniffAsset(Buffer.from('GIF89a')), { ext: 'gif', mime: 'image/gif' })
  assert.deepEqual(sniffAsset(Buffer.from('ID3xxxx', 'latin1')), { ext: 'mp3', mime: 'audio/mpeg' })
  assert.deepEqual(sniffAsset(Buffer.from('RIFF\u0000\u0000\u0000\u0000WAVE', 'latin1')), { ext: 'wav', mime: 'audio/wav' })
  assert.deepEqual(
    sniffAsset(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')),
    { ext: 'svg', mime: 'image/svg+xml' },
  )
  assert.equal(sniffAsset(Buffer.from('hello world')), null)
})

test('assets are stored under DSH_HOME and addressed by name', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-theme-'))
  try {
    const env = { DSH_HOME: home }
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    const saved = await saveAsset(png, env)
    assert.match(saved.name, /^[a-z0-9-]+\.png$/u)
    assert.equal(saved.url, `${ROUTE_PREFIX}/asset/${saved.name}`)
    assert.equal(assetsDir(env), join(home, 'theme-studio', 'assets'))

    const file = assetPath(saved.name, env)
    assert.ok(file !== null)
    assert.deepEqual(await readFile(file), png)

    assert.equal(assetPath('../evil.png', env), null)
    assert.equal(assetPath('bad name.png', env), null)
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})

test('a boot wallpaper may point at an uploaded asset', () => {
  const document = normalizeDocument({
    boot: {
      light: '#fdf6e3',
      dark: '#2d353b',
      wallpaper: { image: '/dsh-theme-studio/asset/abc123.png', blur: 0, brightness: 100, position: 'cover' },
    },
    state: { version: 3 },
  })
  assert.equal(document.boot.wallpaper.image, '/dsh-theme-studio/asset/abc123.png')
  assert.match(bootInjections(document)[0].text, /\/dsh-theme-studio\/asset\/abc123\.png/)
})

test('the Host half registers the route and the boot injection', async () => {
  // The boot injection reads the live document, which may already be customized
  // on the machine running the tests; point DSH_HOME at an empty directory so the
  // assertion is about defaults.
  const home = await mkdtemp(join(tmpdir(), 'dsh-theme-'))
  const previous = process.env.DSH_HOME
  process.env.DSH_HOME = home
  try {
    const listeners = []
    const routes = []
    const ctx = {
      on(name, callback) {
        listeners.push({ name, callback })
        return () => {}
      },
      inject(names, callback) {
        assert.ok(names.includes('webServer'))
        callback({
          get: (name) => name === 'webServer'
            ? { register: (route) => { routes.push(route); return () => {} } }
            : undefined,
          effect: (callback) => callback(),
        })
      },
    }

    applyHost(ctx)

    assert.equal(routes.length, 1)
    assert.equal(routes[0].kind, 'prefix')
    assert.equal(routes[0].path, ROUTE_PREFIX)

    const injector = listeners.find((listener) => listener.name === 'webserver/index-inject')
    assert.ok(injector, 'the Host half must contribute the boot injection')
    const table = []
    injector.callback(table)
    assert.equal(table.length, 1)
    assert.equal(table[0].kind, 'style')
    assert.match(table[0].text, /background-color:#fdf6e3/)
  } finally {
    if (previous === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previous
    await rm(home, { recursive: true, force: true })
  }
})
