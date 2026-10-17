# DSH 自定义主题

包名：`dsh-custom-theme`（0.3.0 之前叫 `dsh-theme-everforest`）。

DeepSeek Harness 的**自定义主题插件**：多套主题可新建 / 切换 / 重命名 / 复制 / 删除，每套主题都能改
配色（浅色 + 深色 + 语义色）、背景图与视觉效果、首屏立绘、以及**多条轮换文案**。

A custom-theme plugin for DeepSeek Harness: several switchable themes, each with palettes
(light + dark + semantic), a wallpaper with effects, hero artwork, and multi-line copy shown
in order or at random.

设置页在 **设置 → 自定义主题**（`settings.section`，id `theme-studio`）。

## 功能

| 分组 | 内容 |
| --- | --- |
| 主题 | 主题列表：**双色迷你预览图标**（浅色一半 + 深色一半，取该主题的底色/强调色/前景色生成）、改名字、切换「使用」、删除（至少保留一套）、新建主题、复制当前主题；**预设主题**：Everforest、德谬歌 |
| 视觉风格 | 模式：浅色 / 深色 / 跟随系统（写回 DSH 内置偏好） |
| 配色 | 强调色、背景、前景、侧栏背景（可留空自动推导）、对比度 0–100 |
| 深色配色 | 「分别设置深色配色」开关；开启后单独编辑深色的一套；关闭时按浅色色相自动生成 |
| 语义色 | 成功 / 错误 / 警告 / 次要 |
| 背景图 | **选择本地图片**或填图片地址、**主界面可见度 0–100%**、**子界面不透明度 0–100%**、**模糊 0–40px**、**亮度 30–200%**、铺满 / 适应 |
| 背景音乐 | 每套主题一首：**选择本地音乐**（mp3/wav/ogg/m4a/flac）或填链接、启用开关、音量、循环；切换主题自动切歌 |
| 首屏立绘 | **选择本地图片**或填地址、显示宽度 16–200px |
| 文案 | 4 个字段（首屏标题、角标、首屏输入框提示、会话输入框提示），每个字段可放**多条**：**顺序**轮换或**随机**显示，可增删/上移/下移/换一条 |

修改即时生效（本地推导 token，不等保存回包），约 160ms 防抖后写入配置目录，页脚显示保存状态。

> 0.5.1：预设主题行去掉「套用到当前主题」按钮，只保留两个预设按钮。
>
> 0.5.0：新增**德谬歌预设主题**（依据昔涟 / 第十三位泰坦设定）与**背景音乐**；本地图片/音频改为
> 上传到宿主 `assets` 目录（不再把大图内联进文档，壁纸也不再压缩）。
>
> 0.4.2：**主界面可见度与子界面不透明度拆成两个开关**（默认子界面 100% 不透明，解决设置面板/卡片
> 透出背景文字重叠）；主题列表图标改为按主题配色生成的迷你双色预览；图片地址行重排为
> 「缩略图 + 输入框 + 操作按钮 + 提示」的整行布局。
>
> 0.4.1：修掉文案标题显示成 `copy.headline` 这类原始 key 的问题（补了 `copy.title.*` 词典并让
> 「当前显示」改用独立 key）；背景图与立绘都支持**直接选本地图片**。

## 德谬歌预设（依据昔涟 / 第十三位泰坦设定）

德谬歌是昔涟的完整形态：第十三位泰坦、权杖 δ-me13 的本源，「十三种光彩」，击败铁幕、闭合因果后
以孩童模样回归最初。预设把设定落成这套观感：

| 部位 | 设计 |
| --- | --- |
| 配色 | 浅色 **粉白**（`#fff7fc` 底 / `#e58bb4` 强调 / `#4a3a57` 前景），深色 **夜幕紫**（`#161020` 底 / `#f0a8cc` 强调 / `#f4e9f3` 前景）——粉白发色、蓝眸与星空记忆的对照 |
| 立绘 | 13 个光点环绕的羽翼光环（十三种光彩，内圈成对羽翼 = 权杖本源），尺寸 96px |
| 文案 | 标题「德谬歌 / 第十三泰坦 / 忆海无垠，故事为舟」，角标「第十三泰坦 / 第十三种光彩」，占位「拾起一段记忆…」「三千万次轮回，皆为你执笔」 |
| 壁纸 | **不内置**：添加预设时直接沿用当前主题的壁纸（保留其可见度/模糊/亮度/铺满方式）；当前主题没有壁纸时才用内置星空兜底 |
| 音乐 | 默认为空并关闭，等你放入音乐文件 |

入口：主题分组底部「预设主题：＋ 德谬歌」。

## 背景音乐

- **按主题保存**：每套主题有各自的 `music.src / enabled / volume / loop`，切主题即切歌；
- **本地文件**：点「选择本地音乐」上传到宿主 `assets` 目录（也可直接填 https 链接）；
- **浏览器自动播放限制**：首次加载不会自动响，需要你先与页面交互一次（点击/按键），之后切换主题、
  重新启用都会继续播放；关闭开关即暂停。

## 本地文件怎么工作

本地图片/音频不再内联进主题文档，而是**上传到宿主**：

1. 客户端把选中的文件 POST 到 `/dsh-theme-studio/asset`；
2. 宿主按魔数识别类型（png/jpg/webp/gif/svg、mp3/wav/ogg/m4a/flac），写入
   `<DSH_HOME>/theme-studio/assets/<随机名>.<ext>`，返回同源 URL；
3. 文档里只存 URL；`GET /dsh-theme-studio/asset/<name>` 负责提供文件（带 Range 支持，音频可拖动进度）。

旧的 `data:image/...` 内联图仍然兼容（此前版本保存的壁纸不受影响）。单文件上限 40MB。

## 修复：配色改完又变回原色

0.2.0 的设置页把 React 的 `key`（`"light.accent"`）当成了调色板字段名去读写，于是颜色被写进
`state.light["light.accent"]` 这种无效字段，保存时被宿主归一化丢弃，回包又把旧颜色刷回来。

0.3.0 的修法有两层：

1. 键名分离：调色板行按字段名 `accent / surface / ink / sidebar / contrast` 读写；
2. **token 由客户端本地推导**：每次编辑立刻 `theme.overrideTokens()` 重绘，保存回包只作回执，
   不再用服务端状态覆盖本地草案 —— 从结构上杜绝"保存后被刷回去"。

## 架构（为什么以后改主题不用重启 DSH）

- **宿主半** `lib/index.js`：薄的文档存储 + 首屏提示。
  - `GET/POST /dsh-theme-studio/document`：读写 `<DSH_HOME>/theme-studio/theme.json`；
  - `webserver/index-inject`：在页面首帧前按 `boot` 提示刷底色和壁纸，UI 挂载后由 token 接管
    （`html[data-ts-ready]`）。
- **浏览器半** `client/client.js`：全部主题逻辑（文档模型、token 推导、文案、壁纸、设置页）。
  它把模型导出为 `__model` 供测试使用。

因此主题功能迭代只需刷新页面（客户端半由 `dsh-client-hmr` 轮询热更新）；只有传输/宿主逻辑变化
才需要重启一次 DSH。

## 数据

```
<DSH_HOME>/theme-studio/theme.json      # 默认 ~/.dsh/theme-studio/theme.json
```

```jsonc
{
  "version": 1,
  "boot": {
    "light": "#fdf6e3",
    "dark": "#2d353b",
    "wallpaper": { "image": "https://…", "blur": 4, "brightness": 90, "position": "cover" }
  },
  "state": {
    "version": 3,
    "activeThemeId": "everforest",
    "themes": [
      {
        "id": "everforest",
        "name": "Everforest",
        "light": { "accent": "#93b259", "surface": "#fdf6e3", "ink": "#5c6a72", "contrast": 45,
                    "success": "#8da101", "danger": "#f85552", "warn": "#dfa000", "idle": "#829181",
                    "sidebar": "" },
        "dark":  { "accent": "#a7c080", "surface": "#2d353b", "ink": "#d3c6aa", "contrast": 45,
                    "success": "#8da101", "danger": "#f85552", "warn": "#dfa000", "idle": "#829181",
                    "sidebar": "" },
        "separateDark": true,
        "background": { "image": "", "strength": 0, "panelOpacity": 100, "blur": 0, "brightness": 100, "position": "cover" },
        "hero": { "image": "", "size": 34 },
        "music": { "src": "", "enabled": false, "volume": 45, "loop": true },
        "copy": {
          "headline": { "mode": "sequence", "items": ["探索未至之境"] },
          "preview": { "mode": "sequence", "items": [] },
          "placeholderHero": { "mode": "sequence", "items": [] },
          "placeholderDefault": { "mode": "sequence", "items": [] }
        },
        "cursor": { "headline": 1, "preview": 0, "placeholderHero": 0, "placeholderDefault": 0 }
      }
    ]
  }
}
```

v1/v2 的单主题文档会在加载时自动迁移到 `themes` 数组。

## 文案的轮换语义

- **顺序**：每次页面加载显示当前游标那一条，然后把游标 +1 存回文档 → 下次加载显示下一条，循环；
- **随机**：每次页面加载随机挑一条（游标不动）；
- 设置页的「换一条」立即把该字段切到下一条/随机一条，并显示「当前显示」。

## 背景图怎么生效

应用表面全部由 `--dsw-alias-*` token 上色，所以壁纸方案是：

1. 客户端注入 `body::before` 固定层，铺图片并按设置做模糊/亮度；
2. **主界面**（页面底色 `bg-base`、侧栏 `specific-sidebar-fill`）按**主界面可见度**变半透明，让固定层透出来；
3. **子界面**（设置面板、弹窗、卡片、输入框等 `bg-layer-1/2`、`bg-overlay`、`specific-menu/selector`）
   由**子界面不透明度**控制，默认 100% 不透明 —— 背景再透也不会让浮层里的文字和背后内容重叠；
4. 文字与描边始终不透明；主界面可见度 0 = 完全关闭透出。

首屏由宿主的 `boot` 提示提前画好底色和壁纸，避免首帧白闪。

## 立绘与文案的落点

- **立绘**：注册 `conversation.hero.brand.mark`（首屏标题前的品牌图形），用 `<img>` 顶替内置小鱼；
- **文案**：没有文案插槽，且同一 locale 重复注册会抛 `already has locale`，因此用 CSS `content`
  覆盖宿主实际渲染的节点（`[class*="_titleGroup"]`、`[class*="_previewBadge"]`、
  `[data-composer-placeholder]`，用 `:has([data-phase="hero"])` 区分首屏/会话内）。宿主改结构时
  规则自然失效并回退到内置文案。

## 安装与生效

仓库不含构建步骤：`client/client.js` 是可读的加载器产物，`lib/index.js` 只依赖 Node 内建模块。

```powershell
# 方式一：从 GitHub 安装（DSH 支持 github: spec）
plugin_manager install_bundle    # target: github:YOGEMOW/dsh-custom-theme
# 或：dsh plugin --profile <profile> add github:YOGEMOW/dsh-custom-theme

# 方式二：克隆后按本地目录安装
git clone https://github.com/YOGEMOW/dsh-custom-theme.git
plugin_manager install_bundle    # target: <克隆目录>
```

- 0.5.0 新增宿主 `assets` 上传/提供路由：**首次升级需要重启一次 DSH**（之后主题/音乐迭代只需刷新页面）；
- 0.4.0 改了包名（`dsh-theme-everforest` → `dsh-custom-theme`），当时需要 remove + install；
- 宿主传输是 `/dsh-theme-studio/document`（文件 `theme.json`）与 `/dsh-theme-studio/asset/*`；
- 旧的 `~/.dsh/theme-studio/state.json` 可删除（新文件是 `theme.json`）；
- 卸载：`plugin_manager remove_bundle`。

## 结构

```
lib/index.js                宿主半：文档存储、assets 上传/服务、首屏注入
client/client.js            浏览器半：文档模型、预设、token、文案、壁纸、音乐、设置页
tests/state.test.mjs        宿主：文件往返、boot 提示、assets 识别与存储、路由注册
tests/client.test.mjs       客户端：模型、迁移、德谬歌预设、音乐、token、文案、壁纸、挂载
locale/{zh,en}.json         插件页标题与描述
examples/codex-appearance-v1.json  最初参考的 Codex 外观
cordis.patch.yml            bundle patch
.github/workflows/test.yml  CI：跑两个测试套件
```

## 测试

```powershell
node tests/state.test.mjs
node tests/client.test.mjs
```

21 项断言覆盖：文档往返与缺失回退、boot 提示校验与注入、assets 魔数识别/存储/路径校验、
路由注册、默认主题、v2→v3 迁移、**德谬歌预设内容与"保留壁纸"**、**音乐配置归一化**、主题 id 去重、
token 双方案取值、壁纸可见度对底色 alpha 的影响、文案顺序/随机轮换、文案与壁纸 CSS、boot hint、
以及挂载后修改强调色**立即**反映到 token（回归原 bug）。

## 已知边界

- 立绘是首屏品牌图形（约 34px 座位）的替换，不是整屏背景；整屏背景用「背景图」。
- 文案覆盖依赖宿主 DOM 结构，属唯一"贴近实现"的部分。
- 主界面可见度越高，文字背后的对比度越依赖壁纸内容；可用亮度/模糊控制观感；子界面不透明度建议保持 100%，否则面板文字会与背后内容重叠。
- 深色语义色由浅色提亮推导，设置页只编辑深色的基础四色。
- 背景音乐受浏览器自动播放策略限制，首次需一次页面交互；音频文件存于 DSH 配置目录，不随主题文档同步到其他机器。
