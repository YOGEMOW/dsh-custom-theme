/**
 * Rebuild `presets/demiurge-complete.json` from the maintainer's live theme.
 *
 * The wallpaper travels inside the theme document as a data URL; the hero
 * artwork is the downscaled `presets/demiurge-hero.webp` (640x640). Regenerate
 * that file from the original artwork before running this script; it is not
 * committed as a separate image because the JSON embeds it.
 *
 *   node scripts/build-complete-preset.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('..', import.meta.url))
const themeFile = join(process.env.USERPROFILE ?? homedir(), '.dsh', 'theme-studio', 'theme.json')
const heroFile = join(repo, 'presets', 'demiurge-hero.webp')
const outFile = join(repo, 'presets', 'demiurge-complete.json')

const raw = JSON.parse(readFileSync(themeFile, 'utf8'))
const theme = raw.state.themes.find((item) => item.name === '德谬歌')
if (theme === undefined) throw new Error('the live document has no 德谬歌 theme')
if (typeof theme.background.image !== 'string' || !theme.background.image.startsWith('data:image/')) {
  throw new Error('the 德谬歌 theme must carry its wallpaper as a data URL')
}

const hero = readFileSync(heroFile)
const heroUrl = `data:image/webp;base64,${hero.toString('base64')}`

const preset = {
  name: '德谬歌·完整',
  light: theme.light,
  dark: theme.dark,
  separateDark: theme.separateDark !== false,
  background: theme.background,
  hero: { image: heroUrl, size: theme.hero.size },
  copy: theme.copy,
  cursor: { headline: 0, preview: 0, placeholderHero: 0, placeholderDefault: 0 },
  music: { src: '', enabled: false, volume: 45, loop: true, pauseWhenHidden: true },
  presets: Array.isArray(theme.presets) ? [...theme.presets] : [],
}

writeFileSync(outFile, `${JSON.stringify(preset, null, 2)}\n`, 'utf8')
console.log(
  'demiurge-complete.json',
  JSON.stringify(preset).length,
  'bytes; wallpaper',
  preset.background.image.length,
  'hero',
  heroUrl.length,
  'presets',
  preset.presets.join(','),
)
