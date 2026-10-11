import QRCode from 'qrcode'
import { rupees } from './format'

// QR payload on tokens; the exit screen's scanner looks for this prefix.
export const TOKEN_PREFIX = 'PARK:'
export const parseToken = (text: string) =>
  text.startsWith(TOKEN_PREFIX) ? text.slice(TOKEN_PREFIX.length).replace(/[^A-Z0-9]/g, '') : null

export interface TokenInfo {
  site: string
  reg: string
  title: string      // e.g. "Vehicle In · Night"
  time: string
  amountLine: string // e.g. "₹50 paid" or "Pay at exit"
  footer: string
}

// Draws a parking token (plate, details, QR) as a PNG the driver can keep on WhatsApp.
export async function tokenImage(info: TokenInfo): Promise<Blob> {
  const W = 600, H = 920
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const g = c.getContext('2d')!
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#1d4ed8'
  g.fillRect(0, 0, W, 110)
  g.fillStyle = '#ffffff'
  g.textAlign = 'center'
  g.font = 'bold 40px system-ui, sans-serif'
  g.fillText(info.site.slice(0, 26), W / 2, 70)

  // Number plate
  g.fillStyle = '#fefce8'
  g.strokeStyle = '#1e293b'
  g.lineWidth = 8
  g.beginPath()
  g.roundRect(60, 150, W - 120, 110, 16)
  g.fill()
  g.stroke()
  g.fillStyle = '#0f172a'
  g.font = 'bold 64px ui-monospace, monospace'
  g.fillText(info.reg, W / 2, 228)

  g.font = 'bold 34px system-ui, sans-serif'
  g.fillText(info.title, W / 2, 320)
  g.font = '28px system-ui, sans-serif'
  g.fillStyle = '#334155'
  g.fillText(info.time, W / 2, 365)
  g.font = 'bold 36px system-ui, sans-serif'
  g.fillStyle = '#15803d'
  g.fillText(info.amountLine, W / 2, 420)

  const qr = new Image()
  qr.src = await QRCode.toDataURL(TOKEN_PREFIX + info.reg, { width: 360, margin: 1 })
  await qr.decode()
  g.drawImage(qr, (W - 360) / 2, 450, 360, 360)

  g.font = '26px system-ui, sans-serif'
  g.fillStyle = '#475569'
  g.fillText(info.footer, W / 2, 860)

  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'))
}

// Share the token image (WhatsApp etc.) where supported, otherwise download it.
export async function shareToken(info: TokenInfo, text: string) {
  const blob = await tokenImage(info)
  const file = new File([blob], `token-${info.reg}.png`, { type: 'image/png' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text })
      return
    } catch { /* cancelled */ return }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 5000)
}

export const amountLine = (paid: number, fallback: string) => (paid > 0 ? `${rupees(paid)} ✓` : fallback)
