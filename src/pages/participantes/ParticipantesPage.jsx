import { History, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import PersonHistorialModal from '../../components/PersonHistorialModal'
import { useNotify } from '../../context/NotifyContext.jsx'
import { useGestionRealtime } from '../../hooks/useGestionRealtime'
import { calcularRutasPorPersona } from '../../lib/aventurero'
import { formatRutaDateShort } from '../../lib/formatDate'
import { mapRuta } from '../../lib/rutas'
import { supabase } from '../../lib/supabase'

async function fetchParticipantesBundle() {
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

function participantePasaFiltroRutaArchivada(p, rutas) {
  const rutaIdParticipante = p.rutaId || p.ruta_id
  if (!rutaIdParticipante) {
    const rutaNombre = (p.ruta_nombre || p.ruta || '').trim()
    if (!rutaNombre) return true
    const ruta = rutas.find((r) => r.nombre === rutaNombre)
    return !ruta || !ruta.archivada
  }
  const ruta = rutas.find((r) => r.id === rutaIdParticipante)
  return !ruta || !ruta.archivada
}

export default function ParticipantesPage() {
  const { toast, confirm } = useNotify()
  const [rutas, setRutas] = useState([])
  const [participantes, setParticipantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filtroRutaId, setFiltroRutaId] = useState('')
  const [historialPersonaNombre, setHistorialPersonaNombre] = useState(null)
  const [deletingId, setDeletingId] = useState(null)

  const reloadParticipantesData = useCallback(async () => {
    const bundle = await fetchParticipantesBundle()
    setRutas(bundle.rutas)
    setParticipantes(bundle.participantes)
  }, [])

  const refreshSilent = useCallback(async () => {
    try {
      const bundle = await fetchParticipantesBundle()
      setRutas(bundle.rutas)
      setParticipantes(bundle.participantes)
      setError('')
    } catch (e) {
      console.warn('[participantes] realtime refresh', e)
    }
  }, [])

  useGestionRealtime(refreshSilent, 'participantes')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bundle = await fetchParticipantesBundle()
        if (cancelled) return
        setRutas(bundle.rutas)
        setParticipantes(bundle.participantes)
        setError('')
      } catch (e) {
        console.error(e)
        if (cancelled) return
        setError(e?.message || 'No se pudieron cargar las personas')
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
      await reloadParticipantesData()
      setError('')
    } catch (e) {
      console.error(e)
      setError(e?.message || 'No se pudieron cargar las personas')
    } finally {
      setLoading(false)
    }
  }

  const rutasActivas = useMemo(
    () => rutas.filter((r) => !r.archivada),
    [rutas],
  )

  const historialPorNombre = useMemo(() => {
    const map = new Map()
    const nombres = new Set(
      participantes.map((p) => (p.nombre || '').trim()).filter(Boolean),
    )
    nombres.forEach((nombre) => {
      map.set(
        nombre.toLowerCase(),
        calcularRutasPorPersona(nombre, participantes, rutas),
      )
    })
    return map
  }, [participantes, rutas])

  const listaFiltrada = useMemo(() => {
    let filtered = [...participantes].filter((p) =>
      participantePasaFiltroRutaArchivada(p, rutas),
    )
    const q = search.trim().toLowerCase()
    if (q) {
      filtered = filtered.filter(
        (p) =>
          (p.nombre || '').toLowerCase().includes(q) ||
          (p.lider || '').toLowerCase().includes(q),
      )
    }
    if (filtroRutaId) {
      const rutaSel = rutas.find((r) => r.id === filtroRutaId)
      filtered = filtered.filter((p) => {
        if (p.rutaId === filtroRutaId || p.ruta_id === filtroRutaId) return true
        if (rutaSel) {
          const nom = (p.ruta_nombre || p.ruta || '').trim()
          return nom === rutaSel.nombre
        }
        return false
      })
    }
    filtered.sort((a, b) => {
      const c = (a.nombre || '').localeCompare(b.nombre || '', 'es', {
        sensitivity: 'base',
      })
      if (c !== 0) return c
      return (a.lider || '').localeCompare(b.lider || '', 'es', {
        sensitivity: 'base',
      })
    })
    return filtered
  }, [participantes, rutas, search, filtroRutaId])

  async function eliminarParticipante(p) {
    const nombre = String(p.nombre || '').trim() || 'esta persona'
    const ok = await confirm({
      title: 'Eliminar participante',
      message:
        `¿Eliminar a "${nombre}"?\n\nLíder: ${p.lider || '—'}\nRuta: ${(p.ruta_nombre || p.ruta || '—').toString()}\n\nEsta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    setDeletingId(p.id)
    try {
      const { error: delErr } = await supabase
        .from('participantes')
        .delete()
        .eq('id', p.id)
      if (delErr) throw delErr
      await reloadParticipantesData()
      toast('Participante eliminado.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'No se pudo eliminar (revisa RLS en Supabase).', 'error')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="sa-page">
      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar personas..."
          className="sa-input-search"
        />
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

      {loading ? (
        <p className="text-center text-sm text-slate-400">Cargando personas…</p>
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

      {!loading && !error && listaFiltrada.length === 0 ? (
        <div className="sa-card p-10 text-center shadow-xl shadow-black/25">
          <div className="text-4xl drop-shadow-md">👥</div>
          <h3 className="mt-3 text-lg font-extrabold tracking-tight text-white">
            No hay personas registradas
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            {search.trim() || filtroRutaId
              ? 'Prueba otro filtro o búsqueda.'
              : 'Añade participantes desde la app clásica o comprueba Supabase.'}
          </p>
        </div>
      ) : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        {!loading &&
          !error &&
          listaFiltrada.map((p) => {
            const rutaIdParticipante = p.rutaId || p.ruta_id
            let ruta = null
            if (rutaIdParticipante) {
              ruta = rutas.find((r) => r.id === rutaIdParticipante)
            }
            if (!ruta) {
              const rutaNombre = (p.ruta_nombre || p.ruta || '').trim()
              ruta = rutas.find((r) => r.nombre === rutaNombre)
            }
            const rutaNombre = ruta
              ? ruta.nombre
              : (p.ruta_nombre || p.ruta || 'Sin ruta')
            const rutaFecha = ruta?.fecha
              ? formatRutaDateShort(ruta.fecha)
              : ''

            const historial = historialPorNombre.get(
              (p.nombre || '').trim().toLowerCase(),
            )
            const rango = historial?.rango
            const tooltipRango = rango
              ? `${rango.emoji} ${rango.nombre}\n• Rutas asistidas: ${historial.totalRutas}\n• Participaciones: ${historial.totalParticipaciones}\n• Asistencias: ${historial.totalAsistidas} ✅\n• Ausencias: ${historial.totalNoAsistidas} ❌\n• Tasa: ${historial.porcentajeAsistencia}%`
              : ''

            const asisteKnown = p.asiste === true || p.asiste === false

            return (
              <li
                key={p.id}
                className="flex items-stretch gap-2 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-3 shadow-sm shadow-black/20 backdrop-blur-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white">{p.nombre}</span>
                    {rango ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold"
                        style={{
                          background: `${rango.color}20`,
                          color: rango.color,
                          borderColor: `${rango.color}66`,
                        }}
                        title={tooltipRango}
                      >
                        {rango.emoji} {rango.nombre}
                      </span>
                    ) : null}
                    {asisteKnown ? (
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          p.asiste
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-600/40 text-slate-400'
                        }`}
                        title="Asistencia en esta ruta"
                      >
                        {p.asiste ? 'Asiste' : 'No asiste'}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-slate-400">
                    <span>👤 {p.lider}</span>
                    <span>📍 {rutaNombre}</span>
                    {rutaFecha ? <span>📅 {rutaFecha}</span> : null}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col gap-1.5 self-center">
                  <button
                    type="button"
                    onClick={() =>
                      setHistorialPersonaNombre((p.nombre || '').trim())
                    }
                    className="flex items-center justify-center rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-2 text-slate-300 transition-colors hover:border-emerald-500/40 hover:bg-emerald-500/15 hover:text-emerald-100"
                    title="Historial completo, WhatsApp y añadir ruta"
                  >
                    <History className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Historial de persona</span>
                  </button>
                  <button
                    type="button"
                    disabled={deletingId === p.id}
                    onClick={() => void eliminarParticipante(p)}
                    className="flex items-center justify-center rounded-lg border border-rose-500/35 bg-rose-950/25 px-2.5 py-2 text-rose-200 transition-colors hover:bg-rose-950/40 disabled:opacity-50"
                    title="Eliminar participante"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Eliminar</span>
                  </button>
                </div>
              </li>
            )
          })}
      </ul>

      {!loading && !error && listaFiltrada.length > 0 ? (
        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
          Historial completo con 📜. Eliminar fila quita solo esa fila en
          Supabase (permisos RLS).
        </p>
      ) : null}

      {historialPersonaNombre != null ? (
        <PersonHistorialModal
          nombre={historialPersonaNombre}
          participantes={participantes}
          rutas={rutas}
          onClose={() => setHistorialPersonaNombre(null)}
          onAfterChange={() => void reloadParticipantesData()}
        />
      ) : null}
    </section>
  )
}
