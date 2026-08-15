/**
 * 情绪引擎 Emotion Engine — Host 半部
 *
 * 标准 Cordis 插件：apply(ctx) 注册 EmotionService（Remote 服务，供 Client 半部
 * 通过 typert 网关调用），并注册 user-mood 系统提示词段落（每次模型调用动态
 * 注入当前用户情绪与回应引导）。
 *
 * 说明：Remote 标记使用手动绑定（Remote + methodContext），避免装饰器语法，
 * 保证构建产物为纯 JavaScript，可在任意 Node 环境加载。
 */
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'

/** 五种情绪键。 */
export type EmotionKey = 'happy' | 'calm' | 'tired' | 'anxious' | 'angry'

/** Remote 结果载荷：当前情绪（null = 无情绪）。 */
export interface EmotionResult {
  mood: EmotionKey | null
}

/** 关键字情感词表（中英）。 */
const KEYWORDS: Record<EmotionKey, readonly string[]> = {
  happy: ['开心', '高兴', '太好了', '哈哈', '喜欢', '超棒', '完美', '好耶', '爽', '赞', '棒', '耶', '🥳', 'happy', 'great', 'awesome', 'love', 'amazing', 'nice'],
  calm: ['平静', '放松', '安逸', '舒服', '淡定', '从容', '安心', '安静', 'calm', 'relaxed', 'peaceful', '嗯'],
  tired: ['累', '疲惫', '困', '乏', '没劲', '懒得', '熬夜', '撑不住', '倦', '蔫', 'tired', 'exhausted', 'sleepy'],
  anxious: ['焦虑', '担心', '怕', '紧张', '急', '慌', '不安', '来不及', '烦', '压力', 'anxious', 'worried', 'nervous', 'hurry'],
  angry: ['生气', '气死', '愤怒', '讨厌', '滚', '差劲', '什么鬼', '受不了', '气人', '抓狂', '暴躁', 'angry', 'mad', 'hate', 'damn'],
}

/** 情绪标签与提示词回应引导。 */
export const MOOD_INFO: Record<EmotionKey, { label: string; hint: string }> = {
  happy: { label: '开心 😊', hint: '用户心情很好，可以保持轻松积极的语气，适当活泼。' },
  calm: { label: '平静 😌', hint: '用户情绪平稳，保持平和简洁的回应即可。' },
  tired: { label: '疲惫 😪', hint: '用户精力有限，请用最简洁的方式给出直接可用的信息，避免冗长。' },
  anxious: { label: '焦虑 😰', hint: '用户可能着急或有压力，请先给出明确、可执行的步骤，语气平稳安抚，不要增加负担。' },
  angry: { label: '生气 😠', hint: '用户有不满情绪，请保持冷静专业，先共情理解再解决问题，不要辩解或推诿。' },
}

/** sessionQuery.filterEvents 返回的语义文档（只取本插件需要的字段）。 */
interface SessionEventDoc {
  text: string
}

/** sessionQuery 服务的客户端面（只取用到的成员）。 */
interface SessionQueryFace {
  filterEvents(sessionId: string, filters: readonly unknown[]): Promise<readonly SessionEventDoc[]>
}

/** 对最近 N 条用户消息做关键字情感评分（消息越新权重越高）。 */
function analyzeMood(docs: readonly SessionEventDoc[]): EmotionKey | null {
  if (docs.length === 0) return null
  const scores: Record<EmotionKey, number> = { happy: 0, calm: 0, tired: 0, anxious: 0, angry: 0 }
  docs.forEach((doc, i) => {
    const weight = 1 + (i / docs.length) * 2
    const text = doc.text.toLowerCase()
    for (const emotion of Object.keys(KEYWORDS) as EmotionKey[]) {
      for (const kw of KEYWORDS[emotion]) {
        if (text.includes(kw.toLowerCase())) scores[emotion] += weight
      }
    }
  })
  let best: EmotionKey | null = null
  let bestScore = 0
  for (const emotion of Object.keys(scores) as EmotionKey[]) {
    if (scores[emotion] > bestScore) {
      best = emotion
      bestScore = scores[emotion]
    }
  }
  return best
}

/** 模拟标准装饰器 context（用于手动绑定 Remote 标记）。 */
function methodContext(
  name: string,
  initializers: Array<() => void>,
): ClassMethodDecoratorContext<EmotionService, (...args: unknown[]) => unknown> {
  return {
    kind: 'method',
    name,
    static: false,
    private: false,
    metadata: {},
    access: {
      has: (object) => name in object,
      get: (object) => (object as unknown as Record<string, unknown>)[name] as (...args: unknown[]) => unknown,
    },
    addInitializer: (initializer) => initializers.push(initializer),
  }
}

/** Remote 标记初始化器（实例构造后执行）。 */
const remoteInitializers: Array<() => void> = []

/**
 * 情绪 Remote 服务：Client 半部通过 typert 网关调用
 * `emotion/get`、`emotion/analyze`、`emotion/set`。
 */
export class EmotionService extends TypertRemoteService<{ mood: EmotionKey | null }> {
  private _mood: EmotionKey | null = null

  constructor(ctx: Context) {
    super(ctx, 'emotion')
    for (const initializer of remoteInitializers) initializer.call(this)
  }

  /** 当前情绪（系统提示词段落读取此值）。 */
  get mood(): EmotionKey | null {
    return this._mood
  }

  /** 读取当前情绪。 */
  get(): EmotionResult {
    return { mood: this._mood }
  }

  /**
   * 分析指定会话最近 5 条用户消息，返回检测到的情绪（不写入当前状态，
   * 由 Client 决定是否 set）。
   */
  async analyze(sessionId: string): Promise<EmotionResult> {
    const sessionQuery = this.ctx.get('sessionQuery') as SessionQueryFace | undefined
    if (sessionQuery === undefined || typeof sessionId !== 'string') return { mood: null }
    try {
      const docs = await sessionQuery.filterEvents(sessionId, [{ kind: 'type', values: ['user/message'] }])
      return { mood: analyzeMood(docs.slice(-5)) }
    } catch (error) {
      return { mood: null }
    }
  }

  /** 设置当前情绪（Client 同步自动/手动结果）。 */
  set(args: { mood: EmotionKey | null }): { ok: true } {
    this._mood = args && args.mood !== undefined && args.mood !== null
      ? (KEYWORDS[args.mood] !== undefined ? args.mood : null)
      : null
    return { ok: true }
  }
}

// 手动绑定 Remote 标记（等价于 @Remote('get') 等装饰器）。
Remote(EmotionService.prototype.get, methodContext('get', remoteInitializers))
Remote(EmotionService.prototype.analyze, methodContext('analyze', remoteInitializers))
Remote(EmotionService.prototype.set, methodContext('set', remoteInitializers))

/** Cordis 插件主体。 */
export const name = 'dsh-cordis-emotion-engine'

export function apply(ctx: Context) {
  // 注册 Remote 服务（构造即 provide + typert 绑定）。
  const service = new EmotionService(ctx)

  // 系统提示词注入：每次模型调用动态读取当前情绪。
  const systemPrompt = ctx.get('systemPrompt') as {
    section(section: {
      name: string
      order: number
      text: string | ((context: unknown) => string)
    }): () => void
  } | undefined
  if (systemPrompt !== undefined) {
    systemPrompt.section({
      name: 'user-mood',
      order: 80,
      text: () => {
        const mood = service.mood
        if (mood === null) return ''
        const info = MOOD_INFO[mood]
        return `[用户情绪感知] 用户当前情绪：${info.label}。${info.hint}`
      },
    })
  }
}
