/**
 * 情绪引擎 — Typert Remote contribution（Client 面）
 *
 * 描述 Host 半部 EmotionService 的 remote 方法契约。Client 半部通过
 * ctx.remote.$mount(TYPERT_REMOTE) 挂载后即可调用 emotion/get、
 * emotion/analyze、emotion/set。
 *
 * 说明：本文件为手写产物（格式与 @deepseek-ai/dsh-typert-generator 生成的
 * typert.remote-client.js 一致），方法签名必须与 src/index.ts 的
 * EmotionService 保持一致。
 */
import { z } from 'zod'
import type { InvocationDescriptor, TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'

export const PACKAGE = 'dsh-cordis-emotion-engine'

const moodSchema = z.union([
  z.literal('happy'),
  z.literal('calm'),
  z.literal('tired'),
  z.literal('anxious'),
  z.literal('angry'),
  z.null(),
])
const emotionResultSchema = z.object({ mood: moodSchema })
const okSchema = z.object({ ok: z.literal(true) })
const sessionIdSchema = z.string()
const setArgsSchema = z.object({ mood: moodSchema })

const descriptors: InvocationDescriptor[] = [
  {
    id: `${PACKAGE}#emotion/get`,
    service: 'emotion',
    namespace: 'emotion',
    method: 'get',
    invocation: { kind: 'direct' },
    parameters: [],
    result: { mode: 'strict', typeSymbol: `${PACKAGE}#EmotionResult`, schema: emotionResultSchema },
  },
  {
    id: `${PACKAGE}#emotion/analyze`,
    service: 'emotion',
    namespace: 'emotion',
    method: 'analyze',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'sessionId',
      wire: 'sessionId',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: `${PACKAGE}#SessionId`, schema: sessionIdSchema },
    }],
    result: { mode: 'strict', typeSymbol: `${PACKAGE}#EmotionResult`, schema: emotionResultSchema },
  },
  {
    id: `${PACKAGE}#emotion/set`,
    service: 'emotion',
    namespace: 'emotion',
    method: 'set',
    invocation: { kind: 'direct' },
    parameters: [{
      name: 'args',
      wire: 'args',
      source: 'json',
      codec: { mode: 'strict', typeSymbol: `${PACKAGE}#SetArgs`, schema: setArgsSchema },
    }],
    result: { mode: 'strict', typeSymbol: `${PACKAGE}#Ok`, schema: okSchema },
  },
]

/** 客户端挂载用 contribution。 */
export const TYPERT_REMOTE: TypertRemoteContribution = {
  package: PACKAGE,
  descriptors,
}

export default TYPERT_REMOTE
