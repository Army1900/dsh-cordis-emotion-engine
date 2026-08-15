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

/** emotion.* Remote 面。 */
export interface EmotionRemoteFace {
  get(): Promise<{ mood: EmotionKey | null }>
  analyze(sessionId: string): Promise<{ mood: EmotionKey | null }>
  set(args: { mood: EmotionKey | null }): Promise<{ ok: true }>
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

export async function apply(ctx: ClientCtx) {
  const slots = ctx.get<SlotsFace>('slots')
  const theme = ctx.get<ThemeFace>('theme')
  if (slots === undefined || theme === undefined) return

  // 挂载本包 Remote 命名空间（emotion.*）。
  await ctx.remote.$mount(TYPERT_REMOTE)

  slots.inject('shell.overlay', () => slots.register(
    { name: 'shell.overlay', id: 'mood-widget', order: 100 },
    (props) => (
      <EmotionWidget
        useSessions={props.useSessions}
        theme={theme}
        remote={ctx.remote}
      />
    ),
  ))
}
