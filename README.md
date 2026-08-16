# 情绪引擎 Emotion Engine

> 一套完整的 **Agent 情绪感知与颜色机制**：自动识别用户当前会话中的情绪，驱动全局动态配色、水波悬浮球、侧边栏同步变色，并将情绪实时注入系统提示词，让 AI 能感知用户情绪并调整回应语气。

适用于 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的动态 Cordis 插件。

---

## ✨ 功能特性

| 能力 | 说明 |
| --- | --- |
| 🎭 **情绪感知** | 基于当前会话最近 5 条用户输入，中英关键字情感评分，每 2.5s 自动刷新（可手动开关） |
| 🎨 **全局变色** | 覆盖主题 token（背景、面板、品牌色、**侧边栏**），5 种情绪 5 套亮/暗配色 |
| 🌊 **动态背景** | 每种情绪专属的全屏动画（金云漂浮 / 蓝波流动 / 紫雾呼吸 / 橙光闪烁 / 红色心跳），切换时交叉淡入淡出 |
| 💧 **水波悬浮球** | 右下角半透明球体，内部多层同心涟漪扩散，波纹颜色跟随情绪；点击展开磨砂情绪面板 |
| 🧠 **提示词注入** | 当前情绪实时注入系统提示词，每次模型调用动态组装，AI 可感知并调整语气 |
| 🔀 **自动/手动** | 自动感知与手动选择可随时切换，面板标题标注来源（自动/手动） |

---

## 🏗️ 架构

```
┌───────────────────────── Browser (Client) ─────────────────────────┐
│  shell.overlay 悬浮组件                                             │
│  ├─ 水波球 + 情绪面板 (React, React.createElement)                  │
│  ├─ theme.overrideTokens() → 全局主题变色（含侧边栏）               │
│  └─ 全屏动态渐变层 (soft-light, 低强度, pointer-events: none)       │
│         │  每 2.5s mood:analyze { sessionId }                       │
│         ▼  情绪变化时 mood:set { mood }                             │
│      host.call (Package 私有 JSON RPC)                              │
└─────────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────── Host (Node) ────────────────────────────┐
│  sessionQuery.filterEvents(sessionId, [{kind:'type',               │
│     values:['user/message']}]) → 最近 5 条用户消息                  │
│  analyzeMood() → 关键字情感评分（按消息新旧加权）                   │
│  systemPrompt.section('user-mood') → 每次模型调用动态注入           │
│     "[用户情绪感知] 用户当前情绪：😊 开心。……"                       │
└─────────────────────────────────────────────────────────────────────┘
```

- **Host 半部**（`src/host.js`）：情绪分析 + 系统提示词注入
- **Client 半部**（`src/client.js`）：UI、主题变色、动态背景、轮询与情绪同步

---

## 🎭 情绪与配色

| 情绪 | Emoji | 主色 | 动态背景效果 | 提示词回应引导 |
| --- | --- | --- | --- | --- |
| 开心 | 😊 | `#F5B83D` 金黄 | 金色暖云缓慢漂移 | 轻松积极、适当活泼 |
| 平静 | 😌 | `#4FB3D9` 蓝 | 蓝色波条流动 | 平和简洁 |
| 疲惫 | 😪 | `#9E93C2` 紫 | 紫雾呼吸 | 最简直接、避免冗长 |
| 焦虑 | 😰 | `#FF9E4D` 橙 | 橙色光斑闪烁 | 先给可执行步骤、安抚 |
| 生气 | 😠 | `#FF6B6B` 红 | 红色心跳脉动 | 冷静专业、先共情再解决 |

每种情绪都有独立的亮色 / 暗色两套 token 值，覆盖：`--dsw-alias-bg-base`、`--dsw-alias-bg-layer-1/2`、`--dsw-alias-brand-primary`、`--dsw-specific-sidebar-fill`。

---

## 📦 安装

情绪引擎支持两种安装方式，按使用场景选择：

| 方式 | 适用场景 | 持久性 |
| --- | --- | --- |
| **A. 会话内动态加载**（推荐） | 单会话试用、开发调试、随用随装 | 当前进程内，重启后需重新定义 |
| **B. 常规插件安装**（进阶） | 想让插件常驻、随 DSH 一起启动 | 写入 host `cordis.yml`，重启即自动加载 |

### 方式 A：会话内动态加载（推荐）

情绪引擎是一个**动态 Cordis 插件**，在 DSH 会话中通过 `@pluginId` 机制加载。源码以函数体形式存放在 `src/`：

| 文件 | 对应字段 |
| --- | --- |
| `src/host.js` | `cordis_define` 的 `code.host` |
| `src/client.js` | `cordis_define` 的 `code.client` |

**加载步骤（在 DSH 会话中）：**

1. **定义**：将 `src/host.js` 与 `src/client.js` 的内容分别作为 `code.host` / `code.client` 传入 `cordis_define`：

   ```
   plugin:  { kind: "new", idPrefix: "mood" }
   name:    "情绪引擎 Emotion Engine"
   purpose: "一套完整的情绪颜色机制：自动识别用户情绪，驱动全局动态配色、水波悬浮球、侧边栏同步与系统提示词注入。"
   ```

2. **运行**：`cordis_run` 激活（Client 端首次运行需要在 UI 中点击"允许"授权；勾选"信任未来版本"可免去后续批准）。

3. **生效**：页面右下角出现水波悬浮球，自动感知默认开启。

> 已有同名插件的会话，可用 `kind: "existing"` + 原 `pluginId` 追加新 Package，用 `cordis_run` 的 `update` 模式升级。

**日常维护：**

| 操作 | 命令 |
| --- | --- |
| 暂停（保留定义） | `cordis_stop <pluginId>` |
| 恢复运行 | `cordis_run <pluginId> <packageId> run` |
| 升级到新版本 | `cordis_define` 追加 Package → `cordis_run ... update` |
| 永久移除 | `cordis_undefine <pluginId>` |
| 查看诊断 | `cordis_inspect_self <pluginId> <packageId>` |

### 方式 B：常规插件安装（npm 发布版）

情绪引擎已包装为**标准 npm 包**（Host + Client 双半部），发布后可通过 host 组合文件 `cordis.yml` 一行挂载、随 DSH 启动常驻。

**包结构：**

| 入口 | 用途 |
| --- | --- |
| `dsh-cordis-emotion-engine`（主入口） | Host 半部：`apply(ctx)` 注册 `EmotionService`（Remote）+ 系统提示词注入 |
| `dsh-cordis-emotion-engine/client` | Client 半部：`dsh.client` web 插件（`exports["./client"]`） |
| `dsh-cordis-emotion-engine/remote` | Typert Remote contribution（Client 挂载用） |

**构建与发布：**

```bash
npm install          # 安装依赖
npm run build        # tsc 类型声明 + tsdown 打包 → lib/
npm publish          # 发布到 npm registry
```

**挂载到 DSH（用户 profile 的 `cordis.patch.yml`）：**

> ⚠️ **关键**：patch 列表是 `PatchOptions` 语义 —— 新增插件行必须用**无 id 的 `insert`**。
> 直接写 `- id: xxx` + `name: xxx` 会被当作"覆盖已有 entry"处理，因找不到目标而被静默跳过（插件不加载）。

```yaml
- insert:
    - id: emotion-engine
      name: dsh-cordis-emotion-engine
```

重启 DSH 后插件自动加载：Host 半部激活（Remote + 提示词注入），Client 半部通过包的 `dsh.client` 声明被运行时发现，浏览器按需加载 `/plugins/<id>/client.js`。

> 前提：DSH 部署需已挂载 typert 网关（`@deepseek-ai/dsh-api-gateway`，默认部署自带）。

---

## 🕹️ 使用指导

### 悬浮球
- **点击**：展开 / 收起磨砂情绪面板
- **球内波纹**：每 0.9s 一条同心涟漪从中心扩散，颜色 = 当前情绪专属色
- 未选择情绪时显示中性品牌色

### 面板
| 控件 | 作用 |
| --- | --- |
| 🤖 **自动感知 开/关** | 默认开：每 2.5s 分析当前会话最近 5 条用户输入并自动切换；手动选情绪后自动关闭 |
| 😊😌😪😰😠 情绪按钮 | 手动设置情绪（自动感知随之关闭） |
| ✨ 清除情绪 | 恢复默认主题、停止提示词注入 |

面板标题会标注当前情绪来源：`当前情绪：开心（自动）` 或 `（手动）`。

### 提示词注入
- 有情绪时，每次模型调用都会带上：`[用户情绪感知] 用户当前情绪：😊 开心。用户心情很好……`
- 情绪为"无"时不注入任何内容
- 切换情绪后**下一条消息立即生效**（提示词每次动态组装）

### 效果示例
| 你输入 | 期望效果 |
| --- | --- |
| "好开心啊，终于搞定了！" | 😊 金色暖云 + AI 语气轻快 |
| "有点焦虑，感觉来不及了…" | 😰 橙色闪烁 + AI 先给步骤 |
| "今天好累，不想写了" | 😪 紫雾 + AI 回答简洁 |
| "气死我了，这什么鬼！" | 😠 红色心跳 + AI 先共情 |
| "嗯，就这样吧，挺好的" | 😌 蓝波流动 + AI 平和 |

---

## 📁 仓库结构

仓库包含**两套源码**：`src/host.js` + `src/client.js` 为动态插件版函数体（安装方式 A），`src/index.ts` 等为可发布 npm 包版（安装方式 B）。

```
dsh-cordis-emotion-engine/
├── README.md              # 本文件
├── package.json           # 包元信息（exports / dsh.client / peerDependencies）
├── tsconfig.json          # TypeScript 配置（声明产出到 lib/types/）
├── tsdown.config.ts       # 打包配置（lib/index.mjs / index.js / remote）
├── scripts/
│   └── smoke-host.mjs     # Host 半部冒烟测试（裸 Cordis Context）
├── src/
│   ├── host.js            # 【方式 A】动态插件 Host 半部函数体
│   ├── client.js          # 【方式 A】动态插件 Client 半部函数体
│   ├── index.ts           # 【方式 B】Host 半部：EmotionService(Remote) + 分析 + 提示词注入
│   ├── typert.remote-client.ts  # 【方式 B】Typert Remote contribution（Client 挂载用）
│   └── client/
│       ├── index.tsx      # 【方式 B】Client 半部：dsh.client 插件入口（$mount + slots）
│       └── EmotionWidget.tsx    # 水波球 + 情绪面板 + 动态背景组件
└── lib/                   # 构建产物（npm publish 内容，不入库）
```

## 🛠️ 开发与调试

- **构建**：`npm run build`（tsc 声明 + tsdown 打包），产物在 `lib/`
- **类型检查**：`npm run typecheck`
- **调词表**：编辑 `src/index.ts` 的 `KEYWORDS`（5 类情绪各一份中英关键词）
- **调配色/动效**：编辑 `src/client/EmotionWidget.tsx` 的 `MOODS.tokens` 与 `CSS`
- **改 Remote 契约**：同步修改 `src/index.ts`（EmotionService 方法）与 `src/typert.remote-client.ts`（descriptors）
- **本地挂载测试**：`npm pack` 后在 DSH 的 host `cordis.yml` 加 `- id: emotion-engine` + `name: <tgz 路径>`，重启 DSH

## 📜 版本历史

| 版本 | 变更 |
| --- | --- |
| v1 | 首个 Client 插件：右下角悬浮面板 + 主题 token 变色 |
| v2 | Siri 风格悬浮球、每种情绪专属动态背景、交叉淡入淡出、侧边栏变色 |
| v3 | 悬浮球简化 |
| v4 | 半透明水波球（多层涟漪） |
| v5 | 球内波纹/色点直接使用情绪专属颜色，去掉表情 |
| v6 | **自动情绪感知**（Host + Client 双端，基于最近 5 条用户输入） |
| v7 | **情绪注入系统提示词**（systemPrompt.section 动态求值） |
| v8 | 动态背景降低强度、理顺层级，避免遮挡会话文字 |
| v9 | 更名"情绪引擎 Emotion Engine" |
| v10 | **可发布 npm 包**：标准 Cordis 插件结构（Host Remote + Client bundle）、tsdown 构建、typert registry 端点注册 |
| v10 | **可发布 npm 包**：标准 Cordis 插件结构、EmotionService Remote、dsh.client bundle、tsdown 构建 |

## ⚠️ 已知限制

- **层级**：动态背景位于 `shell.overlay`（平台机制上在所有内容之上），因此采用低强度 `soft-light` 混合避免遮挡文字；若仍嫌明显可进一步降低透明度
- **全局情绪**：目前注入的是"最近一次活跃会话"的情绪（全局共享）；多会话并行时会有轻微串扰，如需按会话隔离需引入 scope 映射
- **词表识别**：关键字评分为启发式，口语新词可能漏判（可在 `KEYWORDS` 中补充）

## 🚧 TODO

- [x] **常规插件包装（安装方式 B）**：标准 npm 包结构 + Remote 服务 + `dsh.client` bundle + tsdown 构建
- [ ] **发布到 npm registry**：`npm publish`（需 npm 账号，发布后实测挂载）
- [ ] **按会话隔离情绪**：通过 scope 映射让每个会话注入各自的情绪，避免多会话串扰
- [ ] **情绪词表增强**：补充口语化情绪词（砸了/服了/完了/糟了 等），支持自定义词表配置
- [ ] **效果截图/演示**：为 README 补充各情绪主题的界面截图

## 📄 License

MIT
