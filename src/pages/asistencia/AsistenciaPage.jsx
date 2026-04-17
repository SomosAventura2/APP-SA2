import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotify } from '../../context/NotifyContext.jsx'
import { useGestionRealtime } from '../../hooks/useGestionRealtime'
import { formatRutaDateShort } from '../../lib/formatDate'
import { cardIdAsistencia, participantesPorReserva } from '../../lib/participantes'
import { mapRuta } from '../../lib/rutas'
import { normalizeReservas } from '../../lib/reservaCalcs'
import { supabase } from '../../lib/supabase'

async function fetchAsistenciaBundle() {
  const [rutasRes, reservasRes, participantesRes] = await Promise.all([
    supabase.from('rutas').select('*').order('fecha', { ascending: true }),
    supabase.from('reservas').select('*'),
    supabase.from('participantes').select('*'),
  ])
  if (rutasRes.error) throw rutasRes.error
  if (reservasRes.error) throw reservasRes.error
  if (participantesRes.error) throw participantesRes.error
  const rutas = (rutasRes.data || []).map(mapRuta)
  const reservas = normalizeReservas(reservasRes.data || [], rutas)
  return {
    rutas,
    reservas,
    participantes: participantesRes.data || [],
  }
}

function getReservasActivasAsistencia(
  reservas,
  rutas,
  searchTerm,
  liderFiltro,
  rutaFiltro,
) {
  const q = (searchTerm || '').trim().toLowerCase()
  return reservas.filter((reserva) => {
    const ruta = rutas.find((r) => r.id === reserva.rutaId)
    if (!ruta || ruta.archivada) return false
    if (liderFiltro && reserva.lider !== liderFiltro) return false
    if (rutaFiltro && reserva.rutaId !== rutaFiltro) return false
    if (q && !String(reserva.lider || '').toLowerCase().includes(q)) return false
    return true
  })
}

export default function AsistenciaPage() {
  const { toast, confirm } = useNotify()
  const [rutas, setRutas] = useState([])
  const [reservas, setReservas] = useState([])
  const [participantes, setParticipantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filtroLider, setFiltroLider] = useState('')
  const [filtroRutaId, setFiltroRutaId] = useState('')
  const [expanded, setExpanded] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [batchBusy, setBatchBusy] = useState(false)

  const reload = useCallback(async () => {
    const bundle = await fetchAsistenciaBundle()
    setRutas(bundle.rutas)
    setReservas(bundle.reservas)
    setParticipantes(bundle.participantes)
  }, [])

  useGestionRealtime(reload, 'asistencia')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await reload()
        if (cancelled) return
        setError('')
      } catch (e) {
        console.error(e)
        if (cancelled) return
        setError(e?.message || 'No se pudieron cargar los datos')
        setRutas([])
        setReservas([])
        setParticipantes([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reload])

  const rutasActivas = useMemo(
    () => rutas.filter((r) => !r.archivada),
    [rutas],
  )

  const lideresOpciones = useMemo(() => {
    const set = new Set()
    reservas.forEach((r) => {
      const ruta = rutas.find((rt) => rt.id === r.rutaId)
      if (ruta && !ruta.archivada && r.lider) set.add(r.lider)
    })
    return [...set].sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' }),
    )
  }, [reservas, rutas])

  const reservasVisibles = useMemo(
    () =>
      getReservasActivasAsistencia(
        reservas,
        rutas,
        search,
        filtroLider,
        filtroRutaId,
      ),
    [reservas, rutas, search, filtroLider, filtroRutaId],
  )

  const resumenTexto = useMemo(() => {
    if (!filtroLider && !filtroRutaId) return ''
    const ruta = rutas.find((r) => r.id === filtroRutaId)
    const rutaNombre = ruta
      ? ruta.nombre
      : filtroRutaId
        ? 'Ruta seleccionada'
        : ''
    const totalReservas = reservasVisibles.length
    const totalPersonas = reservasVisibles.reduce((sum, reserva) => {
      return (
        sum +
        participantesPorReserva(
          participantes,
          reserva.lider,
          reserva.rutaId,
        ).length
      )
    }, 0)
    return `${rutaNombre ? `📍 ${rutaNombre}` : ''}${rutaNombre && filtroLider ? ' • ' : ''}${filtroLider ? `👤 ${filtroLider}` : ''}${rutaNombre || filtroLider ? ' • ' : ''}🎫 Reservas: ${totalReservas} • 👥 Personas: ${totalPersonas}`
  }, [filtroLider, filtroRutaId, rutas, reservasVisibles, participantes])

  function toggleExpand(cardId) {
    setExpanded((prev) => ({ ...prev, [cardId]: !prev[cardId] }))
  }

  async function toggleAsistencia(participanteId) {
    const p = participantes.find((x) => x.id === participanteId)
    if (!p) return
    const prev = !!p.asiste
    const next = !prev
    setSavingId(participanteId)
    setParticipantes((list) =>
      list.map((x) => (x.id === participanteId ? { ...x, asiste: next } : x)),
    )
    try {
      const { error: upErr } = await supabase
        .from('participantes')
        .update({ asiste: next })
        .eq('id', participanteId)
      if (upErr) throw upErr
      toast('Asistencia actualizada.', 'success')
    } catch (e) {
      console.error(e)
      setParticipantes((list) =>
        list.map((x) => (x.id === participanteId ? { ...x, asiste: prev } : x)),
      )
      toast(e?.message || 'No se pudo actualizar la asistencia', 'error')
    } finally {
      setSavingId(null)
    }
  }

  async function marcarTodosEnReserva(lider, rutaId) {
    const lista = participantesPorReserva(participantes, lider, rutaId).filter(
      (p) => !p.asiste,
    )
    if (lista.length === 0) {
      toast('Todos ya están marcados como presentes en esta reserva.', 'info')
      return
    }
    const ok = await confirm({
      title: 'Marcar asistencia',
      message: `¿Marcar ${lista.length} persona${lista.length !== 1 ? 's' : ''} como presentes en esta reserva?`,
      confirmLabel: 'Marcar todos',
      cancelLabel: 'Cancelar',
    })
    if (!ok) return
    setBatchBusy(true)
    const ids = lista.map((p) => p.id)
    const snapshot = participantes
    setParticipantes((list) =>
      list.map((x) => (ids.includes(x.id) ? { ...x, asiste: true } : x)),
    )
    try {
      for (const id of ids) {
        const { error: upErr } = await supabase
          .from('participantes')
          .update({ asiste: true })
          .eq('id', id)
        if (upErr) throw upErr
      }
      toast('Todos marcados como presentes.', 'success')
    } catch (e) {
      console.error(e)
      setParticipantes(snapshot)
      toast(e?.message || 'Error al marcar asistencia', 'error')
    } finally {
      setBatchBusy(false)
    }
  }

  async function handleRetry() {
    setLoading(true)
    try {
      await reload()
      setError('')
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Error al recargar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="sa-page">
      <div className="mb-3 flex flex-col gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por líder..."
          className="sa-input-search"
        />
        <select
          value={filtroLider}
          onChange={(e) => setFiltroLider(e.target.value)}
          className="sa-field"
        >
          <option value="">Todos los líderes</option>
          {lideresOpciones.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          value={filtroRutaId}
          onChange={(e) => setFiltroRutaId(e.target.value)}
          className="sa-field"
        >
          <option value="">Todas las rutas</option>
          {rutasActivas.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
              {r.fecha ? ` · ${formatRutaDateShort(r.fecha)}` : ''}
            </option>
          ))}
        </select>
      </div>

      {filtroLider || filtroRutaId ? (
        <p className="mb-4 text-[12px] leading-relaxed text-slate-400">
          {resumenTexto}
        </p>
      ) : null}

      {loading ? (
        <p className="text-center text-sm text-slate-400">Cargando asistencia…</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-950/35 p-4 text-sm text-red-100 backdrop-blur-sm">
          {error}
          <button
            type="button"
            onClick={() => void handleRetry()}
            className="mt-3 block w-full rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-white transition-colors hover:bg-white/10"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {!loading && !error && reservasVisibles.length === 0 ? (
        <div className="sa-card p-10 text-center shadow-xl shadow-black/25">
          <div className="text-4xl drop-shadow-md">📋</div>
          <h3 className="mt-3 text-lg font-extrabold tracking-tight text-white">
            No hay reservas que mostrar
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            Ajusta filtros o registra personas en reservas desde la app clásica.
          </p>
        </div>
      ) : null}

      <ul className="flex list-none flex-col gap-3 p-0">
        {!loading &&
          !error &&
          reservasVisibles
            .filter((reserva) =>
              rutas.some((r) => r.id === reserva.rutaId && !r.archivada),
            )
            .map((reserva) => {
            const ruta = rutas.find((r) => r.id === reserva.rutaId)
            const cid = cardIdAsistencia(reserva.lider, reserva.rutaId)
            const lista = participantesPorReserva(
              participantes,
              reserva.lider,
              reserva.rutaId,
            ).slice()
            lista.sort((a, b) =>
              (a.nombre || '').localeCompare(b.nombre || '', 'es', {
                sensitivity: 'base',
              }),
            )
            const presentes = lista.filter((p) => p.asiste).length
            const total = lista.length
            const porcentaje = total > 0 ? Math.round((presentes / total) * 100) : 0
            const barColor =
              porcentaje >= 80
                ? 'bg-emerald-500'
                : porcentaje >= 50
                  ? 'bg-amber-400'
                  : 'bg-rose-500'
            const isOpen = !!expanded[cid]

            return (
              <li
                key={cid}
                className="sa-card overflow-hidden shadow-lg shadow-black/30"
              >
                <div className="p-4">
                  <div className="flex gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-extrabold text-white">
                        📍 {ruta.nombre}
                        {ruta.fecha
                          ? ` · ${formatRutaDateShort(ruta.fecha)}`
                          : ''}
                      </div>
                      <div className="mt-1 text-[13px] text-slate-400">
                        <span>👤 {reserva.lider}</span>
                        <span className="ml-2 font-semibold text-slate-300">
                          📊 {presentes}/{total} presentes
                        </span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="h-1.5 max-w-[140px] flex-1 overflow-hidden rounded-full bg-white/10">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${porcentaje}%` }}
                          />
                        </div>
                        <span className="text-[13px] font-semibold text-slate-400">
                          {porcentaje}%
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleExpand(cid)}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-slate-300 hover:bg-white/10 hover:text-white"
                      aria-expanded={isOpen}
                      title={isOpen ? 'Ocultar lista' : 'Ver lista'}
                    >
                      {isOpen ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="border-t border-white/10 bg-black/20 px-4 py-3">
                    {lista.some((p) => !p.asiste) ? (
                      <button
                        type="button"
                        disabled={batchBusy}
                        onClick={() => void marcarTodosEnReserva(reserva.lider, reserva.rutaId)}
                        className="mb-3 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/15 py-2 text-[13px] font-bold text-emerald-200 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {batchBusy ? 'Guardando…' : 'Marcar todos presentes (esta reserva)'}
                      </button>
                    ) : null}
                    <ul className="m-0 flex list-none flex-col gap-2 p-0">
                      {lista.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.04] px-3 py-2"
                        >
                          <input
                            type="checkbox"
                            checked={!!p.asiste}
                            disabled={savingId === p.id || batchBusy}
                            onChange={() => void toggleAsistencia(p.id)}
                            className="h-5 w-5 shrink-0 cursor-pointer rounded border-white/20 accent-emerald-500"
                          />
                          <button
                            type="button"
                            disabled={savingId === p.id || batchBusy}
                            onClick={() => void toggleAsistencia(p.id)}
                            className={`min-w-0 flex-1 cursor-pointer text-left text-sm font-semibold transition-colors ${
                              p.asiste ? 'text-emerald-300' : 'text-slate-300'
                            } disabled:cursor-wait disabled:opacity-50`}
                          >
                            {p.nombre}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </li>
            )
          })}
      </ul>
    </section>
  )
}
