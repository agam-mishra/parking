import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { useT } from '../lib/i18n'
import { parseToken } from '../lib/token'

// Full-screen camera that reads a parking-token QR and returns the vehicle number.
export function QrScanner({ onFound, onClose }: { onFound: (reg: string) => void; onClose: () => void }) {
  const { t } = useT()
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState(false)
  // Keep the latest callback without restarting the camera on every render.
  const found = useRef(onFound)
  found.current = onFound

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const canvas = document.createElement('canvas')
    const g = canvas.getContext('2d', { willReadFrequently: true })!

    const tick = () => {
      if (stopped) return
      const v = video.current
      if (v && v.readyState === v.HAVE_ENOUGH_DATA) {
        canvas.width = v.videoWidth
        canvas.height = v.videoHeight
        g.drawImage(v, 0, 0)
        const code = jsQR(g.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height)
        const reg = code && parseToken(code.data)
        if (reg) {
          navigator.vibrate?.(80)
          found.current(reg)
          return
        }
      }
      raf = requestAnimationFrame(tick)
    }

    navigator.mediaDevices?.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        stream = s
        if (stopped) return s.getTracks().forEach((tr) => tr.stop())
        video.current!.srcObject = s
        video.current!.play()
        raf = requestAnimationFrame(tick)
      })
      .catch(() => setError(true))
    if (!navigator.mediaDevices) setError(true)

    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((tr) => tr.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black">
      <div className="relative flex-1">
        <video ref={video} playsInline muted className="h-full w-full object-cover" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-64 w-64 rounded-3xl border-4 border-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        <div className="absolute inset-x-0 top-6 px-4 text-center text-xl font-bold text-white">
          {error ? t('cameraError') : t('scanToken')}
        </div>
      </div>
      <button onClick={onClose} className="bg-white py-5 text-xl font-bold text-slate-900">✕ {t('cancel')}</button>
    </div>
  )
}
