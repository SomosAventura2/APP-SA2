import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PersonHistorialModal from '../../components/PersonHistorialModal'
import { calcularRutasPorPersona } from '../../lib/aventurero'
import { useGestionRealtime } from '../../hooks/useGestionRealtime'
import { mapRuta } from '../../lib/rutas'
import { generarRankingAventurados } from '../../lib/ranking'
import { supabase } from '../../lib/supabase'

/** Archivos en `public/badges/{clave}.png` (Vite sirve `/badges/...`). */
const BADGE_PNG = {
  Novato: 'novato',
  Bronce: 'bronce',
  Plata: 'plata',
  Oro: 'oro',
  Platino: 'platino',
  Diamante: 'diamante',
}

const RANGO_FILTROS = [
  { value: '', label: 'Todos los rangos' },
  { value: 'Diamante', label: '✨ Diamante' },
  { value: 'Platino', label: '💎 Platino' },
  { value: 'Oro', label: '🥇 Oro' },
  { value: 'Plata', label: '🥈 Plata' },
  { value: 'Bronce', label: '🥉 Bronce' },
  { value: 'Novato', label: '🌱 Novato' },
]

async function fetchRankingBundle() {
  const [rutasRes, participantesRes] = await Promise.all([
    supabase.from('rutas').select('*').order('fecha', { ascending: true }),
    supabase.from('participantes').select('*'),
  ])
  if (rutasRes.error) throw rutasRes.error
  if (participantesRes.error) throw participantesRes.error
  return {
    rutas: (rutasRes.data || []).map(mapRuta),
    participantes: participantesRes.data || [],
  }
}

function RangoBadge({ rango }) {
  const [imgFallo, setImgFallo] = useState(false)
  if (!rango) return null
  const slug = BADGE_PNG[rango.nombre]
  const srcPng = slug ? `/badges/${slug}.png` : null
  const mostrarImg = srcPng && !imgFallo

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
      style={{
        background: `${rango.color}26`,
        color: rango.color,
        borderColor: `${rango.color}66`,
      }}
    >
      {mostrarImg ? (
        <img
          src={srcPng}
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 shrink-0 object-contain"
          loading="lazy"
          decoding="async"
          onError={() => setImgFallo(true)}
        />
      ) : (
        <span aria-hidden className="text-[12px] leading-none">
          {rango.emoji}
        </span>
      )}
      <span className="truncate">{rango.nombre}</span>
    </span>
  )
}

export default function RankingPage() {
  const [rutas, setRutas] = useState([])
  const [participantes, setParticipantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filtroRango, setFiltroRango] = useState('')
  const [expandedNombre, setExpandedNombre] = useState(null)
  const [historialPersonaNombre, setHistorialPersonaNombre] = useState(null)

  const reloadRankingData = useCallback(async () => {
    const bundle = await fetchRankingBundle()
    setRutas(bundle.rutas)
    setParticipantes(bundle.participantes)
  }, [])

  const refreshSilent = useCallback(async () => {
    try {
      const bundle = await fetchRankingBundle()
      setRutas(bundle.rutas)
      setParticipantes(bundle.participantes)
      setError('')
    } catch (e) {
      console.warn('[ranking] realtime refresh', e)
    }
  }, [])

  useGestionRealtime(refreshSilent, 'ranking')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bundle = await fetchRankingBundle()
        if (cancelled) return
        setRutas(bundle.rutas)
        setParticipantes(bundle.participantes)
        setError('')
      } catch (e) {
        console.error(e)
        if (cancelled) return
        setError(e?.message || 'No se pudieron cargar los datos')
        setRutas([])
        setParticipantes([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRetry() {
    setLoading(true)
    try {
      await reloadRankingData()
      setError('')
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Error al recargar')
    } finally {
      setLoading(false)
    }
  }

  const rankingCompleto = useMemo(
    () => generarRankingAventurados(participantes),
    [participantes],
  )

  const rankingFiltrado = useMemo(() => {
    const q = search.trim().toLowerCase()
    let list = rankingCompleto
    if (q) {
      list = list.filter((p) => (p.nombre || '').toLowerCase().includes(q))
    }
    if (filtroRango) {
      list = list.filter((p) => p.rango && p.rango.nombre === filtroRango)
    }
    return list
  }, [rankingCompleto, search, filtroRango])

  const stats = useMemo(() => {
    const r = rankingCompleto
    const totalAventurados = r.length
    const totalRutas = r.reduce((sum, p) => sum + p.rutasAsistidas, 0)
    const promedioRutas =
      totalAventurados > 0 ? (totalRutas / totalAventurados).toFixed(1) : '0'
    const mejorAsistencia = [...r].sort(
      (a, b) => b.porcentajeAsistencia - a.porcentajeAsistencia,
    )[0]
    const masRutas = [...r].sort((a, b) => b.rutasAsistidas - a.rutasAsistidas)[0]
    return {
      totalAventurados,
      promedioRutas,
      masRutas,
      mejorAsistencia,
    }
  }, [rankingCompleto])

  /** Posición global (1-based) en el ranking sin filtros de búsqueda. */
  const posicionGlobalPorNombre = useMemo(() => {
    const m = new Map()
    rankingCompleto.forEach((p, i) => {
      m.set(p.nombre, i + 1)
    })
    return m
  }, [rankingCompleto])

  return (
    <section className="sa-page">
      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar aventurado..."
          className="sa-input-search"
        />
        <select
          value={filtroRango}
          onChange={(e) => setFiltroRango(e.target.value)}
          className="sa-field"
        >
          {RANGO_FILTROS.map((o) => (
            <option key={o.value || 'all'} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-center text-sm text-slate-400">Cargando ranking…</p>
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

      {!loading && !error ? (
        <>
          <div className="sa-card mb-4 p-4 shadow-lg">
            <h2 className="m-0 text-sm font-extrabold text-white">
              📈 Estadísticas globales
            </h2>
            {rankingCompleto.length === 0 ? (
              <p className="mt-3 text-center text-sm text-slate-400">
                Aún no hay aventureros con 2+ asistencias registradas.
              </p>
            ) : (
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-3 text-center">
                  <span className="block text-xl font-extrabold text-emerald-300">
                    {stats.totalAventurados}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    Aventurados
                  </span>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-3 text-center">
                  <span className="block text-xl font-extrabold text-emerald-300">
                    {stats.promedioRutas}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    Prom. rutas
                  </span>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-3 text-center">
                  <span className="block text-xl font-extrabold text-emerald-300">
                    {stats.masRutas ? stats.masRutas.rutasAsistidas : 0}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    Máx. rutas
                  </span>
                  {stats.masRutas ? (
                    <div className="mt-1 truncate text-[10px] text-slate-400">
                      {stats.masRutas.nombre}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-3 py-3 text-center">
                  <span className="block text-xl font-extrabold text-emerald-300">
                    {stats.mejorAsistencia
                      ? `${stats.mejorAsistencia.porcentajeAsistencia}%`
                      : '0%'}
                  </span>
                  <span className="text-[11px] font-medium text-slate-500">
                    Mejor %
                  </span>
                  {stats.mejorAsistencia ? (
                    <div className="mt-1 truncate text-[10px] text-slate-400">
                      {stats.mejorAsistencia.nombre}
                    </div>
                  ) : null}
                </div>
              </div>
            )}
          </div>

          <div className="sa-card p-4 shadow-lg">
            <h2 className="m-0 text-sm font-extrabold text-white">
              📊 Ranking completo
            </h2>
            {rankingFiltrado.length === 0 ? (
              <div className="mt-6 text-center text-slate-400">
                <div className="text-3xl">🔍</div>
                <p className="mt-2 text-sm">No hay aventurados que coincidan</p>
              </div>
            ) : (
              <ul className="mt-3 flex list-none flex-col gap-2 p-0">
                {rankingFiltrado.map((a) => {
                  const open = expandedNombre === a.nombre
                  const hist = open
                    ? calcularRutasPorPersona(a.nombre, participantes, rutas)
                    : null
                  const progPct =
                    a.totalParaSiguiente > 0
                      ? Math.min(
                          100,
                          (a.progreso / a.totalParaSiguiente) * 100,
                        )
                      : 0
                  const posGlobal =
                    posicionGlobalPorNombre.get(a.nombre) ?? null
                  const top3 = posGlobal != null && posGlobal <= 3
                  return (
                    <li
                      key={a.nombre}
                      className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.03]"
                      style={{
                        borderLeftWidth: 4,
                        borderLeftColor: a.rango.color,
                        background: top3
                          ? 'rgba(118, 200, 147, 0.05)'
                          : undefined,
                      }}
                    >
                      <div className="flex w-full items-stretch">
                        <div
                          className={`flex min-w-[2.75rem] max-w-[3.25rem] shrink-0 flex-col items-center justify-center gap-0.5 border-r border-white/10 px-1 py-2 text-center ${
                            top3
                              ? 'bg-emerald-500/12 text-emerald-200'
                              : 'bg-white/[0.03] text-slate-400'
                          }`}
                          title={`Posición global: ${posGlobal ?? '—'}`}
                          aria-hidden
                        >
                          <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">
                            #
                          </span>
                          <span className="text-sm font-extrabold tabular-nums leading-none text-white">
                            {posGlobal ?? '—'}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedNombre(open ? null : a.nombre)
                          }
                          className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate font-bold text-white">
                                {a.nombre}
                              </span>
                              <RangoBadge rango={a.rango} />
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-400">
                              <span>🏔️ {a.rutasAsistidas} rutas</span>
                              <span>
                                ✅ {a.totalAsistidas}/{a.totalParticipaciones}
                              </span>
                              <span>📊 {a.porcentajeAsistencia}%</span>
                            </div>
                            {a.siguienteRango ? (
                              <div className="mt-2">
                                <div className="mb-1 flex justify-between text-[10px] text-slate-500">
                                  <span>
                                    Progreso a {a.siguienteRango.emoji}{' '}
                                    {a.siguienteRango.nombre}
                                  </span>
                                  <span>
                                    {a.progreso}/{a.totalParaSiguiente}
                                  </span>
                                </div>
                                <div className="h-1 overflow-hidden rounded-full bg-white/10">
                                  <div
                                    className="h-full rounded-full transition-all"
                                    style={{
                                      width: `${progPct}%`,
                                      background: a.siguienteRango.color,
                                    }}
                                  />
                                </div>
                              </div>
                            ) : null}
                          </div>
                          <span className="shrink-0 self-center text-slate-500">
                            {open ? (
                              <ChevronUp className="h-5 w-5" />
                            ) : (
                              <ChevronDown className="h-5 w-5" />
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setHistorialPersonaNombre(a.nombre)}
                          className="shrink-0 border-l border-white/10 px-3 py-3 text-base leading-none text-slate-400 transition-colors hover:bg-white/5 hover:text-emerald-300"
                          title="Historial completo, WhatsApp y añadir ruta"
                        >
                          📜
                        </button>
                      </div>
                      {open && hist ? (
                        <div className="border-t border-white/10 bg-black/20 px-3 py-3 text-[12px] text-slate-300">
                          <p className="m-0 text-slate-400">
                            Participaciones: {hist.totalParticipaciones} ·
                            Asistencias: {hist.totalAsistidas} · Ausencias:{' '}
                            {hist.totalNoAsistidas} · Tasa:{' '}
                            {hist.porcentajeAsistencia}%
                          </p>
                          {hist.participacionesDetalladas?.length ? (
                            <ul className="mt-2 max-h-40 list-none space-y-1 overflow-y-auto p-0">
                              {hist.participacionesDetalladas
                                .slice(0, 12)
                                .map((row, i) => (
                                  <li
                                    key={`${row.ruta}-${i}`}
                                    className="flex justify-between gap-2 rounded border border-white/[0.05] bg-white/[0.03] px-2 py-1.5"
                                  >
                                    <span className="truncate">{row.ruta}</span>
                                    <span>
                                      {row.asiste ? '✅' : '⭕'} {row.lider}
                                    </span>
                                  </li>
                                ))}
                            </ul>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </>
      ) : null}

      <p className="mt-6 text-center text-[11px] text-slate-500">
        Usa 📜 para el historial completo (WhatsApp y añadir ruta pasada). El
        desplegable sigue siendo un resumen corto. Subir foto para la landing
        sigue en la app HTML.
      </p>

      {historialPersonaNombre != null ? (
        <PersonHistorialModal
          nombre={historialPersonaNombre}
          participantes={participantes}
          rutas={rutas}
          onClose={() => setHistorialPersonaNombre(null)}
          onAfterChange={() => void reloadRankingData()}
        />
      ) : null}
    </section>
  )
}
