import {
  Banknote,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  ClipboardList,
  Mountain,
  TrendingDown,
  User,
  Users,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useGestionRealtime } from '../../hooks/useGestionRealtime'
import { formatRutaDate } from '../../lib/formatDate'
import {
  SA_MODAL_BTN_CLOSE,
  SA_MODAL_PANEL_SCROLL,
  saModalBackdropClass,
} from '../../lib/saModalLayout'
import {
  calcularProfitNeto,
  calcularTotalDolares,
  calcularTotalGastos,
  calcularTotalRecaudado,
  cuposReservadosEnRuta,
  estadisticasHistorialArchivado,
  formatMesRango,
  formatSemanaRango,
  getInicioFinMesConOffset,
  getInicioFinSemanaConOffset,
  participantesPorReservaSorted,
  participantesPorRutaId,
  PRIMERA_SEMANA_INICIO,
  PRIMER_MES_INICIO,
} from '../../lib/historialFinanzas'
import { mapRuta } from '../../lib/rutas'
import { calcularTotalesPorMoneda, normalizeReservas } from '../../lib/reservaCalcs'
import { supabase } from '../../lib/supabase'
import { getCuposReserva, getReservaRutaId } from '../../lib/reservas'

function normalizeGasto(raw) {
  return {
    ...raw,
    rutaId: raw.ruta_id ?? raw.rutaId ?? null,
  }
}

async function fetchHistorialBundle() {
  const [rutasRes, reservasRes, participantesRes, gastosRes] = await Promise.all([
    supabase.from('rutas').select('*').order('fecha', { ascending: true }),
    supabase.from('reservas').select('*'),
    supabase.from('participantes').select('*'),
    supabase.from('gastos').select('*'),
  ])
  if (rutasRes.error) throw rutasRes.error
  if (reservasRes.error) throw reservasRes.error
  if (participantesRes.error) throw participantesRes.error
  if (gastosRes.error) throw gastosRes.error
  const rutas = (rutasRes.data || []).map(mapRuta)
  const reservas = normalizeReservas(reservasRes.data || [], rutas)
  return {
    rutas,
    reservas,
    participantes: participantesRes.data || [],
    gastos: (gastosRes.data || []).map(normalizeGasto),
  }
}

function fmtBs(n) {
  return (Number(n) || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export default function HistorialPage() {
  const [rutas, setRutas] = useState([])
  const [reservas, setReservas] = useState([])
  const [participantes, setParticipantes] = useState([])
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const [statsOpen, setStatsOpen] = useState(false)
  const [statsNav, setStatsNav] = useState({ semanaOffset: 0, mesOffset: 0 })

  const refreshSilent = useCallback(async () => {
    try {
      const b = await fetchHistorialBundle()
      setRutas(b.rutas)
      setReservas(b.reservas)
      setParticipantes(b.participantes)
      setGastos(b.gastos)
      setError('')
    } catch (e) {
      console.warn('[historial] realtime refresh', e)
    }
  }, [])

  useGestionRealtime(refreshSilent, 'historial')

  useEffect(() => {
    if (!statsOpen) return
    function onKey(e) {
      if (e.key === 'Escape') setStatsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [statsOpen])

  const loadAll = useCallback(async () => {
    const b = await fetchHistorialBundle()
    setRutas(b.rutas)
    setReservas(b.reservas)
    setParticipantes(b.participantes)
    setGastos(b.gastos)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadAll()
        if (cancelled) return
        setError('')
      } catch (e) {
        console.error(e)
        if (cancelled) return
        setError(e?.message || 'No se pudo cargar el historial')
        setRutas([])
        setReservas([])
        setParticipantes([])
        setGastos([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadAll])

  async function handleRetry() {
    setLoading(true)
    try {
      await loadAll()
      setError('')
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Error al recargar')
    } finally {
      setLoading(false)
    }
  }

  const rutasArchivadasFiltradas = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rutas
      .filter((r) => r.archivada)
      .filter((r) => {
        if (!q) return true
        const nombre = String(r.nombre || '').toLowerCase()
        const fecha = String(r.fecha || '')
        return nombre.includes(q) || fecha.includes(q)
      })
      .slice()
      .sort((a, b) => {
        const da = new Date(String(a.fecha || '').split('T')[0])
        const db = new Date(String(b.fecha || '').split('T')[0])
        return db.getTime() - da.getTime()
      })
  }, [rutas, search])

  const statsSemana = useMemo(() => {
    const { inicio, fin } = getInicioFinSemanaConOffset(statsNav.semanaOffset)
    return {
      inicio,
      fin,
      label: formatSemanaRango(inicio, fin),
      data: estadisticasHistorialArchivado(
        inicio,
        fin,
        rutas,
        reservas,
        gastos,
        participantes,
      ),
    }
  }, [statsNav.semanaOffset, rutas, reservas, gastos, participantes])

  const statsMes = useMemo(() => {
    const { inicio, fin } = getInicioFinMesConOffset(statsNav.mesOffset)
    return {
      inicio,
      fin,
      label: formatMesRango(inicio),
      data: estadisticasHistorialArchivado(
        inicio,
        fin,
        rutas,
        reservas,
        gastos,
        participantes,
      ),
    }
  }, [statsNav.mesOffset, rutas, reservas, gastos, participantes])

  function navegarStats(tipo, delta) {
    setStatsNav((state) => {
      const semOff = state.semanaOffset
      const mesOff = state.mesOffset
      if (delta > 0 && (tipo === 'semana' ? semOff >= 0 : mesOff >= 0)) {
        return state
      }
      if (delta < 0) {
        if (tipo === 'semana') {
          const { inicio } = getInicioFinSemanaConOffset(semOff + delta)
          if (inicio.getTime() < PRIMERA_SEMANA_INICIO.getTime()) return state
        } else {
          const { inicio } = getInicioFinMesConOffset(mesOff + delta)
          if (inicio.getTime() < PRIMER_MES_INICIO.getTime()) return state
        }
      }
      return {
        semanaOffset:
          tipo === 'semana' ? state.semanaOffset + delta : state.semanaOffset,
        mesOffset: tipo === 'mes' ? state.mesOffset + delta : state.mesOffset,
      }
    })
  }

  function abrirStats() {
    setStatsNav({ semanaOffset: 0, mesOffset: 0 })
    setStatsOpen(true)
  }

  const mostrarAdelanteSem = statsNav.semanaOffset < 0
  const mostrarAdelanteMes = statsNav.mesOffset < 0
  const mostrarAtrasSem =
    statsSemana.inicio.getTime() > PRIMERA_SEMANA_INICIO.getTime()
  const mostrarAtrasMes =
    statsMes.inicio.getTime() > PRIMER_MES_INICIO.getTime()

  return (
    <section className="sa-page">
      <div className="mb-4 flex flex-col gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en historial (nombre o fecha)…"
          className="sa-input-search"
        />
        <button
          type="button"
          onClick={abrirStats}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-sm font-semibold text-white hover:bg-white/10"
        >
          <BarChart3 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
          Estadísticas de historial
        </button>
      </div>

      {loading ? (
        <p className="text-center text-sm text-slate-400">Cargando…</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-950/35 p-4 text-sm text-red-100">
          {error}
          <button
            type="button"
            onClick={() => void handleRetry()}
            className="mt-3 block w-full rounded-xl border border-white/15 py-2.5 text-white hover:bg-white/10"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {!loading && !error && rutasArchivadasFiltradas.length === 0 ? (
        <div className="sa-card p-10 text-center">
          <div className="flex justify-center">
            <BookOpen className="h-14 w-14 text-slate-600" strokeWidth={1.25} aria-hidden />
          </div>
          <p className="mt-3 text-sm text-slate-400">
            {search.trim()
              ? 'Ninguna ruta archivada coincide con la búsqueda.'
              : 'No hay rutas archivadas. Archiva rutas desde la app para verlas aquí.'}
          </p>
        </div>
      ) : null}

      <ul className="flex list-none flex-col gap-3 p-0">
        {!loading &&
          !error &&
          rutasArchivadasFiltradas.map((ruta) => {
            const id = ruta.id
            const idCorto = ruta.numero
              ? `#${String(ruta.numero).padStart(4, '0')}`
              : ''
            const reservasRuta = reservas.filter((r) => getReservaRutaId(r) === id)
            const recaudado = calcularTotalRecaudado(id, reservas)
            const gastosRuta = calcularTotalGastos(id, gastos)
            const profitNeto = calcularProfitNeto(id, reservas, gastos)
            const totalDolares = calcularTotalDolares(id, reservas)
            const participantesRuta = participantesPorRutaId(participantes, id)
            const presentes = participantesRuta.filter((p) => p.asiste).length
            const cuposRes = cuposReservadosEnRuta(id, reservas)
            const pctAsist =
              cuposRes > 0
                ? ((presentes / cuposRes) * 100).toFixed(0)
                : '0'
            const open = expandedId === id

            return (
              <li
                key={id}
                className="sa-card overflow-hidden shadow-lg"
              >
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-start gap-1.5 font-extrabold text-white">
                        <Mountain className="mt-0.5 h-4 w-4 shrink-0 text-teal-400/90" strokeWidth={2} aria-hidden />
                        <span className="min-w-0">
                        {ruta.nombre}{' '}
                        {idCorto ? (
                          <span className="text-xs font-normal text-slate-500">
                            {idCorto}
                          </span>
                        ) : null}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
                        {formatRutaDate(ruta.fecha)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-600/80 bg-slate-800/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Archivada
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Banknote className="h-3.5 w-3.5 shrink-0 text-emerald-400/90" strokeWidth={2} aria-hidden />
                      Bs {fmtBs(recaudado)}
                      {totalDolares > 0
                        ? ` + $${fmtBs(totalDolares)}`
                        : ''}
                    </span>
                    <span className="inline-flex items-center gap-1 text-rose-400">
                      <TrendingDown className="h-3.5 w-3.5 shrink-0" strokeWidth={2} aria-hidden />
                      Bs {fmtBs(gastosRuta)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        profitNeto >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'
                      }`}
                    >
                      <BarChart3 className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
                      Bs {fmtBs(profitNeto)}
                    </span>
                  </div>
                </div>

                {open ? (
                  <div className="border-t border-white/10 bg-black/20 px-3 py-3">
                    <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3">
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <div className="text-slate-500">Recaudado (Bs)</div>
                          <div className="text-lg font-extrabold text-emerald-400">
                            Bs {fmtBs(recaudado)}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">USD efectivo</div>
                          <div className="text-lg font-extrabold text-amber-400">
                            ${fmtBs(totalDolares)}
                          </div>
                        </div>
                        <div>
                          <div className="text-slate-500">Gastos</div>
                          <div className="text-lg font-extrabold text-rose-400">
                            Bs {fmtBs(gastosRuta)}
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 border-t border-white/10 pt-2">
                        <div className="text-xs text-slate-500">Profit neto</div>
                        <div
                          className={`text-xl font-extrabold ${profitNeto >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                        >
                          Bs {fmtBs(profitNeto)}
                        </div>
                      </div>
                    </div>

                    {cuposRes > 0 ? (
                      <div className="mt-3">
                        <div className="mb-1 flex justify-between text-xs text-slate-400">
                          <span className="inline-flex items-center gap-1">
                            <ClipboardList className="h-3.5 w-3.5 shrink-0 opacity-90" strokeWidth={2} aria-hidden />
                            Asistencia: {presentes}/{cuposRes} presentes
                          </span>
                          <span className="font-semibold">{pctAsist}%</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full ${Number(pctAsist) >= 80 ? 'bg-emerald-500' : Number(pctAsist) >= 50 ? 'bg-amber-400' : 'bg-rose-500'}`}
                            style={{ width: `${Math.min(100, Number(pctAsist))}%` }}
                          />
                        </div>
                      </div>
                    ) : null}

                    <div className="mt-4">
                      <div className="mb-2 flex items-center gap-1.5 text-sm font-bold text-teal-300/90">
                        <Users className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                        Reservas y participantes
                      </div>
                      {reservasRuta.length === 0 ? (
                        <p className="rounded-lg border border-white/10 bg-white/[0.03] py-4 text-center text-xs text-slate-500">
                          No hay reservas para esta ruta
                        </p>
                      ) : (
                        <ul className="flex list-none flex-col gap-2 p-0">
                          {reservasRuta.map((reserva) => {
                            const rid = getReservaRutaId(reserva)
                            const lista = participantesPorReservaSorted(
                              participantes,
                              reserva.lider,
                              rid,
                            )
                            const pres = lista.filter((p) => p.asiste).length
                            const tot = calcularTotalesPorMoneda(reserva)
                            return (
                              <li
                                key={String(
                                  reserva.id ?? `${reserva.lider}-${rid}`,
                                )}
                                className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-3"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 font-bold text-white">
                                      <User className="h-4 w-4 shrink-0 text-teal-400/90" strokeWidth={2} aria-hidden />
                                      {reserva.lider}
                                    </div>
                                    <div className="mt-1 text-[11px] text-slate-500">
                                      Cupos: {getCuposReserva(reserva)} · Pagado:
                                      Bs {fmtBs(tot.totalBs)}
                                      {tot.totalDolares > 0
                                        ? ` + $${fmtBs(tot.totalDolares)}`
                                        : ''}
                                    </div>
                                  </div>
                                  <span className="shrink-0 rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                                    {pres}/{lista.length} presentes
                                  </span>
                                </div>
                                {lista.length > 0 ? (
                                  <div className="mt-2 flex flex-wrap gap-2 border-t border-white/10 pt-2">
                                    {lista.map((p) => (
                                      <span
                                        key={p.id}
                                        className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] ${p.asiste ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/10 bg-white/[0.04]'}`}
                                      >
                                        {p.asiste ? (
                                          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2} aria-hidden />
                                        ) : (
                                          <Circle className="h-3.5 w-3.5 shrink-0 text-slate-500" strokeWidth={2} aria-hidden />
                                        )}
                                        <span className="min-w-0 truncate">{p.nombre}</span>
                                      </span>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="mt-2 text-[11px] text-slate-500">
                                    Sin participantes registrados
                                  </p>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-white/[0.06] p-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedId((cur) => (cur === id ? null : id))
                    }
                    className="flex w-full items-center justify-center gap-2 rounded-xl py-2 text-xs font-semibold text-slate-300 hover:bg-white/5"
                  >
                    {open ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Menos detalle
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Ver detalles
                      </>
                    )}
                  </button>
                </div>
              </li>
            )
          })}
      </ul>

      {statsOpen
        ? createPortal(
            <div
              className={saModalBackdropClass('historialStats')}
              role="presentation"
              onClick={() => setStatsOpen(false)}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="historial-stats-title"
                className={SA_MODAL_PANEL_SCROLL}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2
                    id="historial-stats-title"
                    className="m-0 flex items-center gap-2 text-lg font-extrabold tracking-tight text-white"
                  >
                    <BarChart3
                      className="h-5 w-5 shrink-0 text-teal-400/90"
                      strokeWidth={2}
                      aria-hidden
                    />
                    Estadísticas — Rutas
                  </h2>
                  <button
                    type="button"
                    onClick={() => setStatsOpen(false)}
                    className={SA_MODAL_BTN_CLOSE}
                    aria-label="Cerrar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="my-4 border-t border-white/10" />

                <StatsCard
                  label={statsSemana.label}
                  headerIcon={
                    <Calendar
                      className="h-3.5 w-3.5 shrink-0 text-slate-400"
                      strokeWidth={2}
                      aria-hidden
                    />
                  }
                  stats={statsSemana.data}
                  onPrev={
                    mostrarAtrasSem ? () => navegarStats('semana', -1) : null
                  }
                  onNext={
                    mostrarAdelanteSem ? () => navegarStats('semana', 1) : null
                  }
                />
                <div className="h-3" />
                <StatsCard
                  label={statsMes.label}
                  headerIcon={
                    <CalendarDays
                      className="h-3.5 w-3.5 shrink-0 text-slate-400"
                      strokeWidth={2}
                      aria-hidden
                    />
                  }
                  stats={statsMes.data}
                  onPrev={
                    mostrarAtrasMes ? () => navegarStats('mes', -1) : null
                  }
                  onNext={
                    mostrarAdelanteMes ? () => navegarStats('mes', 1) : null
                  }
                />
                <p className="mt-4 text-center text-[10px] text-slate-500">
                  Solo rutas archivadas, por fecha de la ruta.
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  )
}

function StatsCard({ label, headerIcon, stats, onPrev, onNext }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {onPrev ? (
          <button
            type="button"
            onClick={onPrev}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white transition-colors hover:border-teal-400/30 hover:bg-teal-500/15 hover:text-teal-100 active:scale-[0.96]"
            title="Anterior"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        ) : (
          <span className="w-8 shrink-0" />
        )}
        <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-center text-xs font-bold text-slate-200">
          {headerIcon}
          <span className="min-w-0">{label}</span>
        </span>
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-white transition-colors hover:border-teal-400/30 hover:bg-teal-500/15 hover:text-teal-100 active:scale-[0.96]"
            title="Siguiente"
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        ) : (
          <span className="w-8 shrink-0" />
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded-lg bg-black/20 py-2">
          <div className="text-[10px] text-slate-500">Rutas</div>
          <div className="text-lg font-extrabold text-white">
            {stats.rutasCount}
          </div>
        </div>
        <div className="rounded-lg bg-black/20 py-2">
          <div className="text-[10px] text-slate-500">Aventurados</div>
          <div className="text-lg font-extrabold text-white">
            {stats.participantesCount}
          </div>
        </div>
        <div className="rounded-lg bg-black/20 py-2">
          <div className="text-[10px] text-slate-500">Recaudado (Bs)</div>
          <div className="text-sm font-extrabold text-emerald-400">
            {fmtBs(stats.recaudado)}
          </div>
        </div>
        <div className="rounded-lg bg-black/20 py-2">
          <div className="text-[10px] text-slate-500">Gastos (Bs)</div>
          <div className="text-sm font-extrabold text-rose-400">
            {fmtBs(stats.gastos)}
          </div>
        </div>
      </div>
      <div className="mt-2 rounded-lg border border-white/10 bg-black/25 py-2 text-center">
        <div className="text-[10px] text-slate-500">Profit neto (Bs)</div>
        <div
          className={`text-base font-extrabold ${stats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
        >
          {fmtBs(stats.profit)}
        </div>
      </div>
    </div>
  )
}
