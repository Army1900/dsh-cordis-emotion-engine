---
name: dsh-plugin-dev-publish
description: 在 DeepSeek Harness 中开发并发布 Cordis 插件（动态或可发布 npm 包）的完整流程与踩坑指南。
---

# DSH 插件开发与发布 Skill

> 由「情绪引擎 Emotion Engine」实战经验提炼：从动态插件到可发布 npm 包的全流程、
> 关键机制、7+ 类常见坑与修复、发布清单。开发前先读本文，能少踩一半坑。

## 适用场景

在 DeepSeek Harness (DSH) 中为 Agent 添加自定义能力：
- 给模型加可调用工具（Host）
- 给浏览器 UI 加组件/主题/设置项（Client）
- 两者结合（Host 数据 + Client 展示）
- 想发布成 npm 包给其他人用（静态插件）

## 第一步：选路线

| 需求 | 路线 | 说明 |
| --- | --- | --- |
| 会话内试用 / 快速迭代 | **动态插件**（`cordis_define` / `cordis_run`） | 快捷通道，接入机制内置，重启丢失 |
| 常驻、可发布给他人 | **静态 npm 包**（cordis.yml 挂载） | 通用体系，所有机制要自己对齐，随 DSH 启动 |

> ⚠️ 动态插件简单，是因为 `harness.handle`/`host.call` 是 runner 内置的私有 RPC；
> 静态插件走 Typert Remote + Guard + loader 完整体系，**这些机制在 harness 内部是
> 编译期自动化的，对独立 npm 包全部要手动复刻**。

## 第二步：选平台

| 能力 | 平台 | 关键接口 |
| --- | --- | --- |
| 文件/命令/网络/模型调用 | Host | `fs`、`bash`、`web`、`llm`、`sessionQuery` |
| Agent/Session/事件 | Host | `sessions`、`agents`、`session/event`、`systemPrompt` |
| 页面 UI/主题 | Client | `slots`、`theme`、`locale` |
| Client↔Host 通信（静态） | Both | Typert Remote（`@Remote` 服务 + `$mount`） |

## 动态插件流程（快速）

1. `cordis_inspect_list` / `cordis_inspect_query`：查真实接口契约，**不要猜 API**
2. `cordis_define`：提交 Package（纯 JS 函数体，无 TS/JSX/import）
3. `cordis_run`：激活（Client 首次需用户批准）
4. Client 通信用 `host.call(method, args)`（Host 侧 `harness.handle`）

## 静态 npm 包流程（发布）

### 工程结构

```
package.json          # exports(./ 、./client、./remote) + dsh.client 声明 + peerDeps
tsconfig.json         # tsc 产出声明到 lib/types
tsdown.config.ts      # host(node ESM) + client(browser CJS factory) + remote
src/
  index.ts            # Host：apply(ctx) + Remote 服务
  typert.remote-client.ts  # Remote descriptors（client 挂载用）
  client/index.tsx    # Client：dsh.client 插件（$mount + slots + React）
scripts/smoke-host.mjs     # Host 冒烟测试（裸 Context + ctx.plugin）
```

### 七个必踩的坑（先读先省）

#### 坑 1：patch 里新增插件不生效
- 症状：`cordis.patch.yml` 加了行，重启后插件没加载
- 根因：patch 是 `PatchOptions` 语义，`{id, name}` = 覆盖已有 entry（找不到被静默跳过）
- 修复：
  ```yaml
  - insert:
      - id: my-plugin
        name: my-plugin
  ```

#### 坑 2：Client bundle 格式
- 症状：`bundle ... loaded without registering "..." via __ModuleLoader__.load`
- 根因：client bundle 必须是 factory 格式（CJS + banner/footer），普通 ESM 不行
- 修复（tsdown）：
  ```ts
  { format: 'cjs', platform: 'browser',
    external: PLATFORM_MODULES,                    // react、@deepseek-ai/*（shell 模块表）
    noExternal: (id) => (PLATFORM_MODULES.includes(id) ? undefined : true), // 其余内联（zod）
    outputOptions: {
      entryFileNames: 'client.js',
      banner: `window.__ModuleLoader__.load({ id: "<pkg>", factory: (require) => {`,
      footer: 'return module.exports; } });',
      intro: 'var module = { exports: {} }; var exports = module.exports;',
    } }
  ```
- 参考：harness `packages/client/tsdown.client.ts`

#### 坑 3：Cordis Guard 注入
- 症状：`cannot get property "remote" / "remote.emotion" without inject`；或声明后 boot 永久 pending
- 根因：访问 `ctx.xxx` 必须 `inject` 声明；但 `remote.emotion` 是 `$mount` 后才注册的，
  inject 声明会让 boot 永远等它
- 修复：inject 只声明 `['remote']`；$mount 后用 **`ctx.get('remote.emotion')`** 拿（ctx.get 不检查 inject）

#### 坑 4：apply 时机（fiber 未激活）
- 症状：host 激活了但 `ctx.get('typert')`/`ctx.get('systemPrompt')` 返回 undefined → RPC 404
- 根因：插件 apply 运行时父级服务尚未提交到当前 fiber
- 修复：依赖父级服务的初始化（typert 注册、systemPrompt.section）放 `setTimeout`（fiber 激活后）
- 验证：apply 里写文件自证（`writeFileSync`）

#### 坑 5：Remote 返回值形状
- 症状：接口 200 但 UI 无状态
- 根因：remote 方法返回 **`{ ok: true, value: T }`**（RemoteResult），不是裸业务值
- 修复：客户端解包 `res.value.mood`（不是 `res.mood`）

#### 坑 6：端点 404（网关没认领）
- 症状：`POST /api/<ns>/<method>` 404，但服务已注册、srcClaims 模拟能找到
- 根因：网关 `claimsEndpoint` 的 `srcClaims` 懒缓存时序
- 修复：host 侧把端点注册进 **typert registry**（claimsEndpoint 第一分支直接命中）：
  ```ts
  ctx.get('typert').register({
    package, face: 'host', schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: TYPERT_REMOTE.descriptors,
  })
  ```

#### 坑 7：llm.stream 返回空流
- 症状：模型调用执行了但输出空（`chunk types: finish`）
- 根因：`messages[].content` 必须是 **`ContentBlock[]`**（`[{type:'text', text}]`），不是字符串
- 修复：
  ```ts
  llm.stream({ provider, model,
    messages: [{ role: 'user', content: [{ type: 'text', text: '...' }] }],
    system: '...', temperature: 0, maxTokens: 64 })
  // 收集：chunk.type === 'text-delta' → chunk.text
  ```

### 事件驱动设计（成本控制）

- 不要轮询分析/调用；**事件驱动**：Host 监听 `session/event`（`user/message`）→ 防抖合并 → 触发一次
- Client 只轻量轮询 `get()` 读状态（无副作用）
- 注意：`session/event` 是 scoped 事件，监听器要用自证文件确认真的收到；事件名不在
  `Events` 类型时用 `(ctx as unknown as { on(name, fn) }).on(...)` 注册

## 发布清单

- [ ] `package.json`：`exports`（`./`、`./client`、`./remote`）、`dsh.client: { platform: 'web' }`、peerDeps
- [ ] 构建：`npm run build`（tsc 声明 + tsdown bundle），产物 `lib/`
- [ ] **产物命名稳定**（`entryFileNames` 固定），重装用 `rm -rf lib && tar 解压`（防残留）
- [ ] 冒烟：裸 `Context + ctx.plugin` 验证 host apply + 服务注册
- [ ] 本地挂载：`cordis.patch.yml` 用 `insert`；重启 dsh + 强刷浏览器验证
- [ ] `npm publish`

## 方法论

1. **自证文件**：运行时写文件确认代码执行/服务可见性（比贴日志可靠）
2. **二分法**：裸 Context vs 真实 loader 环境，快速区分"插件问题"还是"环境问题"
3. **读官方源码**：`grep 错误串 → 读 gateway/loader/client-modules/tsdown 源码确认契约`
4. **让状态可见**：把内部状态暴露到 UI（颜色/标题），用户不用开 console 就能反馈
5. **一次只动一个变量**：每版只改一个根因，配合重启 + 强刷验证

## 关键资源

| 资源 | 用途 |
| --- | --- |
| `@deepseek-ai/cordis-plugin-include` | patch 的 insert/覆盖语义 |
| harness `packages/client/tsdown.client.ts` | client bundle factory 配置模板 |
| `@deepseek-ai/dsh-api-gateway` | 网关 claimsEndpoint / srcClaims / originalOf |
| `@deepseek-ai/dsh-typert-registry` | `register(contribution)` 让网关直接认领端点 |
| `@deepseek-ai/dsh-typert-protocol` | RemoteResult / InvocationDescriptor / TypertRemoteService |
| `@deepseek-ai/dsh-llm` | GenerateOptions / Message.content(ContentBlock[]) / StreamChunk |
| `@deepseek-ai/dsh-client-modules` | client bundle 发现与 `/plugins/<id>/client.js` |

## 参考实战

情绪引擎完整修复过程：见本仓库 `docs/FIXING-EXPERIENCE.md`。
