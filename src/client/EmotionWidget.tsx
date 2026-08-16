/**
 * 情绪引擎 — 水波悬浮球组件
 *
 * 半透明水波球 + 磨砂情绪面板：自动感知（Host 监听新消息分析，Client 轻量轮询状态）或手动选择，
 * 通过 theme.overrideTokens 覆盖全局主题 token（含侧边栏），并渲染情绪专属的
 * 全屏动态渐变背景层（低强度 soft-light，避免遮挡会话文字）。
 */
import { useEffect, useRef, useState } from 'react'
import type { EmotionKey } from '../index'

/** 主题服务面（只取用到的成员）。 */
export interface ThemeFace {
  overrideTokens(source: string, tokens: Record<string, { light: string; dark: string }>): () => void
}

/** Remote 方法返回 RemoteResult 形状：{ ok: true, value: T } | { ok: false, error }。 */
interface RemoteOk<T> {
  ok: true
  value: T
}

/** emotion Remote 命名空间服务（$mount 后注册为 ctx 'remote.emotion'，由 apply 传入）。 */
export interface EmotionRemote {
  get(): Promise<RemoteOk<{ mood: EmotionKey | null }>>
  analyze(sessionId: string): Promise<RemoteOk<{ mood: EmotionKey | null }>>
  set(args: { mood: EmotionKey | null }): Promise<RemoteOk<{ ok: true }>>
}

export interface EmotionWidgetProps {
  useSessions: (sel: (s: { current?: string }) => string | undefined) => string | undefined
  theme: ThemeFace
  emotion: EmotionRemote
}

interface MoodDef {
  label: string
  emoji: string
  color: string
  tokens: Record<string, { light: string; dark: string }>
  layer: string
}

const MOODS: Record<EmotionKey, MoodDef> = {
  happy: {
    label: '开心', emoji: '😊', color: '#F5B83D',
    tokens: {
      '--dsw-alias-bg-base': { light: '#FFF6E0', dark: '#2B2110' },
      '--dsw-alias-bg-layer-1': { light: '#FFFDF2', dark: '#342914' },
      '--dsw-alias-bg-layer-2': { light: '#FDEFC9', dark: '#3F3016' },
      '--dsw-alias-brand-primary': { light: '#D99A06', dark: '#F5B83D' },
      '--dsw-specific-sidebar-fill': { light: '#FBEECB', dark: '#241C0D' },
    },
    layer: 'mood-bg-happy',
  },
  calm: {
    label: '平静', emoji: '😌', color: '#4FB3D9',
    tokens: {
      '--dsw-alias-bg-base': { light: '#EAF4FA', dark: '#10202A' },
      '--dsw-alias-bg-layer-1': { light: '#F4FAFD', dark: '#162936' },
      '--dsw-alias-bg-layer-2': { light: '#DCEEF7', dark: '#1D3444' },
      '--dsw-alias-brand-primary': { light: '#2E7FA3', dark: '#4FB3D9' },
      '--dsw-specific-sidebar-fill': { light: '#D9EDF6', dark: '#0C1A22' },
    },
    layer: 'mood-bg-calm',
  },
  tired: {
    label: '疲惫', emoji: '😪', color: '#9E93C2',
    tokens: {
      '--dsw-alias-bg-base': { light: '#F2EFF5', dark: '#201E28' },
      '--dsw-alias-bg-layer-1': { light: '#F9F7FB', dark: '#282634' },
      '--dsw-alias-bg-layer-2': { light: '#E8E2F0', dark: '#332F42' },
      '--dsw-alias-brand-primary': { light: '#7A6FA0', dark: '#9E93C2' },
      '--dsw-specific-sidebar-fill': { light: '#E5DFEE', dark: '#191722' },
    },
    layer: 'mood-bg-tired',
  },
  anxious: {
    label: '焦虑', emoji: '😰', color: '#FF9E4D',
    tokens: {
      '--dsw-alias-bg-base': { light: '#FFF1E2', dark: '#2B1B0E' },
      '--dsw-alias-bg-layer-1': { light: '#FFF9F1', dark: '#362314' },
      '--dsw-alias-bg-layer-2': { light: '#FCE6CF', dark: '#422A18' },
      '--dsw-alias-brand-primary': { light: '#E87A1F', dark: '#FF9E4D' },
      '--dsw-specific-sidebar-fill': { light: '#FAE3C8', dark: '#221509' },
    },
    layer: 'mood-bg-anxious',
  },
  angry: {
    label: '生气', emoji: '😠', color: '#FF6B6B',
    tokens: {
      '--dsw-alias-bg-base': { light: '#FDECEC', dark: '#2A1214' },
      '--dsw-alias-bg-layer-1': { light: '#FEF6F6', dark: '#36191C' },
      '--dsw-alias-bg-layer-2': { light: '#FADEDE', dark: '#422023' },
      '--dsw-alias-brand-primary': { light: '#D64040', dark: '#FF6B6B' },
      '--dsw-specific-sidebar-fill': { light: '#F9DADA', dark: '#220D0F' },
    },
    layer: 'mood-bg-angry',
  },
}

const CSS = `
  .mood-widget { position: fixed; right: 20px; bottom: 100px; z-index: 10; display: flex; flex-direction: column; align-items: flex-end; gap: 12px; pointer-events: auto; font-family: system-ui, -apple-system, sans-serif; }

  .mood-tint-layer { position: fixed; inset: 0; z-index: 0; pointer-events: none; opacity: 0; mix-blend-mode: soft-light; will-change: transform, opacity, filter; }
  .mood-tint-in { opacity: 1; animation: moodLayerIn .9s cubic-bezier(.22,.68,.32,1) forwards; }
  .mood-tint-out { opacity: 0; animation: moodLayerOut .7s ease forwards; }
  @keyframes moodLayerIn { from { opacity: 0; transform: scale(1.08); } to { opacity: 1; transform: scale(1); } }
  @keyframes moodLayerOut { from { opacity: 1; } to { opacity: 0; } }

  .mood-bg-happy {
    background:
      radial-gradient(38% 52% at 18% 22%, rgba(255, 202, 96, .34), transparent 70%),
      radial-gradient(42% 55% at 82% 18%, rgba(255, 240, 176, .28), transparent 70%),
      radial-gradient(48% 62% at 55% 86%, rgba(230, 140, 30, .22), transparent 70%),
      radial-gradient(35% 45% at 40% 55%, rgba(255, 226, 150, .2), transparent 70%);
    background-size: 170% 170%;
    animation: moodDriftHappy 16s ease-in-out infinite alternate;
  }
  @keyframes moodDriftHappy {
    0%   { transform: translate3d(-2.5%, -2%, 0) scale(1.05) rotate(-1.2deg); filter: hue-rotate(-6deg) brightness(1); }
    50%  { transform: translate3d(2%, 1.2%, 0) scale(1.14) rotate(1deg); filter: hue-rotate(5deg) brightness(1.05); }
    100% { transform: translate3d(-1%, 2.6%, 0) scale(1.09) rotate(-.6deg); filter: hue-rotate(10deg) brightness(1.03); }
  }

  .mood-bg-calm {
    background:
      repeating-linear-gradient(112deg, rgba(79, 179, 217, .12) 0 22px, rgba(79, 179, 217, 0) 22px 58px),
      radial-gradient(58% 66% at 72% 26%, rgba(46, 127, 163, .26), transparent 72%),
      radial-gradient(48% 58% at 18% 82%, rgba(79, 179, 217, .2), transparent 72%),
      radial-gradient(40% 45% at 60% 60%, rgba(140, 210, 235, .16), transparent 72%);
    background-size: 240% 240%, 100% 100%, 100% 100%, 100% 100%;
    animation: moodWaveCalm 11s linear infinite;
  }
  @keyframes moodWaveCalm {
    from { background-position: 0 0, 0 0, 0 0, 0 0; }
    to   { background-position: -340px 150px, 0 0, 0 0, 0 0; }
  }

  .mood-bg-tired {
    background:
      radial-gradient(52% 58% at 28% 28%, rgba(154, 140, 190, .26), transparent 70%),
      radial-gradient(48% 54% at 76% 68%, rgba(120, 110, 160, .2), transparent 70%),
      radial-gradient(42% 48% at 50% 45%, rgba(180, 168, 215, .16), transparent 70%);
    animation: moodHazeTired 24s ease-in-out infinite alternate;
  }
  @keyframes moodHazeTired {
    0%   { opacity: .4; transform: scale(1) translateY(0); }
    50%  { opacity: .65; transform: scale(1.1) translateY(-1.5%); }
    100% { opacity: .5; transform: scale(1.05) translateY(1.2%); }
  }

  .mood-bg-anxious {
    background:
      radial-gradient(44% 50% at 50% 44%, rgba(255, 158, 77, .3), transparent 70%),
      radial-gradient(38% 44% at 24% 76%, rgba(232, 122, 31, .24), transparent 70%),
      radial-gradient(38% 44% at 80% 24%, rgba(255, 182, 122, .2), transparent 70%);
    animation: moodFlickAnxious 2.8s ease-in-out infinite;
  }
  @keyframes moodFlickAnxious {
    0%, 100% { opacity: .5; transform: scale(1.03); filter: brightness(1); }
    50%      { opacity: .7; transform: scale(1.12); filter: brightness(1.08); }
  }

  .mood-bg-angry {
    background:
      radial-gradient(50% 56% at 50% 50%, rgba(255, 90, 90, .32), transparent 72%),
      radial-gradient(34% 40% at 30% 30%, rgba(214, 64, 64, .24), transparent 72%),
      radial-gradient(34% 40% at 72% 68%, rgba(255, 130, 130, .2), transparent 72%);
    animation: moodPulseAngry 1.7s ease-in-out infinite;
  }
  @keyframes moodPulseAngry {
    0%, 100% { opacity: .5; transform: scale(1.02); }
    50%      { opacity: .72; transform: scale(1.13); }
  }

  .mood-orb {
    position: relative; z-index: 2; width: 54px; height: 54px; border-radius: 50%; cursor: pointer; padding: 0;
    border: none; overflow: hidden;
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 42%, transparent);
    backdrop-filter: blur(3px);
    -webkit-backdrop-filter: blur(3px);
    transition: transform .2s ease;
  }
  .mood-orb:hover { transform: scale(1.06); }
  .mood-orb-core {
    position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent);
    box-shadow: 0 0 10px color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
  }
  .mood-orb-ripple {
    position: absolute; left: 50%; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px;
    border-radius: 50%; border: 1.5px solid var(--dsw-alias-brand-primary);
    opacity: 0; pointer-events: none;
    animation: moodRipple 2.8s ease-out infinite;
  }
  .mood-orb-ripple:nth-child(3) { animation-delay: .93s; }
  .mood-orb-ripple:nth-child(4) { animation-delay: 1.86s; }
  @keyframes moodRipple {
    0%   { transform: scale(.25); opacity: .75; }
    100% { transform: scale(6.4); opacity: 0; }
  }

  .mood-panel {
    position: relative; z-index: 2;
    background: var(--dsw-alias-bg-layer-2);
    background: color-mix(in srgb, var(--dsw-alias-bg-layer-2) 80%, transparent);
    backdrop-filter: blur(14px) saturate(1.25);
    -webkit-backdrop-filter: blur(14px) saturate(1.25);
    border: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 72%, transparent);
    border-radius: 16px; padding: 10px; min-width: 184px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, .25);
    display: flex; flex-direction: column; gap: 2px;
    animation: moodPanelIn .35s cubic-bezier(.34, 1.56, .64, 1);
  }
  @keyframes moodPanelIn {
    from { opacity: 0; transform: translateY(10px) scale(.95); }
    to   { opacity: 1; transform: none; }
  }
  .mood-panel-title { font-size: 12px; color: var(--dsw-alias-label-secondary); padding: 4px 10px 6px; }
  .mood-row {
    display: flex; align-items: center; gap: 8px; padding: 7px 10px; border: none; border-radius: 10px;
    background: transparent; cursor: pointer; color: var(--dsw-alias-label-primary); font-size: 14px; text-align: left;
    transition: background-color .15s ease, transform .15s ease;
  }
  .mood-row:hover { background: var(--dsw-alias-bg-layer-1); transform: translateX(2px); }
  .mood-row-active { background: var(--dsw-alias-bg-layer-1); box-shadow: inset 2px 0 0 var(--dsw-alias-brand-primary); }
  .mood-dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
  .mood-panel-note {
    font-size: 11px; color: var(--dsw-alias-label-secondary); padding: 6px 10px 2px;
    border-top: 1px solid color-mix(in srgb, var(--dsw-alias-border-l1) 60%, transparent);
    margin-top: 4px; line-height: 1.5;
  }
`

/**
 * 水波悬浮球组件。
 */
export function EmotionWidget(props: EmotionWidgetProps) {
  const { useSessions, theme, emotion } = props
  const sessionId = useSessions((s) => s.current)
  const [mood, setMood] = useState<EmotionKey | null>(null)
  const [prevMood, setPrevMood] = useState<EmotionKey | null>(null)
  const [open, setOpen] = useState(false)
  const [auto, setAuto] = useState(true)
  /** true = 全局 UI 变色；false = 仅水波球变色。 */
  const [globalTheme, setGlobalTheme] = useState(true)
  const moodRef = useRef<EmotionKey | null>(null)
  moodRef.current = mood

  // 注入包样式。
  useEffect(() => {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.appendChild(style)
    return () => style.remove()
  }, [])

  // 情绪 → 全局主题 token 覆盖（仅"全局变色"模式）。
  useEffect(() => {
    if (mood === null || !globalTheme) return
    return theme.overrideTokens('mood-emotion', MOODS[mood].tokens)
  }, [mood, theme, globalTheme])

  // 情绪变化 → 同步给 Host（系统提示词注入）。
  useEffect(() => {
    emotion.set({ mood }).catch(() => {})
  }, [mood, emotion])

  // 轮询 Host 当前情绪（Host 在新消息时自动分析并更新，这里只读状态，不重复分析）。
  const runPoll = () => {
    if (!sessionId) return
    emotion.get()
      .then((res) => {
        // RemoteResult 形状：{ ok, value: { mood } }，先解包。
        if (!res || !res.ok) return
        const current = res.value.mood
        if (current !== moodRef.current) {
          setPrevMood(moodRef.current)
          setMood(current)
        }
      })
      .catch(() => {})
  }

  // 自动感知：每 3s 轮询一次状态（无副作用，仅读取）。
  useEffect(() => {
    if (!auto || !sessionId) return
    runPoll()
    const id = window.setInterval(runPoll, 3000)
    return () => window.clearInterval(id)
  }, [auto, sessionId, emotion])

  const choose = (key: EmotionKey) => {
    if (key === mood) return
    setAuto(false)
    setPrevMood(mood)
    setMood(key)
  }
  const clear = () => {
    setAuto(false)
    setPrevMood(mood)
    setMood(null)
  }
  const current = mood === null ? null : MOODS[mood]

  const renderLayer = (key: EmotionKey | null, exiting: boolean) => {
    if (key === null) return null
    const m = MOODS[key]
    return (
      <div
        key={exiting ? 'prev' : 'cur'}
        className={'mood-tint-layer ' + m.layer + (exiting ? ' mood-tint-out' : ' mood-tint-in')}
        onAnimationEnd={exiting ? () => setPrevMood(null) : undefined}
      />
    )
  }

  const rippleStyle = current === null ? undefined : { borderColor: current.color }
  const coreStyle = current === null ? undefined : {
    background: current.color + '8C',
    boxShadow: '0 0 10px ' + current.color + '73',
  }

  return (
    <div className="mood-widget">
      {globalTheme ? renderLayer(prevMood, true) : null}
      {globalTheme ? renderLayer(mood, false) : null}
      {open ? (
        <div className="mood-panel">
          <div className="mood-panel-title">
            {current === null ? '当前情绪：无' : `当前情绪：${current.label}（${auto ? '自动' : '手动'}）`}
          </div>
          <button className={'mood-row' + (auto ? ' mood-row-active' : '')} onClick={() => setAuto(!auto)}>
            <span>🤖 自动感知 {auto ? '开' : '关'}</span>
          </button>
          <button className={'mood-row' + (globalTheme ? '' : ' mood-row-active')} onClick={() => setGlobalTheme(!globalTheme)}>
            <span>🌐 变色范围：{globalTheme ? '全局 UI' : '仅水波球'}</span>
          </button>
          {(Object.keys(MOODS) as EmotionKey[]).map((key) => {
            const m = MOODS[key]
            return (
              <button
                key={key}
                className={'mood-row' + (mood === key ? ' mood-row-active' : '')}
                onClick={() => choose(key)}
              >
                <span className="mood-dot" style={{ background: m.color }} />
                <span>{m.emoji} {m.label}</span>
              </button>
            )
          })}
          <button className="mood-row" onClick={clear}>✨ 清除情绪</button>
          <div className="mood-panel-note">📝 当前情绪会注入系统提示词，AI 每次回复都能感知</div>
        </div>
      ) : null}
      <button className="mood-orb" onClick={() => setOpen(!open)} title="情绪引擎">
        <span className="mood-orb-core" style={coreStyle} />
        <span className="mood-orb-ripple" style={rippleStyle} />
        <span className="mood-orb-ripple" style={rippleStyle} />
        <span className="mood-orb-ripple" style={rippleStyle} />
      </button>
    </div>
  )
}
