import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { useT } from '../lib/i18n'

// In-app replacements for window.confirm / window.prompt: large Hindi/English bottom sheets.

interface ConfirmOpts { title: string; message?: string; yes?: string; danger?: boolean }
interface PromptOpts { title: string; label?: string; numeric?: boolean; maxLength?: number; pattern?: RegExp }

type Pending =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void }

const Ctx = createContext<{
  confirm: (o: ConfirmOpts) => Promise<boolean>
  prompt: (o: PromptOpts) => Promise<string | null>
}>(null!)

export const useDialog = () => useContext(Ctx)

export function DialogProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const confirm = useCallback((opts: ConfirmOpts) =>
    new Promise<boolean>((resolve) => setPending({ kind: 'confirm', opts, resolve })), [])
  const prompt = useCallback((opts: PromptOpts) =>
    new Promise<string | null>((resolve) => setPending({ kind: 'prompt', opts, resolve })), [])

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      {pending && <Sheet pending={pending} close={() => setPending(null)} />}
    </Ctx.Provider>
  )
}

function Sheet({ pending, close }: { pending: Pending; close: () => void }) {
  const { t } = useT()
  const [value, setValue] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const { opts } = pending

  const done = (ok: boolean) => {
    if (pending.kind === 'confirm') pending.resolve(ok)
    else pending.resolve(ok ? value.trim() : null)
    close()
  }

  const valid = pending.kind === 'confirm' ||
    (value.trim() !== '' && (!(pending.opts as PromptOpts).pattern || (pending.opts as PromptOpts).pattern!.test(value.trim())))
  const danger = pending.kind === 'confirm' && pending.opts.danger

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50" onClick={() => done(false)}>
      <div className="w-full max-w-lg space-y-4 rounded-t-3xl bg-white p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-300" />
        <h2 className="text-2xl font-extrabold">{opts.title}</h2>
        {pending.kind === 'confirm' && pending.opts.message && <p className="text-lg text-slate-700">{pending.opts.message}</p>}
        {pending.kind === 'prompt' && (
          <label className="block">
            {pending.opts.label && <span className="mb-1 block font-semibold text-slate-700">{pending.opts.label}</span>}
            <input
              ref={input}
              autoFocus
              value={value}
              maxLength={pending.opts.maxLength}
              inputMode={pending.opts.numeric ? 'numeric' : 'text'}
              onChange={(e) => setValue(pending.opts.numeric ? e.target.value.replace(/\D/g, '') : e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && valid && done(true)}
              className="w-full rounded-xl border-2 border-slate-400 px-4 py-4 text-2xl outline-none focus:border-blue-600"
            />
          </label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => done(false)} className="rounded-xl border-2 border-slate-400 bg-white py-4 text-xl font-bold text-slate-800">
            ✕ {pending.kind === 'confirm' ? t('no') : t('cancel')}
          </button>
          <button
            disabled={!valid}
            onClick={() => done(true)}
            className={`rounded-xl py-4 text-xl font-bold text-white disabled:opacity-40 ${danger ? 'bg-red-600' : 'bg-blue-600'}`}
          >
            ✓ {pending.kind === 'confirm' ? (pending.opts.yes ?? t('yes')) : t('save')}
          </button>
        </div>
      </div>
    </div>
  )
}
