/**
 * Browser-half tests: loader artifact contract, the theme document model
 * (multi-theme, migration, tokens, copy lists, wallpaper) and a mount smoke
 * test that exercises a palette edit end to end.
 *
 *   node tests/client.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../client/client.js', import.meta.url), 'utf8')

/** Capture `window.__ModuleLoader__.load({ id, factory })`. */
let artifact
globalThis.window = {
  __ModuleLoader__: {
    load(definition) {
      artifact = definition
    },
  },
}
new Function(source)()

assert.equal(artifact.id, 'dsh-custom-theme', 'the artifact id must equal the package name')

/** The factory only needs the React hooks the bundle destructures. */
const reactStub = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (value) => [value, () => {}],
  useEffect: () => {},
  useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
}

const plugin = artifact.factory((seed) => {
  if (seed === 'react') return reactStub
  throw new Error(`unexpected loader seed ${seed}`)
})
const model = plugin.__model

test('exposes the cordis client-plugin contract', () => {
  assert.equal(plugin.name, 'dsh-custom-theme')
  assert.deepEqual(plugin.inject, ['slots', 'theme', 'locale'])
  assert.equal(typeof plugin.apply, 'function')
  assert.equal(model.THEME_VERSION, 3)
})

test('the default document carries one theme with the Codex palette', () => {
  const doc = model.normalizeDocument(model.defaultDocument())
  assert.equal(doc.version, 3)
  assert.equal(doc.themes.length, 1)
  assert.equal(doc.activeThemeId, doc.themes[0].id)
  const theme = model.activeTheme(doc)
  assert.equal(theme.light.accent, '#93b259')
  assert.equal(theme.light.surface, '#fdf6e3')
  assert.equal(theme.dark.surface, '#2d353b')
  assert.equal(theme.separateDark, true)
})

test('a v2 single-theme document migrates into the themes list', () => {
  const doc = model.normalizeDocument({
    version: 2,
    light: { accent: '#112233', surface: '#ffffff', ink: '#000000', contrast: 60 },
    dark: { accent: '#aabbcc', surface: '#101010', ink: '#eeeeee', contrast: 60 },
    separateDark: true,
    hero: { image: '', size: 44 },
    copy: { headline: '旧标题', preview: '', placeholderHero: '', placeholderDefault: '' },
  })
  assert.equal(doc.version, 3)
  assert.equal(doc.themes.length, 1)
  const theme = doc.themes[0]
  assert.equal(theme.light.accent, '#112233')
  assert.equal(theme.light.contrast, 60)
  assert.equal(theme.hero.size, 44)
  assert.deepEqual(theme.copy.headline, { mode: 'sequence', items: ['旧标题'] })
})

test('the Demiurge preset carries the Cyrene design and keeps a given wallpaper', () => {
  const themed = model.demiurgeTheme()
  assert.equal(themed.name, '德谬歌')
  assert.equal(themed.light.accent, '#e58bb4')
  assert.equal(themed.light.surface, '#fff7fc')
  assert.equal(themed.dark.surface, '#161020')
  assert.match(themed.hero.image, /^data:image\/svg\+xml;base64,/)
  assert.deepEqual(themed.copy.headline.items, ['德谬歌', '第十三泰坦', '忆海无垠，故事为舟'])
  assert.deepEqual(themed.copy.preview.items, ['第十三泰坦', '第十三种光彩'])
  assert.equal(themed.music.enabled, false)
  assert.equal(themed.music.volume, 45)
  assert.equal(themed.music.loop, true)

  // The preset must NOT replace a wallpaper the user already has.
  const wallpaper = {
    image: '/dsh-theme-studio/asset/abc123.png',
    strength: 100,
    panelOpacity: 100,
    blur: 5,
    brightness: 100,
    position: 'contain',
  }
  const withWallpaper = model.demiurgeTheme(wallpaper)
  assert.deepEqual(withWallpaper.background, wallpaper)
})

test('music settings normalize per theme', () => {
  const doc = model.normalizeDocument({
    version: 3,
    themes: [{
      id: 't',
      name: 'T',
      music: { src: '/dsh-theme-studio/asset/abc123.mp3', enabled: true, volume: 500, loop: false, pauseWhenHidden: false },
    }],
  })
  const music = doc.themes[0].music
  assert.equal(music.src, '/dsh-theme-studio/asset/abc123.mp3')
  assert.equal(music.enabled, true)
  assert.equal(music.volume, 100)
  assert.equal(music.loop, false)
  assert.equal(music.pauseWhenHidden, false)

  const invalid = model.normalizeDocument({
    version: 3,
    themes: [{ id: 't', name: 'T', music: { src: 'javascript:alert(1)', volume: 'x' } }],
  }).themes[0].music
  assert.equal(invalid.src, '')
  assert.equal(invalid.pauseWhenHidden, true, 'pause-when-minimized defaults on')
  assert.equal(invalid.volume, 45)
  assert.equal(invalid.enabled, false)
})

test('several themes keep unique ids and a valid active theme', () => {
  const doc = model.normalizeDocument({
    version: 3,
    activeThemeId: 'missing',
    themes: [
      { id: 'same', name: 'A', light: { accent: '#111111' } },
      { id: 'same', name: 'B' },
    ],
  })
  assert.equal(doc.themes.length, 2)
  assert.notEqual(doc.themes[0].id, doc.themes[1].id)
  assert.equal(doc.activeThemeId, doc.themes[0].id)
})

test('tokens follow the palette and the wallpaper visibility', () => {
  const theme = model.defaultTheme('t', 'T')
  const plain = model.buildTokens(theme)
  assert.deepEqual(plain['--dsw-alias-bg-base'], { light: '#fdf6e3', dark: '#2d353b' })
  assert.deepEqual(plain['--dsw-alias-brand-primary'], { light: '#93b259', dark: '#a7c080' })
  assert.equal(plain['--dsw-alias-border-l1'].light, 'rgba(92, 106, 114, 0.213)')

  const wallpapered = model.buildTokens({
    ...theme,
    background: { image: 'https://example.com/a.png', strength: 60, panelOpacity: 100, blur: 0, brightness: 100, position: 'cover' },
  })
  assert.match(wallpapered['--dsw-alias-bg-base'].light, /^rgba\(253, 246, 227, 0\.508\)$/)
  assert.match(wallpapered['--dsw-alias-bg-base'].dark, /^rgba\(45, 53, 59, 0\.508\)$/)
  // Elevated surfaces stay opaque by default, so a translucent page never makes
  // the settings panel / popovers translucent (no overlapping text).
  assert.equal(wallpapered['--dsw-alias-bg-layer-2'].light, '#f4eedc')
  assert.equal(wallpapered['--dsw-alias-bg-overlay'].light, '#fefbf2')
  // Text stays opaque over the wallpaper.
  assert.equal(wallpapered['--dsw-alias-label-primary'].light, '#5c6a72')
  // Secondary/paragraph text is pulled toward the ink while a wallpaper shows,
  // so pale grays stay readable.
  assert.notEqual(wallpapered['--dsw-alias-label-secondary'].light, plain['--dsw-alias-label-secondary'].light)
  assert.notEqual(wallpapered['--dsw-alias-label-tertiary'].light, plain['--dsw-alias-label-tertiary'].light)

  // The sub-interface opacity is a separate knob.
  const frosted = model.buildTokens({
    ...theme,
    background: { image: 'https://example.com/a.png', strength: 60, panelOpacity: 35, blur: 0, brightness: 100, position: 'cover' },
  })
  assert.match(frosted['--dsw-alias-bg-layer-2'].light, /^rgba\(244, 238, 220, 0\.35\)$/)
  assert.match(frosted['--dsw-alias-bg-base'].light, /^rgba\(253, 246, 227, 0\.508\)$/)
})

test('copy lists resolve in order or at random', () => {
  const theme = model.defaultTheme('t', 'T')
  theme.copy.headline = { mode: 'sequence', items: ['第一条', '第二条'] }
  theme.cursor.headline = 0

  const first = model.resolveCopy(theme, true, () => 0)
  assert.equal(first.values.headline, '第一条')
  assert.equal(first.cursors.headline, 1)

  const second = model.resolveCopy({ ...theme, cursor: first.cursors }, true, () => 0)
  assert.equal(second.values.headline, '第二条')
  assert.equal(second.cursors.headline, 0)

  const randomTheme = { ...theme, copy: { ...theme.copy, headline: { mode: 'random', items: ['A', 'B'] } } }
  const picked = model.resolveCopy(randomTheme, true, () => 0.75)
  assert.equal(picked.values.headline, 'B')
  assert.equal(picked.cursors.headline, 0, 'random mode leaves the sequential cursor alone')
})

test('copy rules and the wallpaper compile to scoped CSS', () => {
  const copyCss = model.buildCopyCss({ headline: '你好', preview: '', placeholderHero: '', placeholderDefault: '' })
  assert.match(copyCss, /--ts-copy-headline:"你好"/)
  assert.match(copyCss, /\[class\*="_titleGroup"\] > span:nth-child\(1\)/)
  assert.ok(!copyCss.includes('previewBadge'))
  assert.equal(model.buildCopyCss({ headline: '', preview: '', placeholderHero: '', placeholderDefault: '' }), '')

  const wallCss = model.buildWallpaperCss({ image: 'https://example.com/a.png', blur: 4, brightness: 90, position: 'contain' })
  assert.match(wallCss, /body::before\{content:""/)
  assert.match(wallCss, /background-size:contain/)
  assert.match(wallCss, /blur\(4px\) brightness\(90%\)/)
  assert.equal(model.buildWallpaperCss({ image: '' }), '')

  // With palettes the wallpaper gets a scheme-aware scrim so text keeps contrast.
  const theme = model.defaultTheme('t', 'T')
  const scrimmed = model.buildWallpaperCss(
    { image: 'https://example.com/a.png', strength: 80, blur: 0, brightness: 100, position: 'cover' },
    model.resolvePalettes(theme),
  )
  assert.match(scrimmed, /linear-gradient\(rgba\(253, 246, 227, 0\.4\d+\),rgba\(253, 246, 227, 0\.4\d+\)\),url\(/)
  assert.match(scrimmed, /body\[data-ds-dark-theme\]::before\{background-image:linear-gradient\(rgba\(45, 53, 59,/)
})

test('locale dictionaries are complete and agree between zh and en', () => {
  const { zh, en } = plugin.__locale
  const zhKeys = Object.keys(zh).sort()
  const enKeys = Object.keys(en).sort()
  assert.deepEqual(enKeys, zhKeys, 'zh and en must define the same keys')
  for (const key of [
    'copy.title.headline',
    'copy.title.preview',
    'copy.title.placeholderHero',
    'copy.title.placeholderDefault',
    'copy.showing',
    'image.pick',
    'image.busy',
    'image.error',
    'image.tooLarge',
    'image.local',
    'asset.pick',
    'asset.uploading',
    'asset.failed',
    'asset.localHint',
    'presets.label',
    'presets.demiurge',
    'group.music',
    'music.enabled',
    'music.file',
    'music.pick',
    'music.volume',
    'music.loop',
    'nav',
    'reset',
  ]) {
    assert.ok(Object.prototype.hasOwnProperty.call(zh, key), `missing zh ${key}`)
  }
  // The copy titles used to render as raw keys because these were absent.
  assert.equal(zh['copy.title.headline'], '首屏标题')
  assert.notEqual(zh['copy.title.placeholderHero'], 'copy.title.placeholderHero')
})

test('local image references survive document normalization', () => {
  const dataUrl = 'data:image/webp;base64,AAAA'
  const doc = model.normalizeDocument({
    version: 3,
    themes: [{
      id: 't',
      name: 'T',
      background: { image: dataUrl, strength: 50, blur: 2, brightness: 90, position: 'cover' },
      hero: { image: dataUrl, size: 40 },
    }],
  })
  assert.equal(doc.themes[0].background.image, dataUrl)
  assert.equal(doc.themes[0].background.panelOpacity, 100, 'sub-interface opacity defaults to opaque')
  assert.equal(doc.themes[0].hero.image, dataUrl)
  assert.equal(model.buildBootHint(doc.themes[0]).wallpaper.image, dataUrl)

  // Same-origin asset URLs (uploaded files) are valid image references too.
  const assetDoc = model.normalizeDocument({
    version: 3,
    themes: [{
      id: 't',
      name: 'T',
      background: { image: '/dsh-theme-studio/asset/abc123.png' },
      hero: { image: '/dsh-theme-studio/asset/abc123.png' },
    }],
  })
  assert.equal(assetDoc.themes[0].background.image, '/dsh-theme-studio/asset/abc123.png')
  assert.equal(model.buildBootHint(assetDoc.themes[0]).wallpaper.image, '/dsh-theme-studio/asset/abc123.png')
})

test('the boot hint carries the backdrop colors and the wallpaper', () => {
  const theme = model.defaultTheme('t', 'T')
  const plain = model.buildBootHint(theme)
  assert.deepEqual(plain, { light: '#fdf6e3', dark: '#2d353b', wallpaper: null })

  const wallpapered = model.buildBootHint({
    ...theme,
    background: { image: 'https://example.com/a.png', strength: 40, blur: 8, brightness: 80, position: 'cover' },
  })
  assert.deepEqual(wallpapered.wallpaper, {
    image: 'https://example.com/a.png',
    blur: 8,
    brightness: 80,
    position: 'cover',
    scrim: {
      light: 'rgba(253, 246, 227, 0.28)',
      dark: 'rgba(45, 53, 59, 0.28)',
    },
  })
})

test('preset themes adopt updated preset designs while keeping user edits', () => {
  const design = model.presetDesign('demiurge')
  const base = JSON.parse(JSON.stringify(design))
  // Pretend the previous preset shipped an older hero and an older surface.
  base.hero = { image: 'https://example.com/old.svg', size: 20 }
  base.light = { ...base.light, surface: '#000000' }

  const theme = model.demiurgeTheme()
  theme.preset = 'demiurge'
  theme.presetVersion = 0
  theme.presetBase = base
  theme.hero = { image: 'https://example.com/old.svg', size: 20 }
  theme.light = { ...base.light, accent: '#123456' }

  const doc = model.normalizeDocument({ version: 3, activeThemeId: theme.id, themes: [theme] })
  const synced = doc.themes[0]
  assert.equal(synced.presetVersion, model.PRESET_VERSION)
  // Untouched fields follow the new preset design…
  assert.deepEqual(synced.hero, design.hero)
  assert.equal(synced.light.surface, design.light.surface)
  // …while the field the user changed survives.
  assert.equal(synced.light.accent, '#123456')

  // A theme that predates preset linking is adopted by its preset name.
  const adopted = model.normalizeDocument({
    version: 3,
    themes: [{ id: 'legacy', name: '德谬歌', light: { accent: '#abcdef' } }],
  }).themes[0]
  assert.equal(adopted.preset, 'demiurge')
  assert.equal(adopted.presetVersion, model.PRESET_VERSION)
  assert.equal(adopted.light.accent, '#abcdef')
})

test('the wallpaper scrim is configurable per theme', () => {
  const theme = model.defaultTheme('t', 'T')
  const palettes = model.resolvePalettes(theme)

  const off = model.normalizeDocument({
    version: 3,
    themes: [{
      id: 't',
      name: 'T',
      background: { image: 'https://example.com/a.png', strength: 80, scrim: 0 },
    }],
  }).themes[0]
  assert.equal(off.background.scrim, 0)
  const offCss = model.buildWallpaperCss(off.background, palettes)
  assert.match(offCss, /url\("https:\/\/example\.com\/a\.png"\)/)
  assert.ok(!offCss.includes('linear-gradient'), 'scrim 0 disables the veil')
  assert.equal(model.buildBootHint(off).wallpaper.scrim, null)

  const clamped = model.normalizeDocument({
    version: 3,
    themes: [{ id: 't', name: 'T', background: { image: 'https://example.com/a.png', scrim: 500 } }],
  }).themes[0]
  assert.equal(clamped.background.scrim, 150)

  const strong = model.normalizeDocument({
    version: 3,
    themes: [{
      id: 't',
      name: 'T',
      background: { image: 'https://example.com/a.png', strength: 60, scrim: 150 },
    }],
  }).themes[0]
  const strongCss = model.buildWallpaperCss(strong.background, palettes)
  assert.match(strongCss, /linear-gradient\(rgba\(253, 246, 227, 0\.54\),/)
  assert.match(model.buildBootHint(strong).wallpaper.scrim.light, /^rgba\(253, 246, 227, 0\.54\)$/)
})

test('copy lists drop blank lines but keep the new-line placeholder', () => {
  const doc = model.normalizeDocument({
    version: 3,
    themes: [{
      id: 't',
      name: 'T',
      copy: { headline: { mode: 'sequence', items: ['甲', '新文案', '   ', '乙'] } },
    }],
  })
  // Adding a line used to insert "", which normalization silently dropped — the
  // editor now adds a real placeholder value so the row persists.
  assert.deepEqual(doc.themes[0].copy.headline.items, ['甲', '新文案', '乙'])
})

test('wallpaper CSS is reused while unchanged and refreshed when a knob changes', () => {
  const palettes = model.resolvePalettes(model.defaultTheme('t', 'T'))
  const background = { image: 'https://example.com/w.png', strength: 80, panelOpacity: 100, scrim: 100, blur: 0, brightness: 100, position: 'cover' }
  const first = model.buildWallpaperCss(background, palettes)
  const again = model.buildWallpaperCss({ ...background }, palettes)
  assert.equal(first, again)

  const off = model.buildWallpaperCss({ ...background, scrim: 0 }, palettes)
  assert.notEqual(off, first)
  assert.ok(!off.includes('linear-gradient'))
})

test('themes remember which agent presets activate them', () => {
  const doc = model.normalizeDocument({
    version: 3,
    themes: [
      { id: 'a', name: 'A', presets: [' Standard ', 'standard', 'wonderland-lua-builder', ''] },
      { id: 'b', name: 'B' },
    ],
  })
  assert.deepEqual(doc.themes[0].presets, ['Standard', 'wonderland-lua-builder'])
  assert.deepEqual(doc.themes[1].presets, [])

  // Matching is case-insensitive and ignores themes that claim no preset.
  assert.equal(model.themeForAgentPreset(doc, 'WONDERLAND-LUA-BUILDER').id, 'a')
  assert.equal(model.themeForAgentPreset(doc, 'cordis'), null)
  assert.equal(model.themeForAgentPreset(doc, ''), null)

  // Links survive a round-trip through the editor state.
  const links = model.normalizePresetLinks('one, two；three  one')
  assert.deepEqual(links, ['one', 'two', 'three'])
  assert.deepEqual(model.normalizePresetLinks(undefined), [])

  // Checkbox toggling adds/removes one id and keeps the rest in order.
  assert.deepEqual(model.togglePresetLink(['a'], 'B'), ['a', 'B'])
  assert.deepEqual(model.togglePresetLink(['a', 'b'], 'A'), ['b'])
  assert.equal(model.presetLinkLabel([{ id: 'a', name: 'Alpha' }], 'a'), 'Alpha')
  assert.equal(model.presetLinkLabel([], 'zzz'), 'zzz')
})

test('narrow viewports make only the sidebar opaque over the wallpaper', () => {
  const theme = model.defaultTheme('t', 'T')
  const palettes = model.resolvePalettes(theme)
  assert.equal(model.buildMobileSurfaceCss({ image: '' }, palettes), '')

  const css = model.buildMobileSurfaceCss({ image: 'https://example.com/a.png' }, palettes)
  assert.match(css, /@media \(max-width: 1023px\)/)
  assert.match(css, /--dsw-specific-sidebar-fill:rgba\([^)]+, 0\.94\) !important/)
  assert.match(css, /body\[data-ds-dark-theme\]\{/)
  // The page background keeps the wallpaper: no base/layer override.
  assert.ok(!css.includes('--dsw-alias-bg-base'))
  assert.ok(!css.includes('--dsw-alias-bg-layer-1'))
})

test('the bundled complete preset is offered next to the built-in designs', () => {
  const ids = model.PRESETS.map((preset) => preset.id)
  assert.ok(ids.includes('demiurge'), 'the basic design stays available')
  assert.ok(ids.includes('demiurge-complete'), 'the bundled complete preset is offered')
})

test('mounts, registers the page and applies palette edits immediately', async () => {
  const elements = []
  globalThis.document = {
    createElement: (tag) => ({ tagName: tag, dataset: {}, textContent: "", remove() {} }),
    head: { appendChild: (element) => elements.push(element) },
    documentElement: { attributes: {}, setAttribute(name) { this.attributes[name] = ""; } },
  }
  globalThis.fetch = async (url) => {
    if (String(url).includes("/preset/demiurge-complete")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          preset: {
            name: "德谬歌·完整",
            light: { accent: "#e58bb4", surface: "#fff7fc", ink: "#4a3a57", contrast: 100 },
            background: { image: "data:image/webp;base64,AAAA", strength: 100, blur: 5, position: "cover" },
            hero: { image: "", size: 96 },
            copy: { headline: { mode: "sequence", items: ["德谬歌"] } },
            presets: ["chat"],
          },
        }),
      }
    }
    return { ok: false, status: 404, json: async () => ({ ok: false, error: "missing" }) }
  }

  const injections = []
  const overrides = []
  const ctx = {
    locale: { register: () => () => {}, bind: () => (key) => key },
    theme: {
      getTheme: () => ({ preference: "light", revision: 0 }),
      overrideTokens: (sourceName, tokens) => {
        overrides.push({ sourceName, tokens })
        return () => {}
      },
      setTheme: () => {},
    },
    slots: {
      inject: (name, callback) => {
        injections.push(name)
        if (name === "settings.section") callback()
        return () => {}
      },
      register: () => () => {},
    },
    on: () => () => {},
    effect: (callback) => {
      const cleanup = callback()
      return typeof cleanup === "function" ? cleanup : undefined
    },
  }

  plugin.apply(ctx)
  await new Promise((resolve) => setImmediate(resolve))

  assert.ok(injections.includes("settings.section"), 'the settings page must be contributed')
  assert.ok(overrides.length > 0, 'the default palette must paint even offline')
  assert.equal(overrides.at(-1).tokens["--dsw-alias-brand-primary"].light, "#93b259")

  // Editing the accent must repaint from local state (the old bug let a save
  // round-trip revert it).
  plugin.__edit((doc) => ({
    ...doc,
    themes: doc.themes.map((theme) => theme.id === doc.activeThemeId
      ? { ...theme, light: { ...theme.light, accent: "#ff0000" } }
      : theme),
  }))
  assert.equal(plugin.__stores.viewStore.get().doc.themes[0].light.accent, "#ff0000")
  assert.equal(overrides.at(-1).tokens["--dsw-alias-brand-primary"].light, "#ff0000")

  // Theme operations: add, switch, delete.
  plugin.__themeOps.addTheme()
  const withNew = plugin.__stores.viewStore.get().doc
  assert.equal(withNew.themes.length, 2)
  assert.equal(withNew.activeThemeId, withNew.themes[1].id)
  plugin.__themeOps.setActiveTheme(withNew.themes[0].id)
  assert.equal(plugin.__stores.viewStore.get().doc.activeThemeId, withNew.themes[0].id)
  plugin.__themeOps.removeTheme(withNew.themes[1].id)
  assert.equal(plugin.__stores.viewStore.get().doc.themes.length, 1)

  // Session-scoped watchers run the Agent-preset projection.
  assert.ok(injections.includes('conversation.input.dock'), 'the composer dock must host the preset watcher')
  assert.ok(injections.includes('conversation.hero.options'), 'the hero options row must host the preset watcher')

  // A Session switching to a linked Agent preset activates its theme.
  plugin.__edit((doc) => ({
    ...doc,
    themes: doc.themes.concat([{ ...doc.themes[0], id: 'agent-theme', name: 'Agent theme', presets: ['standard'] }]),
  }))
  plugin.__agentPresets.applyAgentPreset('STANDARD')
  assert.equal(plugin.__stores.viewStore.get().doc.activeThemeId, 'agent-theme')
  assert.equal(plugin.__stores.agentPresetStore.get(), 'STANDARD')
  // An unclaimed preset keeps whatever theme the user chose.
  plugin.__agentPresets.applyAgentPreset('ptc')
  assert.equal(plugin.__stores.viewStore.get().doc.activeThemeId, 'agent-theme')

  // The bundled complete preset is downloaded through the Host route and lands
  // as an independent theme (no design sync, wallpaper included).
  const beforeComplete = plugin.__stores.viewStore.get().doc.themes.length
  await plugin.__themeOps.addPreset('demiurge-complete')
  const withComplete = plugin.__stores.viewStore.get().doc
  assert.equal(withComplete.themes.length, beforeComplete + 1)
  const complete = withComplete.themes.find((item) => item.name === '德谬歌·完整')
  assert.ok(complete, 'the bundled preset must add a theme')
  assert.equal(complete.background.image, 'data:image/webp;base64,AAAA')
  assert.equal(complete.light.contrast, 100)
  assert.deepEqual(complete.presets, ['chat'])
  assert.equal(complete.preset, null, 'the bundled preset does not join design sync')
})
