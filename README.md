# 情绪引擎 Emotion Engine

面向 [DeepSeek Harness（DSH）](https://github.com/deepseek-ai/deepseek-harness) 的 Cordis 插件。它会识别用户最近的情绪，并同步改变界面配色、动态背景和悬浮球，同时把情绪信息注入系统提示词，让 AI 调整回应语气。

## 功能概览

| 功能 | 说明 |
| --- | --- |
| 情绪感知 | 识别开心、平静、疲惫、焦虑和生气五种状态 |
| 自动与手动模式 | 可以自动判断，也可以从悬浮面板手动选择或清除情绪 |
| 界面联动 | 根据情绪切换主题色、侧边栏、动态背景和水波悬浮球 |
| 变色范围 | 可以选择“全局 UI”或“仅水波球” |
| 提示词注入 | 将当前情绪和回应建议动态加入系统提示词 |
| 降级分析 | npm 版优先使用 LLM 分析语境，不可用时回退到关键词评分 |

支持的情绪如下：

| 情绪 | 主题色 | 背景效果 | AI 回应倾向 |
| --- | --- | --- | --- |
| 😊 开心 | 金黄 | 暖云漂移 | 轻松、积极、适当活泼 |
| 😌 平静 | 蓝色 | 蓝波流动 | 平和、简洁 |
| 😪 疲惫 | 紫色 | 紫雾呼吸 | 直接、精简，避免冗长 |
| 😰 焦虑 | 橙色 | 光斑闪烁 | 先给可执行步骤，语气平稳 |
| 😠 生气 | 红色 | 心跳脉动 | 先共情，再冷静解决问题 |

## 选择安装方式

本仓库同时提供动态插件版和 npm 包版。两种方式功能接近，但安装场景不同：

| 方式 | 适合场景 | 是否常驻 | 对应源码 |
| --- | --- | --- | --- |
| 动态加载 | 快速体验、单次会话、开发调试 | 否，DSH 进程重启后需要重新定义 | `src/host.js`、`src/client.js` |
| npm 包挂载 | 长期使用、随 DSH 启动、分发给其他用户 | 是 | `src/index.ts`、`src/client/` |

如果只是想先体验效果，使用“方式一：动态加载”。如果要部署到自己的 DSH 环境并长期使用，选择“方式二：npm 包挂载”。

> 当前版本尚未发布到 npm registry。npm 方式需要先在本仓库构建并打包，或者在发布后直接填写包名。

## 方式一：动态加载

动态加载不是在终端里执行命令，也不是把 JavaScript 粘贴到浏览器控制台。它的使用方式是：**在 DSH 对话中让 Agent 调用 Cordis 工具安装插件**。

这种方式适合正在用 DSH Agent 开发本仓库的用户。安装时，DSH Agent 必须能够读取本仓库中的 `src/host.js` 和 `src/client.js`。

### 最简单的安装方法

1. 下载或克隆本仓库。
2. 在 DSH 中打开一个以本仓库为工作目录的会话。
3. 把下面这段话直接发送给 DSH Agent：

```text
请安装当前项目的情绪引擎动态插件：

1. 读取 src/host.js 和 src/client.js 的完整内容。
2. 调用 cordis_define 创建一个新插件：
   - idPrefix: mood
   - name: 情绪引擎 Emotion Engine
   - purpose: 感知用户情绪，并驱动界面配色、悬浮球和系统提示词。
   - code.host 使用 src/host.js 的完整内容
   - code.client 使用 src/client.js 的完整内容
3. 定义成功后，使用返回的 pluginId 和 packageId 调用 cordis_run，
   以 run 模式启动插件。
4. 最后告诉我 pluginId、packageId 和运行结果。
```

Agent 会替你完成 `cordis_define` 和 `cordis_run`，不需要手动拼装很长的 JSON 参数。

### 首次授权

Agent 启动插件后，DSH 页面可能出现 Client 插件授权提示：

1. 点击“允许”。
2. 如果这是你信任的本地源码，可以勾选“信任未来版本”。
3. 页面右下角出现水波悬浮球即表示安装成功。

如果没有看到授权提示或悬浮球，可以继续在同一个 DSH 会话中发送：

```text
请检查刚才安装的情绪引擎插件状态，并用 cordis_inspect_self 查看诊断信息。
```

### Agent 实际执行了什么

动态版通过 DSH 提供的 Cordis 工具加载，不需要修改 DSH 的启动配置：

| 源码 | 传给 `cordis_define` 的字段 | 作用 |
| --- | --- | --- |
| `src/host.js` | `code.host` | 情绪分析和提示词注入 |
| `src/client.js` | `code.client` | 悬浮球、面板、主题和动态背景 |

`cordis_define` 返回本次定义的 `pluginId` 和 `packageId`，随后 `cordis_run` 使用这两个 ID 激活它。上面的安装话术已经包含完整流程。

### 后续管理

这些操作也可以直接用自然语言让 DSH Agent 执行：

| 需求 | 可以发送给 Agent 的话 |
| --- | --- |
| 暂停 | “请暂停刚才安装的情绪引擎，但保留插件定义。” |
| 恢复 | “请重新运行刚才的情绪引擎插件。” |
| 更新 | “我修改了动态版源码，请读取两个文件，为现有插件定义新 Package 并以 update 模式升级。” |
| 诊断 | “请用 cordis_inspect_self 检查情绪引擎的 Host 和 Client 状态。” |
| 移除 | “请永久移除刚才安装的情绪引擎插件。” |

动态加载只保存在当前 DSH 进程中，重启后通常需要重新定义。它更像开发和体验入口；想要插件随 DSH 自动启动，请使用下面的 npm 包方式。

## 方式二：npm 包挂载

npm 版是标准 Cordis Host + Client 双端插件。Host 监听新用户消息并分析情绪，Client 只读取状态和更新 UI。

### 前置条件

- 已安装 Node.js 和 npm。
- DSH 部署已经提供 Typert 网关；默认部署通常已包含 `@deepseek-ai/dsh-api-gateway`。
- 可以修改当前 DSH profile 下的 `cordis.patch.yml`。

### 1. 安装依赖并构建

在本仓库目录执行：

```bash
npm install
npm run typecheck
npm run build
```

构建完成后，`lib/` 中应包含：

```text
lib/index.mjs                 Host 插件入口
lib/client.js                 浏览器 Client bundle
lib/typert.remote-client.js  Client/Host Remote 契约
lib/types/                    TypeScript 类型声明
```

### 2. 生成本地安装包

```bash
npm pack
```

命令会在仓库根目录生成类似下面的文件：

```text
dsh-cordis-emotion-engine-0.1.0.tgz
```

### 3. 挂载到 DSH

在 DSH 当前 profile 的 `cordis.patch.yml` 中添加：

```yaml
- insert:
    - id: emotion-engine
      name: /absolute/path/to/dsh-cordis-emotion-engine-0.1.0.tgz
```

请将 `name` 换成实际 tgz 绝对路径，然后重启 DSH。

> 新增插件必须使用无 `id` 的外层 `insert`。直接写 `- id: emotion-engine` 和 `name: ...` 会被解释为覆盖已有条目；找不到目标时可能被静默跳过。

发布到 npm registry 后，可以把本地 tgz 路径替换为包名：

```yaml
- insert:
    - id: emotion-engine
      name: dsh-cordis-emotion-engine
```

### 4. 验证安装

重启 DSH 后按以下顺序检查：

1. 页面右下角是否出现水波悬浮球。
2. 点击悬浮球，手动选择情绪，确认球体颜色发生变化。
3. 保持“全局 UI”模式，确认背景和侧边栏同步变色。
4. 输入一条带明显情绪的消息，等待自动感知更新。
5. 如果 Client 资源有缓存，强制刷新浏览器页面后再检查。

## 使用说明

### 悬浮球和面板

点击页面右下角的水波球，可以展开或收起控制面板。

| 控件 | 行为 |
| --- | --- |
| 自动感知 | 开启后自动读取 Host 分析出的情绪 |
| 变色范围 | 在“全局 UI”和“仅水波球”之间切换 |
| 五个情绪按钮 | 手动设置情绪，并关闭自动感知 |
| 清除情绪 | 清除当前状态、恢复默认主题，并停止情绪提示词注入 |

面板标题会显示当前状态和来源，例如：

```text
当前情绪：开心（自动）
当前情绪：焦虑（手动）
当前情绪：无
```

### 自动感知

npm 版的自动感知流程为：

1. Host 监听新的 `user/message` 事件。
2. 连续消息在 2 秒防抖窗口内合并。
3. 读取当前会话最近 5 条用户消息。
4. 优先调用用户当前默认模型判断语境。
5. LLM 不可用或未识别出明显情绪时，回退到中英文关键词评分。
6. Client 每 3 秒读取一次状态并更新界面，不会重复调用 LLM。

手动选择情绪会关闭当前 Client 的自动感知。再次打开后，界面会继续同步 Host 检测到的状态。

### 提示词注入

存在有效情绪时，Host 会动态加入类似下面的系统提示词段落：

```text
[用户情绪感知] 用户当前情绪：焦虑 😰。用户可能着急或有压力，
请先给出明确、可执行的步骤，语气平稳安抚，不要增加负担。
```

切换情绪后，下一次模型调用会读取新状态。清除情绪后，该段落返回空文本。

### 输入示例

| 用户输入 | 预期结果 |
| --- | --- |
| “好开心啊，终于搞定了！” | 开心：金色主题，回应更轻快 |
| “有点焦虑，感觉来不及了……” | 焦虑：橙色主题，优先给出步骤 |
| “今天好累，不想写了。” | 疲惫：紫色主题，回应更精简 |
| “气死我了，这什么鬼！” | 生气：红色主题，先共情再处理 |
| “嗯，就这样吧，挺好的。” | 平静：蓝色主题，回应平和 |

## 工作原理

```text
Browser / Client
  ├─ EmotionWidget：水波球、控制面板、动态背景
  ├─ theme.overrideTokens：覆盖主题和侧边栏 token
  ├─ remote.emotion.get：读取 Host 情绪状态
  └─ remote.emotion.set：同步手动选择或清除操作
                         │
                         ▼ Typert Remote
Host / Node
  ├─ EmotionService：get / analyze / set
  ├─ session/event：监听新的用户消息
  ├─ llm.stream：分析最近 5 条输入的语境
  ├─ KEYWORDS：LLM 不可用时的关键词回退
  └─ systemPrompt.section：动态注入 user-mood 段落
```

## 项目结构

```text
dsh-cordis-emotion-engine/
├── README.md
├── package.json
├── tsconfig.json
├── tsdown.config.ts
├── scripts/
│   └── smoke-host.mjs
├── docs/
│   ├── FIXING-EXPERIENCE.md
│   └── DEVELOP-PUBLISH-SKILL.md
└── src/
    ├── host.js                   动态版 Host 函数体
    ├── client.js                 动态版 Client 函数体
    ├── index.ts                  npm 版 Host 和 EmotionService
    ├── typert.remote-client.ts   Typert Remote 描述
    └── client/
        ├── index.tsx             npm 版 Client 入口
        └── EmotionWidget.tsx     悬浮球、面板、主题和动画
```

## 开发

常用命令：

```bash
npm run typecheck   # TypeScript 类型检查
npm run build       # 生成 Host、Client、Remote 和类型产物
node scripts/smoke-host.mjs
npm pack            # 生成本地 tgz 安装包
```

常见修改位置：

| 需求 | 文件 |
| --- | --- |
| 修改关键词和提示词 | `src/index.ts` |
| 修改配色、动画和面板 | `src/client/EmotionWidget.tsx` |
| 修改 Remote 方法 | `src/index.ts` 与 `src/typert.remote-client.ts` |
| 修改动态加载版 | `src/host.js` 与 `src/client.js` |
| 修改打包方式 | `tsdown.config.ts` |

修改 Remote 契约时，Host 方法、Client 类型和 `typert.remote-client.ts` 描述必须保持一致。动态版和 npm 版是两套源码，功能修改也需要检查是否应同步到另一套实现。

## 常见问题

### 插件重启后没有加载

确认 `cordis.patch.yml` 使用了 `insert` 结构，并检查 tgz 路径是否为绝对路径。

### 页面没有出现悬浮球

先检查 Host 是否成功加载，再确认 `/plugins/<id>/client.js` 可以访问。重新构建或替换安装包后，重启 DSH 并强制刷新浏览器。

### Remote 接口返回 404

确认 DSH 已挂载 Typert 网关，并确认 Host 已将 Remote descriptors 注册到 typert registry。具体排查过程参见 [`docs/FIXING-EXPERIENCE.md`](docs/FIXING-EXPERIENCE.md)。

### 接口成功但 UI 不更新

Typert Remote 返回的是 `{ ok, value }`，实际情绪位于 `res.value.mood`。

### 修改代码后仍然是旧效果

重新执行 `npm run build` 和 `npm pack`，确认 DSH 配置指向新生成的 tgz。必要时清理部署端旧产物并强制刷新浏览器缓存。

## 已知限制

- npm 版目前使用一个全局情绪状态，多会话并行时可能互相影响。
- 动态版与 npm 版的自动分析机制不同，修改功能时需要分别维护。
- 关键词评分属于启发式判断，口语、新词和复杂反讽可能识别不准。
- 动态背景位于 `shell.overlay`，通过低透明度和 `soft-light` 降低对正文可读性的影响。

## 后续计划

- [ ] 发布到 npm registry 并完成公开安装验证
- [ ] 按会话隔离情绪状态
- [ ] 支持自定义关键词和分析配置
- [ ] 增加 Host 事件、LLM fallback 和 Client 交互测试
- [ ] 补充不同情绪主题的截图或演示

## 相关文档

- [`docs/FIXING-EXPERIENCE.md`](docs/FIXING-EXPERIENCE.md)：问题症状、原因和修复记录
- [`docs/DEVELOP-PUBLISH-SKILL.md`](docs/DEVELOP-PUBLISH-SKILL.md)：DSH 插件开发与发布经验

## License

[MIT](LICENSE)
