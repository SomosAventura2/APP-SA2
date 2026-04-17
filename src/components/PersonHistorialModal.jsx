import { X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotify } from '../context/NotifyContext.jsx'
import { calcularRutasPorPersona } from '../lib/aventurero'
import { formatRutaDate } from '../lib/formatDate'
import { buildPersonHistorialShareText } from '../lib/personHistorialText'
import { getRutasPasadasParaHistorial } from '../lib/rutasPasadasHistorial'
import { supabase } from '../lib/supabase'

/**
 * Solo montar cuando deba mostrarse; al desmontar se limpia el estado local.
 * @param {{
 *   nombre: string
 *   participantes: Array<Record<string, unknown>>
 *   rutas: Array<Record<string, unknown>>
 *   onClose: () => void
 *   onAfterChange?: () => void | Promise<void>
 * }} props
 */
export default function PersonHistorialModal({
  nombre,
  participantes,
  rutas,
  onClose,
  onAfterChange,
}) {
  const { toast } = useNotify()
  const nombreTrim = (nombre || '').trim()
  const historial = useMemo(
    () => calcularRutasPorPersona(nombreTrim, participantes, rutas),
    [nombreTrim, participantes, rutas],
  )
  const shareText = useMemo(
    () => buildPersonHistorialShareText(nombreTrim, historial),
    [nombreTrim, historial],
  )

  const rutasPasadas = useMemo(
    () => getRutasPasadasParaHistorial(rutas),
    [rutas],
  )

  const [addOpen, setAddOpen] = useState(false)
  const [rutaIdPick, setRutaIdPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const addSectionRef = useRef(null)

  const pct = Number(historial.porcentajeAsistencia) || 0
  const tituloColorClass =
    pct >= 70 ? 'text-emerald-400' : pct >= 30 ? 'text-amber-400' : 'text-rose-400'

  function compartirWhatsApp() {
    if (!shareText.trim()) {
      toast('No hay historial registrado para compartir.', 'info')
      return
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareText)}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  async function guardarRutaPasada() {
    setMsg('')
    if (!nombreTrim) {
      setMsg('Nombre no válido.')
      return
    }
    if (!rutaIdPick) {
      setMsg('Elige una ruta.')
      return
    }
    const ruta = rutas.find((r) => String(r.id) === String(rutaIdPick))
    if (!ruta) {
      setMsg('Ruta no encontrada.')
      return
    }
    const yaExiste = participantes.some(
      (p) =>
        String(p.nombre || '').trim().toLowerCase() === nombreTrim.toLowerCase() &&
        String(p.rutaId ?? p.ruta_id ?? '') === String(rutaIdPick),
    )
    if (yaExiste) {
      setMsg('Esta persona ya tiene esa ruta en su historial.')
      return
    }
    setBusy(true)
    try {
      const { error } = await supabase.from('participantes').insert({
        nombre: nombreTrim,
        lider: nombreTrim,
        ruta_id: rutaIdPick,
        ruta_nombre: ruta.nombre,
        asiste: true,
      })
      if (error) throw error
      setAddOpen(false)
      setRutaIdPick('')
      if (onAfterChange) await onAfterChange()
    } catch (e) {
      console.error(e)
      setMsg(e?.message || 'Error al guardar.')
    } finally {
      setBusy(false)
    }
  }

  const cuerpoVacio = historial.totalParticipaciones === 0

  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    if (!addOpen || !addSectionRef.current) return
    addSectionRef.current.scrollIntoView({
      block: 'nearest',
      behavior: 'smooth',
    })
  }, [addOpen])

  return createPortal(
    <div
      className="sa-motion-backdrop fixed inset-0 z-[10200] flex items-end justify-center bg-black/70 p-3 pt-12 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal
      aria-labelledby="person-historial-title"
      onClick={onClose}
    >
      <div
        className="sa-card sa-motion-modal flex max-h-[88vh] w-full max-w-[480px] flex-col overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-2 border-b border-white/10 px-4 py-3">
          <h2
            id="person-historial-title"
            className={`m-0 pr-2 text-sm font-extrabold leading-snug ${tituloColorClass}`}
          >
            ⭐ {nombreTrim || '—'}{' '}
            <span className="text-xs font-semibold text-slate-500">
              ({historial.totalRutas}{' '}
              {historial.totalRutas === 1 ? 'ruta asistida' : 'rutas asistidas'})
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {cuerpoVacio ? (
            <p className="m-0 text-sm text-slate-400">
              Esta persona no tiene historial de rutas registrado. Puedes
              añadir una ruta pasada abajo.
            </p>
          ) : (
            <div
              className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-200"
              style={{ fontFamily: 'inherit' }}
            >
              {shareText.trimEnd()}
            </div>
          )}

          {addOpen ? (
            <div
              ref={addSectionRef}
              className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3"
            >
              <p className="m-0 text-xs font-bold text-emerald-200/90">
                ➕ Añadir ruta asistida para: {nombreTrim}
              </p>
              {rutasPasadas.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">
                  No hay rutas pasadas o archivadas.
                </p>
              ) : (
                <>
                  <select
                    value={rutaIdPick}
                    onChange={(e) => setRutaIdPick(e.target.value)}
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
                  >
                    <option value="">— Elegir ruta —</option>
                    {rutasPasadas.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                        {r.fecha ? ` — ${formatRutaDate(r.fecha)}` : ''}
                      </option>
                    ))}
                  </select>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void guardarRutaPasada()}
                      className="flex-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-2 text-xs font-bold text-white disabled:opacity-60"
                    >
                      {busy ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setAddOpen(false)
                        setRutaIdPick('')
                        setMsg('')
                      }}
                      className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                    >
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {msg ? (
            <p className="mt-2 text-center text-xs text-amber-200/90">{msg}</p>
          ) : null}
        </div>

        <div className="shrink-0 space-y-2 border-t border-white/10 bg-slate-950/40 px-4 py-3">
          <button
            type="button"
            onClick={compartirWhatsApp}
            disabled={!shareText.trim()}
            className="w-full rounded-xl py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-45"
            style={{ background: '#25D366', border: '1px solid #25D366' }}
          >
            📱 Compartir por WhatsApp
          </button>
          <button
            type="button"
            onClick={() => {
              setMsg('')
              if (addOpen) {
                setAddOpen(false)
                setRutaIdPick('')
                return
              }
              setAddOpen(true)
              if (rutasPasadas.length === 0) {
                toast('No hay rutas pasadas o archivadas para elegir.', 'info')
              }
            }}
            className="w-full rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-sm font-semibold text-white hover:bg-white/10"
          >
            {addOpen ? 'Ocultar formulario de ruta' : '➕ Añadir ruta pasada'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 py-2.5 text-sm font-bold text-white"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
