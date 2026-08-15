/**
 * 情绪引擎 Emotion Engine — Host 半部
 *
 * 本文件是 cordis_define 的 code.host 函数体（纯 JavaScript，无 TS/JSX/import）。
 * 在 DSH 会话中加载时，把本文件内容作为 code.host 传入 cordis_define 即可。
 *
 * 职责：
 *  - mood:analyze RPC：读取指定会话最近 5 条用户消息，做关键字情感评分
 *  - mood:set RPC：接收客户端同步的当前情绪
 *  - 注册 user-mood 系统提示词段落：每次模型调用动态注入用户当前情绪与回应引导
 */
return {
  apply(ctx) {
    const sessionQuery = ctx.get('sessionQuery')
    const systemPrompt = ctx.get('systemPrompt')
    if (sessionQuery === undefined || systemPrompt === undefined) return

    const KEYWORDS = {
      happy: ['开心', '高兴', '太好了', '哈哈', '喜欢', '超棒', '完美', '好耶', '爽', '赞', '棒', '耶', '🥳', 'happy', 'great', 'awesome', 'love', 'amazing', 'nice'],
      calm: ['平静', '放松', '安逸', '舒服', '淡定', '从容', '安心', '安静', 'calm', 'relaxed', 'peaceful', '嗯'],
      tired: ['累', '疲惫', '困', '乏', '没劲', '懒得', '熬夜', '撑不住', '倦', '蔫', 'tired', 'exhausted', 'sleepy'],
      anxious: ['焦虑', '担心', '怕', '紧张', '急', '慌', '不安', '来不及', '烦', '压力', 'anxious', 'worried', 'nervous', 'hurry'],
      angry: ['生气', '气死', '愤怒', '讨厌', '滚', '差劲', '什么鬼', '受不了', '气人', '抓狂', '暴躁', 'angry', 'mad', 'hate', 'damn'],
    }

    const MOOD_INFO = {
      happy: { label: '开心 😊', hint: '用户心情很好，可以保持轻松积极的语气，适当活泼。' },
      calm: { label: '平静 😌', hint: '用户情绪平稳，保持平和简洁的回应即可。' },
      tired: { label: '疲惫 😪', hint: '用户精力有限，请用最简洁的方式给出直接可用的信息，避免冗长。' },
      anxious: { label: '焦虑 😰', hint: '用户可能着急或有压力，请先给出明确、可执行的步骤，语气平稳安抚，不要增加负担。' },
      angry: { label: '生气 😠', hint: '用户有不满情绪，请保持冷静专业，先共情理解再解决问题，不要辩解或推诿。' },
    }

    let currentMood = null

    function analyzeMood(docs) {
      if (docs.length === 0) return null
      const scores = { happy: 0, calm: 0, tired: 0, anxious: 0, angry: 0 }
      docs.forEach((doc, i) => {
        const weight = 1 + (i / docs.length) * 2
        const text = String(doc.text || '').toLowerCase()
        for (const emotion of Object.keys(KEYWORDS)) {
          for (const kw of KEYWORDS[emotion]) {
            if (text.includes(kw.toLowerCase())) scores[emotion] += weight
          }
        }
      })
      let best = null
      let bestScore = 0
      for (const emotion of Object.keys(scores)) {
        if (scores[emotion] > bestScore) {
          best = emotion
          bestScore = scores[emotion]
        }
      }
      return best
    }

    ctx.effect(() => harness.handle('mood:analyze', async (args) => {
      const sessionId = args && typeof args === 'object' ? args.sessionId : undefined
      if (typeof sessionId !== 'string') return { mood: null }
      try {
        const docs = await sessionQuery.filterEvents(sessionId, [{ kind: 'type', values: ['user/message'] }])
        const recent = docs.slice(-5)
        return { mood: analyzeMood(recent) }
      } catch (error) {
        return { mood: null }
      }
    }))

    ctx.effect(() => harness.handle('mood:set', (args) => {
      const mood = args && typeof args === 'object' && typeof args.mood === 'string' ? args.mood : null
      currentMood = mood
      return { ok: true }
    }))

    ctx.effect(() => systemPrompt.section({
      name: 'user-mood',
      order: 80,
      text: () => {
        if (currentMood === null || !MOOD_INFO[currentMood]) return ''
        const info = MOOD_INFO[currentMood]
        return '[用户情绪感知] 用户当前情绪：' + info.label + '。' + info.hint
      },
    }))
  },
}
