import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PersonHistorialModal from '../../components/PersonHistorialModal'
import { useNotify } from '../../context/NotifyContext.jsx'
import { useGestionRealtime } from '../../hooks/useGestionRealtime'
import { formatRutaDate } from '../../lib/formatDate'
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
import { getRutasPasadasParaHistorial } from '../../lib/rutasPasadasHistorial'
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
  const { toast } = useNotify()
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

  const [addOpen, setAddOpen] = useState(false)
  const [addNombre, setAddNombre] = useState('')
  const [addSelected, setAddSelected] = useState(() => new Set())
  const [addBusy, setAddBusy] = useState(false)
  const [addMsg, setAddMsg] = useState('')
  const [personaHistorialInput, setPersonaHistorialInput] = useState('')
  const [historialPersonaNombre, setHistorialPersonaNombre] = useState(null)

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

  const rutasParaAlta = useMemo(() => getRutasPasadasParaHistorial(rutas), [rutas])

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

  function toggleAddRuta(id) {
    setAddSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function guardarAventuradoHistorial() {
    setAddMsg('')
    const nombre = addNombre.trim()
    if (!nombre) {
      setAddMsg('Indica el nombre completo.')
      return
    }
    const rutaIds = [...addSelected]
    if (rutaIds.length === 0) {
      setAddMsg('Marca al menos una ruta asistida.')
      return
    }
    setAddBusy(true)
    try {
      const inserts = []
      for (const rutaId of rutaIds) {
        const ruta = rutas.find((r) => r.id === rutaId)
        if (!ruta) continue
        const yaExiste = participantes.some(
          (p) =>
            String(p.nombre || '').trim().toLowerCase() === nombre.toLowerCase() &&
            (p.rutaId === rutaId || p.ruta_id === rutaId),
        )
        if (yaExiste) continue
        inserts.push({
          nombre,
          lider: nombre,
          ruta_id: rutaId,
          ruta_nombre: ruta.nombre,
          asiste: true,
        })
      }
      if (inserts.length === 0) {
        setAddMsg('Esas rutas ya figuran para esta persona.')
        setAddBusy(false)
        return
      }
      const { error: insErr } = await supabase
        .from('participantes')
        .insert(inserts)
      if (insErr) throw insErr
      await loadAll()
      setAddNombre('')
      setAddSelected(new Set())
      setAddOpen(false)
    } catch (e) {
      console.error(e)
      setAddMsg(e?.message || 'Error al guardar.')
    } finally {
      setAddBusy(false)
    }
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
        <div className="flex gap-2">
          <input
            type="text"
            value={personaHistorialInput}
            onChange={(e) => setPersonaHistorialInput(e.target.value)}
            placeholder="Nombre → historial completo…"
            className="sa-field min-w-0 flex-1 py-2.5 text-sm"
          />
          <button
            type="button"
            onClick={() => {
              const n = personaHistorialInput.trim()
              if (!n) {
                toast('Escribe el nombre del aventurero.', 'info')
                return
              }
              setHistorialPersonaNombre(n)
            }}
            className="shrink-0 rounded-xl border border-emerald-500/35 bg-emerald-500/20 px-3 py-2.5 text-lg leading-none text-emerald-100"
            title="Ver historial, WhatsApp y añadir ruta"
          >
            📜
          </button>
        </div>
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
          className="w-full rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-sm font-semibold text-white hover:bg-white/10"
        >
          📊 Estadísticas de historial
        </button>
        <button
          type="button"
          onClick={() => {
            setAddMsg('')
            setAddNombre('')
            setAddSelected(new Set())
            setAddOpen(true)
          }}
          className="w-full rounded-xl border border-emerald-500/35 bg-emerald-500/15 py-2.5 text-sm font-bold text-emerald-100"
        >
          ➕ Añadir aventurado al historial
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
          <div className="text-4xl">📚</div>
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
                      <div className="font-extrabold text-white">
                        🏔️ {ruta.nombre}{' '}
                        {idCorto ? (
                          <span className="text-xs font-normal text-slate-500">
                            {idCorto}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        📅 {formatRutaDate(ruta.fecha)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-slate-600/80 bg-slate-800/80 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      Archivada
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>
                      💰 Bs {fmtBs(recaudado)}
                      {totalDolares > 0
                        ? ` + $${fmtBs(totalDolares)}`
                        : ''}
                    </span>
                    <span className="text-rose-400">
                      💸 Bs {fmtBs(gastosRuta)}
                    </span>
                    <span
                      className={
                        profitNeto >= 0 ? 'font-semibold text-emerald-400' : 'font-semibold text-rose-400'
                      }
                    >
                      📊 Bs {fmtBs(profitNeto)}
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
                          <span>
                            📋 Asistencia: {presentes}/{cuposRes} presentes
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
                      <div className="mb-2 text-sm font-bold text-teal-300/90">
                        👥 Reservas y participantes
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
                                    <div className="font-bold text-white">
                                      👤 {reserva.lider}
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
                                        className={`rounded-lg border px-2 py-1 text-[11px] ${p.asiste ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-white/10 bg-white/[0.04]'}`}
                                      >
                                        {p.asiste ? '✅' : '⭕'} {p.nombre}
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

      {statsOpen ? (
        <div
          className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/65 p-3 pt-10 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="historial-stats-title"
        >
          <div className="sa-card max-h-[85vh] w-full max-w-[480px] overflow-y-auto p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2
                id="historial-stats-title"
                className="m-0 text-sm font-extrabold text-white"
              >
                📊 Estadísticas (archivadas)
              </h2>
              <button
                type="button"
                onClick={() => setStatsOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <StatsCard
              label={statsSemana.label}
              headerPrefix="📅"
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
              headerPrefix="📆"
              stats={statsMes.data}
              onPrev={mostrarAtrasMes ? () => navegarStats('mes', -1) : null}
              onNext={mostrarAdelanteMes ? () => navegarStats('mes', 1) : null}
            />
            <p className="mt-3 text-center text-[10px] text-slate-500">
              Solo rutas archivadas, por fecha de la ruta.
            </p>
          </div>
        </div>
      ) : null}

      {addOpen ? (
        <div
          className="fixed inset-0 z-[10001] flex items-end justify-center bg-black/65 p-3 pt-16 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal
          aria-labelledby="historial-add-title"
        >
          <div className="sa-card max-h-[85vh] w-full max-w-[480px] overflow-y-auto p-4 shadow-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2
                id="historial-add-title"
                className="m-0 text-sm font-extrabold text-white"
              >
                ➕ Añadir al historial
              </h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white"
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Registra asistencias en rutas pasadas o archivadas (misma lógica
              que la app HTML).
            </p>
            <input
              type="text"
              value={addNombre}
              onChange={(e) => setAddNombre(e.target.value)}
              placeholder="Nombre completo"
              className="mt-3 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
            />
            <div className="mt-3 max-h-48 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
              {rutasParaAlta.length === 0 ? (
                <p className="text-xs text-slate-500">
                  No hay rutas pasadas o archivadas.
                </p>
              ) : (
                rutasParaAlta.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white/5"
                  >
                    <input
                      type="checkbox"
                      checked={addSelected.has(r.id)}
                      onChange={() => toggleAddRuta(r.id)}
                      className="rounded border-white/20"
                    />
                    <span className="text-slate-200">
                      {r.nombre}
                      {r.fecha ? (
                        <span className="text-slate-500">
                          {' '}
                          — {formatRutaDate(r.fecha)}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))
              )}
            </div>
            {addMsg ? (
              <p className="mt-2 text-center text-xs text-amber-200/90">
                {addMsg}
              </p>
            ) : null}
            <button
              type="button"
              disabled={addBusy}
              onClick={() => void guardarAventuradoHistorial()}
              className="mt-4 w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-2.5 text-sm font-bold text-white disabled:opacity-60"
            >
              {addBusy ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      ) : null}

      {historialPersonaNombre != null ? (
        <PersonHistorialModal
          nombre={historialPersonaNombre}
          participantes={participantes}
          rutas={rutas}
          onClose={() => setHistorialPersonaNombre(null)}
          onAfterChange={() => void loadAll()}
        />
      ) : null}
    </section>
  )
}

function StatsCard({ label, headerPrefix, stats, onPrev, onNext }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        {onPrev ? (
          <button
            type="button"
            onClick={onPrev}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-sm text-white"
            title="Anterior"
          >
            ←
          </button>
        ) : (
          <span className="w-7 shrink-0" />
        )}
        <span className="min-w-0 flex-1 text-center text-xs font-bold text-slate-200">
          {headerPrefix} {label}
        </span>
        {onNext ? (
          <button
            type="button"
            onClick={onNext}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] text-sm text-white"
            title="Siguiente"
          >
            →
          </button>
        ) : (
          <span className="w-7 shrink-0" />
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
