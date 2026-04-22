import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from 'react'
import { X } from 'lucide-react'
import {
  SA_MODAL_PANEL_CONFIRM,
  saModalBackdropClass,
} from '../lib/saModalLayout'

const NotifyContext = createContext(null)

/** @typedef {'success' | 'error' | 'info'} ToastVariant */

/**
 * @typedef {{
 *   title?: string
 *   message: string
 *   confirmLabel?: string
 *   cancelLabel?: string
 *   danger?: boolean
 * }} ConfirmOptions
 */

export function NotifyProvider({ children }) {
  const baseId = useId()
  const [toasts, setToasts] = useState([])
  const toastIdRef = useRef(0)
  const [confirmUi, setConfirmUi] = useState(null)
  const confirmResolveRef = useRef(null)

  const TOAST_MS = 2800
  const TOAST_EXIT_MS = 260

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }, [])

  const toast = useCallback(
    (message, variant = 'info') => {
      const id = ++toastIdRef.current
      setToasts((prev) => [
        ...prev,
        { id, message: String(message), variant, exiting: false },
      ])
      window.setTimeout(() => {
        setToasts((prev) =>
          prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
        )
        window.setTimeout(() => removeToast(id), TOAST_EXIT_MS)
      }, TOAST_MS)
    },
    [removeToast],
  )

  const confirm = useCallback((/** @type {ConfirmOptions} */ opts) => {
    return new Promise((resolve) => {
      confirmResolveRef.current = resolve
      setConfirmUi({
        title: opts.title || 'Confirmar',
        message: opts.message || '',
        confirmLabel: opts.confirmLabel || 'Aceptar',
        cancelLabel: opts.cancelLabel || 'Cancelar',
        danger: !!opts.danger,
      })
    })
  }, [])

  const finishConfirm = useCallback((ok) => {
    const fn = confirmResolveRef.current
    confirmResolveRef.current = null
    setConfirmUi(null)
    if (typeof fn === 'function') fn(ok)
  }, [])

  const dismissToast = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    )
    window.setTimeout(() => removeToast(id), TOAST_EXIT_MS)
  }, [removeToast])

  return (
    <NotifyContext.Provider value={{ toast, confirm }}>
      {children}

      <div
        className="pointer-events-none fixed inset-x-0 z-[10090] flex flex-col items-center gap-2 px-3"
        style={{ bottom: 'var(--sa-toast-offset)' }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-[min(440px,calc(100vw-24px))] items-start gap-3 rounded-[1rem] border px-4 py-3.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.55)] ring-1 ring-inset ring-white/[0.06] backdrop-blur-xl ${
              t.exiting ? 'sa-motion-toast-exit' : 'sa-motion-toast'
            }`}
            role="status"
            style={{
              borderColor:
                t.variant === 'success'
                  ? 'rgba(45, 212, 191, 0.35)'
                  : t.variant === 'error'
                    ? 'rgba(251, 113, 133, 0.42)'
                    : 'rgba(148, 163, 184, 0.22)',
              background:
                t.variant === 'success'
                  ? 'rgba(4, 47, 46, 0.94)'
                  : t.variant === 'error'
                    ? 'rgba(69, 10, 10, 0.94)'
                    : 'rgba(15, 23, 42, 0.94)',
            }}
          >
            <p className="m-0 flex-1 text-[13px] font-medium leading-snug text-white">
              {t.message}
            </p>
            <button
              type="button"
              onClick={() => dismissToast(t.id)}
              className="shrink-0 rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Cerrar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {confirmUi ? (
        <div
          className={saModalBackdropClass('confirm')}
          role="presentation"
          onClick={() => finishConfirm(false)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') finishConfirm(false)
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${baseId}-confirm-title`}
            aria-describedby={`${baseId}-confirm-desc`}
            className={SA_MODAL_PANEL_CONFIRM}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id={`${baseId}-confirm-title`}
              className="m-0 text-lg font-extrabold tracking-tight text-white"
            >
              {confirmUi.title}
            </h2>
            <p
              id={`${baseId}-confirm-desc`}
              className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-300"
            >
              {confirmUi.message}
            </p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={() => finishConfirm(false)}
                className="sa-btn-ghost flex-1 py-2.5 text-sm"
              >
                {confirmUi.cancelLabel}
              </button>
              <button
                type="button"
                onClick={() => finishConfirm(true)}
                className={
                  confirmUi.danger
                    ? 'flex-1 rounded-xl bg-gradient-to-r from-rose-500 to-red-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-rose-950/40'
                    : 'sa-btn-primary flex-1 py-2.5 text-sm text-slate-950'
                }
              >
                {confirmUi.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </NotifyContext.Provider>
  )
}

// Hook acoplado al mismo módulo que el provider (patrón típico de contexto).
// eslint-disable-next-line react-refresh/only-export-components
export function useNotify() {
  const ctx = useContext(NotifyContext)
  if (!ctx) {
    throw new Error('useNotify debe usarse dentro de NotifyProvider')
  }
  return ctx
}
