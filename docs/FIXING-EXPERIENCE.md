# DSH 插件发布修复经验

> 本文档记录把「情绪引擎 Emotion Engine」从**动态插件**改造成**可发布 npm 包**过程中遇到的
> 全部问题、根因与修复方案。按问题分类整理，附带方法论，供后续 DSH 插件开发参考。

---

## 背景

情绪引擎最初以**动态 Cordis 插件**（会话内 `cordis_define`/`cordis_run`）运行，功能完整。
为了"能发布给其他人用"（常驻、随 DSH 启动），改造成**标准 npm 插件包**：
Host 半部（Remote 服务 + 情绪分析 + 系统提示词注入）+ Client 半部（水波球 UI + 主题变色）。

改造过程踩了 7 类坑，逐一记录如下。

---

## 问题 1：patch 里新增插件不生效（插件静默不加载）

**症状**：在用户 profile 的 `cordis.patch.yml` 加了插件行，重启后插件完全没有加载。

**根因**：patch 列表是 `@deepseek-ai/cordis-plugin-include` 的 **`PatchOptions`** 语义：

```ts
interface PatchOptions {
  id?: string
  insert?: EntryOptions[]   // 新增插件必须用这个
  name?: string
  // ...其余字段都是"覆盖已有 entry"的配置
}
```

直接写 `- id: emotion-engine` + `name: ...` 会被当作**按 id 覆盖已有 entry** —— 找不到目标
时 `warn('patch: entry not found')` 并**静默跳过**（不报错，不加载）。

**修复**：新增插件必须用**无 id 的 `insert`**：

```yaml
- insert:
    - id: emotion-engine
      name: dsh-cordis-emotion-engine
```

**教训**：先读 `cordis-plugin-include` 的 `PatchOptions` 定义再写 patch，不要套用 web-app
bundle 里的行格式（那是 bundle 层，语义不同）。

---

## 问题 2：Client bundle 格式错误（`__ModuleLoader__.load` 未注册）

**症状**：启动报

```
failed to import loader entry ... (dsh-cordis-emotion-engine):
client-modules: bundle /plugins/.../client.js loaded without registering "..." via __ModuleLoader__.load
```

**根因**：DSH 的 client 插件 bundle 必须是**闭包 factory 格式**（CJS 输出 + 特殊 banner/footer）：

```js
window.__ModuleLoader__.load({
  id: "dsh-cordis-emotion-engine",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    // ... CJS 代码，依赖通过 require() 从 shell 模块表解析 ...
    exports.apply = apply;
    exports.inject = inject;
    exports.name = name;
    return module.exports;
  }
});
```

普通 ESM bundle 会被浏览器直接执行但不注册 → 报错。

**修复**（tsdown 配置）：

```ts
{
  format: 'cjs',
  platform: 'browser',
  external: PLATFORM_MODULES,            // react、@deepseek-ai/* 等 shell 模块
  noExternal: (id) => (PLATFORM_MODULES.includes(id) ? undefined : true), // 其余内联（zod 等）
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: "...", factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}
```

**参考**：harness `packages/client/tsdown.client.ts` 的 `clientConfig()`。

**教训**：client 插件 bundle 的加载协议是 `__ModuleLoader__` factory，依赖必须走 `require()`
（shell 模块表），不能假设 import map。

---

## 问题 3：Cordis Guard 注入（`ctx.remote` / `ctx.remote.emotion`）

**症状 A**：`cannot get property "remote" without inject` —— apply 里访问 `ctx.remote`。

**修复 A**：`export const inject = ['remote']`。

**症状 B**：组件渲染时 `cannot get property "remote.emotion" without inject`。

**根因 B**：`ctx.remote` 是 traceable proxy，访问其**子命名空间**（`emotion`）会被当作子服务
检查注入。若声明 `inject: ['remote.emotion']` → Cordis 会**等待该服务激活** —— 但它是我们
自己 `$mount` 后才注册的，boot 阶段不存在 → **entry 永久 pending**（页面报错）。

**修复 B**：
- `inject` 只声明 `['remote']`（避免 boot 等待）
- `$mount` 完成后用 **`ctx.get('remote.emotion')`** 读取（`ctx.get` 是显式读取 API，
  不检查 inject，也不触发 Guard）
- 把拿到的服务实例通过 props 传给组件，组件直接调 `emotion.get()/analyze()/set()`
  （普通对象方法，不再触碰 `ctx.remote` proxy）

**教训**：Guard 的 `inject` 是"等待服务激活"语义；`$mount` 动态挂载的命名空间不能用 inject
声明，要用 `ctx.get()`。参考 ui-cordis 的 `'remote.dynamicCordisRunner'` 模式（那是已注册服务）。

---

## 问题 4：apply 时机 —— fiber 未激活，父级服务不可见

**症状**：host 半部激活了（有激活日志），但 `ctx.get('typert')`、`ctx.get('systemPrompt')`
在 apply 里返回 **undefined** → 端点注册失败 → `/api/emotion/analyze` 404；提示词注入也不生效。

**根因**：插件 `apply` 运行在 **fiber 激活之前**，父级（root）服务此时**尚未提交**到当前
fiber 的可见范围。延迟后（fiber 激活）同一服务就可见了。

**验证手段**：在 apply 里写**自证文件**确认激活 + 延迟 2s 后复查服务可见性（`ctx.get('typert')`
从 undefined → 存在）。

**修复**：把依赖父级服务的初始化（typert 端点注册、systemPrompt.section）放进 `setTimeout`
（fiber 激活后）：

```ts
setTimeout(() => {
  const typert = ctx.get('typert')
  if (typert) typert.register({ package, face: 'host', schemas: [], model: {...}, invocations })
  const systemPrompt = ctx.get('systemPrompt')
  if (systemPrompt) systemPrompt.section({ name: 'user-mood', order: 80, text: () => ... })
}, 2000)
```

**教训**：插件 apply 里只能可靠使用**自己注册的服务** + **inject 声明的服务**；父级服务要等
fiber 激活。这是 cordis 的正常生命周期，不是 bug。

---

## 问题 5：Remote 返回值形状（接口 200 但 UI 无状态）

**症状**：`POST /api/emotion/analyze` 返回 200 且 `value.mood` 正确，但组件里情绪从未生效，
UI 永远"无状态"（涟漪中性色）。

**根因**：Typert remote 方法返回 **`RemoteResult`** 形状，不是裸业务值：

```ts
type RemoteResult<T> = { ok: true; value: T } | { ok: false; error: RemoteFailure }
```

组件里写 `res.mood` → `res` 是 `{ok, value}` → `res.mood` 永远是 **undefined** →
`if (!res.mood) return` 静默跳过 → 情绪从不 set。

**修复**：解包 `res.value`：

```ts
emotion.analyze(sessionId).then((res) => {
  if (!res || !res.ok) return
  const mood = res.value.mood
  if (!mood) return
  setMood(mood)
})
```

**教训**：用 Typert Remote 前先查 `RemoteResult` 契约（`@deepseek-ai/dsh-typert-protocol`），
所有 remote 方法都返回 `{ok, value}`。

---

## 问题 6：情绪分析加权 —— 最新消息被历史淹没

**症状**：连续输入"好开心啊"×2 后输入"气死我了"，接口仍返回 `happy`。

**根因**：分析取**最近 5 条**消息做关键词评分，原加权 `1 + (i/N)*2` 太平缓，历史开心
（2 条）分数压过了最新生气（1 条）。

**修复**：陡峭衰减加权（最新消息主导当前情绪状态）：

```ts
const weight = docs.length === 1 ? 3 : 0.5 + (i / (docs.length - 1)) * 2.5
// 最新一条 weight=3.0，最早 ≈0.5
```

**教训**：情绪是"当前状态"，最近消息权重应显著高于历史；调参后务必用**真实对话序列**验证。

---

## 问题 7：部署残留导致"改了没生效"

**症状**：反复改代码、重装、重启，浏览器加载的 bundle 还是旧逻辑。

**根因**：`npm pack` + `tar -xzf` 解压**只覆盖同名文件，不删除多余文件**；早期产物命名
（`lib/index.js`）与后期（`lib/client.js`）不同，旧文件残留。运行时可能读到旧产物。

**修复**：重装前**先删干净**部署目录再解压：

```bash
rm -rf ~/.dsh/profiles/node_modules/dsh-cordis-emotion-engine/lib
tar -xzf dsh-cordis-emotion-engine-0.1.0.tgz -C ... --strip-components=1
```

**教训**：产物命名要稳定（`client.js` 由 `entryFileNames` 固定）；重装用 `rm -rf + 解压`
而不是覆盖；怀疑"改了没生效"先核对部署目录实际文件内容。

---

## 问题 8：LLM 调用返回空流（只有 finish，没有 text-delta）

**症状**：LLM 语境分析调用执行了（模型选择正确），但流式输出为空 ——
`chunk types: finish`（没有任何 `text-delta`），情绪永远判为 neutral/null。

**根因**：`llm.stream()` 的 `messages` 里 `Message.content` 必须是 **`ContentBlock[]`**
（如 `[{ type: 'text', text }]`），不能是裸字符串。传字符串时适配器不认 → 模型空响应。

**修复**：

```ts
llm.stream({
  provider, model,
  messages: [{ role: 'user', content: [{ type: 'text', text: JSON.stringify(texts) }] }],
  system: MOOD_SYSTEM_PROMPT,
  temperature: 0,
  maxTokens: 64,   // 别太小：reasoning 模型会吃掉 token
})
```

**教训**：调用 `llm.stream` 前先查 `Message` / `ContentBlock` 类型契约（`@deepseek-ai/dsh-llm`）；
流式结果用 `chunk.type === 'text-delta'` 收集。

## 问题 9：事件驱动 vs 轮询（成本设计）

**设计**：情绪分析不能每 2.5s 轮询（浪费），应该**事件驱动**：
- Host 监听 `session/event`（新 `user/message` 到达）→ **防抖 2s**（连续消息合并）→ 分析一次
- Client 只轻量轮询 `get()`（读状态，无分析开销）
- 无新消息 = 零模型调用

**注意**：`session/event` 是 scoped 事件，监听器要确认真的收到事件（用自证文件验证）；
事件名不在 `Events` 类型声明时用显式面 `(ctx as ...).on(name, fn)` 注册。

## 方法论（怎么高效排查这类问题）

1. **自证文件**：在运行时写文件（`writeFileSync`）确认"某段代码是否真的执行了"、
   "某个服务当时是否可见"。比让用户贴终端/console 可靠得多。
2. **二分法**：裸 `Context + ctx.plugin` vs 真实 loader 环境对比 —— 快速区分"插件问题"
   还是"环境/集成问题"（本例 loader 环境连空插件都报 Cyclic __proto__，证明是测试脚本
   环境不完整，与插件无关）。
3. **读官方源码**：gateway / loader / client-modules / tsdown.client.ts 的实现就是答案。
   症状 → grep 错误串 → 读源码确认契约。
4. **让状态可见**：把组件内部状态（mood）通过 UI（涟漪颜色/面板标题）暴露出来，用户
   不用开 console 就能反馈"到没到组件"。
5. **一次只动一个变量**：每个版本只改一个根因，配合重启 + 强刷验证。

---

## 关键资源

| 资源 | 用途 |
| --- | --- |
| `cordis-plugin-include` 的 `PatchOptions` | patch 的 insert/覆盖语义 |
| `packages/client/tsdown.client.ts` | client bundle 的 `__ModuleLoader__` factory 配置 |
| `@deepseek-ai/dsh-api-gateway`（src/index.ts） | 网关 `claimsEndpoint`/`collectSrcClaims`/`originalOf` |
| `@deepseek-ai/dsh-typert-registry` | `register(contribution)` 让端点被网关直接认领 |
| `@deepseek-ai/dsh-typert-protocol` | `RemoteResult`、`InvocationDescriptor`、`TypertRemoteService` |
| `@deepseek-ai/dsh-client-modules` | client bundle 的发现与 `/plugins/<id>/client.js` 服务 |
| `vendor/cordis`（reflect.ts / utils.ts） | Guard 的 traceable proxy、`ctx.get` 语义 |
