import type { Lang } from './i18n'

// Spoken prompts, beeps and vibration so workers don't have to read the screen.

const KEY = 'sound'
export function soundOn() {
  try { return localStorage.getItem(KEY) !== 'off' } catch { return true }
}
export function setSoundOn(on: boolean) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off') } catch { /* private mode */ }
}

export function speak(text: string, lang: Lang) {
  if (!soundOn() || !('speechSynthesis' in window)) return
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang === 'hi' ? 'hi-IN' : 'en-IN'
  const voice = speechSynthesis.getVoices().find((v) => v.lang.replace('_', '-').startsWith(u.lang.slice(0, 2)))
  if (voice) u.voice = voice
  u.rate = 0.9
  speechSynthesis.cancel()
  speechSynthesis.speak(u)
}

export const sayAmount = (amount: number, lang: Lang) =>
  speak(lang === 'hi' ? `${amount} रुपये लीजिए` : `Take ${amount} rupees`, lang)

let ctx: AudioContext | null = null
function beep(freqs: number[], ms = 120) {
  if (!soundOn()) return
  try {
    ctx ??= new AudioContext()
    freqs.forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain()
      o.frequency.value = f
      o.connect(g).connect(ctx!.destination)
      const t = ctx!.currentTime + (i * ms) / 1000
      g.gain.setValueAtTime(0.25, t)
      g.gain.exponentialRampToValueAtTime(0.001, t + ms / 1000)
      o.start(t)
      o.stop(t + ms / 1000)
    })
  } catch { /* no audio */ }
}

export function success(message: string, lang: Lang) {
  navigator.vibrate?.([80, 60, 80])
  beep([660, 880])
  setTimeout(() => speak(message, lang), 300)
}

export function failure() {
  navigator.vibrate?.(300)
  beep([300], 250)
}
