/**
 * 情绪引擎 Emotion Engine — Client 半部（dsh.client web 插件）
 *
 * 挂载本包自己的 Typert Remote（emotion/get、analyze、set），注册
 * shell.overlay 悬浮水波球，并通过 theme.overrideTokens 驱动全局变色。
 *
 * 说明：为保持独立可发布，本半部不依赖 @deepseek-ai 的 monorepo 内 client 包
 * （部分未发布到 npm），而是使用结构化类型；运行时这些服务由 DSH 部署提供。
 */
import type { TypertRemoteContribution } from '@deepseek-ai/dsh-typert-protocol'
import { EmotionWidget } from './EmotionWidget'
import TYPERT_REMOTE from '../typert.remote-client'
import type { EmotionKey } from '../index'

/** emotion.* Remote 面（RemoteResult 形状：{ ok, value }）。 */
export interface EmotionRemoteFace {
  get(): Promise<{ ok: true; value: { mood: EmotionKey | null } }>
  analyze(sessionId: string): Promise<{ ok: true; value: { mood: EmotionKey | null } }>
  set(args: { mood: EmotionKey | null }): Promise<{ ok: true; value: { ok: true } }>
}

/** Client 运行时面（结构化类型）。 */
export interface ClientCtx {
  get<T = unknown>(name: string): T | undefined
  remote: { $mount(contribution: TypertRemoteContribution): Promise<unknown> } & { emotion: EmotionRemoteFace }
}

/** slots 服务面。 */
interface SlotsFace {
  inject(key: string, callback: () => unknown): () => void
  register(
    options: { name: string; id: string; order?: number },
    component: (props: { useSessions: (sel: (s: { current?: string }) => string | undefined) => string | undefined }) => unknown,
  ): unknown
}

/** theme 服务面。 */
interface ThemeFace {
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
}

export const name = 'dsh-cordis-emotion-engine'

/**
 * 只声明 'remote'：'remote.emotion' 是 $mount 后才注册的服务，
 * 若声明为 inject 会让 boot 阶段永久等待（pending）。
 * $mount 完成后通过 ctx.get('remote.emotion') 获取（ctx.get 不检查 inject）。
 */
export const inject = ['remote']

/** 模块级防重复挂载：apply 可能被多次调用（会话/激活）。 */
let remoteMounted = false

/**
 * Client 插件 apply 必须是同步函数（加载器不 await 返回值），
 * 因此 $mount（异步）完成后才注册 slots UI。
 */
export function apply(ctx: ClientCtx) {
  const slots = ctx.get<SlotsFace>('slots')
  const theme = ctx.get<ThemeFace>('theme')
  if (slots === undefined || theme === undefined) return

  const registerUi = () => {
    // $mount 完成后 'remote.emotion' 服务已注册，ctx.get 直接读取（绕过 Guard 的注入检查）。
    const emotion = ctx.get('remote.emotion') as EmotionRemoteFace | undefined
    if (emotion === undefined) return
    slots.inject('shell.overlay', () => slots.register(
      { name: 'shell.overlay', id: 'mood-widget', order: 100 },
      (props) => (
        <EmotionWidget
          useSessions={props.useSessions}
          theme={theme}
          emotion={emotion}
        />
      ),
    ))
  }

  if (remoteMounted) {
    registerUi()
    return
  }
  remoteMounted = true
  ctx.remote.$mount(TYPERT_REMOTE)
    .then(registerUi)
    .catch((error) => {
      console.error('[emotion-engine] remote mount failed:', error)
    })
}
