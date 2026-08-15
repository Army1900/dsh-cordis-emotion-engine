/**
 * Host 半部冒烟测试：在裸 Cordis Context 中加载 lib/index.mjs，
 * 注入假 sessionQuery / systemPrompt，验证：
 *  1. EmotionService 注册为 ctx.emotion
 *  2. analyze 关键字情感识别
 *  3. set / get 状态
 *  4. systemPrompt 段落动态注入
 */
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../lib/index.mjs'

const ctx = new Context()

// 假 sessionQuery：分析用的会话文档。
ctx.provide('sessionQuery', {
  filterEvents: async (_sessionId, _filters) => [
    { text: '今天好累，不想写了' },
    { text: '好开心啊，终于搞定了！' },
  ],
})

// 假 systemPrompt：捕获注册的段落。
const sections = []
ctx.provide('systemPrompt', {
  section: (section) => {
    sections.push(section)
    return () => {}
  },
})

await ctx.plugin(plugin)

const emotion = ctx.get('emotion')
console.log('1. EmotionService 已注册:', emotion !== undefined)

const analyzed = await emotion.analyze('session-1')
console.log('2. analyze(最近含“好开心”消息) →', JSON.stringify(analyzed), analyzed.mood === 'happy' ? '✓' : '✗')

emotion.set({ mood: 'calm' })
const got = emotion.get()
console.log('3. set/calm + get →', JSON.stringify(got), got.mood === 'calm' ? '✓' : '✗')

emotion.set({ mood: null })
const gotNull = emotion.get()
console.log('4. set/null + get →', JSON.stringify(gotNull), gotNull.mood === null ? '✓' : '✗')

const section = sections[0]
console.log('5. systemPrompt 段落注册:', section && section.name === 'user-mood' ? '✓' : '✗')
emotion.set({ mood: 'angry' })
const text = section.text()
console.log('6. 段落动态文本(angry):', text, text.includes('生气') && text.includes('共情') ? '✓' : '✗')
emotion.set({ mood: null })
console.log('7. 段落动态文本(null):', JSON.stringify(section.text()), section.text() === '' ? '✓' : '✗')

await ctx.fiber.dispose()
console.log('\n冒烟测试完成')
