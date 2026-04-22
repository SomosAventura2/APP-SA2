import { Plus, Smartphone, Star, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNotify } from '../context/NotifyContext.jsx'
import { calcularRutasPorPersona } from '../lib/aventurero'
import { formatRutaDate } from '../lib/formatDate'
import {
  buildPersonHistorialShareText,
  buildRankingHistorialShareText,
} from '../lib/personHistorialText'
import { getRutasPasadasParaHistorial } from '../lib/rutasPasadasHistorial'
import {
  SA_MODAL_BTN_CLOSE,
  SA_MODAL_PANEL_COLUMN,
  saModalBackdropClass,
} from '../lib/saModalLayout'
import { supabase } from '../lib/supabase'

/** Misma convención que RankingPage: `public/badges/{slug}.png`. */
const BADGE_PNG = {
  Novato: 'novato',
  Bronce: 'bronce',
  Plata: 'plata',
  Oro: 'oro',
  Platino: 'platino',
  Diamante: 'diamante',
}

/**
 * Cuerpo tipo verDetalleAventurero (index.html): badge, rejilla, tasa, próximo rango, chips.
 * @param {{ historial: Record<string, unknown>, nombreTrim: string }} props
 */
function PerfilRankingHistorialCuerpo({ historial, nombreTrim }) {
  const r = historial.rango
  const siguiente = historial.siguienteRango
  const [badgeFallo, setBadgeFallo] = useState(false)
  const slug = r?.nombre ? BADGE_PNG[r.nombre] : null
  const srcPng = slug ? `/badges/${slug}.png` : null
  const mostrarImg = Boolean(srcPng && !badgeFallo)

  const pct = Number(historial.porcentajeAsistencia) || 0
  const totalPara = Number(historial.totalParaSiguiente) || 0
  const prog = Number(historial.progresoHaciaSiguiente) || 0
  const progPct =
    siguiente && totalPara > 0 ? Math.min(100, (prog / totalPara) * 100) : 0
  const faltanAsistencias = siguiente
    ? siguiente.minRutas - historial.totalAsistidas
    : 0

  const lista = historial.rutasAsistidas || []
  const chips = lista.slice(0, 8)
  const mas = lista.length > 8 ? lista.length - 8 : 0

  return (
    <div className="text-[13px] leading-relaxed text-slate-200">
      <div className="mb-5 text-center">
        <div className="mb-2 flex justify-center items-center">
          {mostrarImg ? (
            <img
              src={srcPng}
              alt=""
              className="h-16 w-auto max-w-[80px] object-contain"
              onError={() => setBadgeFallo(true)}
            />
          ) : (
            <span className="text-5xl leading-none" aria-hidden>
              {r?.emoji}
            </span>
          )}
        </div>
        <div
          className="text-xl font-extrabold"
          style={{ color: r?.color || '#e2e8f0' }}
        >
          {r?.nombre}
        </div>
        <div className="text-sm text-slate-400">{nombreTrim || '—'}</div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center">
          <div
            className="text-2xl font-extrabold tabular-nums"
            style={{ color: r?.color || '#34d399' }}
          >
            {historial.totalRutas}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Rutas asistidas
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center">
          <div className="text-2xl font-extrabold tabular-nums text-slate-100">
            {historial.totalParticipaciones}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Participaciones
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center">
          <div className="text-2xl font-extrabold tabular-nums text-emerald-400">
            {historial.totalAsistidas}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            ✅ Asistencias
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-3 text-center">
          <div className="text-2xl font-extrabold tabular-nums text-rose-400">
            {historial.totalNoAsistidas}
          </div>
          <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            ❌ Ausencias
          </div>
        </div>
      </div>

      <div className="mb-5">
        <div className="mb-2 text-sm font-bold text-slate-100">📊 Tasa de asistencia</div>
        <div className="h-3 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-slate-400">
          <span>{pct}%</span>
          <span>
            {historial.totalAsistidas}/{historial.totalParticipaciones}
          </span>
        </div>
      </div>

      {siguiente && totalPara > 0 ? (
        <div
          className="mb-5 rounded-xl p-4"
          style={{ background: 'rgba(118, 200, 147, 0.1)' }}
        >
          <div
            className="mb-2 text-sm font-bold"
            style={{ color: siguiente.color }}
          >
            {siguiente.emoji} Próximo rango: {siguiente.nombre}
          </div>
          <div className="mb-2 text-xs text-slate-400">
            Necesitas {faltanAsistencias} asistencia
            {faltanAsistencias !== 1 ? 's' : ''} más
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full"
              style={{
                width: `${progPct}%`,
                background: siguiente.color,
              }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-slate-500">
            <span>
              {prog}/{totalPara}
            </span>
            <span>{progPct.toFixed(0)}%</span>
          </div>
        </div>
      ) : null}

      {chips.length > 0 ? (
        <div>
          <div className="mb-3 text-sm font-bold text-slate-100">
            🏔️ Rutas asistidas
          </div>
          <div className="flex flex-wrap gap-2">
            {chips.map((ruta, i) => {
              const veces = ruta.vecesAsistio || 1
              return (
                <span
                  key={`${String(ruta.nombre)}-${i}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-slate-100"
                >
                  {ruta.nombre}
                  {veces > 1 ? (
                    <span className="rounded-md bg-emerald-400/90 px-1.5 text-[10px] font-bold text-slate-950">
                      x{veces}
                    </span>
                  ) : null}
                </span>
              )
            })}
            {mas > 0 ? (
              <span className="inline-flex items-center rounded-lg border border-dashed border-white/15 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-400">
                +{mas} más
              </span>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Solo montar cuando deba mostrarse; al desmontar se limpia el estado local.
 * @param {{
 *   nombre: string
 *   participantes: Array<Record<string, unknown>>
 *   rutas: Array<Record<string, unknown>>
 *   onClose: () => void
 *   onAfterChange?: () => void | Promise<void>
 *   variant?: 'historial' | 'perfil'
 * }} props
 */
export default function PersonHistorialModal({
  nombre,
  participantes,
  rutas,
  onClose,
  onAfterChange,
  variant = 'historial',
}) {
  const { toast } = useNotify()
  const nombreTrim = (nombre || '').trim()
  const historial = useMemo(
    () => calcularRutasPorPersona(nombreTrim, participantes, rutas),
    [nombreTrim, participantes, rutas],
  )
  const shareTextHistorial = useMemo(
    () => buildPersonHistorialShareText(nombreTrim, historial),
    [nombreTrim, historial],
  )
  const shareTextRanking = useMemo(
    () => buildRankingHistorialShareText(nombreTrim, historial),
    [nombreTrim, historial],
  )
  const shareTextParaWhatsApp =
    variant === 'perfil' ? shareTextRanking : shareTextHistorial

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
  const rango = historial.rango

  function compartirWhatsApp() {
    if (!shareTextParaWhatsApp.trim()) {
      toast('No hay historial registrado para compartir.', 'info')
      return
    }
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareTextParaWhatsApp)}`,
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
      className={saModalBackdropClass('personHistorial')}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="person-historial-title"
        className={SA_MODAL_PANEL_COLUMN}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-6">
          <h2
            id="person-historial-title"
            className={
              variant === 'perfil' && rango
                ? 'm-0 flex min-w-0 flex-1 flex-wrap items-center gap-2 pr-2 text-lg font-extrabold leading-snug tracking-tight'
                : `m-0 flex min-w-0 flex-1 flex-wrap items-center gap-2 pr-2 text-lg font-extrabold leading-snug tracking-tight ${tituloColorClass}`
            }
            style={
              variant === 'perfil' && rango ? { color: rango.color } : undefined
            }
          >
            {variant === 'perfil' && rango ? (
              <>
                <span aria-hidden>{rango.emoji}</span>
                <span className="min-w-0 break-words">{nombreTrim || '—'}</span>
                <span className="text-slate-400">—</span>
                <span className="min-w-0 break-words">{rango.nombre}</span>
              </>
            ) : (
              <>
                <Star className="h-5 w-5 shrink-0 text-amber-400" strokeWidth={2} aria-hidden />
                <span>{nombreTrim || '—'}</span>
                <span className="text-xs font-semibold text-slate-500">
                  ({historial.totalRutas}{' '}
                  {historial.totalRutas === 1 ? 'ruta asistida' : 'rutas asistidas'})
                </span>
              </>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className={SA_MODAL_BTN_CLOSE}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {cuerpoVacio ? (
            <p className="m-0 text-sm text-slate-400">
              Esta persona no tiene historial de rutas registrado. Puedes
              añadir una ruta pasada abajo.
            </p>
          ) : variant === 'perfil' && rango ? (
            <PerfilRankingHistorialCuerpo
              historial={historial}
              nombreTrim={nombreTrim}
            />
          ) : (
            <div
              className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-200"
              style={{ fontFamily: 'inherit' }}
            >
              {shareTextHistorial.trimEnd()}
            </div>
          )}

          {addOpen ? (
            <div
              ref={addSectionRef}
              className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-3"
            >
              <p className="m-0 flex flex-wrap items-center gap-1.5 text-xs font-bold text-emerald-200/90">
                <Plus className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                <span>
                  Añadir ruta asistida para: {nombreTrim}
                </span>
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
                    className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2.5 text-base text-white outline-none focus:border-emerald-500/40"
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

        <div className="shrink-0 space-y-2 border-t border-white/10 bg-slate-950/40 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={compartirWhatsApp}
            disabled={!shareTextParaWhatsApp.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-45"
            style={{ background: '#25D366', border: '1px solid #25D366' }}
          >
            <Smartphone className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
            Compartir por WhatsApp
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
            {addOpen ? (
              'Ocultar formulario de ruta'
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <Plus className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                Añadir ruta pasada
              </span>
            )}
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
