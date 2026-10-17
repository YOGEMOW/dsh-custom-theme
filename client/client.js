/**
 * DSH 自定义主题 — browser half.
 *
 * Everything theme-shaped lives here:
 *
 *  - a document of named themes (create / switch / rename / delete),
 *  - palette → DSH token derivation, applied through `theme.overrideTokens`
 *    (a layer, so it survives the shipped theme preference adoption),
 *  - copy lists per field (several lines, shown in order or at random),
 *  - hero artwork and a page wallpaper with visibility / blur / brightness.
 *
 * The Host half only stores this document (`/dsh-theme-studio/document`) and
 * pre-paints `boot` (backdrop colors + wallpaper) before first paint, so a
 * theme feature never needs a Host restart.
 *
 * Two deliberate choices:
 *
 *  - Tokens are derived locally on every edit, so a save round-trip can never
 *    revert what the user just picked (and the theme still paints when the
 *    document route is unavailable).
 *  - Hero artwork uses the `conversation.hero.brand.mark` slot; copy uses CSS
 *    `content` overrides on the nodes the shipped UI renders, and degrades to
 *    the shipped copy when a selector stops matching.
 */
window.__ModuleLoader__.load({ id: "dsh-custom-theme", factory: (require) => {
  const module = { exports: {} };
  const exports = module.exports;
  Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

  const React = require("react");
  const h = React.createElement;
  const { useState, useRef, useEffect, useSyncExternalStore } = React;

  /** Route prefix owned by the Host half. */
  const ROUTE = "/dsh-theme-studio";
  /** Token-layer identity: one layer per source, later calls replace it. */
  const SOURCE = "dsh-custom-theme";
  /** Locale namespace owned by this package. */
  const NS = "theme-studio";
  /** Marks that the saved palette has taken over from the boot-time style. */
  const READY_ATTR = "data-ts-ready";
  /** Document schema this half writes. */
  const THEME_VERSION = 3;

  /* ------------------------------------------------------------------ *
   * Colour helpers
   * ------------------------------------------------------------------ */

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isHex(value) {
    return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);
  }

  function parseHex(value) {
    if (typeof value !== "string") return null;
    const raw = value.trim().replace(/^#/, "");
    const full = raw.length === 3 ? raw[0] + raw[0] + raw[1] + raw[1] + raw[2] + raw[2] : raw;
    if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
    return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
  }

  function formatHex(rgb) {
    let out = "#";
    for (let i = 0; i < 3; i += 1) out += Math.max(0, Math.min(255, Math.round(rgb[i]))).toString(16).padStart(2, "0");
    return out;
  }

  function mix(from, to, ratio) {
    const a = parseHex(from);
    const b = parseHex(to);
    if (a === null || b === null) return isHex(from) ? from : "#000000";
    const t = Math.max(0, Math.min(1, ratio));
    return formatHex([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
  }

  function alpha(hex, value) {
    const rgb = parseHex(hex);
    if (rgb === null) return hex;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${Number(Math.max(0, Math.min(1, value)).toFixed(3))})`;
  }

  /** Hex while fully opaque, rgba once the wallpaper shows through. */
  function withOpacity(hex, opacity) {
    return opacity >= 0.999 ? hex : alpha(hex, opacity);
  }

  function rgbToHsl(hex) {
    const rgb = parseHex(hex);
    if (rgb === null) return { h: 0, s: 0, l: 0.5 };
    const [r, g, b] = rgb.map((channel) => channel / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return { h: 0, s: 0, l };
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let hue;
    if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) hue = ((b - r) / d + 2) / 6;
    else hue = ((r - g) / d + 4) / 6;
    return { h: hue * 360, s, l };
  }

  function hslToHex(hue, s, l) {
    const h2 = ((hue % 360) + 360) % 360;
    const sat = clamp(s, 0, 1);
    const light = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const x = c * (1 - Math.abs(((h2 / 60) % 2) - 1));
    const m = light - c / 2;
    let rgb;
    if (h2 < 60) rgb = [c, x, 0];
    else if (h2 < 120) rgb = [x, c, 0];
    else if (h2 < 180) rgb = [0, c, x];
    else if (h2 < 240) rgb = [0, x, c];
    else if (h2 < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];
    return formatHex(rgb.map((channel) => (channel + m) * 255));
  }

  function relight(hex, lightness, saturationCap) {
    if (!isHex(hex)) return hex;
    const hsl = rgbToHsl(hex);
    return hslToHex(hsl.h, saturationCap === undefined ? hsl.s : Math.min(hsl.s, saturationCap), clamp(lightness, 0, 1));
  }

  function readColor(value, fallback) {
    return isHex(value) ? value.trim() : fallback;
  }

  /** Same-origin asset names the Host serves from `<DSH_HOME>/theme-studio/assets`. */
  const ASSET_PATH = /^\/dsh-theme-studio\/asset\/[a-z0-9][a-z0-9-]{4,80}\.(?:png|jpe?g|webp|gif|svg|mp3|wav|ogg|m4a|flac)$/u;

  function sanitizeImageUrl(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (trimmed === "") return "";
    if (ASSET_PATH.test(trimmed)) return trimmed;
    if (/^data:image\/(?:png|jpe?g|webp|gif|avif|svg\+xml);base64,[A-Za-z0-9+/=]+$/u.test(trimmed)) {
      return trimmed.length <= 3_000_000 ? trimmed : "";
    }
    try {
      const url = new URL(trimmed);
      if (url.protocol === "https:" || url.protocol === "http:") return trimmed.slice(0, 2000);
    } catch {
      /* not a URL */
    }
    return "";
  }

  function sanitizeAudioUrl(value) {
    if (typeof value !== "string") return "";
    const trimmed = value.trim();
    if (trimmed === "") return "";
    if (ASSET_PATH.test(trimmed) && /\.(?:mp3|wav|ogg|m4a|flac)$/u.test(trimmed)) return trimmed;
    if (/^data:audio\/(?:mpeg|wav|ogg|mp4|flac);base64,[A-Za-z0-9+/=]+$/u.test(trimmed)) {
      return trimmed.length <= 8_000_000 ? trimmed : "";
    }
    try {
      const url = new URL(trimmed);
      if (url.protocol === "https:" || url.protocol === "http:") return trimmed.slice(0, 2000);
    } catch {
      /* not a URL */
    }
    return "";
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  /** Base64 `data:` URL for inline SVG artwork. */
  function svgDataUrl(svg) {
    const bytes = new TextEncoder().encode(svg);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:image/svg+xml;base64,${btoa(binary)}`;
  }

  function cssString(text) {
    return JSON.stringify(String(text));
  }

  /* ------------------------------------------------------------------ *
   * Document model
   * ------------------------------------------------------------------ */

  const COPY_FIELDS = Object.freeze(["headline", "preview", "placeholderHero", "placeholderDefault"]);
  const COPY_LIMIT = 240;
  const COPY_ITEMS_MAX = 20;
  const THEME_LIMIT = 40;

  function emptyList() {
    return { mode: "sequence", items: [] };
  }

  function defaultPalette(dark) {
    return dark
      ? { accent: "#a7c080", surface: "#2d353b", ink: "#d3c6aa", contrast: 45, success: "#8da101", danger: "#f85552", warn: "#dfa000", idle: "#829181", sidebar: "" }
      : { accent: "#93b259", surface: "#fdf6e3", ink: "#5c6a72", contrast: 45, success: "#8da101", danger: "#f85552", warn: "#dfa000", idle: "#829181", sidebar: "" };
  }

  function defaultMusic() {
    return { src: "", enabled: false, volume: 45, loop: true, pauseWhenHidden: true };
  }

  function normalizeMusic(input) {
    const source = input !== null && typeof input === "object" ? input : {};
    const volume = Number(source.volume);
    return {
      src: sanitizeAudioUrl(source.src),
      enabled: source.enabled === true,
      volume: Number.isFinite(volume) ? Math.round(clamp(volume, 0, 100)) : 45,
      loop: source.loop !== false,
      pauseWhenHidden: source.pauseWhenHidden !== false,
    };
  }

  function defaultTheme(id, name) {
    return {
      id,
      name,
      light: defaultPalette(false),
      dark: defaultPalette(true),
      separateDark: true,
      background: { image: "", strength: 0, panelOpacity: 100, scrim: 100, blur: 0, brightness: 100, position: "cover" },
      hero: { image: "", size: 34 },
      music: defaultMusic(),
      copy: { headline: emptyList(), preview: emptyList(), placeholderHero: emptyList(), placeholderDefault: emptyList() },
      cursor: { headline: 0, preview: 0, placeholderHero: 0, placeholderDefault: 0 },
      presets: [],
    };
  }

  function defaultDocument() {
    return { version: THEME_VERSION, activeThemeId: "everforest", themes: [defaultTheme("everforest", "Everforest")] };
  }

  function normalizePalette(input, fallback) {
    const source = input !== null && typeof input === "object" ? input : {};
    const contrast = Number(source.contrast);
    return {
      accent: readColor(source.accent, fallback.accent),
      surface: readColor(source.surface, fallback.surface),
      ink: readColor(source.ink, fallback.ink),
      contrast: Number.isFinite(contrast) ? Math.round(clamp(contrast, 0, 100)) : fallback.contrast,
      success: readColor(source.success, fallback.success),
      danger: readColor(source.danger, fallback.danger),
      warn: readColor(source.warn, fallback.warn),
      idle: readColor(source.idle, fallback.idle),
      sidebar: source.sidebar === "" || source.sidebar === undefined || source.sidebar === null
        ? ""
        : readColor(source.sidebar, ""),
    };
  }

  function normalizeBackground(input) {
    const source = input !== null && typeof input === "object" ? input : {};
    const num = (value, fallback, min, max) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? Math.round(clamp(parsed, min, max)) : fallback;
    };
    return {
      image: sanitizeImageUrl(source.image),
      strength: num(source.strength, 0, 0, 100),
      panelOpacity: num(source.panelOpacity, 100, 0, 100),
      scrim: num(source.scrim, 100, 0, 150),
      blur: num(source.blur, 0, 0, 40),
      brightness: num(source.brightness, 100, 30, 200),
      position: source.position === "contain" ? "contain" : "cover",
    };
  }

  function normalizeCopyList(input) {
    if (typeof input === "string") {
      const trimmed = input.replace(/\s+/gu, " ").trim().slice(0, COPY_LIMIT);
      return { mode: "sequence", items: trimmed === "" ? [] : [trimmed] };
    }
    const source = input !== null && typeof input === "object" ? input : {};
    const rawItems = Array.isArray(source.items) ? source.items : [];
    const items = [];
    for (const item of rawItems) {
      if (typeof item !== "string") continue;
      const text = item.replace(/\s+/gu, " ").trim().slice(0, COPY_LIMIT);
      if (text !== "") items.push(text);
      if (items.length >= COPY_ITEMS_MAX) break;
    }
    return { mode: source.mode === "random" ? "random" : "sequence", items };
  }

  function normalizeCursor(input, list) {
    const value = Number(input);
    const cursor = Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
    return list.items.length === 0 ? 0 : cursor % list.items.length;
  }

  function normalizeTheme(input, index) {
    const source = input !== null && typeof input === "object" ? input : {};
    const base = defaultTheme(`theme-${index + 1}`, `主题 ${index + 1}`);
    const id = typeof source.id === "string" && source.id.trim() !== "" ? source.id.trim().slice(0, 64) : base.id;
    const name = typeof source.name === "string" && source.name.trim() !== ""
      ? source.name.trim().slice(0, 40)
      : base.name;
    const copySource = source.copy !== null && typeof source.copy === "object" ? source.copy : {};
    const copy = {};
    const cursorSource = source.cursor !== null && typeof source.cursor === "object" ? source.cursor : {};
    const cursor = {};
    for (const field of COPY_FIELDS) {
      copy[field] = normalizeCopyList(copySource[field]);
      cursor[field] = normalizeCursor(cursorSource[field], copy[field]);
    }
    const hero = source.hero !== null && typeof source.hero === "object" ? source.hero : {};
    const heroSize = Number(hero.size);
    return {
      id,
      name,
      light: normalizePalette(source.light, base.light),
      dark: normalizePalette(source.dark, base.dark),
      separateDark: source.separateDark !== false,
      background: normalizeBackground(source.background),
      hero: {
        image: sanitizeImageUrl(hero.image),
        size: Number.isFinite(heroSize) ? Math.round(clamp(heroSize, 16, 200)) : base.hero.size,
      },
      music: normalizeMusic(source.music),
      copy,
      cursor,
      presets: normalizePresetLinks(source.presets),
      preset: typeof source.preset === "string" && source.preset !== "" ? source.preset.slice(0, 40) : null,
      presetVersion: Number.isFinite(Number(source.presetVersion)) ? Math.max(0, Math.round(Number(source.presetVersion))) : 0,
      presetBase: source.presetBase !== null && typeof source.presetBase === "object"
        ? JSON.parse(JSON.stringify(source.presetBase))
        : null,
    };
  }

  /** Normalize any saved document, including the v1/v2 single-theme shape. */
  function normalizeDocument(input) {
    const source = input !== null && typeof input === "object" ? input : {};
    let themes;
    if (Array.isArray(source.themes) && source.themes.length > 0) {
      themes = source.themes.slice(0, THEME_LIMIT).map((theme, index) => normalizeTheme(theme, index));
    } else if (source.light !== undefined || source.dark !== undefined || source.copy !== undefined) {
      // v1/v2: one implicit Everforest theme at the top level.
      themes = [normalizeTheme({ id: "everforest", name: "Everforest", ...source }, 0)];
    } else {
      themes = defaultDocument().themes;
    }

    const seen = new Set();
    for (const theme of themes) {
      let id = theme.id;
      let suffix = 1;
      while (seen.has(id)) {
        id = `${theme.id}-${suffix}`;
        suffix += 1;
      }
      theme.id = id;
      seen.add(id);
    }
    const requested = typeof source.activeThemeId === "string" ? source.activeThemeId : "";
    const activeThemeId = themes.some((theme) => theme.id === requested) ? requested : themes[0].id;
    for (const theme of themes) syncPreset(theme);
    return { version: THEME_VERSION, activeThemeId, themes };
  }

  function activeTheme(doc) {
    return doc.themes.find((theme) => theme.id === doc.activeThemeId) ?? doc.themes[0];
  }

  /* ------------------------------------------------------------------ *
   * Preset linking — a theme created from a preset remembers which preset
   * and which design snapshot it came from. When the preset design evolves
   * (PRESET_VERSION bump), every linked theme adopts the new design for the
   * fields the user has not touched, while customised fields and the
   * wallpaper stay as they are.
   * ------------------------------------------------------------------ */

  const PRESET_VERSION = 1;

  /** The design fields a preset owns (the wallpaper is never owned by a preset). */
  function presetDesignSnapshot(theme) {
    return {
      light: JSON.parse(JSON.stringify(theme.light)),
      dark: JSON.parse(JSON.stringify(theme.dark)),
      separateDark: theme.separateDark,
      hero: JSON.parse(JSON.stringify(theme.hero)),
      copy: JSON.parse(JSON.stringify(theme.copy)),
      music: JSON.parse(JSON.stringify(theme.music)),
    };
  }

  function presetDesign(presetId) {
    if (presetId === "demiurge") return presetDesignSnapshot(demiurgeTheme());
    return presetDesignSnapshot(defaultTheme("everforest", "Everforest"));
  }

  const PRESET_IDS = Object.freeze(["everforest", "demiurge"]);
  const PALETTE_FIELDS = Object.freeze(["accent", "surface", "ink", "contrast", "success", "danger", "warn", "idle", "sidebar"]);

  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function sameJson(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }

  /** Replace only the fields the user has not touched since the last preset. */
  function syncGroup(target, base, design, fields) {
    for (const field of fields) {
      if (sameJson(target[field], base[field])) target[field] = cloneJson(design[field]);
    }
  }

  /** Link a theme to a preset, or adopt one by its preset name. */
  function syncPreset(theme) {
    if (theme.preset === null) {
      // Themes created before preset linking: adopt the matching built-in design.
      if (theme.name === "德谬歌") {
        theme.preset = "demiurge";
        theme.presetVersion = PRESET_VERSION;
        theme.presetBase = presetDesign("demiurge");
      }
      return;
    }
    if (!PRESET_IDS.includes(theme.preset)) return;
    if (theme.presetBase === null) {
      theme.presetBase = presetDesign(theme.preset);
      theme.presetVersion = PRESET_VERSION;
      return;
    }
    // Past this point a design rebuild is only worth it when a new preset shipped.
    if (theme.presetVersion >= PRESET_VERSION) return;
    const design = presetDesign(theme.preset);
    const base = theme.presetBase;
    syncGroup(theme.light, base.light, design.light, PALETTE_FIELDS);
    syncGroup(theme.dark, base.dark, design.dark, PALETTE_FIELDS);
    syncGroup(theme.hero, base.hero, design.hero, ["image", "size"]);
    syncGroup(theme.copy, base.copy, design.copy, COPY_FIELDS);
    syncGroup(theme.music, base.music, design.music, ["src", "enabled", "volume", "loop"]);
    if (theme.separateDark === base.separateDark) theme.separateDark = design.separateDark;
    theme.presetVersion = PRESET_VERSION;
    theme.presetBase = design;
  }

  /* ------------------------------------------------------------------ *
   * Presets — 德谬歌 is designed from the Cyrene setting: the Thirteenth
   * Titan / wing-staff δ-me13's complete form, "thirteen kinds of radiance",
   * pink-white with a blue memory light. Its wallpaper is intentionally NOT
   * bundled: the preset keeps whatever wallpaper the current theme carries.
   * ------------------------------------------------------------------ */

  /** 13 sparks around the halo: the "十三种光彩". */
  function demiurgeHeroSvg() {
    let sparks = "";
    for (let index = 0; index < 13; index += 1) {
      const angle = (index / 13) * Math.PI * 2 - Math.PI / 2;
      const x = (100 + 63 * Math.cos(angle)).toFixed(1);
      const y = (94 + 63 * Math.sin(angle)).toFixed(1);
      const bright = index % 3 === 0;
      sparks += `<circle cx="${x}" cy="${y}" r="${bright ? 2.4 : 1.4}" fill="${bright ? "#ffe2f0" : "#8fd3ff"}" opacity="${bright ? 0.95 : 0.7}"/>`;
    }
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">',
      '<defs>',
      '<radialGradient id="halo" cx="50%" cy="40%" r="62%">',
      '<stop offset="0" stop-color="#fff6fb"/><stop offset="0.5" stop-color="#f2b5d3"/><stop offset="1" stop-color="#8a63a8" stop-opacity="0"/>',
      '</radialGradient>',
      '<linearGradient id="wing" x1="34" y1="34" x2="166" y2="170">',
      '<stop offset="0" stop-color="#ffd9ea"/><stop offset="1" stop-color="#b98fd2"/>',
      '</linearGradient>',
      '</defs>',
      '<circle cx="100" cy="94" r="76" fill="url(#halo)" opacity=".6"/>',
      '<circle cx="100" cy="94" r="63" fill="none" stroke="url(#wing)" stroke-width="1.3" opacity=".85"/>',
      '<circle cx="100" cy="94" r="52" fill="none" stroke="#fff" stroke-width=".8" opacity=".35"/>',
      '<path d="M100 50c-23 19-35 39-35 59 0 13 8 24 20 29-6-10-8-20-6-30 4-19 13-36 25-46z" fill="url(#wing)" opacity=".95"/>',
      '<path d="M100 50c23 19 35 39 35 59 0 13-8 24-20 29 6-10 8-20 6-30-4-19-13-36-25-46z" fill="url(#wing)" opacity=".95"/>',
      '<circle cx="100" cy="94" r="8" fill="#fff8fc"/>',
      '<circle cx="100" cy="94" r="3.4" fill="#e58bb4"/>',
      sparks,
      '</svg>',
    ].join("");
  }

  /** Fallback starfield used only when the current theme has no wallpaper. */
  function demiurgeFallbackWallpaperSvg() {
    let stars = "";
    for (let index = 0; index < 90; index += 1) {
      const x = ((index * 137.508) % 1600).toFixed(1);
      const y = ((index * 61.7 + 37) % 900).toFixed(1);
      const radius = (0.6 + ((index * 7) % 10) / 8).toFixed(2);
      const opacity = (0.22 + ((index * 13) % 10) / 16).toFixed(2);
      stars += `<circle cx="${x}" cy="${y}" r="${radius}" fill="#ffe6f4" opacity="${opacity}"/>`;
    }
    return [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 900">',
      '<defs>',
      '<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">',
      '<stop offset="0" stop-color="#120d1e"/><stop offset="0.55" stop-color="#1c142e"/><stop offset="1" stop-color="#2a1c3d"/>',
      '</linearGradient>',
      '<radialGradient id="glow" cx="50%" cy="38%" r="55%">',
      '<stop offset="0" stop-color="#e58bb4" stop-opacity=".36"/><stop offset="1" stop-color="#e58bb4" stop-opacity="0"/>',
      '</radialGradient>',
      '</defs>',
      '<rect width="1600" height="900" fill="url(#bg)"/>',
      '<rect width="1600" height="900" fill="url(#glow)"/>',
      '<g fill="none" stroke="#ffd7ea" opacity=".16">',
      '<circle cx="800" cy="340" r="210"/><circle cx="800" cy="340" r="290"/><circle cx="800" cy="340" r="380"/>',
      '</g>',
      stars,
      '</svg>',
    ].join("");
  }

  /** The 德谬歌 theme: palette, emblem, copy — and the current wallpaper. */
  function demiurgeTheme(background) {
    const theme = defaultTheme("demiurge", "德谬歌");
    theme.light = {
      accent: "#e58bb4", surface: "#fff7fc", ink: "#4a3a57", contrast: 42,
      success: "#86c7a9", danger: "#e06a82", warn: "#e3be74", idle: "#a292b2", sidebar: "",
    };
    theme.dark = {
      accent: "#f0a8cc", surface: "#161020", ink: "#f4e9f3", contrast: 45,
      success: "#86c7a9", danger: "#e06a82", warn: "#e3be74", idle: "#a292b2", sidebar: "#1e1630",
    };
    theme.separateDark = true;
    theme.background = background ?? {
      image: svgDataUrl(demiurgeFallbackWallpaperSvg()),
      strength: 55,
      panelOpacity: 100,
      scrim: 70,
      blur: 3,
      brightness: 100,
      position: "cover",
    };
    theme.hero = { image: svgDataUrl(demiurgeHeroSvg()), size: 96 };
    theme.music = { ...defaultMusic(), volume: 45 };
    theme.copy = {
      headline: { mode: "sequence", items: ["德谬歌", "第十三泰坦", "忆海无垠，故事为舟"] },
      preview: { mode: "sequence", items: ["第十三泰坦", "第十三种光彩"] },
      placeholderHero: { mode: "sequence", items: ["拾起一段记忆，写下你的故事…", "三千万次轮回，皆为你执笔。"] },
      placeholderDefault: { mode: "sequence", items: ["让记忆继续流淌…", "此页，由你书写。"] },
    };
    theme.cursor = { headline: 0, preview: 0, placeholderHero: 0, placeholderDefault: 0 };
    return theme;
  }

  const PRESETS = Object.freeze([
    { id: "everforest", label: "presets.everforest" },
    { id: "demiurge", label: "presets.demiurge" },
  ]);

  /* ------------------------------------------------------------------ *
   * Agent-preset linking
   *
   * A Session's Agent preset is a Host projection (`agentPreset`), readable in
   * any session-scoped slot through `useProjection("agentPreset")`. A theme may
   * name the presets it belongs to; when the open Session runs one of them the
   * matching theme is activated.
   * ------------------------------------------------------------------ */

  const PRESET_LINK_MAX = 12;

  function normalizePresetLinks(input) {
    const raw = Array.isArray(input)
      ? input
      : typeof input === "string"
        ? input.split(/[,，;；\s]+/u)
        : [];
    const links = [];
    const seen = new Set();
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const value = item.trim().slice(0, 120);
      if (value === "") continue;
      const key = value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(value);
      if (links.length >= PRESET_LINK_MAX) break;
    }
    return links;
  }

  /** The theme bound to one Agent preset id, or null when no theme claims it. */
  function themeForAgentPreset(doc, presetId) {
    if (typeof presetId !== "string" || presetId === "") return null;
    const wanted = presetId.toLowerCase();
    const match = doc.themes.find((theme) => theme.presets.some((entry) => entry.toLowerCase() === wanted));
    return match ?? null;
  }

  /** Add or remove one preset id from a link list, keeping order stable. */
  function togglePresetLink(links, presetId) {
    const list = normalizePresetLinks(links);
    if (typeof presetId !== "string" || presetId === "") return list;
    const wanted = presetId.toLowerCase();
    const found = list.some((entry) => entry.toLowerCase() === wanted);
    return found ? list.filter((entry) => entry.toLowerCase() !== wanted) : [...list, presetId];
  }

  /** Display name for one linked preset id, falling back to the id itself. */
  function presetLinkLabel(roster, presetId) {
    const entry = Array.isArray(roster) ? roster.find((row) => row.id === presetId) : undefined;
    return entry !== undefined && typeof entry.name === "string" && entry.name !== "" ? entry.name : presetId;
  }

  /** Fetch the Host's agent preset roster (id + display name). */
  async function loadAgentPresets() {
    const payload = await request("/agent-presets");
    const presets = Array.isArray(payload.presets) ? payload.presets : [];
    return presets
      .filter((row) => row !== null && typeof row === "object" && typeof row.id === "string" && row.id !== "")
      .map((row) => ({
        id: row.id.slice(0, 120),
        name: typeof row.name === "string" && row.name !== "" ? row.name.slice(0, 80) : row.id,
        description: typeof row.description === "string" ? row.description.slice(0, 240) : "",
        broken: row.broken === true,
      }));
  }

  /* ------------------------------------------------------------------ *
   * Palette and tokens
   * ------------------------------------------------------------------ */

  function lift(hex) {
    return mix(hex, "#ffffff", 0.18);
  }

  function deriveAutoDark(light) {
    return {
      accent: relight(light.accent, Math.max(0.45, Math.min(0.72, rgbToHsl(light.accent).l + 0.08))),
      surface: relight(light.surface, 0.14, 0.22),
      ink: relight(light.ink, Math.max(0.72, 1 - rgbToHsl(light.ink).l), 0.2),
      contrast: light.contrast,
      success: lift(light.success),
      danger: lift(light.danger),
      warn: lift(light.warn),
      idle: mix(light.idle, "#ffffff", 0.25),
      sidebar: "",
    };
  }

  /** Resolve the two complete palettes one theme paints with. */
  function resolvePalettes(theme) {
    const light = { ...theme.light };
    const dark = theme.separateDark
      ? {
        ...theme.dark,
        success: lift(light.success),
        danger: lift(light.danger),
        warn: lift(light.warn),
        idle: mix(light.idle, "#ffffff", 0.25),
      }
      : deriveAutoDark(light);
    return { light, dark };
  }

  /** Palette → the DSH token layer for one color scheme. */
  function deriveTokens(palette, scheme, background) {
    const ink = palette.ink;
    const surface = palette.surface;
    const accent = palette.accent;
    const c = clamp(Number(palette.contrast) || 0, 0, 100) / 100;
    const tint = 0.025 + 0.075 * c;

    const layer1 = mix(surface, ink, tint * 0.5);
    const layer2 = mix(surface, ink, tint);
    const overlay = mix(surface, "#ffffff", scheme === "dark" ? 0.06 : 0.55);
    const sidebar = palette.sidebar === "" || palette.sidebar === undefined
      ? mix(surface, ink, tint * 0.35)
      : palette.sidebar;

    // Wallpaper visibility is two independent knobs:
    //  - `strength` makes the *main* surface (base + sidebar) translucent so the
    //    fixed wallpaper shows through;
    //  - `panelOpacity` controls the *elevated* surfaces (cards, popovers, the
    //    settings panel). Keeping it at 100 means a translucent page never makes
    //    a sub-interface translucent, so text never overlaps the page behind.
    const hasWallpaper = background !== undefined && background !== null && background.image !== "";
    const visible = hasWallpaper ? clamp(Number(background.strength) || 0, 0, 100) / 100 : 0;
    const surfaceOpacity = (share) => 1 - visible * share;
    // Text that is merely "mixed toward the surface" loses contrast as soon as
    // the surface itself becomes translucent over a bright wallpaper, so the mix
    // is pulled back toward the ink while a wallpaper is showing.
    const readable = (share) => Math.max(0.10, share - visible * 0.20);
    const chrome = hasWallpaper
      ? clamp(Number(background.panelOpacity === undefined ? 100 : background.panelOpacity) || 0, 0, 100) / 100
      : 1;

    return {
      "--dsw-alias-bg-base": withOpacity(surface, surfaceOpacity(0.82)),
      "--dsw-alias-bg-layer-1": withOpacity(layer1, chrome),
      "--dsw-alias-bg-layer-2": withOpacity(layer2, chrome),
      "--dsw-alias-bg-overlay": withOpacity(overlay, chrome),
      "--dsw-alias-bg-module-platform": withOpacity(layer1, chrome),
      "--dsw-alias-bg-skeleton": alpha(ink, 0.05),
      "--dsw-alias-border-l1": alpha(ink, 0.10 + 0.25 * c),
      "--dsw-alias-border-l2": alpha(ink, 0.16 + 0.34 * c),
      "--dsw-alias-border-l3": alpha(ink, 0.20 + 0.28 * c),
      "--dsw-alias-border-l4": alpha(ink, 0.24 + 0.34 * c),
      "--dsw-alias-label-primary": ink,
      "--dsw-alias-label-primary-dimmed": mix(ink, surface, readable(0.22)),
      "--dsw-alias-label-secondary": mix(ink, surface, readable(0.35)),
      "--dsw-alias-label-tertiary": mix(ink, surface, readable(0.48)),
      "--dsw-alias-label-caption": mix(ink, surface, readable(0.52)),
      "--dsw-alias-label-dimmed": mix(ink, surface, readable(0.62)),
      "--dsw-alias-label-primary-bluish": mix(accent, ink, 0.45),
      "--dsw-alias-brand-primary": accent,
      "--dsw-alias-state-success-primary": palette.success,
      "--dsw-alias-state-error-primary": palette.danger,
      "--dsw-alias-state-warn-primary": palette.warn,
      "--dsw-alias-state-idle-primary": palette.idle,
      "--dsw-alias-state-business-primary": accent,
      "--dsw-alias-state-business-tertiary": alpha(accent, 0.14),
      "--dsw-alias-interactive-bg-hover": alpha(ink, 0.05 + 0.06 * c),
      "--dsw-alias-interactive-bg-hover-solid": withOpacity(mix(surface, ink, tint * 0.7), chrome),
      "--dsw-alias-markdown-code-block": withOpacity(layer2, chrome),
      "--dsw-alias-scrollbar-bg-l1": alpha(ink, 0.10),
      "--dsw-alias-scrollbar-bg-l2": alpha(ink, 0.16),
      "--dsw-alias-scrollbar-hover-l2": alpha(ink, 0.28),
      "--dsw-specific-sidebar-fill": withOpacity(sidebar, surfaceOpacity(0.72)),
      "--dsw-specific-input-major": withOpacity(scheme === "dark" ? layer1 : overlay, chrome),
      "--dsw-specific-menu": withOpacity(overlay, chrome),
      "--dsw-specific-selector": withOpacity(layer2, chrome),
    };
  }

  /** Full `{ light, dark }` pair map for `theme.overrideTokens`. */
  function buildTokens(theme, palettes) {
    const resolved = palettes ?? resolvePalettes(theme);
    const light = deriveTokens(resolved.light, "light", theme.background);
    const dark = deriveTokens(resolved.dark, "dark", theme.background);
    const pairs = {};
    for (const name of Object.keys(light)) pairs[name] = { light: light[name], dark: dark[name] };
    return pairs;
  }

  /* ------------------------------------------------------------------ *
   * Copy lists
   * ------------------------------------------------------------------ */

  function pickCopy(list, cursor, random) {
    const items = list.items;
    if (items.length === 0) return { value: "", index: 0, cursor: 0 };
    if (list.mode === "random") {
      const index = Math.floor(random() * items.length) % items.length;
      return { value: items[index], index, cursor };
    }
    const index = cursor % items.length;
    return { value: items[index], index, cursor: (index + 1) % items.length };
  }

  /**
   * Resolve every copy field for one display.
   *
   * @param theme - the active theme.
   * @param advance - true on a fresh page display (advance the sequential cursors).
   * @param random - injectable randomness for tests.
   */
  function resolveCopy(theme, advance, random) {
    const rng = typeof random === "function" ? random : Math.random;
    const values = {};
    const indices = {};
    const cursors = { ...theme.cursor };
    for (const field of COPY_FIELDS) {
      const list = theme.copy[field];
      const picked = pickCopy(list, cursors[field] ?? 0, rng);
      values[field] = picked.value;
      indices[field] = picked.index;
      cursors[field] = picked.cursor;
    }
    return { values, indices, cursors };
  }

  /** Re-derive displayed values from edited lists without moving the cursors. */
  function syncCopyValues(theme, copyState) {
    const values = {};
    for (const field of COPY_FIELDS) {
      const items = theme.copy[field].items;
      const index = copyState.indices[field] ?? 0;
      values[field] = items.length === 0 ? "" : items[index % items.length] ?? "";
    }
    return { ...copyState, values };
  }

  /** CSS overrides for hero copy and composer placeholders. */
  function buildCopyCss(values) {
    const rules = [];
    const vars = [];

    if (values.headline) {
      vars.push(`--ts-copy-headline:${cssString(values.headline)}`);
      rules.push('html body [class*="_titleGroup"] > span:nth-child(1){font-size:0!important;line-height:0!important}');
      rules.push('html body [class*="_titleGroup"] > span:nth-child(1)::after{content:var(--ts-copy-headline);font-size:26px;line-height:32px;font-weight:500;white-space:pre-wrap}');
    }
    if (values.preview) {
      vars.push(`--ts-copy-preview:${cssString(values.preview)}`);
      rules.push('html body [class*="_previewBadge"]{font-size:0!important}');
      rules.push('html body [class*="_previewBadge"]::after{content:var(--ts-copy-preview);font-size:12px;line-height:18px}');
    }
    if (values.placeholderHero) {
      vars.push(`--ts-copy-placeholder-hero:${cssString(values.placeholderHero)}`);
      rules.push('html body [class*="_grow"]:has([data-phase="hero"]) [data-composer-placeholder]{font-size:0!important}');
      rules.push('html body [class*="_grow"]:has([data-phase="hero"]) [data-composer-placeholder]::after{content:var(--ts-copy-placeholder-hero);font-size:var(--dsh-content-font-size,14px);line-height:inherit}');
    }
    if (values.placeholderDefault) {
      vars.push(`--ts-copy-placeholder-default:${cssString(values.placeholderDefault)}`);
      rules.push('html body [class*="_grow"]:not(:has([data-phase="hero"])) [data-composer-placeholder]{font-size:0!important}');
      rules.push('html body [class*="_grow"]:not(:has([data-phase="hero"])) [data-composer-placeholder]::after{content:var(--ts-copy-placeholder-default);font-size:var(--dsh-content-font-size,14px);line-height:inherit}');
    }

    const parts = [];
    if (vars.length > 0) parts.push(`:root{${vars.join(";")}}`);
    parts.push(...rules);
    return parts.join("\n");
  }

  /** Scrim opacity over the wallpaper: a theme-colored veil that keeps text readable. */
  function wallpaperScrimAlpha(background) {
    const strength = clamp(Number(background.scrim === undefined ? 100 : background.scrim) || 0, 0, 150);
    if (strength <= 0) return 0;
    const visible = clamp(Number(background.strength) || 0, 0, 100) / 100;
    return Math.min(0.85, (0.12 + visible * 0.40) * (strength / 100));
  }

  let wallpaperCache = { image: null, fields: "", css: "" };

  /** Fixed wallpaper layer behind the translucent application surfaces. */
  function buildWallpaperCss(background, palettes) {
    if (background === undefined || background === null || background.image === "") return "";
    const fields = [
      background.strength, background.panelOpacity, background.scrim,
      background.blur, background.brightness, background.position,
      palettes === undefined || palettes === null ? "" : palettes.light.surface,
      palettes === undefined || palettes === null ? "" : palettes.dark.surface,
    ].join("|");
    if (wallpaperCache.image === background.image && wallpaperCache.fields === fields) {
      return wallpaperCache.css;
    }
    const css = renderWallpaperCss(background, palettes);
    wallpaperCache = { image: background.image, fields, css };
    return css;
  }

  function renderWallpaperCss(background, palettes) {
    const scale = background.blur > 0 ? "transform:scale(1.04);" : "";
    const base = [
      'content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;',
      `background-size:${background.position};background-position:center;background-repeat:no-repeat;`,
      `filter:blur(${background.blur}px) brightness(${background.brightness}%);${scale}`,
    ].join("");
    const url = cssString(background.image);
    const scrim = wallpaperScrimAlpha(background);
    if (palettes === undefined || palettes === null || scrim <= 0.005) {
      return `body::before{${base}background-image:url(${url});}`;
    }
    const light = alpha(palettes.light.surface, scrim);
    const dark = alpha(palettes.dark.surface, scrim);
    return [
      `body::before{${base}background-image:linear-gradient(${light},${light}),url(${url});}`,
      `body[data-ds-dark-theme]::before{background-image:linear-gradient(${dark},${dark}),url(${url});}`,
    ].join("\n");
  }

  /** Minimal boot hint the Host paints before this bundle runs. */
  function buildBootHint(theme, palettes) {
    const resolved = palettes ?? resolvePalettes(theme);
    const scrim = wallpaperScrimAlpha(theme.background);
    return {
      light: resolved.light.surface,
      dark: resolved.dark.surface,
      wallpaper: theme.background.image === ""
        ? null
        : {
          image: theme.background.image,
          blur: theme.background.blur,
          brightness: theme.background.brightness,
          position: theme.background.position,
          scrim: scrim <= 0.005
            ? null
            : {
              light: alpha(resolved.light.surface, scrim),
              dark: alpha(resolved.dark.surface, scrim),
            },
        },
    };
  }

  /* ------------------------------------------------------------------ *
   * Store and application
   * ------------------------------------------------------------------ */

  function createStore(initial) {
    let state = initial;
    const listeners = new Set();
    return {
      get: () => state,
      set(next) {
        state = next;
        for (const listener of listeners) listener();
      },
      patch(partial) {
        state = { ...state, ...partial };
        for (const listener of listeners) listener();
      },
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    };
  }

  function initialView() {
    const doc = defaultDocument();
    const theme = activeTheme(doc);
    return {
      doc,
      resolved: resolvePalettes(theme),
      copy: {
        values: { headline: "", preview: "", placeholderHero: "", placeholderDefault: "" },
        indices: { headline: 0, preview: 0, placeholderHero: 0, placeholderDefault: 0 },
      },
      saving: "idle",
      error: "",
      loaded: false,
    };
  }

  const viewStore = createStore(initialView());
  const modeStore = createStore("system");
  const agentPresetStore = createStore("");

  let ctxRef = null;
  let tokenDisposer = null;
  let tokenKey = "";
  let sheetKey = { copy: null, wall: null };
  let studioTag = null;
  let copyTag = null;
  let heroDisposer = null;
  const presetWatchers = [];
  let saveTimer = null;
  let saveGeneration = 0;

  /* ------------------------------------------------------------------ *
   * Host API
   * ------------------------------------------------------------------ */

  async function request(path, init) {
    const response = await fetch(ROUTE + path, {
      ...init,
      headers: { accept: "application/json", ...(init?.headers ?? {}) },
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload === null || payload.ok !== true) {
      throw new Error(payload?.error ?? `theme document request failed: ${response.status}`);
    }
    return payload;
  }

  function loadDocument() {
    return request("/document", { method: "GET" });
  }

  function saveDocument(document) {
    return request("/document", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document }),
    });
  }

  function payloadOf(view) {
    const theme = activeTheme(view.doc);
    return { version: 1, boot: buildBootHint(theme, view.resolved), state: clone(view.doc) };
  }

  function scheduleSave(view) {
    if (saveTimer !== null) clearTimeout(saveTimer);
    const generation = ++saveGeneration;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      flushSave(generation, view);
    }, 160);
  }

  function flushSave(generation, view) {
    if (generation !== saveGeneration) return;
    viewStore.patch({ saving: "saving", error: "" });
    saveDocument(payloadOf(view)).then(() => {
      if (generation !== saveGeneration) return;
      viewStore.patch({ saving: "saved" });
    }).catch((error) => {
      if (generation !== saveGeneration) return;
      viewStore.patch({ saving: "error", error: error instanceof Error ? error.message : String(error) });
    });
  }

  /** Hero image occupant for the blank-session brand mark. */
  function HeroArt() {
    const view = useSyncExternalStore(viewStore.subscribe, viewStore.get);
    const theme = activeTheme(view.doc);
    const [broken, setBroken] = useState(false);
    const image = theme.hero.image;
    const size = clamp(Number(theme.hero.size) || 34, 16, 200);
    useEffect(() => setBroken(false), [image]);
    if (!image || broken) return null;
    return h("img", {
      src: image,
      alt: "",
      draggable: false,
      className: "ts-hero-art",
      onError: () => setBroken(true),
      style: {
        width: `${size}px`,
        height: "auto",
        maxHeight: `${Math.round(size * 1.5)}px`,
        objectFit: "contain",
        display: "block",
      },
    });
  }

  /**
   * Session-scoped watcher: follows the Session's `agentPreset` projection and
   * activates the theme that names it. Renders nothing.
   */
  function PresetWatcher({ useProjection }) {
    const preset = typeof useProjection === "function" ? useProjection("agentPreset") : undefined;
    useEffect(() => {
      if (typeof preset === "string" && preset !== "") applyAgentPreset(preset);
    }, [preset]);
    return null;
  }

  /** Switch to the theme bound to `presetId`, when one exists and is not active. */
  function applyAgentPreset(presetId) {
    const view = currentView();
    agentPresetStore.set(presetId);
    const theme = themeForAgentPreset(view.doc, presetId);
    if (theme === null || theme.id === view.doc.activeThemeId) return;
    setActiveTheme(theme.id);
  }

  /** Occupy two harmless session slots so the preset projection stays observed. */
  function syncPresetWatcher() {
    const ctx = ctxRef;
    if (ctx === null || presetWatchers.length > 0) return;
    for (const slot of ["conversation.input.dock", "conversation.hero.options"]) {
      try {
        presetWatchers.push(ctx.slots.inject(slot, () => ctx.slots.register(
          { name: slot, id: "theme-agent-preset", order: 900 },
          PresetWatcher,
        )));
      } catch {
        /* slot missing in this build: the other one may still exist */
      }
    }
  }

  function syncHeroSlot() {
    const ctx = ctxRef;
    if (ctx === null) return;
    const wanted = activeTheme(viewStore.get().doc).hero.image !== "";
    if (wanted && heroDisposer === null) {
      heroDisposer = ctx.slots.inject("conversation.hero.brand.mark", () => ctx.slots.register(
        { name: "conversation.hero.brand.mark" },
        HeroArt,
      ));
    } else if (!wanted && heroDisposer !== null) {
      heroDisposer();
      heroDisposer = null;
    }
  }

  /* ------------------------------------------------------------------ *
   * Background music
   * ------------------------------------------------------------------ */

  let audio = null;
  let gestureCleanup = null;

  function ensureAudio() {
    if (typeof Audio === "undefined") return null;
    if (audio === null) {
      audio = new Audio();
      audio.preload = "auto";
      audio.loop = true;
    }
    return audio;
  }

  function clearGesture() {
    if (gestureCleanup !== null) {
      gestureCleanup();
      gestureCleanup = null;
    }
  }

  let pausedForHidden = false;

  /**
   * Pause while the window is hidden (minimized / another tab) and resume when
   * it comes back, when the theme asks for it (`music.pauseWhenHidden`).
   */
  function onVisibilityChange() {
    const player = ensureAudio();
    if (player === null) return;
    const theme = activeTheme(viewStore.get().doc);
    const music = theme.music ?? defaultMusic();
    if (music.enabled !== true || music.src === "") {
      pausedForHidden = false;
      return;
    }
    if (document.hidden) {
      if (music.pauseWhenHidden !== false && !player.paused) {
        player.pause();
        pausedForHidden = true;
      }
      return;
    }
    if (pausedForHidden) {
      pausedForHidden = false;
      player.play().catch(() => {});
    }
  }

  /**
   * Keep the audio element in sync with the active theme's music settings.
   * Playback is per-theme: switching themes switches the track; disabling or
   * leaving the source empty pauses. Browsers refuse programmatic playback
   * before a user gesture, so a rejected `play()` waits for the first
   * pointer/key event and retries.
   *
   * @param theme - the active theme.
   */
  function syncMusic(theme) {
    const music = theme.music ?? defaultMusic();
    const player = ensureAudio();
    if (player === null) return;
    const src = music.src;
    if (player.getAttribute("src") !== src) {
      if (src === "") player.removeAttribute("src");
      else player.setAttribute("src", src);
    }
    player.loop = music.loop !== false;
    player.volume = clamp(Number(music.volume) || 0, 0, 100) / 100;

    const shouldPlay = music.enabled === true && src !== "";
    if (!shouldPlay) {
      player.pause();
      pausedForHidden = false;
      clearGesture();
      return;
    }
    if (document.hidden && music.pauseWhenHidden !== false) return;
    if (!player.paused) return;
    player.play().catch(() => {
      if (gestureCleanup !== null) return;
      const resume = () => {
        clearGesture();
        if (!document.hidden) player.play().catch(() => {});
      };
      document.addEventListener("pointerdown", resume, { once: true, capture: true });
      document.addEventListener("keydown", resume, { once: true, capture: true });
      gestureCleanup = () => {
        document.removeEventListener("pointerdown", resume, true);
        document.removeEventListener("keydown", resume, true);
      };
    });
  }

  function stopMusic() {
    if (audio !== null) {
      audio.pause();
      audio.removeAttribute("src");
    }
    pausedForHidden = false;
    clearGesture();
  }

  /** Apply one view: token layer, copy/wallpaper styles, hero occupant, music. */
  function applyView(view) {
    const ctx = ctxRef;
    if (ctx === null) return;
    const theme = activeTheme(view.doc);

    // Editing copy must not re-derive the 34 tokens or re-parse the (possibly
    // huge) wallpaper stylesheet on every keystroke; both are cached by value.
    const nextTokenKey = [
      JSON.stringify(view.resolved.light),
      JSON.stringify(view.resolved.dark),
      theme.background.image !== "",
      theme.background.strength,
      theme.background.panelOpacity,
    ].join("|");
    if (tokenDisposer === null || tokenKey !== nextTokenKey) {
      tokenDisposer = ctx.theme.overrideTokens(SOURCE, buildTokens(theme, view.resolved));
      if (typeof tokenDisposer !== "function") tokenDisposer = null;
      tokenKey = nextTokenKey;
    }

    if (copyTag !== null) {
      const copyCss = buildCopyCss(view.copy.values);
      const wallCss = buildWallpaperCss(theme.background, view.resolved);
      if (sheetKey.copy !== copyCss || sheetKey.wall !== wallCss) {
        copyTag.textContent = [copyCss, wallCss].filter((part) => part !== "").join("\n");
        sheetKey = { copy: copyCss, wall: wallCss };
      }
    }

    syncHeroSlot();
    syncPresetWatcher();
    syncMusic(theme);
    document.documentElement.setAttribute(READY_ATTR, "");
  }

  function currentView() {
    return viewStore.get();
  }

  /** Recompute resolution for a document while keeping the displayed copy in place. */
  function viewFor(doc, previous) {
    const theme = activeTheme(doc);
    const resolved = resolvePalettes(theme);
    const copy = previous === undefined
      ? resolveCopy(theme, true)
      : syncCopyValues(theme, previous.copy);
    return {
      doc,
      resolved,
      copy: { values: copy.values, indices: copy.indices },
      saving: previous?.saving ?? "idle",
      error: previous?.error ?? "",
      loaded: previous?.loaded ?? true,
    };
  }

  function setView(view) {
    viewStore.set(view);
    applyView(view);
  }

  /** Apply one edit: normalize, repaint immediately, persist in the background. */
  function edit(updater) {
    const view = currentView();
    const doc = normalizeDocument(updater(clone(view.doc)));
    const next = viewFor(doc, view);
    setView(next);
    scheduleSave(next);
  }

  function editTheme(updater) {
    edit((doc) => ({
      ...doc,
      themes: doc.themes.map((theme) => theme.id === doc.activeThemeId ? updater(theme) : theme),
    }));
  }

  function setActiveTheme(id) {
    edit((doc) => ({ ...doc, activeThemeId: id }));
  }

  function addTheme() {
    const view = currentView();
    const base = activeTheme(view.doc);
    const theme = clone(base);
    theme.id = `theme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    theme.name = `主题 ${view.doc.themes.length + 1}`;
    edit((doc) => ({ ...doc, themes: [...doc.themes, theme], activeThemeId: theme.id }));
  }

  function duplicateTheme() {
    const view = currentView();
    const base = activeTheme(view.doc);
    const theme = clone(base);
    theme.id = `theme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    theme.name = `${base.name} 副本`.slice(0, 40);
    edit((doc) => ({ ...doc, themes: [...doc.themes, theme], activeThemeId: theme.id }));
  }

  function removeTheme(id) {
    const view = currentView();
    if (view.doc.themes.length <= 1) return;
    edit((doc) => {
      const themes = doc.themes.filter((theme) => theme.id !== id);
      return { ...doc, themes, activeThemeId: doc.activeThemeId === id ? themes[0].id : doc.activeThemeId };
    });
  }

  /** Restart one sequence field at its first entry. */
  function resetCopyCursor(field) {
    const view = currentView();
    const theme = activeTheme(view.doc);
    const list = theme.copy[field];
    if (list.items.length === 0) return;
    const doc = {
      ...view.doc,
      themes: view.doc.themes.map((item) => item.id === theme.id
        ? { ...item, cursor: { ...item.cursor, [field]: 0 } }
        : item),
    };
    const next = {
      ...view,
      doc,
      copy: {
        values: { ...view.copy.values, [field]: list.items[0] },
        indices: { ...view.copy.indices, [field]: 0 },
      },
    };
    setView(next);
    scheduleSave(next);
  }

  /** Show the next (or a random) copy entry for one field immediately. */
  function rerollCopy(field) {
    const view = currentView();
    const theme = activeTheme(view.doc);
    const list = theme.copy[field];
    if (list.items.length === 0) return;
    const random = list.mode === "random";
    const index = random
      ? Math.floor(Math.random() * list.items.length) % list.items.length
      : (theme.cursor[field] ?? 0) % list.items.length;
    const doc = {
      ...view.doc,
      themes: view.doc.themes.map((item) => item.id === theme.id
        ? {
          ...item,
          cursor: {
            ...item.cursor,
            [field]: random ? item.cursor[field] : (index + 1) % list.items.length,
          },
        }
        : item),
    };
    const next = {
      ...view,
      doc,
      copy: {
        values: { ...view.copy.values, [field]: list.items[index] },
        indices: { ...view.copy.indices, [field]: index },
      },
    };
    setView(next);
    scheduleSave(next);
  }

  /* ------------------------------------------------------------------ *
   * Presets and asset uploads
   * ------------------------------------------------------------------ */

  /** Append one preset theme. 德谬歌 keeps the wallpaper of the current theme. */
  function addPreset(presetId) {
    const view = currentView();
    const current = activeTheme(view.doc);
    const id = `theme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    let theme;
    if (presetId === "demiurge") {
      const background = current.background.image === ""
        ? undefined
        : { ...clone(current.background) };
      theme = demiurgeTheme(background);
    } else {
      theme = defaultTheme("everforest", "Everforest");
    }
    theme.id = id;
    theme.preset = presetId;
    theme.presetVersion = PRESET_VERSION;
    theme.presetBase = presetDesign(presetId);
    edit((doc) => ({ ...doc, themes: [...doc.themes, theme], activeThemeId: id }));
  }

  async function uploadAsset(file) {
    const response = await fetch(`${ROUTE}/asset`, {
      method: "POST",
      headers: { "content-type": file.type || "application/octet-stream" },
      body: file,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload === null || payload.ok !== true) {
      throw new Error(payload?.error ?? `upload failed: ${response.status}`);
    }
    return payload.url;
  }

  /* ------------------------------------------------------------------ *
   * Small UI primitives
   * ------------------------------------------------------------------ */

  function useView() {
    return useSyncExternalStore(viewStore.subscribe, viewStore.get);
  }

  function Row({ title, description, children }) {
    return h("div", { className: "ts-row" },
      h("div", { className: "ts-rowText" },
        h("div", { className: "ts-rowTitle" }, title),
        description ? h("div", { className: "ts-rowDesc" }, description) : null),
      h("div", { className: "ts-control" }, children));
  }

  function Group({ label, children }) {
    return h("section", { className: "ts-group" },
      label ? h("div", { className: "ts-groupLabel" }, label) : null,
      h("div", { className: "ts-card" }, children));
  }

  function Segmented({ options, value, onChange, small }) {
    return h("div", { className: small ? "ts-seg ts-segSmall" : "ts-seg", role: "group" },
      options.map((option) => h("button", {
        key: option.value,
        type: "button",
        className: option.value === value ? "ts-segBtn ts-segBtnOn" : "ts-segBtn",
        "aria-pressed": option.value === value,
        onClick: () => onChange(option.value),
      }, option.label)));
  }

  function Switch({ checked, onChange, label }) {
    return h("button", {
      type: "button",
      role: "switch",
      "aria-checked": checked,
      "aria-label": label,
      className: checked ? "ts-switch ts-switchOn" : "ts-switch",
      onClick: () => onChange(!checked),
    }, h("span", { className: "ts-switchKnob" }));
  }

  function ColorField({ value, fallback, onChange, autoLabel, onAuto }) {
    const [draft, setDraft] = useState(value || "");
    useEffect(() => setDraft(value || ""), [value]);
    const shown = isHex(value) ? value : (isHex(fallback) ? fallback : "#000000");
    const commit = (text) => {
      setDraft(text);
      const trimmed = text.trim();
      if (isHex(trimmed)) onChange(trimmed.toLowerCase());
    };
    return h("div", { className: "ts-color" },
      onAuto !== undefined
        ? h("button", {
          type: "button",
          className: value === "" ? "ts-chip ts-chipOn" : "ts-chip",
          title: autoLabel,
          onClick: () => onAuto(),
        }, autoLabel)
        : null,
      h("input", {
        type: "color",
        className: "ts-swatch",
        value: shown,
        "aria-label": "color",
        onChange: (event) => onChange(event.target.value),
      }),
      h("input", {
        type: "text",
        className: "ts-hex",
        value: draft,
        placeholder: shown,
        spellCheck: false,
        onChange: (event) => commit(event.target.value),
        onBlur: () => { if (!isHex(draft.trim())) setDraft(value || ""); },
      }));
  }

  function RangeField({ value, min, max, step, suffix, onChange }) {
    return h("div", { className: "ts-range" },
      h("input", {
        type: "range",
        min,
        max,
        step: step ?? 1,
        value,
        onChange: (event) => onChange(Number(event.target.value)),
      }),
      h("span", { className: "ts-rangeValue" }, `${value}${suffix ?? ""}`));
  }

  function TextField({ value, placeholder, onChange, wide, maxLength }) {
    return h("input", {
      type: "text",
      className: wide ? "ts-input ts-inputWide" : "ts-input",
      value,
      placeholder,
      spellCheck: false,
      maxLength,
      onChange: (event) => onChange(event.target.value),
    });
  }

  /**
   * One uploaded asset slot: preview, URL field and a local-file picker that
   * uploads to the Host (`/dsh-theme-studio/asset`) instead of inlining bytes
   * into the theme document.
   */
  function AssetSetting({ kind = "image", title, description, value, onChange, placeholder, pickLabel }) {
    const isLocal = value.startsWith("data:") || value.startsWith("/dsh-theme-studio/asset/");
    const [draft, setDraft] = useState(isLocal ? "" : value);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [broken, setBroken] = useState(false);
    const fileRef = useRef(null);

    useEffect(() => {
      setDraft(value.startsWith("data:") ? "" : value);
      setError("");
      setBroken(false);
    }, [value]);

    const valid = (text) => (kind === "audio"
      ? /^(?:https?:\/\/|data:audio\/|\/dsh-theme-studio\/asset\/)/u.test(text)
      : /^(?:https?:\/\/|data:image\/|\/dsh-theme-studio\/asset\/)/u.test(text));

    const commit = (text) => {
      setDraft(text);
      const trimmed = text.trim();
      if (trimmed === "") {
        onChange("");
        return;
      }
      if (valid(trimmed)) onChange(trimmed);
    };

    const onFile = (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const prefix = kind === "audio" ? "audio/" : "image/";
      if (!file.type.startsWith(prefix)) {
        setError(translate("asset.failed"));
        return;
      }
      if (file.size > 40 * 1024 * 1024) {
        setError(translate("asset.tooLarge"));
        return;
      }
      setBusy(true);
      setError("");
      uploadAsset(file).then((url) => {
        if (typeof url === "string" && url !== "") onChange(url);
        else setError(translate("asset.failed"));
      }).catch(() => setError(translate("asset.failed"))).finally(() => setBusy(false));
    };

    return h("div", { className: "ts-imageSetting" },
      h("div", { className: "ts-imageSettingHead" },
        h("div", { className: "ts-rowTitle" }, title),
        description ? h("div", { className: "ts-rowDesc" }, description) : null),
      h("div", { className: "ts-imageSettingBody" },
        h("div", { className: "ts-imagePreview" },
          value && kind === "image" && !broken
            ? h("img", {
              src: value,
              alt: "",
              className: "ts-imagePreviewImg",
              onError: () => setBroken(true),
            })
            : h("span", { className: "ts-imagePreviewGlyph" }, kind === "audio" ? "♪" : "—"),
          isLocal ? h("span", { className: "ts-imagePreviewTag" }, translate("asset.localTag")) : null),
        h("div", { className: "ts-imageFields" },
          h("input", {
            type: "text",
            className: "ts-input ts-imageInput",
            value: draft,
            placeholder: isLocal ? translate("asset.local") : placeholder,
            spellCheck: false,
            onChange: (event) => commit(event.target.value),
            onBlur: () => { if (draft.trim() !== "" && !valid(draft.trim())) setDraft(isLocal ? "" : value); },
          }),
          h("div", { className: "ts-imageActions" },
            h("input", {
              ref: fileRef,
              type: "file",
              accept: kind === "audio" ? "audio/*" : "image/*",
              style: { display: "none" },
              onChange: onFile,
            }),
            h("button", {
              type: "button",
              className: "ts-btn ts-btnSmall",
              disabled: busy,
              onClick: () => fileRef.current?.click(),
            }, busy
              ? translate("asset.uploading")
              : (isLocal ? translate("asset.replace") : (pickLabel ?? translate("asset.pick")))),
            value
              ? h("button", { type: "button", className: "ts-link", onClick: () => onChange("") }, translate("asset.clear"))
              : null,
            error
              ? h("span", { className: "ts-error" }, error)
              : h("span", { className: "ts-imageHint" }, isLocal ? translate("asset.localHint") : translate("asset.urlHint"))))));
  }

  /* ------------------------------------------------------------------ *
   * Appearance page
   * ------------------------------------------------------------------ */

  function paletteRow(t, field, title, palette, setPalette, resolvedValue, auto) {
    return h(Row, {
      key: field,
      title,
      description: auto ? t("palette.sidebar.desc") : undefined,
    }, h(ColorField, {
      value: palette[field],
      fallback: auto ? resolvedValue : undefined,
      autoLabel: auto ? t("palette.auto") : undefined,
      onAuto: auto ? () => setPalette({ [field]: "" }) : undefined,
      onChange: (next) => setPalette({ [field]: next }),
    }));
  }

  function paletteRows(t, palette, setPalette, resolved) {
    return [
      paletteRow(t, "accent", t("palette.accent"), palette, setPalette, resolved?.accent, false),
      paletteRow(t, "surface", t("palette.surface"), palette, setPalette, resolved?.surface, false),
      paletteRow(t, "ink", t("palette.ink"), palette, setPalette, resolved?.ink, false),
      paletteRow(t, "sidebar", t("palette.sidebar"), palette, setPalette, resolved?.sidebarFill, true),
      h(Row, { key: "contrast", title: t("palette.contrast"), description: t("palette.contrast.desc") },
        h(RangeField, {
          value: palette.contrast,
          min: 0,
          max: 100,
          onChange: (next) => setPalette({ contrast: next }),
        })),
    ];
  }

  function CopyListEditor({ t, theme, field, title, description, onChange, onReroll, onReset }) {
    const view = useView();
    const list = theme.copy[field];
    const items = list.items;
    const setList = (patch) => onChange({ ...list, ...patch });
    const setItems = (nextItems) => setList({ items: nextItems });
    const shown = view.copy.values[field] || "";
    const shownIndex = items.length === 0 ? -1 : (view.copy.indices[field] ?? 0);
    return h("div", { className: "ts-copy" },
      h("div", { className: "ts-copyHead" },
        h("div", { className: "ts-copyTitle" }, title),
        h("div", { className: "ts-copyActions" },
          h(Segmented, {
            small: true,
            value: list.mode,
            options: [
              { value: "sequence", label: t("copy.mode.sequence") },
              { value: "random", label: t("copy.mode.random") },
            ],
            onChange: (mode) => setList({ mode }),
          }),
          list.mode === "sequence" && items.length > 0
            ? h("button", {
              type: "button",
              className: "ts-link",
              onClick: () => onReset(),
            }, t("copy.first"))
            : null,
          h("button", {
            type: "button",
            className: "ts-link",
            disabled: items.length === 0,
            onClick: () => onReroll(),
          }, t("copy.reroll")),
          h("button", {
            type: "button",
            className: "ts-link",
            disabled: items.length >= 20,
            onClick: () => setItems([...items, t("copy.newItem")]),
          }, t("copy.add")))),
      description ? h("div", { className: "ts-copyDesc" }, description) : null,
      items.length === 0
        ? h("div", { className: "ts-copyEmpty" }, t("copy.empty"))
        : items.map((item, index) => h("div", {
          key: index,
          className: index === shownIndex ? "ts-copyItem ts-copyItemOn" : "ts-copyItem",
        },
          h("span", { className: "ts-copyIndex" }, String(index + 1)),
          h("input", {
            type: "text",
            className: "ts-input ts-copyInput",
            value: item,
            placeholder: t("copy.itemPlaceholder"),
            spellCheck: false,
            maxLength: 240,
            onChange: (event) => {
              const next = items.slice();
              next[index] = event.target.value;
              setItems(next);
            },
          }),
          h("button", {
            type: "button",
            className: "ts-mini",
            title: t("copy.up"),
            disabled: index === 0,
            onClick: () => {
              const next = items.slice();
              const moved = next.splice(index, 1)[0];
              next.splice(index - 1, 0, moved);
              setItems(next);
            },
          }, "↑"),
          h("button", {
            type: "button",
            className: "ts-mini",
            title: t("copy.down"),
            disabled: index === items.length - 1,
            onClick: () => {
              const next = items.slice();
              const moved = next.splice(index, 1)[0];
              next.splice(index + 1, 0, moved);
              setItems(next);
            },
          }, "↓"),
          h("button", {
            type: "button",
            className: "ts-mini",
            title: t("copy.remove"),
            onClick: () => setItems(items.filter((_, itemIndex) => itemIndex !== index)),
          }, "×"))),
      h("div", { className: "ts-copyPreview" },
        items.length === 0
          ? t("copy.showing")
          : t("copy.showingIndex").replace("{n}", String(shownIndex + 1)),
        h("span", { className: "ts-copyPreviewValue" }, items.length === 0 ? "—" : shown || "—")));
  }

  /** Miniature two-tone preview of one theme: light half + dark half. */
  function ThemeIcon({ theme }) {
    const palettes = resolvePalettes(theme);
    const half = (palette, key) => h("span", {
      key,
      className: "ts-themeIconHalf",
      style: { background: palette.surface },
    },
    h("span", { className: "ts-themeIconDot", style: { background: palette.accent } }),
    h("span", { className: "ts-themeIconLine", style: { background: palette.ink, top: "12px" } }),
    h("span", { className: "ts-themeIconLine", style: { background: palette.ink, top: "17px", width: "45%" } }));
    return h("span", { className: "ts-themeIcon", "aria-hidden": true },
      half(palettes.light, "light"),
      half(palettes.dark, "dark"));
  }

  function ThemeList({ t }) {
    const view = useView();
    return h("div", { className: "ts-themeList" },
      view.doc.themes.map((theme) => h("div", {
        key: theme.id,
        className: theme.id === view.doc.activeThemeId ? "ts-themeRow ts-themeRowOn" : "ts-themeRow",
      },
      h(ThemeIcon, { theme }),
      h("input", {
        type: "text",
        className: "ts-input ts-themeName",
        value: theme.name,
        spellCheck: false,
        maxLength: 40,
        "aria-label": t("themes.name"),
        onChange: (event) => {
          const name = event.target.value;
          edit((doc) => ({
            ...doc,
            themes: doc.themes.map((item) => item.id === theme.id ? { ...item, name } : item),
          }));
        },
      }),
      theme.id === view.doc.activeThemeId
        ? h("span", { className: "ts-badge" }, t("themes.active"))
        : h("button", {
          type: "button",
          className: "ts-btn ts-btnSmall",
          onClick: () => setActiveTheme(theme.id),
        }, t("themes.use")),
      h("button", {
        type: "button",
        className: "ts-mini",
        title: t("themes.remove"),
        disabled: view.doc.themes.length <= 1,
        onClick: () => removeTheme(theme.id),
      }, "×"))),
      h("div", { className: "ts-themeFoot" },
        h("button", { type: "button", className: "ts-btn", onClick: addTheme }, t("themes.new")),
        h("button", { type: "button", className: "ts-btn", onClick: duplicateTheme }, t("themes.duplicate"))),
      h("div", { className: "ts-presetRow" },
        h("span", { className: "ts-presetLabel" }, t("presets.label")),
        PRESETS.map((preset) => h("button", {
          key: preset.id,
          type: "button",
          className: "ts-btn ts-btnSmall",
          onClick: () => addPreset(preset.id),
        }, t(preset.label)))));
  }

  function AppearancePage() {
    const view = useView();
    const mode = useSyncExternalStore(modeStore.subscribe, modeStore.get);
    const lastAgentPreset = useSyncExternalStore(agentPresetStore.subscribe, agentPresetStore.get);
    const theme = activeTheme(view.doc);
    const resolved = view.resolved;
    const t = (key) => translate(key);
    const [roster, setRoster] = useState({ state: "loading", presets: [] });
    const [rosterToken, setRosterToken] = useState(0);
    const [presetPanel, setPresetPanel] = useState("");

    useEffect(() => {
      let cancelled = false;
      setRoster((current) => ({ ...current, state: "loading" }));
      loadAgentPresets()
        .then((presets) => {
          if (!cancelled) setRoster({ state: "ready", presets });
        })
        .catch(() => {
          if (!cancelled) setRoster((current) => ({ ...current, state: "error" }));
        });
      return () => {
        cancelled = true;
      };
    }, [rosterToken]);

    const setLight = (patch) => editTheme((item) => ({ ...item, light: { ...item.light, ...patch } }));
    const setDark = (patch) => editTheme((item) => ({ ...item, dark: { ...item.dark, ...patch } }));
    const setBackground = (patch) => editTheme((item) => ({ ...item, background: { ...item.background, ...patch } }));
    const setHero = (patch) => editTheme((item) => ({ ...item, hero: { ...item.hero, ...patch } }));
    const setCopy = (field, next) => editTheme((item) => ({ ...item, copy: { ...item.copy, [field]: next } }));
    const setMusic = (patch) => editTheme((item) => ({ ...item, music: { ...item.music, ...patch } }));
    const togglePreset = (themeId, presetId) => {
      edit((doc) => ({
        ...doc,
        themes: doc.themes.map((item) => item.id === themeId
          ? { ...item, presets: togglePresetLink(item.presets, presetId) }
          : item),
      }));
    };

    const modeOptions = [
      { value: "light", label: t("mode.light") },
      { value: "dark", label: t("mode.dark") },
      { value: "system", label: t("mode.system") },
    ];

    const status = view.saving === "saving"
      ? t("status.saving")
      : view.saving === "error"
        ? `${t("status.error")} ${view.error}`
        : view.saving === "saved"
          ? t("status.saved")
          : "";

    const reset = () => edit((doc) => ({
      ...doc,
      themes: doc.themes.map((item) => item.id === doc.activeThemeId ? defaultTheme(item.id, item.name) : item),
    }));

    const copyLabels = {
      headline: "copy.title.headline",
      preview: "copy.title.preview",
      placeholderHero: "copy.title.placeholderHero",
      placeholderDefault: "copy.title.placeholderDefault",
    };
    const copyDescriptions = {
      headline: "copy.headline.desc",
      preview: "copy.preview.desc",
      placeholderHero: "copy.placeholderHero.desc",
      placeholderDefault: "copy.placeholderDefault.desc",
    };

    return h("div", { className: "ts-page" },
      h("h1", { className: "ts-h1" }, t("page.title")),
      h("p", { className: "ts-sub" }, t("page.desc")),

      h(Group, { label: t("group.themes") },
        h(ThemeList, { t })),

      h(Group, { label: t("group.presetLinks") },
        h("div", { className: "ts-copyNote" }, t("presetLink.hint")),
        ...view.doc.themes.map((item) => {
          const open = presetPanel === item.id;
          const selected = item.presets;
          return h("div", { key: item.id, className: "ts-presetLink" },
            h("div", { className: "ts-presetLinkHead" },
              h("span", { className: "ts-presetLinkName" }, item.name || t("themes.name")),
              h("div", { className: "ts-presetChips" },
                selected.length === 0
                  ? h("span", { className: "ts-presetChipsEmpty" }, t("presetLink.empty"))
                  : selected.map((presetId) => h("span", {
                    key: presetId,
                    className: "ts-presetChip",
                    title: presetId,
                  }, presetLinkLabel(roster.presets, presetId)))),
              h("button", {
                type: "button",
                className: "ts-btn ts-btnSmall",
                onClick: () => setPresetPanel(open ? "" : item.id),
              }, open ? t("presetLink.close") : t("presetLink.choose"))),
            open
              ? h("div", { className: "ts-presetPanel" },
                roster.state === "loading"
                  ? h("div", { className: "ts-presetChipsEmpty" }, t("presetLink.loading"))
                  : roster.state === "error"
                    ? h("div", { className: "ts-presetChipsEmpty" },
                      t("presetLink.error"),
                      h("button", {
                        type: "button",
                        className: "ts-link",
                        onClick: () => setRosterToken((value) => value + 1),
                      }, t("presetLink.retry")))
                    : roster.presets.length === 0
                      ? h("div", { className: "ts-presetChipsEmpty" }, t("presetLink.noPresets"))
                      : roster.presets.map((preset) => {
                        const checked = selected.some((entry) => entry.toLowerCase() === preset.id.toLowerCase());
                        return h("label", { key: preset.id, className: "ts-presetOption" },
                          h("input", {
                            type: "checkbox",
                            checked,
                            onChange: () => togglePreset(item.id, preset.id),
                          }),
                          h("span", { className: "ts-presetOptionName" }, preset.name),
                          preset.broken ? h("span", { className: "ts-presetOptionBroken" }, t("presetLink.broken")) : null,
                          h("span", { className: "ts-presetOptionId" }, preset.id));
                      }))
              : null);
        }),
        h("div", { className: "ts-presetDetected" },
          t("presetLink.detected"),
          h("span", { className: "ts-copyPreviewValue" }, lastAgentPreset === "" ? "—" : lastAgentPreset))),

      h(Group, { label: t("group.style") },
        h(Row, { title: t("mode.title"), description: t("mode.desc") },
          h(Segmented, { options: modeOptions, value: mode, onChange: (id) => ctxRef.theme.setTheme(id) }))),

      h(Group, { label: t("group.light") },
        ...paletteRows(t, theme.light, setLight, resolved?.light),
        h(Row, { title: t("separate.title"), description: t("separate.desc") },
          h(Switch, {
            checked: theme.separateDark,
            onChange: (value) => editTheme((item) => ({ ...item, separateDark: value })),
            label: t("separate.title"),
          }))),

      theme.separateDark
        ? h(Group, { label: t("group.dark") }, ...paletteRows(t, theme.dark, setDark, resolved?.dark))
        : h(Group, { label: t("group.dark") },
          h(Row, { title: t("dark.auto.title"), description: t("dark.auto.desc") },
            h("span", { className: "ts-hint" }, t("dark.auto.hint")))),

      h(Group, { label: t("group.semantic") },
        h(Row, { title: t("semantic.success") }, h(ColorField, {
          value: theme.light.success, onChange: (next) => setLight({ success: next }),
        })),
        h(Row, { title: t("semantic.danger") }, h(ColorField, {
          value: theme.light.danger, onChange: (next) => setLight({ danger: next }),
        })),
        h(Row, { title: t("semantic.warn") }, h(ColorField, {
          value: theme.light.warn, onChange: (next) => setLight({ warn: next }),
        })),
        h(Row, { title: t("semantic.idle") }, h(ColorField, {
          value: theme.light.idle, onChange: (next) => setLight({ idle: next }),
        }))),

      h(Group, { label: t("group.background") },
        h(AssetSetting, {
          title: t("bg.image.title"),
          description: t("bg.image.desc"),
          value: theme.background.image,
          placeholder: "https://… / 本地图片",
          onChange: (image) => setBackground({ image }),
        }),
        h(Row, { title: t("bg.strength"), description: t("bg.strength.desc") },
          h(RangeField, {
            value: theme.background.strength, min: 0, max: 100, suffix: "%",
            onChange: (strength) => setBackground({ strength }),
          })),
        h(Row, { title: t("bg.panelOpacity"), description: t("bg.panelOpacity.desc") },
          h(RangeField, {
            value: theme.background.panelOpacity, min: 0, max: 100, suffix: "%",
            onChange: (panelOpacity) => setBackground({ panelOpacity }),
          })),
        h(Row, { title: t("bg.blur"), description: t("bg.blur.desc") },
          h(RangeField, {
            value: theme.background.blur, min: 0, max: 40, suffix: "px",
            onChange: (blur) => setBackground({ blur }),
          })),
        h(Row, { title: t("bg.brightness"), description: t("bg.brightness.desc") },
          h(RangeField, {
            value: theme.background.brightness, min: 30, max: 200, suffix: "%",
            onChange: (brightness) => setBackground({ brightness }),
          })),
        h(Row, { title: t("bg.scrim"), description: t("bg.scrim.desc") },
          h(RangeField, {
            value: theme.background.scrim, min: 0, max: 150, suffix: "%",
            onChange: (scrim) => setBackground({ scrim }),
          })),
        h(Row, { title: t("bg.position") },
          h(Segmented, {
            value: theme.background.position,
            options: [
              { value: "cover", label: t("bg.position.cover") },
              { value: "contain", label: t("bg.position.contain") },
            ],
            onChange: (position) => setBackground({ position }),
          }))),

      h(Group, { label: t("group.music") },
        h("div", { className: "ts-copyNote" }, t("music.hint")),
        h(Row, { title: t("music.enabled"), description: t("music.enabled.desc") },
          h(Switch, {
            checked: theme.music.enabled,
            onChange: (enabled) => setMusic({ enabled }),
            label: t("music.enabled"),
          })),
        h(AssetSetting, {
          kind: "audio",
          title: t("music.file"),
          description: t("music.file.desc"),
          value: theme.music.src,
          placeholder: t("music.placeholder"),
          pickLabel: t("music.pick"),
          onChange: (src) => setMusic({ src }),
        }),
        h(Row, { title: t("music.volume") },
          h(RangeField, {
            value: theme.music.volume, min: 0, max: 100, suffix: "%",
            onChange: (volume) => setMusic({ volume }),
          })),
        h(Row, { title: t("music.loop") },
          h(Switch, {
            checked: theme.music.loop,
            onChange: (loop) => setMusic({ loop }),
            label: t("music.loop"),
          })),
        h(Row, { title: t("music.pauseHidden"), description: t("music.pauseHidden.desc") },
          h(Switch, {
            checked: theme.music.pauseWhenHidden,
            onChange: (pauseWhenHidden) => setMusic({ pauseWhenHidden }),
            label: t("music.pauseHidden"),
          }))),

      h(Group, { label: t("group.hero") },
        h(AssetSetting, {
          title: t("hero.image.title"),
          description: t("hero.image.desc"),
          value: theme.hero.image,
          placeholder: "https://… / 本地图片",
          onChange: (image) => setHero({ image }),
        }),
        h(Row, { title: t("hero.size.title"), description: t("hero.size.desc") },
          h(RangeField, {
            value: theme.hero.size, min: 16, max: 200, suffix: "px",
            onChange: (size) => setHero({ size }),
          }))),

      h(Group, { label: t("group.copy") },
        h("div", { className: "ts-copyNote" }, t("copy.hint")),
        ...COPY_FIELDS.map((field) => h(CopyListEditor, {
          key: field,
          t,
          theme,
          field,
          title: t(copyLabels[field]),
          description: t(copyDescriptions[field]),
          onChange: (next) => setCopy(field, next),
          onReroll: () => rerollCopy(field),
          onReset: () => resetCopyCursor(field),
        }))),

      h("div", { className: "ts-foot" },
        h("span", { className: view.saving === "error" ? "ts-status ts-statusError" : "ts-status" }, status),
        h("button", { type: "button", className: "ts-btn", onClick: reset }, t("reset"))));
  }

  /* ------------------------------------------------------------------ *
   * Locale
   * ------------------------------------------------------------------ */

  const ZH = {
    nav: "自定义主题",
    "page.title": "DSH 自定义主题",
    "page.desc": "多套主题、配色、背景图、首屏立绘与文案。修改即时生效，保存在 DSH 的配置目录。",
    "group.themes": "主题",
    "group.presetLinks": "Agent 预设联动",
    "presetLink.hint": "点「选择预设」多选：会话使用这些 Agent 预设时自动切换到该主题；勾选即保存。",
    "presetLink.choose": "选择预设",
    "presetLink.close": "收起",
    "presetLink.loading": "读取预设列表…",
    "presetLink.error": "读取预设列表失败",
    "presetLink.retry": "重试",
    "presetLink.empty": "未绑定预设",
    "presetLink.noPresets": "没有可选的 Agent 预设",
    "presetLink.broken": "加载失败",
    "presetLink.detected": "当前会话的 Agent 预设：",
    "group.style": "视觉风格",
    "group.light": "配色",
    "group.dark": "深色配色",
    "group.semantic": "语义色",
    "group.background": "背景图",
    "group.music": "背景音乐",
    "group.hero": "首屏立绘",
    "group.copy": "文案",
    "themes.name": "主题名称",
    "themes.use": "使用",
    "themes.active": "使用中",
    "themes.remove": "删除主题",
    "themes.new": "新建主题",
    "themes.duplicate": "复制当前主题",
    "mode.title": "模式",
    "mode.desc": "跟随系统时，浅色/深色由操作系统决定",
    "mode.light": "浅色",
    "mode.dark": "深色",
    "mode.system": "跟随系统",
    "palette.accent": "强调色",
    "palette.surface": "背景",
    "palette.ink": "前景",
    "palette.sidebar": "侧栏背景",
    "palette.sidebar.desc": "留空时由背景色自动推导",
    "palette.contrast": "对比度",
    "palette.contrast.desc": "同时影响凸起层级与描边强度",
    "palette.auto": "自动",
    "separate.title": "分别设置深色配色",
    "separate.desc": "关闭时由浅色配色按同一色相自动生成深色",
    "dark.auto.title": "深色配色由浅色自动生成",
    "dark.auto.desc": "打开上方的开关即可单独编辑深色的强调色、背景与前景",
    "dark.auto.hint": "自动",
    "semantic.success": "成功",
    "semantic.danger": "错误",
    "semantic.warn": "警告",
    "semantic.idle": "次要",
    "bg.image.title": "图片地址",
    "bg.image.desc": "可点「选择本地文件」上传（保存到 DSH 配置目录），也可直接填 https 链接",
    "bg.strength": "主界面可见度",
    "bg.strength.desc": "页面底色与侧栏的透明程度，越大背景图越清楚（0 表示关闭透出）",
    "bg.panelOpacity": "子界面不透明度",
    "bg.panelOpacity.desc": "设置面板、弹窗、卡片等浮层的透明度；100% 为完全不透明，避免与背景文字重叠",
    "bg.blur": "模糊",
    "bg.blur.desc": "0–40px",
    "bg.brightness": "亮度",
    "bg.brightness.desc": "30%–200%",
    "bg.scrim": "文字遮罩",
    "bg.scrim.desc": "壁纸上的同色遮罩强度，越高段落文字越清楚（0 关闭）",
    "bg.position": "铺满方式",
    "bg.position.cover": "铺满",
    "bg.position.contain": "适应",
    "hero.image.title": "立绘图片",
    "hero.image.desc": "替换首屏标题前的品牌图形；可选本地图片，也可填 https 链接",
    "hero.size.title": "立绘尺寸",
    "hero.size.desc": "首屏立绘的显示宽度",
    "copy.hint": "每个文案字段可以放多条。顺序：每次打开页面按列表顺序轮换一条，游标存在主题里，所以「当前显示」是第几条以高亮行为准；随机：每次随机挑一条。留空使用内置文案。",
    "copy.title.headline": "首屏标题",
    "copy.title.preview": "角标文案",
    "copy.title.placeholderHero": "首屏输入框提示",
    "copy.title.placeholderDefault": "会话输入框提示",
    "copy.headline.desc": "首屏大标题",
    "copy.preview.desc": "标题旁的胶囊标签",
    "copy.placeholderHero.desc": "新会话首屏输入框的占位文案",
    "copy.placeholderDefault.desc": "已有对话中输入框的占位文案",
    "copy.mode.sequence": "顺序",
    "copy.mode.random": "随机",
    "copy.add": "添加一条",
    "copy.newItem": "新文案",
    "copy.remove": "删除",
    "copy.up": "上移",
    "copy.down": "下移",
    "copy.reroll": "换一条",
    "copy.empty": "留空使用内置文案",
    "copy.showing": "当前显示：",
    "copy.showingIndex": "当前显示（第 {n} 条）：",
    "copy.first": "回到第一条",
    "copy.itemPlaceholder": "输入一条文案，留空则忽略",
    "image.pick": "选择本地图片",
    "image.replace": "选择其他图片",
    "image.clear": "清除",
    "image.busy": "上传中…",
    "image.error": "读取图片失败",
    "image.tooLarge": "图片过大（上限 40MB）",
    "image.localTag": "本地",
    "image.local": "已选本地图片（点输入框可换成链接）",
    "image.localHint": "已保存到 DSH 配置目录的 assets 下",
    "image.urlHint": "可粘贴 https 链接，也可选择本地图片",
    "asset.pick": "选择本地文件",
    "asset.replace": "选择其他文件",
    "asset.clear": "清除",
    "asset.uploading": "上传中…",
    "asset.failed": "上传失败（仅支持常见图片/音频格式）",
    "asset.tooLarge": "文件过大（上限 40MB）",
    "asset.localTag": "本地",
    "asset.local": "已选本地文件（点输入框可换成链接）",
    "asset.localHint": "已保存到 DSH 配置目录的 assets 下",
    "asset.urlHint": "可粘贴 https 链接，也可选择本地文件",
    "presets.label": "预设主题",
    "presets.everforest": "＋ Everforest",
    "presets.demiurge": "＋ 德谬歌",
    "group.music": "背景音乐",
    "music.hint": "背景音乐按主题保存。浏览器要求先与页面交互一次才会播放；之后切换主题会自动切歌。",
    "music.enabled": "启用背景音乐",
    "music.enabled.desc": "只播放当前主题的音乐；关闭后暂停",
    "music.file": "音乐文件",
    "music.file.desc": "选择本地音频（mp3/wav/ogg/m4a/flac），或粘贴 https 链接",
    "music.placeholder": "https://… / 本地音频",
    "music.pick": "选择本地音乐",
    "music.volume": "音量",
    "music.loop": "循环播放",
    "music.pauseHidden": "最小化时暂停",
    "music.pauseHidden.desc": "窗口最小化或切到后台时暂停，回到界面继续播放",
    "status.saving": "保存中…",
    "status.saved": "已保存",
    "status.error": "保存失败：",
    reset: "重置当前主题",
  };

  const EN = {
    nav: "Custom theme",
    "page.title": "DSH Custom Theme",
    "page.desc": "Multiple themes, palettes, wallpaper, hero artwork and copy. Changes apply immediately and are saved in the DSH config directory.",
    "group.themes": "Themes",
    "group.presetLinks": "Agent preset linking",
    "presetLink.hint": "Pick the Agent presets this theme belongs to: the matching theme is activated when a session runs one of them. Checking saves immediately.",
    "presetLink.choose": "Choose presets",
    "presetLink.close": "Close",
    "presetLink.loading": "Loading presets…",
    "presetLink.error": "Could not load presets",
    "presetLink.retry": "Retry",
    "presetLink.empty": "No preset bound",
    "presetLink.noPresets": "No Agent presets available",
    "presetLink.broken": "broken",
    "presetLink.detected": "Current session's Agent preset:",
    "group.style": "Visual style",
    "group.light": "Colors",
    "group.dark": "Dark colors",
    "group.semantic": "Semantic colors",
    "group.background": "Wallpaper",
    "group.music": "Background music",
    "group.hero": "Hero artwork",
    "group.copy": "Copy",
    "themes.name": "Theme name",
    "themes.use": "Use",
    "themes.active": "Active",
    "themes.remove": "Delete theme",
    "themes.new": "New theme",
    "themes.duplicate": "Duplicate current",
    "mode.title": "Mode",
    "mode.desc": "With System, the operating system decides light or dark",
    "mode.light": "Light",
    "mode.dark": "Dark",
    "mode.system": "System",
    "palette.accent": "Accent",
    "palette.surface": "Background",
    "palette.ink": "Foreground",
    "palette.sidebar": "Sidebar background",
    "palette.sidebar.desc": "Empty derives it from the background",
    "palette.contrast": "Contrast",
    "palette.contrast.desc": "Drives raised surfaces and border strength",
    "palette.auto": "Auto",
    "separate.title": "Separate dark colors",
    "separate.desc": "Off derives dark from light in the same hue",
    "dark.auto.title": "Dark colors are derived from light",
    "dark.auto.desc": "Turn the switch on to edit the dark accent, background and foreground",
    "dark.auto.hint": "Auto",
    "semantic.success": "Success",
    "semantic.danger": "Error",
    "semantic.warn": "Warning",
    "semantic.idle": "Idle",
    "bg.image.title": "Image",
    "bg.image.desc": "Pick a local file (stored in the DSH config directory), or paste an https URL",
    "bg.strength": "Page visibility",
    "bg.strength.desc": "Transparency of the page background and sidebar; higher shows more of the wallpaper (0 disables it)",
    "bg.panelOpacity": "Sub-interface opacity",
    "bg.panelOpacity.desc": "Opacity of panels, popovers and cards; 100% keeps them opaque so text never overlaps the page behind",
    "bg.blur": "Blur",
    "bg.blur.desc": "0–40px",
    "bg.brightness": "Brightness",
    "bg.brightness.desc": "30%–200%",
    "bg.scrim": "Text scrim",
    "bg.scrim.desc": "Strength of the theme-colored veil over the wallpaper; higher keeps paragraph text clearer (0 disables)",
    "bg.position": "Fit",
    "bg.position.cover": "Cover",
    "bg.position.contain": "Contain",
    "hero.image.title": "Hero image",
    "hero.image.desc": "Replaces the brand mark before the hero headline; pick a local image or paste an https URL",
    "hero.size.title": "Hero size",
    "hero.size.desc": "Rendered width of the hero artwork",
    "copy.hint": "Each field takes several lines. Sequence: rotates one line per page load, the cursor lives in the theme, so the highlighted row is the one shown; Random: picks one at random. Empty keeps the shipped copy.",
    "copy.title.headline": "Hero headline",
    "copy.title.preview": "Badge",
    "copy.title.placeholderHero": "Hero placeholder",
    "copy.title.placeholderDefault": "Composer placeholder",
    "copy.headline.desc": "The big hero headline",
    "copy.preview.desc": "The pill beside the headline",
    "copy.placeholderHero.desc": "Placeholder of the blank-session composer",
    "copy.placeholderDefault.desc": "Placeholder of the composer inside a conversation",
    "copy.mode.sequence": "Seq",
    "copy.mode.random": "Random",
    "copy.add": "Add line",
    "copy.newItem": "New line",
    "copy.remove": "Remove",
    "copy.up": "Move up",
    "copy.down": "Move down",
    "copy.reroll": "Next",
    "copy.empty": "Empty keeps the shipped copy",
    "copy.showing": "Showing:",
    "copy.showingIndex": "Showing (line {n}):",
    "copy.first": "First line",
    "copy.itemPlaceholder": "One line; empty lines are ignored",
    "image.pick": "Pick local image",
    "image.replace": "Pick another image",
    "image.clear": "Clear",
    "image.busy": "Processing…",
    "image.error": "Could not read that image",
    "image.tooLarge": "Image too large (30MB max)",
    "image.localTag": "local",
    "image.local": "Local image selected (type a URL to replace it)",
    "image.localHint": "Stored under the DSH config directory's assets folder",
    "image.urlHint": "Paste an https URL, or pick a local image",
    "asset.pick": "Pick local file",
    "asset.replace": "Pick another file",
    "asset.clear": "Clear",
    "asset.uploading": "Uploading…",
    "asset.failed": "Upload failed (common image/audio formats only)",
    "asset.tooLarge": "File too large (40MB max)",
    "asset.localTag": "local",
    "asset.local": "Local file selected (type a URL to replace it)",
    "asset.localHint": "Stored under the DSH config directory's assets folder",
    "asset.urlHint": "Paste an https URL, or pick a local file",
    "presets.label": "Presets",
    "presets.everforest": "+ Everforest",
    "presets.demiurge": "+ Demiurge",
    "group.music": "Background music",
    "music.hint": "Music is saved per theme. Browsers start audio only after the first interaction; switching themes then switches the track.",
    "music.enabled": "Enable background music",
    "music.enabled.desc": "Plays the current theme's track only; turning it off pauses",
    "music.file": "Music file",
    "music.file.desc": "Pick a local audio file (mp3/wav/ogg/m4a/flac), or paste an https URL",
    "music.placeholder": "https://… / local audio",
    "music.pick": "Pick local audio",
    "music.volume": "Volume",
    "music.loop": "Loop",
    "music.pauseHidden": "Pause when minimized",
    "music.pauseHidden.desc": "Pause while the window is minimized or in the background, resume when it returns",
    "status.saving": "Saving…",
    "status.saved": "Saved",
    "status.error": "Save failed: ",
    reset: "Reset current theme",
  };

  let translate = (key) => key;

  /* ------------------------------------------------------------------ *
   * Styles
   * ------------------------------------------------------------------ */

  const STUDIO_CSS = `
.ts-page{box-sizing:border-box;max-width:680px;padding:20px 0 48px;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.ts-h1{margin:0;font-size:26px;line-height:32px;font-weight:600;letter-spacing:.2px}
.ts-sub{margin:8px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.ts-group{margin-top:24px}
.ts-groupLabel{margin:0 0 8px 2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;font-weight:500}
.ts-card{border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.ts-row{display:flex;align-items:center;gap:16px;padding:12px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.ts-row:last-child{border-bottom:0}
.ts-rowText{flex:1;min-width:0}
.ts-rowTitle{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px}
.ts-rowDesc{margin-top:2px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.ts-control{flex:none;display:flex;align-items:center;gap:8px;max-width:60%}
.ts-seg{display:inline-flex;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2)}
.ts-segSmall .ts-segBtn{padding:1px 8px;font-size:12px}
.ts-segBtn{border:0;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:13px;line-height:20px;padding:3px 12px;cursor:pointer}
.ts-segBtn:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.ts-segBtnOn,.ts-segBtnOn:hover{background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);box-shadow:0 0 0 .5px var(--dsw-alias-border-l2),0 2px 6px rgba(0,0,0,.06)}
.ts-switch{position:relative;flex:none;width:36px;height:20px;border:.5px solid var(--dsw-alias-border-l2);border-radius:999px;background:var(--dsw-alias-bg-layer-2);cursor:pointer;padding:0;transition:background .15s}
.ts-switchOn{background:var(--dsw-alias-brand-primary);border-color:transparent}
.ts-switchKnob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:var(--dsw-alias-bg-overlay);box-shadow:0 1px 2px rgba(0,0,0,.15);transition:transform .15s}
.ts-switchOn .ts-switchKnob{transform:translateX(16px)}
.ts-range{display:inline-flex;align-items:center;gap:10px}
.ts-range input[type=range]{width:170px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.ts-rangeValue{min-width:48px;color:var(--dsw-alias-label-secondary);font-size:12px;font-variant-numeric:tabular-nums;text-align:right}
.ts-color{display:inline-flex;align-items:center;gap:8px}
.ts-swatch{flex:none;width:26px;height:26px;padding:0;border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:transparent;cursor:pointer;-webkit-appearance:none;appearance:none}
.ts-swatch::-webkit-color-swatch-wrapper{padding:0}
.ts-swatch::-webkit-color-swatch{border:0;border-radius:6px}
.ts-hex{width:92px;box-sizing:border-box;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code);font-size:12px;line-height:18px;padding:3px 8px;text-transform:lowercase}
.ts-hex:focus,.ts-input:focus{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-1px}
.ts-input{box-sizing:border-box;min-width:160px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:3px 8px}
.ts-inputWide{width:min(320px,40vw)}
.ts-themeList{display:flex;flex-direction:column}
.ts-themeRow{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.ts-themeRowOn{background:var(--dsw-alias-bg-layer-2)}
.ts-themeRow .ts-themeName{flex:1;min-width:0;background:transparent;border-color:transparent}
.ts-themeRow .ts-themeName:focus{background:var(--dsw-alias-bg-overlay);border-color:var(--dsw-alias-border-l2)}
.ts-themeIcon{flex:none;width:36px;height:28px;border-radius:8px;overflow:hidden;display:flex;border:.5px solid var(--dsw-alias-border-l2);box-shadow:0 1px 2px rgba(0,0,0,.08)}
.ts-themeIconHalf{flex:1;position:relative;min-width:0}
.ts-themeIconDot{position:absolute;left:4px;top:4px;width:5px;height:5px;border-radius:50%}
.ts-themeIconLine{position:absolute;left:4px;right:6px;height:2px;border-radius:1px;opacity:.55}
.ts-badge{flex:none;border-radius:999px;background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-brand-primary);font-size:11px;line-height:16px;padding:1px 9px}
.ts-themeFoot{display:flex;gap:10px;padding:10px 16px}
.ts-presetRow{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;border-top:.5px solid var(--dsw-alias-border-l1)}
.ts-presetLabel{color:var(--dsw-alias-label-secondary);font-size:12px}
.ts-presetDetected{display:flex;gap:6px;padding:10px 16px;border-top:.5px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.ts-presetLink{padding:10px 16px;border-top:.5px solid var(--dsw-alias-border-l1)}
.ts-presetLinkHead{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.ts-presetLinkName{font-size:13px;line-height:20px;font-weight:500;min-width:88px}
.ts-presetChips{display:flex;align-items:center;gap:6px;flex-wrap:wrap;flex:1;min-width:0}
.ts-presetChip{border-radius:10px;background:var(--dsw-alias-state-business-tertiary);color:var(--dsw-alias-brand-primary);padding:1px 8px;font-size:12px;line-height:18px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ts-presetChipsEmpty{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.ts-presetPanel{display:flex;flex-direction:column;gap:1px;padding:8px 0 2px}
.ts-presetOption{display:flex;align-items:center;gap:8px;padding:4px 8px;border-radius:8px;cursor:pointer}
.ts-presetOption:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ts-presetOption input{accent-color:var(--dsw-alias-brand-primary);flex:none}
.ts-presetOptionName{font-size:13px;line-height:20px;color:var(--dsw-alias-label-primary)}
.ts-presetOptionBroken{color:var(--dsw-alias-state-error-primary);font-size:11px}
.ts-presetOptionId{margin-left:auto;color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums}
.ts-imagePreviewGlyph{color:var(--dsw-alias-label-secondary);font-size:22px;line-height:1}
.ts-btn{border:.5px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;line-height:20px;padding:4px 14px;cursor:pointer}
.ts-btn:hover{background:var(--dsw-alias-interactive-bg-hover)}
.ts-btnSmall{padding:1px 10px;font-size:12px}
.ts-link{border:0;background:transparent;padding:0;color:var(--dsw-alias-brand-primary);font:inherit;font-size:13px;cursor:pointer}
.ts-link:hover{text-decoration:underline}
.ts-link:disabled{color:var(--dsw-alias-label-dimmed);cursor:default;text-decoration:none}
.ts-mini{flex:none;width:24px;height:24px;border:.5px solid var(--dsw-alias-border-l2);border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:12px;line-height:1;cursor:pointer;padding:0}
.ts-mini:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
.ts-mini:disabled{opacity:.4;cursor:default}
.ts-imageSetting{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.ts-imageSettingHead{display:flex;flex-direction:column;gap:2px}
.ts-imageSettingBody{display:flex;align-items:flex-start;gap:12px;min-width:0}
.ts-imagePreview{flex:none;position:relative;width:56px;height:56px;border-radius:10px;border:.5px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);overflow:hidden;display:flex;align-items:center;justify-content:center}
.ts-imagePreviewImg{width:100%;height:100%;object-fit:cover;display:block}
.ts-imagePreviewEmpty{color:var(--dsw-alias-label-dimmed);font-size:16px}
.ts-imagePreviewTag{position:absolute;left:2px;bottom:2px;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-secondary);font-size:9px;line-height:14px}
.ts-imageFields{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.ts-imageInput{width:100%}
.ts-imageActions{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ts-imageHint{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.ts-hint{color:var(--dsw-alias-label-tertiary);font-size:12px}
.ts-copy{display:flex;flex-direction:column;gap:8px;padding:12px 16px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.ts-copy:last-child{border-bottom:0}
.ts-copyHead{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ts-copyTitle{color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;font-weight:500}
.ts-copyActions{display:flex;align-items:center;gap:12px;margin-left:auto}
.ts-copyDesc{color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.ts-copyNote{padding:12px 16px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.ts-copyItem{display:flex;align-items:center;gap:8px;border-radius:8px;padding:2px 6px;margin:0 -6px}
.ts-copyItemOn{background:var(--dsw-alias-state-business-tertiary);box-shadow:inset 2px 0 0 var(--dsw-alias-brand-primary)}
.ts-copyItemOn .ts-copyIndex{color:var(--dsw-alias-brand-primary);font-weight:600}
.ts-copyIndex{flex:none;width:18px;color:var(--dsw-alias-label-tertiary);font-size:12px;font-variant-numeric:tabular-nums;text-align:right}
.ts-copyInput{flex:1;min-width:0}
.ts-copyEmpty{color:var(--dsw-alias-label-tertiary);font-size:12px}
.ts-copyPreview{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.ts-copyPreviewValue{color:var(--dsw-alias-label-secondary)}
.ts-error{color:var(--dsw-alias-state-error-primary);font-size:12px}
.ts-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-top:28px}
.ts-status{color:var(--dsw-alias-label-tertiary);font-size:12px}
.ts-statusError{color:var(--dsw-alias-state-error-primary)}
.ts-hero-art{user-select:none;-webkit-user-drag:none}
@media (max-width:720px){.ts-control{max-width:50%}.ts-inputWide{width:100%}}
`;

  /* ------------------------------------------------------------------ *
   * Plugin entry
   * ------------------------------------------------------------------ */

  const inject = ["slots", "theme", "locale"];

  /**
   * Mount the browser half.
   *
   * @param ctx - Client cordis context.
   */
  function apply(ctx) {
    ctxRef = ctx;
    translate = (key) => ctx.locale.bind(NS)(key);

    ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), "dsh-custom-theme: dictionaries");

    ctx.effect(() => {
      studioTag = document.createElement("style");
      studioTag.dataset.plugin = SOURCE;
      studioTag.dataset.pluginCss = `${SOURCE}/studio.css`;
      studioTag.textContent = STUDIO_CSS;
      document.head.appendChild(studioTag);
      return () => {
        studioTag?.remove();
        studioTag = null;
      };
    }, "dsh-custom-theme: studio stylesheet");

    ctx.effect(() => {
      copyTag = document.createElement("style");
      copyTag.dataset.plugin = SOURCE;
      copyTag.dataset.pluginCss = `${SOURCE}/applied.css`;
      document.head.appendChild(copyTag);
      return () => {
        copyTag?.remove();
        copyTag = null;
      };
    }, "dsh-custom-theme: applied stylesheet");

    ctx.effect(() => {
      modeStore.set(ctx.theme.getTheme().preference);
      return ctx.on("theme/change", (snapshot) => modeStore.set(snapshot.preference));
    }, "dsh-custom-theme: mode preference");

    // Pause / resume background music with window visibility (minimize, tab switch).
    ctx.effect(() => {
      if (typeof document.addEventListener !== "function") return () => {};
      document.addEventListener("visibilitychange", onVisibilityChange);
      return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    }, "dsh-custom-theme: music visibility");

    ctx.effect(() => () => {
      if (tokenDisposer !== null) {
        tokenDisposer();
        tokenDisposer = null;
      }
      if (heroDisposer !== null) {
        heroDisposer();
        heroDisposer = null;
      }
      while (presetWatchers.length > 0) {
        const dispose = presetWatchers.pop();
        try {
          dispose();
        } catch {
          /* already disposed with the plugin context */
        }
      }
      if (saveTimer !== null) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      stopMusic();
    }, "dsh-custom-theme: applied theme");

    ctx.slots.inject("settings.section", () => ctx.slots.register({
      name: "settings.section",
      id: "theme-studio",
      order: 12,
      label: () => translate("nav"),
    }, AppearancePage));

    // Paint immediately with the default theme, then adopt the saved document.
    setView(viewStore.get());

    ctx.effect(() => {
      let alive = true;
      loadDocument().then((payload) => {
        if (!alive) return;
        const saved = payload.document;
        const doc = saved === null || saved === undefined ? defaultDocument() : normalizeDocument(saved.state);
        const theme = activeTheme(doc);
        const copy = resolveCopy(theme, true);
        const next = {
          doc: {
            ...doc,
            themes: doc.themes.map((item) => item.id === theme.id ? { ...item, cursor: copy.cursors } : item),
          },
          resolved: resolvePalettes(theme),
          copy: { values: copy.values, indices: copy.indices },
          saving: "idle",
          error: "",
          loaded: true,
        };
        setView(next);
        // Persist the advanced sequential cursors (and the first-run document).
        scheduleSave(next);
      }).catch((error) => {
        if (!alive) return;
        viewStore.patch({ saving: "error", error: error instanceof Error ? error.message : String(error), loaded: true });
      });
      return () => {
        alive = false;
      };
    }, "dsh-custom-theme: load theme document");
  }

  /* ------------------------------------------------------------------ *
   * Exports (the model is exported for tests; the loader only needs the
   * plugin contract above, extra keys are harmless).
   * ------------------------------------------------------------------ */

  exports.name = "dsh-custom-theme";
  exports.inject = inject;
  exports.apply = apply;
  exports.__model = {
    THEME_VERSION,
    COPY_FIELDS,
    defaultDocument,
    defaultTheme,
    defaultMusic,
    normalizeMusic,
    demiurgeTheme,
    PRESETS,
    PRESET_VERSION,
    presetDesign,
    presetDesignSnapshot,
    normalizePresetLinks,
    themeForAgentPreset,
    togglePresetLink,
    presetLinkLabel,
    normalizeDocument,
    activeTheme,
    resolvePalettes,
    deriveTokens,
    buildTokens,
    resolveCopy,
    syncCopyValues,
    buildCopyCss,
    buildWallpaperCss,
    buildBootHint,
    pickCopy,
  };
  exports.__stores = { viewStore, modeStore, agentPresetStore };
  exports.__locale = { zh: ZH, en: EN };
  exports.__edit = edit;
  exports.__rerollCopy = rerollCopy;
  exports.__applyView = applyView;
  exports.__themeOps = { addTheme, duplicateTheme, removeTheme, setActiveTheme };
  exports.__agentPresets = { applyAgentPreset }; 
  return module.exports;
} });
