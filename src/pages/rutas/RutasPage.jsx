import {
  AlertTriangle,
  Archive,
  Calendar,
  ChevronDown,
  ChevronUp,
  Mountain,
  Pencil,
  Plus,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotify } from '../../context/NotifyContext.jsx'
import { useGestionRealtime } from '../../hooks/useGestionRealtime'
import { formatRutaDate, formatRutaDateShort } from '../../lib/formatDate'
import { mapRuta } from '../../lib/rutas'
import { supabase } from '../../lib/supabase'
import { getCuposReserva, getReservaRutaId } from '../../lib/reservas'

function cuposOcupadosEnRuta(rutaId, reservas, ruta) {
  if (!ruta || ruta.archivada) return 0
  return reservas
    .filter((r) => getReservaRutaId(r) === rutaId)
    .reduce((sum, r) => sum + getCuposReserva(r), 0)
}

async function fetchRutasBundle() {
  const [rutasRes, reservasRes] = await Promise.all([
    supabase.from('rutas').select('*').order('fecha', { ascending: true }),
    supabase.from('reservas').select('*'),
  ])
  if (rutasRes.error) throw rutasRes.error
  if (reservasRes.error) throw reservasRes.error
  const raw = rutasRes.data || []
  return {
    rutas: raw.map(mapRuta),
    reservas: reservasRes.data || [],
  }
}

function siguienteNumeroRuta(rutas) {
  let m = 0
  for (const r of rutas || []) {
    const n = Number(r.numero)
    if (Number.isFinite(n) && n > m) m = n
  }
  return m + 1
}

/** Misma subida que app/index.html (bucket `flyers`). Si falla, devuelve null. */
async function subirFotoRutaSiHay(file, nombreRuta) {
  if (!file) return null
  const nombreLimpio = String(nombreRuta || 'ruta')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 50)
  const extension = (file.name && file.name.split('.').pop()) || 'jpg'
  const nombreUnico = `ruta_${Date.now()}_${nombreLimpio}.${extension}`
  const { error: upErr } = await supabase.storage
    .from('flyers')
    .upload(nombreUnico, file, { cacheControl: '3600', upsert: false })
  if (upErr) {
    console.warn('[rutas] subida foto', upErr)
    return null
  }
  const { data } = supabase.storage.from('flyers').getPublicUrl(nombreUnico)
  return data?.publicUrl ?? null
}

export default function RutasPage() {
  const { toast, confirm } = useNotify()
  const [rutas, setRutas] = useState([])
  const [reservas, setReservas] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [nfNombre, setNfNombre] = useState('')
  const [nfFecha, setNfFecha] = useState('')
  const [nfCupos, setNfCupos] = useState('')
  const [nfPrecio, setNfPrecio] = useState('')
  const [nfFile, setNfFile] = useState(null)
  const [crearBusy, setCrearBusy] = useState(false)
  const [crearMsg, setCrearMsg] = useState('')
  const [archivarBusyId, setArchivarBusyId] = useState(null)
  const [editOpenId, setEditOpenId] = useState(null)
  const [editNombre, setEditNombre] = useState('')
  const [editFecha, setEditFecha] = useState('')
  const [editCupos, setEditCupos] = useState('')
  const [editPrecio, setEditPrecio] = useState('')
  const [editBusy, setEditBusy] = useState(false)
  const [editMsg, setEditMsg] = useState('')

  const reload = useCallback(async () => {
    const { rutas: nr, reservas: nv } = await fetchRutasBundle()
    setRutas(nr)
    setReservas(nv)
  }, [])

  const refreshSilent = useCallback(async () => {
    try {
      await reload()
      setError('')
    } catch (e) {
      console.warn('[rutas] realtime refresh', e)
    }
  }, [reload])

  useGestionRealtime(refreshSilent, 'rutas')

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
        setError(e?.message || 'No se pudieron cargar las rutas')
        setRutas([])
        setReservas([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [reload])

  async function handleRetry() {
    setLoading(true)
    try {
      await reload()
      setError('')
    } catch (e) {
      console.error(e)
      setError(e?.message || 'No se pudieron cargar las rutas')
      setRutas([])
      setReservas([])
    } finally {
      setLoading(false)
    }
  }

  async function crearRuta(e) {
    e.preventDefault()
    setCrearMsg('')
    const nombre = nfNombre.trim()
    const fecha = nfFecha.trim()
    const cupos = parseInt(String(nfCupos), 10)
    const precioEuros = parseFloat(String(nfPrecio).replace(',', '.'))

    if (!nombre || nombre.length < 2) {
      setCrearMsg('El nombre debe tener al menos 2 caracteres.')
      return
    }
    if (!fecha) {
      setCrearMsg('Selecciona una fecha.')
      return
    }
    if (!Number.isFinite(cupos) || cupos < 1 || cupos > 1000) {
      setCrearMsg('Los cupos deben estar entre 1 y 1000.')
      return
    }
    if (!Number.isFinite(precioEuros) || precioEuros < 0) {
      setCrearMsg('El precio en € debe ser un número ≥ 0.')
      return
    }

    setCrearBusy(true)
    try {
      let fotoUrl = null
      if (nfFile) {
        fotoUrl = await subirFotoRutaSiHay(nfFile, nombre)
        if (!fotoUrl) {
          setCrearMsg(
            'La foto no se pudo subir; la ruta se guardará sin imagen.',
          )
        }
      }

      const numero = siguienteNumeroRuta(rutas)
      const { error: insErr } = await supabase.from('rutas').insert({
        nombre,
        fecha,
        cupos,
        precio_euros: precioEuros,
        archivada: false,
        numero,
        foto_url: fotoUrl,
      })
      if (insErr) throw insErr

      setNfNombre('')
      setNfFecha('')
      setNfCupos('')
      setNfPrecio('')
      setNfFile(null)
      setCrearMsg('Ruta creada.')
      toast('Ruta creada correctamente.', 'success')
      await reload()
    } catch (e) {
      console.error(e)
      const msg = e?.message || 'Error al crear la ruta.'
      setCrearMsg(msg)
      toast(msg, 'error')
    } finally {
      setCrearBusy(false)
    }
  }

  async function archivarRuta(ruta) {
    if (ruta.archivada) {
      toast('Esta ruta ya está archivada.', 'info')
      return
    }
    const reservasRuta = reservas.filter((r) => getReservaRutaId(r) === ruta.id)
    const { count: partCount, error: cErr } = await supabase
      .from('participantes')
      .select('*', { count: 'exact', head: true })
      .eq('ruta_id', ruta.id)
    if (cErr) console.warn('[rutas] contar participantes', cErr)

    const numeroRuta = ruta.numero
      ? `#${String(ruta.numero).padStart(4, '0')}`
      : ''
    const fechaTxt = ruta.fecha ? formatRutaDateShort(ruta.fecha) : '—'
    const mensaje =
      `¿Archivar la ruta "${ruta.nombre}"?\n\n` +
      `${numeroRuta ? `• Número: ${numeroRuta}\n` : ''}` +
      `• Fecha: ${fechaTxt}\n` +
      `• Cupos: ${ruta.cupos}\n` +
      `• Reservas: ${reservasRuta.length}\n` +
      `• Participantes registrados: ${partCount ?? '—'}\n\n` +
      `La ruta pasará al historial y dejará de listarse aquí.`

    const ok = await confirm({
      title: 'Archivar ruta',
      message: mensaje,
      confirmLabel: 'Archivar',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return

    setArchivarBusyId(ruta.id)
    try {
      const { error: upErr } = await supabase
        .from('rutas')
        .update({ archivada: true })
        .eq('id', ruta.id)
      if (upErr) throw upErr
      await reload()
      toast('Ruta archivada.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'No se pudo archivar la ruta.', 'error')
    } finally {
      setArchivarBusyId(null)
    }
  }

  function openEditar(ruta) {
    setEditOpenId((cur) => (cur === ruta.id ? null : ruta.id))
    setEditMsg('')
    setEditNombre(String(ruta.nombre || ''))
    const f = ruta.fecha ? String(ruta.fecha).split('T')[0] : ''
    setEditFecha(f)
    setEditCupos(String(ruta.cupos ?? ''))
    setEditPrecio(String(ruta.precioEuros ?? ruta.precio_euros ?? ''))
  }

  async function guardarEdicionRuta(rutaId) {
    setEditMsg('')
    const nombre = editNombre.trim()
    const fecha = editFecha.trim()
    const cupos = parseInt(String(editCupos), 10)
    const precio = parseFloat(String(editPrecio).replace(',', '.'))
    if (!nombre || nombre.length < 2) {
      setEditMsg('Nombre inválido.')
      return
    }
    if (!fecha) {
      setEditMsg('Indica la fecha.')
      return
    }
    if (!Number.isFinite(cupos) || cupos < 1 || cupos > 1000) {
      setEditMsg('Cupos entre 1 y 1000.')
      return
    }
    if (!Number.isFinite(precio) || precio < 0) {
      setEditMsg('Precio € inválido.')
      return
    }
    setEditBusy(true)
    try {
      const { error: upErr } = await supabase
        .from('rutas')
        .update({
          nombre,
          fecha,
          cupos,
          precio_euros: precio,
        })
        .eq('id', rutaId)
      if (upErr) throw upErr
      setEditOpenId(null)
      await reload()
      toast('Ruta actualizada.', 'success')
    } catch (e) {
      console.error(e)
      setEditMsg(e?.message || 'Error al guardar.')
      toast(e?.message || 'Error al guardar.', 'error')
    } finally {
      setEditBusy(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rutas.filter((r) => {
      if (r.archivada) return false
      if (!q) return true
      const nombre = String(r.nombre || '').toLowerCase()
      const fecha = String(r.fecha || '')
      return nombre.includes(q) || fecha.includes(q)
    })
  }, [rutas, search])

  return (
    <section className="sa-page">
      <div className="sa-card mb-4 shadow-lg">
        <button
          type="button"
          onClick={() => setNuevaOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-extrabold text-white">
            <Plus className="h-4 w-4 shrink-0 text-emerald-400" strokeWidth={2} aria-hidden />
            Nueva ruta
          </span>
          {nuevaOpen ? (
            <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
          )}
        </button>
        {nuevaOpen ? (
          <form
            onSubmit={(ev) => void crearRuta(ev)}
            className="space-y-3 border-t border-white/10 px-4 pb-4 pt-2"
          >
            <input
              type="text"
              value={nfNombre}
              onChange={(e) => setNfNombre(e.target.value)}
              placeholder="Nombre de la ruta"
              className="sa-field py-2.5 text-base"
            />
            <input
              type="date"
              value={nfFecha}
              onChange={(e) => setNfFecha(e.target.value)}
              className="sa-field py-2.5 text-base"
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                max={1000}
                inputMode="numeric"
                value={nfCupos}
                onChange={(e) => setNfCupos(e.target.value)}
                placeholder="Cupos"
                className="sa-field py-2.5 text-base"
              />
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={nfPrecio}
                onChange={(e) => setNfPrecio(e.target.value)}
                placeholder="Precio € / cupo"
                className="sa-field py-2.5 text-base"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-slate-500">
                Flyer (opcional, bucket flyers)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) =>
                  setNfFile(e.target.files && e.target.files[0] ? e.target.files[0] : null)
                }
                className="w-full text-xs text-slate-400 file:mr-2 file:rounded-lg file:border-0 file:bg-emerald-500/20 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-emerald-200"
              />
            </div>
            <button
              type="submit"
              disabled={crearBusy}
              className="sa-btn-primary w-full py-2.5 disabled:opacity-60"
            >
              {crearBusy ? 'Guardando…' : 'Crear ruta'}
            </button>
            {crearMsg ? (
              <p className="m-0 text-center text-xs text-slate-400">{crearMsg}</p>
            ) : null}
          </form>
        ) : null}
      </div>

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar rutas..."
          className="sa-input-search"
        />
      </div>

      {loading ? (
        <p className="text-center text-sm text-slate-400">Cargando rutas…</p>
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

      {!loading && !error && filtered.length === 0 ? (
        <div className="sa-card p-10 text-center shadow-xl shadow-black/25">
          <div className="flex justify-center drop-shadow-md">
            <Mountain
              className="h-14 w-14 text-slate-500"
              strokeWidth={1.25}
              aria-hidden
            />
          </div>
          <h3 className="mt-3 text-lg font-extrabold tracking-tight text-white">
            No hay rutas que mostrar
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            {search.trim()
              ? 'Prueba otro criterio de búsqueda.'
              : 'No hay rutas activas o aún no hay datos en Supabase.'}
          </p>
        </div>
      ) : null}

      <ul className="flex list-none flex-col gap-4 p-0">
        {filtered.map((ruta) => {
          const cuposTot = Number(ruta.cupos) || 0
          const ocupados = cuposOcupadosEnRuta(ruta.id, reservas, ruta)
          const disponibles = cuposTot - ocupados
          const haySobreventa = ocupados > cuposTot && cuposTot > 0
          const pct =
            cuposTot > 0 ? Math.min(100, (ocupados / cuposTot) * 100) : 0
          const badgeClass = haySobreventa
            ? 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20'
            : disponibles > 5
              ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/25'
              : disponibles > 0
                ? 'bg-amber-500/15 text-amber-200 ring-1 ring-amber-400/20'
                : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-400/20'
          const badgeText = haySobreventa
            ? 'Sobrevendida'
            : disponibles > 0
              ? 'Activa'
              : 'Completa'

          const editando = editOpenId === ruta.id

          return (
            <li
              key={ruta.id}
              className="sa-card p-5 shadow-xl shadow-black/30 transition-[border-color,box-shadow] hover:border-teal-400/25 hover:shadow-teal-950/25"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="flex flex-wrap items-center gap-2 text-lg font-extrabold tracking-tight text-white">
                    <Mountain
                      className="h-5 w-5 shrink-0 text-teal-400/90 drop-shadow-sm"
                      strokeWidth={2}
                      aria-hidden
                    />
                    <span className="break-words">{ruta.nombre}</span>
                  </h2>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">
                    ID:{' '}
                    {ruta.numero != null
                      ? `#${String(ruta.numero).padStart(4, '0')}`
                      : 'N/A'}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                    <Calendar
                      className="h-4 w-4 shrink-0 text-slate-500"
                      strokeWidth={2}
                      aria-hidden
                    />
                    {formatRutaDate(ruta.fecha)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${badgeClass}`}
                >
                  {badgeText}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2.5 py-3.5 text-center">
                  <span
                    className={`block text-xl font-extrabold tabular-nums ${haySobreventa ? 'text-rose-400' : 'text-emerald-300'}`}
                  >
                    {ocupados}/{cuposTot || '—'}
                  </span>
                  <span className="mt-1 flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500">
                    Cupos
                    {haySobreventa ? (
                      <AlertTriangle
                        className="h-3.5 w-3.5 text-amber-400"
                        strokeWidth={2}
                        aria-hidden
                      />
                    ) : null}
                  </span>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2.5 py-3.5 text-center">
                  <span
                    className={`block text-xl font-extrabold tabular-nums ${haySobreventa ? 'text-rose-400' : disponibles > 0 ? 'text-teal-300' : 'text-slate-500'}`}
                  >
                    {haySobreventa ? `-${Math.abs(disponibles)}` : disponibles}
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-slate-500">
                    {haySobreventa ? 'Sobrevendidos' : 'Disponibles'}
                  </span>
                </div>
                <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2.5 py-3.5 text-center">
                  <span className="block text-xl font-extrabold tabular-nums text-emerald-300">
                    {Number(ruta.precioEuros) || 0}€
                  </span>
                  <span className="mt-1 block text-[11px] font-medium text-slate-500">
                    Precio ref.
                  </span>
                </div>
              </div>

              {cuposTot > 0 ? (
                <>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-black/40 ring-1 ring-white/[0.06]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-[width] duration-500 ease-out"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-right text-xs text-slate-500">
                    {Math.round(pct)}% ocupado
                  </p>
                </>
              ) : null}

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => openEditar(ruta)}
                  className="flex-1 rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-sm font-semibold text-slate-200 hover:bg-white/10"
                >
                  {editando ? (
                    'Cerrar edición'
                  ) : (
                    <span className="inline-flex items-center justify-center gap-2">
                      <Pencil className="h-4 w-4" strokeWidth={2} aria-hidden />
                      Editar
                    </span>
                  )}
                </button>
              </div>

              {editando ? (
                <div className="mt-3 space-y-2 rounded-xl border border-teal-500/25 bg-teal-950/15 p-3">
                  <input
                    type="text"
                    value={editNombre}
                    onChange={(e) => setEditNombre(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-base text-white outline-none focus:border-emerald-500/40"
                  />
                  <input
                    type="date"
                    value={editFecha}
                    onChange={(e) => setEditFecha(e.target.value)}
                    className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-base text-white outline-none focus:border-emerald-500/40"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      min={1}
                      max={1000}
                      value={editCupos}
                      onChange={(e) => setEditCupos(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-base text-white outline-none focus:border-emerald-500/40"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={editPrecio}
                      onChange={(e) => setEditPrecio(e.target.value)}
                      className="w-full rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-base text-white outline-none focus:border-emerald-500/40"
                    />
                  </div>
                  {editMsg ? (
                    <p className="text-xs text-amber-200/90">{editMsg}</p>
                  ) : null}
                  <button
                    type="button"
                    disabled={editBusy}
                    onClick={() => void guardarEdicionRuta(ruta.id)}
                    className="w-full rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-60"
                  >
                    {editBusy ? 'Guardando…' : 'Guardar cambios'}
                  </button>
                </div>
              ) : null}

              <div className="mt-4 border-t border-white/10 pt-3">
                <button
                  type="button"
                  disabled={archivarBusyId === ruta.id}
                  onClick={() => void archivarRuta(ruta)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/35 bg-rose-950/25 py-2.5 text-sm font-bold text-rose-100 transition-colors hover:bg-rose-950/40 disabled:opacity-50"
                >
                  {archivarBusyId === ruta.id ? (
                    'Archivando…'
                  ) : (
                    <>
                      <Archive className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                      Archivar ruta (ir al historial)
                    </>
                  )}
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-500">
        Crear, editar datos básicos y archivar rutas desde aquí. Cambios
        visibles en reservas, asistencia e historial vía Realtime.
      </p>
    </section>
  )
}
