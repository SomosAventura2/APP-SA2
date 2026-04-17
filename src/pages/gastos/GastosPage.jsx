import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotify } from '../../context/NotifyContext.jsx'
import { formatRutaDateShort } from '../../lib/formatDate'
import { useGestionRealtime } from '../../hooks/useGestionRealtime'
import { mapRuta } from '../../lib/rutas'
import { supabase } from '../../lib/supabase'

function getGastoRutaId(g) {
  return g.ruta_id ?? g.rutaId ?? null
}

function normalizeGasto(raw) {
  return {
    ...raw,
    rutaId: getGastoRutaId(raw),
  }
}

async function fetchGastosBundle() {
  const [rutasRes, gastosRes] = await Promise.all([
    supabase.from('rutas').select('*').order('fecha', { ascending: true }),
    supabase.from('gastos').select('*').order('fecha', { ascending: false }),
  ])
  if (rutasRes.error) throw rutasRes.error
  if (gastosRes.error) throw gastosRes.error
  return {
    rutas: (rutasRes.data || []).map(mapRuta),
    gastos: (gastosRes.data || []).map(normalizeGasto),
  }
}

function formatGastoFecha(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return String(iso)
  }
}

export default function GastosPage() {
  const { toast, confirm } = useNotify()
  const [rutas, setRutas] = useState([])
  const [gastos, setGastos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filtroRutaId, setFiltroRutaId] = useState('')
  const [concepto, setConcepto] = useState('')
  const [nuevaRutaId, setNuevaRutaId] = useState('')
  const [monto, setMonto] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formMsg, setFormMsg] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const refreshSilent = useCallback(async () => {
    try {
      const bundle = await fetchGastosBundle()
      setRutas(bundle.rutas)
      setGastos(bundle.gastos)
      setError('')
    } catch (e) {
      console.warn('[gastos] refresh silent', e)
    }
  }, [])

  useGestionRealtime(refreshSilent, 'gastos')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const bundle = await fetchGastosBundle()
        if (cancelled) return
        setRutas(bundle.rutas)
        setGastos(bundle.gastos)
        setError('')
      } catch (e) {
        console.error(e)
        if (cancelled) return
        setError(e?.message || 'No se pudieron cargar los gastos')
        setRutas([])
        setGastos([])
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
      const bundle = await fetchGastosBundle()
      setRutas(bundle.rutas)
      setGastos(bundle.gastos)
      setError('')
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Error al recargar')
    } finally {
      setLoading(false)
    }
  }

  const rutasActivas = useMemo(
    () => rutas.filter((r) => !r.archivada),
    [rutas],
  )

  const listaFiltrada = useMemo(() => {
    const q = search.trim().toLowerCase()
    let filtered = gastos.filter((g) => {
      const rutaIdGasto = g.rutaId
      const ruta = rutas.find((r) => r.id === rutaIdGasto)
      if (!ruta || ruta.archivada) return false
      const nombreRuta = ruta.nombre || g.ruta || ''
      if (!q) return true
      return (
        String(g.concepto || '')
          .toLowerCase()
          .includes(q) || nombreRuta.toLowerCase().includes(q)
      )
    })
    if (filtroRutaId) {
      filtered = filtered.filter((g) => g.rutaId === filtroRutaId)
    }
    return filtered
  }, [gastos, rutas, search, filtroRutaId])

  async function handleRegistrarGasto(e) {
    e.preventDefault()
    setFormMsg('')
    const c = concepto.trim()
    if (c.length < 2) {
      const msg = 'El concepto debe tener al menos 2 caracteres.'
      setFormMsg(msg)
      toast(msg, 'info')
      return
    }
    if (!nuevaRutaId) {
      const msg = 'Selecciona una ruta.'
      setFormMsg(msg)
      toast(msg, 'info')
      return
    }
    const m = parseFloat(String(monto).replace(',', '.'))
    if (!m || m <= 0 || m > 10_000_000) {
      const msg = 'Indica un monto válido (mayor que 0 y menor a 10.000.000).'
      setFormMsg(msg)
      toast(msg, 'info')
      return
    }
    setSubmitting(true)
    try {
      const { error: insErr } = await supabase.from('gastos').insert({
        concepto: c,
        ruta_id: nuevaRutaId,
        monto: m,
        fecha: new Date().toISOString(),
      })
      if (insErr) throw insErr
      setConcepto('')
      setMonto('')
      const okMsg = 'Gasto registrado.'
      setFormMsg(okMsg)
      toast(okMsg, 'success')
      await refreshSilent()
    } catch (err) {
      console.error(err)
      const msg = err?.message || 'No se pudo registrar el gasto.'
      setFormMsg(msg)
      toast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function eliminarGasto(g) {
    const concepto = String(g.concepto || '').trim() || 'este gasto'
    const m = Number(g.monto) || 0
    const ok = await confirm({
      title: 'Eliminar gasto',
      message: `¿Eliminar el gasto "${concepto}" por Bs ${m.toLocaleString('es-ES')}?\n\nEsta acción no se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    setDeletingId(g.id)
    try {
      const { error: delErr } = await supabase.from('gastos').delete().eq('id', g.id)
      if (delErr) throw delErr
      await refreshSilent()
      toast('Gasto eliminado.', 'success')
    } catch (e) {
      console.error(e)
      toast(
        e?.message || 'No se pudo eliminar (revisa permisos RLS en Supabase).',
        'error',
      )
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="sa-page">
      <form
        onSubmit={(ev) => void handleRegistrarGasto(ev)}
        className="sa-card mb-6 p-4 shadow-lg shadow-black/25"
      >
        <h2 className="m-0 text-sm font-extrabold tracking-tight text-white">
          Registrar gasto
        </h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Montos en Bs, asociados a una ruta activa.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <input
            type="text"
            value={concepto}
            onChange={(e) => setConcepto(e.target.value)}
            placeholder="Concepto (ej. combustible, alimentos)"
            className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
          />
          <select
            value={nuevaRutaId}
            onChange={(e) => setNuevaRutaId(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
          >
            <option value="">Selecciona ruta</option>
            {rutasActivas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
                {r.fecha ? ` · ${formatRutaDateShort(r.fecha)}` : ''}
              </option>
            ))}
          </select>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="Monto (Bs)"
            className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
            onKeyDown={(e) => {
              if (['e', 'E', '+'].includes(e.key)) e.preventDefault()
            }}
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-950/30 disabled:opacity-60"
          >
            {submitting ? 'Guardando…' : 'Guardar gasto'}
          </button>
          {formMsg ? (
            <p
              className={`m-0 text-center text-xs ${
                formMsg.includes('registrado')
                  ? 'text-emerald-400'
                  : 'text-amber-200'
              }`}
            >
              {formMsg}
            </p>
          ) : null}
        </div>
      </form>

      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar gastos..."
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
        <p className="text-center text-sm text-slate-400">Cargando gastos…</p>
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
          <div className="text-4xl drop-shadow-md">💸</div>
          <h3 className="mt-3 text-lg font-extrabold tracking-tight text-white">
            No hay gastos registrados
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            {search.trim() || filtroRutaId
              ? 'Prueba otro filtro o búsqueda.'
              : 'Registra un gasto arriba o desde la app clásica.'}
          </p>
        </div>
      ) : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        {!loading &&
          !error &&
          listaFiltrada.map((g) => {
            const ruta = rutas.find((r) => r.id === g.rutaId)
            const nombreRuta = ruta ? ruta.nombre : g.ruta || 'Sin ruta'
            const montoVal = Number(g.monto) || 0
            return (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/50 px-3 py-3 backdrop-blur-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white">{g.concepto}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] text-slate-400">
                    <span>📍 {nombreRuta}</span>
                    <span>📅 {formatGastoFecha(g.fecha)}</span>
                    <span className="font-extrabold text-rose-400">
                      Bs {montoVal.toLocaleString('es-ES')}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={deletingId === g.id}
                  onClick={() => void eliminarGasto(g)}
                  className="shrink-0 rounded-lg border border-rose-500/30 bg-rose-950/30 px-2 py-2 text-rose-200 transition-colors hover:bg-rose-950/50 disabled:opacity-50"
                  title="Eliminar gasto"
                >
                  {deletingId === g.id ? '…' : '🗑️'}
                </button>
              </li>
            )
          })}
      </ul>

      <p className="mt-6 text-center text-[11px] text-slate-500">
        Los cambios desde otra pestaña se reflejan vía Realtime. Si delete
        falla, revisa políticas RLS para la tabla gastos en Supabase.
      </p>
    </section>
  )
}
