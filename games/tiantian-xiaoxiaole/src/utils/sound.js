// ============ WebAudio 音效（零素材，合成音） ============
let ctx = null
let muted = localStorage.getItem('ttxsl-muted') === '1'

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume()
  return ctx
}

function beep({ freq = 440, to = null, dur = 0.12, type = 'sine', gain = 0.14, delay = 0 }) {
  const c = ac()
  if (!c || muted) return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

export function playSound(name) {
  try {
    switch (name) {
      case 'tap':
        beep({ freq: 620, to: 720, dur: 0.06, type: 'triangle', gain: 0.08 })
        break
      case 'swap':
        beep({ freq: 480, to: 560, dur: 0.08, type: 'sine', gain: 0.1 })
        break
      case 'fail':
        beep({ freq: 220, to: 160, dur: 0.16, type: 'sawtooth', gain: 0.06 })
        break
      case 'pop':
        beep({ freq: 700, to: 990, dur: 0.1, type: 'triangle', gain: 0.12 })
        break
      case 'combo':
        beep({ freq: 700, to: 990, dur: 0.1, type: 'triangle', gain: 0.12 })
        beep({ freq: 880, to: 1240, dur: 0.12, delay: 0.08, type: 'triangle', gain: 0.12 })
        break
      case 'bomb':
        // 低频爆炸：双重下滑 + 气浪
        beep({ freq: 170, to: 42, dur: 0.34, type: 'sawtooth', gain: 0.2 })
        beep({ freq: 90, to: 30, dur: 0.42, type: 'sine', gain: 0.22, delay: 0.02 })
        break
      case 'rainbow':
        // 彩虹猫：上行琶音一气呵成
        ;[660, 830, 990, 1320].forEach((f, i) =>
          beep({ freq: f, to: f * 1.12, dur: 0.11, delay: i * 0.055, type: 'triangle', gain: 0.12 })
        )
        break
      case 'super':
        // 超级彩虹猫：双八度琶音 + 收束高音
        ;[523, 659, 784, 1046, 1318, 1568].forEach((f, i) =>
          beep({ freq: f, dur: 0.13, delay: i * 0.06, type: 'triangle', gain: 0.13 })
        )
        beep({ freq: 1568, to: 2093, dur: 0.22, delay: 0.38, type: 'sine', gain: 0.12 })
        break
      case 'born':
        // 特殊块诞生：星光上滑
        beep({ freq: 1180, to: 1860, dur: 0.14, type: 'sine', gain: 0.09 })
        beep({ freq: 1560, to: 2340, dur: 0.1, delay: 0.07, type: 'sine', gain: 0.06 })
        break
      case 'clear':
        ;[523, 659, 784, 1046].forEach((f, i) =>
          beep({ freq: f, dur: 0.16, delay: i * 0.09, type: 'triangle', gain: 0.12 })
        )
        break
      case 'over':
        ;[400, 300, 200].forEach((f, i) =>
          beep({ freq: f, dur: 0.18, delay: i * 0.12, type: 'sine', gain: 0.1 })
        )
        break
      case 'save':
        ;[660, 880].forEach((f, i) => beep({ freq: f, dur: 0.1, delay: i * 0.08, type: 'sine', gain: 0.1 }))
        break
      default:
        break
    }
  } catch {
    /* 音频失败不影响游戏 */
  }
}

export function isMuted() {
  return muted
}

export function toggleMute() {
  muted = !muted
  localStorage.setItem('ttxsl-muted', muted ? '1' : '0')
  return muted
}
