import type { Tenant } from './supabase'

export const rupees = (n: number | string | null | undefined) =>
  '₹' + Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const normReg = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '')

export const fmtTime = (iso: string, lang: string) =>
  new Date(iso).toLocaleString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })

export const fmtDate = (d: string, lang: string) =>
  new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
  })

export function fmtDuration(fromIso: string, toIso: string, lang: string) {
  const mins = Math.max(0, Math.round((new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000))
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60
  const [dd, hh, mm] = lang === 'hi' ? ['दिन', 'घं', 'मि'] : ['d', 'h', 'm']
  return [d && `${d} ${dd}`, h && `${h} ${hh}`, `${m} ${mm}`].filter(Boolean).join(' ')
}

export const todayISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000)

// Suggest Day or Night from the current time and the site's slot times.
export function suggestPlan(t: Tenant | null): 'day' | 'night' {
  if (!t) return 'day'
  const now = new Date().toTimeString().slice(0, 5)
  const ds = t.day_start.slice(0, 5), ns = t.night_start.slice(0, 5)
  return ds < ns ? (now >= ds && now < ns ? 'day' : 'night') : (now >= ns && now < ds ? 'night' : 'day')
}

export const upiLink = (upiId: string, name: string, amount: number) =>
  `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(name)}&am=${amount.toFixed(2)}&cu=INR&tn=Parking`

export const waLink = (phone: string | null | undefined, text: string) => {
  const p = (phone ?? '').replace(/\D/g, '').slice(-10)
  return `https://wa.me/${p ? '91' + p : ''}?text=${encodeURIComponent(text)}`
}
