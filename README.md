# DSH 自定义主题

包名 `dsh-custom-theme`（0.3.0 之前叫 `dsh-theme-everforest`）。DeepSeek Harness 的自定义主题插件：
多套主题可新建 / 切换 / 重命名 / 复制 / 删除，每套都能改配色（浅色 + 深色 + 语义色）、背景图与
视觉效果、首屏立绘、多条轮换文案、背景音乐，并能与 Agent 预设联动。

A custom-theme plugin for DeepSeek Harness: switchable themes with palettes, wallpaper effects,
hero artwork, multi-line copy, background music and Agent-preset linking.

- 当前版本：**0.9.1**
- 设置入口：**设置 → 自定义主题**（`settings.section`，id `theme-studio`）
- 仓库：<https://github.com/YOGEMOW/dsh-custom-theme>

## 特性一览

| 分组 | 内容 |
| --- | --- |
| 主题 | 双色迷你预览图标、改名、切换「使用」、删除（至少保留一套）、新建主题、复制当前主题；内置预设：Everforest、德谬歌、德谬歌·完整 |
| Agent 预设联动 | 每套主题可绑定若干 Agent 预设；会话切到这些预设时自动切到该主题 |
| 视觉风格 | 浅色 / 深色 / 跟随系统（写回 DSH 内置偏好） |
| 配色 | 强调色、背景、前景、侧栏背景（可留空自动推导）、对比度 0–100 |
| 深色配色 | 「分别设置深色配色」开关；关闭时按浅色色相自动生成 |
| 语义色 | 成功 / 错误 / 警告 / 次要 |
| 背景图 | 本地图片或链接、主界面可见度 0–100%、子界面不透明度 0–100%、模糊 0–40px、亮度 30–200%、文字遮罩 0–150%、铺满 / 适应 |
| 背景音乐 | 每套主题一首：本地音乐（mp3/wav/ogg/m4a/flac）或链接、启用、音量、循环、最小化暂停；切主题自动切歌 |
| 首屏立绘 | 本地图片或地址、显示宽度 16–200px |
| 文案 | 4 个字段（首屏标题、角标、首屏输入框提示、会话输入框提示），每个字段可放多条：顺序轮换或随机 |

修改即时生效（本地推导 token，不等保存回包），约 160ms 防抖后写入配置目录，页脚显示保存状态。

## 快速开始

### 安装

仓库不含构建步骤：`client/client.js` 是可读的加载器产物，`lib/index.js` 只依赖 Node 内建模块。

```powershell
# 方式一：从 GitHub 安装（DSH 支持 github: spec）
plugin_manager install_bundle    # target: github:YOGEMOW/dsh-custom-theme
# 或：dsh plugin --profile <profile> add github:YOGEMOW/dsh-custom-theme

# 方式二：克隆后按本地目录安装
git clone https://github.com/YOGEMOW/dsh-custom-theme.git
plugin_manager install_bundle    # target: <克隆目录>
```

> 0.9.0 起宿主提供多个只读路由（`assets`、`agent-presets`、`preset`）。从旧版本升级后**重启一次 DSH**；
> 之后主题、文案、音乐、预设的日常迭代只需刷新页面。卸载：`plugin_manager remove_bundle`。

### 第一次打开

1. 打开 **设置 → 自定义主题**；
2. 想一键换观感：主题分组底部点「**＋ 德谬歌·完整**」（见[预设与同步](#预设与同步)）；
3. 想自己搭：新建主题，逐项改配色 / 壁纸 / 立绘 / 文案，修改即时预览；
4. 页脚会显示保存状态；配色改动不会再被保存回包刷回旧值。

## 使用指南

### 主题

- 列表里每行是一个主题：左侧是**双色迷你预览**（浅色一半 + 深色一半，取该主题的底色/强调色/前景色）；
- 行内可改名、「使用」切换、删除（至少保留一套）；底部可新建主题、复制当前主题；
- 「预设主题」一行可追加内置预设：`Everforest`、`德谬歌`、`德谬歌·完整`。

### 配色与视觉风格

- **模式**：浅色 / 深色 / 跟随系统（写回 DSH 内置偏好）；
- **配色**：强调色、背景、前景、侧栏背景（留空则自动推导）、对比度 0–100；
- **深色配色**：「分别设置深色配色」打开后单独编辑深色一套；关闭时按浅色色相自动生成；
- **语义色**：成功 / 错误 / 警告 / 次要。

### 背景图与文字可读性

- 支持**本地图片**或图片地址；可调主界面可见度、子界面不透明度、模糊、亮度、文字遮罩、铺满 / 适应；
- **主界面可见度**：页面底色和侧栏透出壁纸的程度（最多透出 82%，不会完全消失）；
- **子界面不透明度**：设置面板、弹窗、卡片、输入框等浮层（默认 100%，避免浮层文字和背后内容重叠）；
- **文字遮罩**：壁纸上方叠一层与主题同色的纱。`0` 关闭、`100` 默认、`150` 更压得住亮背景；
  壁纸开启时，次级/段落文字会自动向正文色靠拢，解决「浅白色段落看不清」；
- **窄屏（≤1023px）自动提高不透明度**：手机/平板上的侧栏是覆盖式抽屉，启用壁纸时
  侧栏与页面底色会被提到约 90–96% 不透明，避免抽屉里的列表和背后的会话文字互相透出。

原理细节见[实现细节 → 壁纸与 token 管线](#壁纸与-token-管线)。

### 首屏立绘

替换首屏标题前的品牌图形（`conversation.hero.brand.mark`），支持本地图片或地址，宽度 16–200px。

### 文案

- 4 个字段：首屏标题、角标、首屏输入框提示、会话输入框提示；
- 每个字段可放**多条**：
  - **顺序**：每次页面加载显示当前游标那一条，然后游标 +1 存回文档 → 下次加载显示下一条，循环；
  - **随机**：每次页面加载随机挑一条（游标不动）；
- 「换一条」立即切到下一条/随机一条；「回到第一条」把游标重置为 0；
- 「添加一条」插入可编辑的占位文案（「新文案 / New line」）——空行会被归一化丢弃，不能靠插入空串新建；
- 列表里**高亮那一行**就是当前显示的那条，预览行写着「当前显示（第 n 条）」。游标保存在主题里，
  刷新几次后可能停在第二条，不是顺序错位，点「回到第一条」即可回到开头。

### 背景音乐

- **按主题保存**：`music.src / enabled / volume / loop / pauseWhenHidden`，切主题即切歌；
- **本地文件**：点「选择本地音乐」上传到宿主 `assets` 目录（也可直接填 https 链接）；
- **最小化暂停**：窗口最小化或切到后台时自动暂停，回到界面继续（每套主题可关）；
- **自动播放限制**：浏览器要求先与页面交互一次（点击/按键）才会响；之后切换主题、重新启用会继续播放。

### 与 Agent 预设联动

Agent 预设（Session 的 `agentPreset` 投影）决定一个会话用哪套工具/提示词。主题可以绑定预设：

- 设置页「Agent 预设联动」每套主题一行：点「选择预设」展开勾选列表（**多选**，勾选即保存），
  列表来自宿主 `agentPresets.list()`（名称 + id，加载失败的预设会标注）；
- 客户端占用两个无害的会话槽位（`conversation.input.dock`、`conversation.hero.options`）各挂一个
  不渲染的观察组件，通过标准 Hook `useProjection("agentPreset")` 读取当前会话预设，一变就切主题；
- 没有任何主题绑定该预设时，保持用户当前主题不动；
- 设置页底部显示「当前会话的 Agent 预设」，用来核对是否命中。

### 预设与同步

#### 德谬歌（基础 / 完整）

德谬歌是昔涟的完整形态：第十三位泰坦、权杖 δ-me13 的本源，「十三种光彩」，击败铁幕、闭合因果后
以孩童模样回归最初。插件带两套德谬歌预设：

| 预设 | 包含 | 适合 |
| --- | --- | --- |
| **德谬歌**（基础） | 配色、光环立绘、文案；壁纸**沿用当前主题**，没有壁纸时才用内置星空兜底 | 想配自己的壁纸 |
| **德谬歌·完整** | 上面全部 + 随包携带的**壁纸、立绘、文案、配色**；预绑定 `chat` / `cyrene-work` / `wonderland-lua-builder` | 一键还原整套观感 |

#### 完整预设里有什么

| 部位 | 内容 |
| --- | --- |
| 配色 | 浅色粉白（`#fff7fc` / `#e58bb4` / `#4a3a57`，对比度 100）、深色夜幕紫（`#161020` / `#f0a8cc` / `#f4e9f3`，对比度 45） |
| 壁纸 | 随包携带的同人壁纸（WebP，内联为 data URL；可见度 100%、模糊 5px、铺满） |
| 立绘 | 首屏立绘（640×640 WebP 内联），尺寸 96px |
| 文案 | 标题「一起写下不同以往的诗篇吧 ♪」「流星划过夜空，生命的长河荡起涟漪，闪烁十三种光彩」「忆海无垠，故事为舟」「德谬歌」；角标「Cyrene / 第十三泰坦」；输入框提示「拾起一段记忆…」「三千万次轮回，皆为你执笔。」等 |
| Agent 联动 | 预绑定 `chat`、`cyrene-work`、`wonderland-lua-builder`（可在设置里改） |
| 音乐 | **不包含**：音乐是本地文件，不随包发运，需要自己选 |

入口：主题分组底部「预设主题：＋ 德谬歌·完整」。客户端请求宿主
`GET /dsh-theme-studio/preset/demiurge-complete`，宿主读仓库里的 `presets/demiurge-complete.json`
返回；点击后**新建一套独立主题**（可改名、可继续编辑），不覆盖现有主题。

#### 素材与授权

- 壁纸与立绘是使用者提供的**同人素材**，随预设打包，仅供个人非商业使用；
- 昔涟（Cyrene）与《崩坏：星穹铁道》的角色、名称与美术版权归 HoYoverse / 米哈游所有；
  本仓库是非官方同人工具，与 IP 方无关联，含角色 IP 的内容禁止商业使用；
- 若你是素材原作者、希望补充署名或要求移除，请开 issue。

#### 预设同步

从预设创建的主题会记录 `preset / presetVersion / presetBase`（上一次预设的设计快照）：

- 预设设计随插件版本更新（`PRESET_VERSION` 提升）时，**已创建的主题会自动同步**；
- 同步按字段比较：只有仍等于旧预设值的字段会被替换，你手动改过的颜色/立绘/文案/音乐保持原样；
- 壁纸从不属于预设，始终保留；旧的、改名恰好为「德谬歌」的主题会被自动认领为德谬歌预设；
- 「德谬歌·完整」是一次性快照，不参与同步，避免以后改预设设计时动到你保存的版本。

## 数据与存储

```
<DSH_HOME>/theme-studio/theme.json      # 默认 ~/.dsh/theme-studio/theme.json
<DSH_HOME>/theme-studio/assets/         # 上传的图片 / 音频
```

```jsonc
{
  "version": 1,
  "boot": {                                  // 首帧提示：UI 挂载前先画底色和壁纸
    "light": "#fdf6e3",
    "dark": "#2d353b",
    "wallpaper": { "image": "https://…", "blur": 4, "brightness": 90, "position": "cover",
                   "scrim": { "light": "rgba(…)", "dark": "rgba(…)" } }
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
        "background": { "image": "", "strength": 0, "panelOpacity": 100, "scrim": 100,
                        "blur": 0, "brightness": 100, "position": "cover" },
        "hero": { "image": "", "size": 34 },
        "music": { "src": "", "enabled": false, "volume": 45, "loop": true, "pauseWhenHidden": true },
        "copy": {
          "headline": { "mode": "sequence", "items": ["探索未至之境"] },
          "preview": { "mode": "sequence", "items": [] },
          "placeholderHero": { "mode": "sequence", "items": [] },
          "placeholderDefault": { "mode": "sequence", "items": [] }
        },
        "cursor": { "headline": 1, "preview": 0, "placeholderHero": 0, "placeholderDefault": 0 },
        "presets": []                        // 绑定的 Agent 预设 id
      }
    ]
  }
}
```

- v1/v2 的单主题文档会在加载时自动迁移到 `themes` 数组；
- 预设主题另有 `preset / presetVersion / presetBase` 三个字段，普通主题没有；
- 旧的 `~/.dsh/theme-studio/state.json` 可删除（新文件是 `theme.json`）。

### 本地文件怎么上传

本地图片 / 音频不再内联进主题文档（壁纸除外——`德谬歌·完整` 的壁纸是随包 data URL）：

1. 客户端把选中的文件 POST 到 `/dsh-theme-studio/asset`；
2. 宿主按魔数识别类型（png/jpg/webp/gif/svg、mp3/wav/ogg/m4a/flac），写入
   `<DSH_HOME>/theme-studio/assets/<随机名>.<ext>`，返回同源 URL；
3. 文档里只存 URL；`GET /dsh-theme-studio/asset/<name>` 负责提供文件（支持 Range，音频可拖动进度）。

单文件上限 40MB；旧的 `data:image/...` 内联图仍然兼容。

## 实现细节

### 架构

- **宿主半** `lib/index.js`：薄的文档存储 + 首屏提示 + 只读数据路由，只依赖 Node 内建模块。
- **浏览器半** `client/client.js`：全部主题逻辑（文档模型、预设、token 推导、文案、壁纸、音乐、设置页、
  Agent 预设观察器），模型通过 `__model` 导出给测试使用。

因此主题功能迭代只需刷新页面（`dsh-client-hmr` 轮询热更新）；只有传输/宿主逻辑变化才需要重启 DSH。

### 宿主路由总表

| 路由 | 作用 |
| --- | --- |
| `GET /dsh-theme-studio/document` | 读主题文档 |
| `POST /dsh-theme-studio/document` | 写主题文档（同源校验） |
| `POST /dsh-theme-studio/asset` | 上传本地图片/音频 |
| `GET /dsh-theme-studio/asset/<name>` | 提供上传的文件（Range） |
| `GET /dsh-theme-studio/agent-presets` | Agent 预设列表（id / 名称 / 是否加载失败） |
| `GET /dsh-theme-studio/preset/<id>` | 随包预设文档（存在 `presets/*.json`） |

### 壁纸与 token 管线

应用表面全部由 `--dsw-alias-*` token 上色，所以壁纸方案是：

1. 客户端注入 `body::before` 固定层，铺图片并按设置做模糊/亮度；
2. 壁纸层上叠一层**与主题同色的遮罩**（浅色用浅色 surface、深色用深色 surface，透明度 =
   可见度基础值 ×「文字遮罩」百分比；默认 100% 时随可见度从 0.12 升到 0.52，调 0 即关闭）；
3. 主界面（`bg-base`、侧栏 `specific-sidebar-fill`）按**主界面可见度**变半透明，底色最多透出 82%；
4. 壁纸开启时，次级/段落文字（`label-secondary/tertiary/caption/dimmed`）自动向正文色靠拢；
5. 子界面（`bg-layer-1/2`、`bg-overlay`、`specific-menu/selector`）由**子界面不透明度**控制，默认 100%；
6. 文字与描边始终不透明；可见度 0 = 完全关闭透出。

首屏由宿主的 `boot` 提示提前画好底色、壁纸与同一层遮罩，避免首帧白闪。壁纸 CSS 与 token 都按值缓存，
编辑文案时不会重复重算。

窄屏（`max-width: 1023px`）另有一条 `!important` 规则，把侧栏填充、页面底色和两层浮层提到接近不透明
——移动端侧栏抽屉是覆盖在会话之上的，半透明会让两边的文字叠在一起；桌面端不受影响。

### 插槽与文案覆盖

- **立绘**：占用 `conversation.hero.brand.mark`，用 `<img>` 顶替内置小鱼；
- **文案**：没有文案插槽，且同一 locale 重复注册会抛 `already has locale`，因此用 CSS `content`
  覆盖宿主实际渲染的节点（`[class*="_titleGroup"]`、`[class*="_previewBadge"]`、
  `[data-composer-placeholder]`，用 `:has([data-phase="hero"])` 区分首屏/会话内）。宿主改结构时
  规则自然失效并回退到内置文案。

### 为什么 token 由客户端推导（历史修复：配色回弹）

0.2.0 的设置页把 React 的 `key`（`"light.accent"`）当成调色板字段名读写，颜色被写进
`state.light["light.accent"]` 这种无效字段，保存时被宿主归一化丢弃，回包又把旧颜色刷回来。
0.3.0 的修法：键名分离（按 `accent / surface / ink / sidebar / contrast` 读写）+ **token 在客户端本地
推导**，每次编辑立刻 `theme.overrideTokens()` 重绘，保存回包只作回执、不覆盖本地草案。

## 开发

### 仓库结构

```
lib/index.js                宿主半：文档存储、assets 上传/服务、预设与预设列表路由、首屏注入
client/client.js            浏览器半：文档模型、预设、token、文案、壁纸、音乐、设置页
presets/demiurge-complete.json  完整预设（壁纸/立绘内联为 data URL）
scripts/build-complete-preset.mjs  从本机主题文档重新生成上面的完整预设
tests/state.test.mjs        宿主：文件往返、boot 注入、assets、预设路由、Agent 预设列表
tests/client.test.mjs       客户端：模型、预设、音乐、token、文案、壁纸、Agent 联动、挂载
locale/{zh,en}.json         插件页标题与描述
examples/codex-appearance-v1.json  最初参考的 Codex 外观
cordis.patch.yml            bundle patch
.github/workflows/test.yml  CI：跑两个测试套件
```

### 测试与 CI

```powershell
node tests/state.test.mjs
node tests/client.test.mjs
```

31 项断言覆盖：文档往返与缺失回退、boot 提示校验与注入（含遮罩）、bundled preset 路由（完整预设）、
assets 魔数识别/存储/路径校验、Agent 预设列表路由、路由注册、默认主题、v2→v3 迁移、
德谬歌预设内容与版本同步（保留用户字段与壁纸）、音乐配置归一化（含最小化暂停）、
文字遮罩 0/150% 的开关与强度、空白文案行的丢弃与占位行、壁纸 CSS 缓存的复用与失效、
Agent 预设绑定（多选增删/大小写/显示名）与自动切主题、完整预设下载后创建独立主题、
主题 id 去重、token 双方案取值、壁纸可见度对底色 alpha 与文字对比度的影响、
文案顺序/随机轮换、文案与壁纸 CSS、**窄屏近不透明规则**、boot hint，以及挂载后修改强调色**立即**反映到 token。

CI（`.github/workflows/test.yml`）在 push / PR 时于 `ubuntu-latest` 跑这两个套件。

## 已知边界

- 立绘只替换首屏品牌图形（约 34px 座位），不是整屏背景；整屏背景用「背景图」；
- 文案覆盖依赖宿主 DOM 结构，属唯一「贴近实现」的部分；
- 主界面可见度越高，文字对比度越依赖壁纸内容；已有同色遮罩兜底，仍建议配合亮度/模糊，
  子界面不透明度建议保持 100%，否则面板文字会与背后内容重叠；
- 深色语义色由浅色提亮推导，设置页只编辑深色的基础四色；
- 背景音乐受浏览器自动播放策略限制，首次需一次页面交互；音频文件存于 DSH 配置目录，
  不随主题文档同步到其他机器。

## 变更记录

- **0.9.1**：修移动端侧栏抽屉里的文字重叠——壁纸开启时，窄屏（≤1023px）自动把侧栏/页面底色
  提到约 90–96% 不透明，抽屉里的列表不会再和背后的会话文字互相透出；桌面端观感不变。
- **0.9.0**：新增**德谬歌·完整**预设——随包携带壁纸（WebP）、首屏立绘（640×640 WebP）与整套文案，
  由宿主 `GET /dsh-theme-studio/preset/<id>` 读取 `presets/*.json`，点一下就还原完整观感；音乐不在包内。
- **0.8.0**：Agent 预设联动改成**从宿主预设列表里多选**（显示名称 + id，勾选即保存），不再手填 id；
  新增路由 `GET /dsh-theme-studio/agent-presets`。
- **0.7.0**：新增**与 Agent 预设联动**——主题可绑定 Agent 预设，会话 `agentPreset` 投影变化时自动切主题。
- **0.6.3**：修「添加一条没反应」（空行会被归一化丢弃，改为插入占位文案）；预设设计只在版本升级时重建、
  token 与壁纸 CSS 按值缓存，删除/连续编辑不再卡顿。
- **0.6.2**：文案列表高亮当前显示的那一条，预览行标出「第 n 条」，新增「回到第一条」。
- **0.6.1**：文字遮罩变成可调选项（0–150%），0 即关闭；最小化/切后台时自动暂停背景音乐。
- **0.6.0**：壁纸模式下的文字可读性——同色遮罩、底色最多透出 82%、段落文字向正文色靠拢；
  新增预设版本同步（预设更新后已创建主题自动接收新设计，保留用户字段与壁纸）。
- **0.5.1**：预设主题行去掉「套用到当前主题」按钮，只保留预设按钮。
- **0.5.0**：新增德谬歌预设与背景音乐；本地图片/音频改为上传到宿主 `assets` 目录。
- **0.4.2**：主界面可见度与子界面不透明度拆成两个开关；主题图标改为迷你双色预览；图片地址行重排。
- **0.4.1**：修文案标题显示成 `copy.headline` 原始 key 的问题；背景图与立绘支持直接选本地图片。
