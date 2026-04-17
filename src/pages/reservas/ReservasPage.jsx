import { ChevronDown, ChevronUp } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotify } from '../../context/NotifyContext.jsx'
import { useGestionRealtime } from '../../hooks/useGestionRealtime'
import { formatRutaDateShort } from '../../lib/formatDate'
import { mapRuta } from '../../lib/rutas'
import {
  calcularEurosRecibidos,
  calcularTotalesPorMoneda,
  countParticipantesReserva,
  cuposPagoTextClass,
  normalizeReservas,
  personasCuposTextClass,
  rankPagoCompletitud,
  saldoUsadoEnReserva,
} from '../../lib/reservaCalcs'
import { supabase } from '../../lib/supabase'
import { getCuposReserva, getReservaRutaId } from '../../lib/reservas'

async function fetchReservasBundle() {
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

function montoPagadoBsDesdePagos(pagos) {
  return (pagos || [])
    .filter((p) => !p.enDolares)
    .reduce((sum, p) => sum + (Number(p.monto) || 0), 0)
}

function sortReservasList(list) {
  return list.slice().sort((a, b) => {
    const totA = calcularTotalesPorMoneda(a)
    const totB = calcularTotalesPorMoneda(b)
    const totalA = getCuposReserva(a)
    const totalB = getCuposReserva(b)
    const rankA = rankPagoCompletitud(totA.cuposPagados, totalA)
    const rankB = rankPagoCompletitud(totB.cuposPagados, totalB)
    if (rankA !== rankB) return rankA - rankB
    return totB.cuposPagados - totA.cuposPagados
  })
}

export default function ReservasPage() {
  const { toast, confirm } = useNotify()
  const [rutas, setRutas] = useState([])
  const [reservas, setReservas] = useState([])
  const [participantes, setParticipantes] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filtroRutaId, setFiltroRutaId] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const [nuevaOpen, setNuevaOpen] = useState(false)
  const [nLider, setNLider] = useState('')
  const [nRutaId, setNRutaId] = useState('')
  const [nCantidad, setNCantidad] = useState('')
  const [nMonto, setNMonto] = useState('')
  const [nEnDolares, setNEnDolares] = useState(false)
  const [nCuposPago, setNCuposPago] = useState('1')
  const [nReferencia, setNReferencia] = useState('')
  const [nBusy, setNBusy] = useState(false)
  const [nMsg, setNMsg] = useState('')

  const [cuposEdit, setCuposEdit] = useState('')
  const [cuposBusy, setCuposBusy] = useState(false)

  const [payTipo, setPayTipo] = useState('bs')
  const [payMonto, setPayMonto] = useState('')
  const [payCupos, setPayCupos] = useState('1')
  const [payRef, setPayRef] = useState('')
  const [payBusy, setPayBusy] = useState(false)

  const [delBusyId, setDelBusyId] = useState(null)

  const reload = useCallback(async () => {
    const bundle = await fetchReservasBundle()
    setRutas(bundle.rutas)
    setReservas(bundle.reservas)
    setParticipantes(bundle.participantes)
  }, [])

  const refreshSilent = useCallback(async () => {
    try {
      await reload()
      setError('')
    } catch (e) {
      console.warn('[reservas] realtime refresh', e)
    }
  }, [reload])

  useGestionRealtime(refreshSilent, 'reservas')

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
        setError(e?.message || 'No se pudieron cargar las reservas')
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

  async function handleRetry() {
    setLoading(true)
    try {
      await reload()
      setError('')
    } catch (e) {
      console.error(e)
      setError(e?.message || 'No se pudieron cargar las reservas')
    } finally {
      setLoading(false)
    }
  }

  async function crearNuevaReserva(e) {
    e.preventDefault()
    setNMsg('')
    const lider = nLider.trim()
    const rutaId = nRutaId
    const cantidad = parseInt(String(nCantidad), 10)
    const monto = parseFloat(String(nMonto).replace(',', '.')) || 0

    if (!lider || lider.length < 2) {
      setNMsg('Indica el nombre del líder.')
      return
    }
    if (!rutaId) {
      setNMsg('Selecciona una ruta.')
      return
    }
    if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > 500) {
      setNMsg('Cupos reservados entre 1 y 500.')
      return
    }

    const ruta = rutas.find((rt) => rt.id === rutaId)
    if (!ruta || ruta.archivada) {
      setNMsg('Ruta no válida.')
      return
    }

    const dup = reservas.some(
      (rv) =>
        String(rv.lider || '').trim().toLowerCase() === lider.toLowerCase() &&
        getReservaRutaId(rv) === rutaId,
    )
    if (dup) {
      setNMsg('Ya existe una reserva de ese líder en esa ruta.')
      return
    }

    setNBusy(true)
    try {
      const pagosIniciales = []
      let montoPagadoBs = 0
      if (monto > 0) {
        const cuposIni = parseInt(String(nCuposPago), 10)
        const cuposPagados = nEnDolares
          ? 0
          : Number.isFinite(cuposIni) && cuposIni >= 1
            ? cuposIni
            : 1
        pagosIniciales.push({
          monto,
          referencia: nReferencia.trim() || 'Pago inicial',
          fecha: new Date().toISOString(),
          enDolares: nEnDolares,
          cuposPagados,
        })
        if (!nEnDolares) montoPagadoBs = monto
      }

      const { data: nueva, error: insErr } = await supabase
        .from('reservas')
        .insert({
          lider,
          ruta_id: rutaId,
          cantidad,
          monto_pagado: montoPagadoBs,
          pagos: pagosIniciales,
          abonado_euros: null,
          pagado_con_abono: false,
        })
        .select()
        .single()
      if (insErr) throw insErr

      const liderExiste = participantes.some(
        (p) =>
          String(p.nombre || '').trim().toLowerCase() === lider.toLowerCase() &&
          p.lider === lider &&
          (p.rutaId === rutaId || p.ruta_id === rutaId),
      )
      if (!liderExiste) {
        const { error: pErr } = await supabase.from('participantes').insert({
          nombre: lider,
          lider,
          ruta_id: rutaId,
          ruta_nombre: ruta.nombre,
          asiste: false,
        })
        if (pErr) throw pErr
      }

      setNLider('')
      setNRutaId('')
      setNCantidad('')
      setNMonto('')
      setNEnDolares(false)
      setNCuposPago('1')
      setNReferencia('')
      setNMsg('Reserva creada.')
      toast('Reserva creada. Líder registrado en participantes si faltaba.', 'success')
      await reload()
      if (nueva?.id) setExpandedId(nueva.id)
    } catch (e) {
      console.error(e)
      const msg = e?.message || 'Error al crear la reserva.'
      setNMsg(msg)
      toast(msg, 'error')
    } finally {
      setNBusy(false)
    }
  }

  async function guardarCuposReserva(reserva) {
    const n = parseInt(String(cuposEdit), 10)
    if (!Number.isFinite(n) || n < 1 || n > 500) {
      toast('Cupos entre 1 y 500.', 'error')
      return
    }
    setCuposBusy(true)
    try {
      const { error: upErr } = await supabase
        .from('reservas')
        .update({ cantidad: n })
        .eq('id', reserva.id)
      if (upErr) throw upErr
      await reload()
      setCuposEdit(String(n))
      toast('Cupos de la reserva actualizados.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Error al actualizar cupos.', 'error')
    } finally {
      setCuposBusy(false)
    }
  }

  async function registrarPago(reserva) {
    const monto = parseFloat(String(payMonto).replace(',', '.'))
    if (!Number.isFinite(monto) || monto < 0) {
      toast('Indica un monto válido.', 'error')
      return
    }
    const enDolares = payTipo === 'usd'
    const cupos = parseInt(String(payCupos), 10) || 0
    const referencia = payRef.trim()

    setPayBusy(true)
    try {
      const pagosActuales = [...(reserva.pagos || [])]
      pagosActuales.push({
        monto,
        referencia: referencia || (enDolares ? 'Pago USD' : 'Pago Bs'),
        fecha: new Date().toISOString(),
        enDolares,
        cuposPagados: enDolares ? 0 : cupos,
      })
      const montoPagadoBs = montoPagadoBsDesdePagos(pagosActuales)
      const { error: upErr } = await supabase
        .from('reservas')
        .update({ pagos: pagosActuales, monto_pagado: montoPagadoBs })
        .eq('id', reserva.id)
      if (upErr) throw upErr
      setPayMonto('')
      setPayCupos('1')
      setPayRef('')
      await reload()
      toast('Pago registrado.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Error al registrar el pago.', 'error')
    } finally {
      setPayBusy(false)
    }
  }

  async function eliminarReserva(reserva) {
    const ruta = rutas.find((rt) => rt.id === reserva.rutaId)
    const rutaNombre = ruta?.nombre || reserva.ruta || '—'
    const nPart = countParticipantesReserva(
      participantes,
      reserva.lider,
      reserva.rutaId,
    )
    const ok = await confirm({
      title: 'Eliminar reserva',
      message:
        `¿Eliminar la reserva de "${reserva.lider}"?\n\n` +
        `• Ruta: ${rutaNombre}\n` +
        `• Cupos: ${getCuposReserva(reserva)}\n` +
        `• Personas en lista: ${nPart}\n\n` +
        `Se borrarán participantes de este líder en esta ruta y la reserva. No se puede deshacer.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    const rutaId = reserva.rutaId
    const lider = reserva.lider
    setDelBusyId(reserva.id)
    try {
      const { error: d1 } = await supabase
        .from('participantes')
        .delete()
        .eq('lider', lider)
        .eq('ruta_id', rutaId)
      if (d1) throw d1
      const { error: d2 } = await supabase.from('reservas').delete().eq('id', reserva.id)
      if (d2) throw d2
      setExpandedId(null)
      await reload()
      toast('Reserva eliminada.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Error al eliminar.', 'error')
    } finally {
      setDelBusyId(null)
    }
  }

  const rutasActivas = useMemo(
    () => rutas.filter((r) => !r.archivada),
    [rutas],
  )

  const listaFiltrada = useMemo(() => {
    const q = search.trim().toLowerCase()
    let filtered = reservas.filter((r) => {
      const ruta = rutas.find((rt) => rt.id === r.rutaId)
      if (!ruta || ruta.archivada) return false
      const nombreRuta = r.ruta || ruta.nombre || ''
      if (!q) return true
      return (
        String(r.lider || '')
          .toLowerCase()
          .includes(q) || nombreRuta.toLowerCase().includes(q)
      )
    })
    if (filtroRutaId) {
      filtered = filtered.filter((r) => r.rutaId === filtroRutaId)
    }
    return sortReservasList(filtered)
  }, [reservas, rutas, search, filtroRutaId])

  return (
    <section className="sa-page">
      <div className="sa-card mb-4 shadow-lg">
        <button
          type="button"
          onClick={() => setNuevaOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="text-sm font-extrabold text-white">
            ➕ Nueva reserva
          </span>
          {nuevaOpen ? (
            <ChevronUp className="h-5 w-5 shrink-0 text-slate-400" />
          ) : (
            <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
          )}
        </button>
        {nuevaOpen ? (
          <form
            onSubmit={(ev) => void crearNuevaReserva(ev)}
            className="space-y-3 border-t border-white/10 px-4 pb-4 pt-2"
          >
            <input
              type="text"
              value={nLider}
              onChange={(e) => setNLider(e.target.value)}
              placeholder="Líder (nombre)"
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
            />
            <select
              value={nRutaId}
              onChange={(e) => setNRutaId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white outline-none focus:border-emerald-500/40"
            >
              <option value="">Ruta</option>
              {rutasActivas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                  {r.fecha ? ` · ${formatRutaDateShort(r.fecha)}` : ''}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={500}
              inputMode="numeric"
              value={nCantidad}
              onChange={(e) => setNCantidad(e.target.value)}
              placeholder="Cupos reservados"
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
            />
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <p className="m-0 text-[11px] font-medium text-slate-400">
                Pago inicial (opcional)
              </p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="nueva-en-dolares"
                  type="checkbox"
                  checked={nEnDolares}
                  onChange={(e) => setNEnDolares(e.target.checked)}
                  className="rounded border-white/20"
                />
                <label htmlFor="nueva-en-dolares" className="text-xs text-slate-300">
                  Monto en USD (efectivo)
                </label>
              </div>
              <input
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={nMonto}
                onChange={(e) => setNMonto(e.target.value)}
                placeholder={nEnDolares ? 'Monto USD' : 'Monto Bs'}
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
              />
              {!nEnDolares ? (
                <input
                  type="number"
                  min={1}
                  inputMode="numeric"
                  value={nCuposPago}
                  onChange={(e) => setNCuposPago(e.target.value)}
                  placeholder="Cupos que cubre el pago (Bs)"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
                />
              ) : null}
              <input
                type="text"
                value={nReferencia}
                onChange={(e) => setNReferencia(e.target.value)}
                placeholder="Referencia / nota"
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={nBusy}
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-2.5 text-sm font-bold text-white shadow-lg disabled:opacity-60"
            >
              {nBusy ? 'Guardando…' : 'Crear reserva'}
            </button>
            {nMsg ? (
              <p className="m-0 text-center text-xs text-slate-400">{nMsg}</p>
            ) : null}
          </form>
        ) : null}
      </div>

      <div className="mb-4 flex flex-col gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar reservas..."
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
        <p className="text-center text-sm text-slate-400">Cargando reservas…</p>
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
          <div className="text-4xl drop-shadow-md">🎫</div>
          <h3 className="mt-3 text-lg font-extrabold tracking-tight text-white">
            No hay reservas
          </h3>
          <p className="mt-2 text-sm text-slate-400">
            {search.trim() || filtroRutaId
              ? 'Prueba otro filtro o búsqueda.'
              : 'Crea una reserva arriba o desde otra herramienta.'}
          </p>
        </div>
      ) : null}

      <ul className="flex list-none flex-col gap-4 p-0">
        {!loading &&
          !error &&
          listaFiltrada.map((reserva) => {
            const ruta = rutas.find((rt) => rt.id === reserva.rutaId)
            if (!ruta) return null
            const cuposReserva = getCuposReserva(reserva)
            const registrados = countParticipantesReserva(
              participantes,
              reserva.lider,
              reserva.rutaId,
            )
            const { totalBs, totalDolares, cuposPagados } =
              calcularTotalesPorMoneda(reserva)
            const eurosRecibidos = calcularEurosRecibidos(reserva, ruta)
            const eurosEsperados = cuposReserva * Number(ruta.precioEuros || 0)
            const precioEuros = Number(ruta.precioEuros || 0)
            const saldoUsado = saldoUsadoEnReserva(reserva)
            const tienePagos =
              totalBs > 0 || totalDolares > 0 || saldoUsado > 0
            const numPagos = reserva.pagos?.length || 0
            const expandida = expandedId === reserva.id
            const haySobrePersonas = registrados > cuposReserva

            return (
              <li
                key={reserva.id}
                className="sa-card shadow-xl shadow-black/30"
              >
                <div className="p-5">
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-lg font-extrabold tracking-tight text-white">
                        👤 {reserva.lider}
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        📍 {ruta.nombre}
                        {ruta.fecha
                          ? ` · ${formatRutaDateShort(ruta.fecha)}`
                          : ''}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-400">
                        <span
                          className={cuposPagoTextClass(
                            cuposPagados,
                            cuposReserva,
                          )}
                          title="Cupos pagados / reservados · € recibidos / esperados"
                        >
                          📊 {cuposPagados}/{cuposReserva} ({eurosRecibidos}€/
                          {eurosEsperados}€)
                        </span>
                        {tienePagos ? (
                          <span className="text-slate-300">
                            💰{' '}
                            {totalBs > 0 || totalDolares > 0
                              ? `Bs ${totalBs.toLocaleString('es-ES')}${
                                  totalDolares > 0
                                    ? ` + $${totalDolares.toLocaleString('es-ES')}`
                                    : ''
                                }`
                              : ''}
                            {saldoUsado > 0
                              ? `${totalBs > 0 || totalDolares > 0 ? ' + ' : ''}€${saldoUsado % 1 === 0 ? saldoUsado : saldoUsado.toFixed(2)} saldo`
                              : totalBs === 0 && totalDolares === 0
                                ? `€${saldoUsado % 1 === 0 ? saldoUsado : saldoUsado.toFixed(2)} saldo`
                                : ''}
                          </span>
                        ) : (
                          <span className="text-slate-500">Sin pagos</span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (expandida) {
                          setExpandedId(null)
                        } else {
                          setPayMonto('')
                          setPayCupos('1')
                          setPayRef('')
                          setPayTipo('bs')
                          setCuposEdit(String(getCuposReserva(reserva)))
                          setExpandedId(reserva.id)
                        }
                      }}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                      aria-expanded={expandida}
                      title={expandida ? 'Ocultar detalle' : 'Ver detalle'}
                    >
                      {expandida ? (
                        <ChevronUp className="h-5 w-5" />
                      ) : (
                        <ChevronDown className="h-5 w-5" />
                      )}
                    </button>
                  </div>

                  {expandida ? (
                    <div className="mt-4 border-t border-white/10 pt-4">
                      <div className="grid grid-cols-3 gap-2.5">
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2 py-3 text-center">
                          <span className="block text-lg font-extrabold text-white">
                            {cuposReserva}
                          </span>
                          <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                            Cupos
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2 py-3 text-center">
                          <span className="block text-lg font-extrabold text-emerald-300">
                            {precioEuros}€
                          </span>
                          <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                            Precio ref.
                          </span>
                        </div>
                        <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2 py-3 text-center">
                          <span
                            className={`block text-lg font-extrabold tabular-nums ${personasCuposTextClass(registrados, cuposReserva)}`}
                          >
                            {registrados}/{cuposReserva}
                            {haySobrePersonas ? ' ⚠️' : ''}
                          </span>
                          <span className="mt-0.5 block text-[10px] font-medium text-slate-500">
                            {haySobrePersonas
                              ? 'Sobrevendidos'
                              : registrados === cuposReserva
                                ? 'Completo'
                                : registrados === 0
                                  ? 'Personas'
                                  : `Faltan ${cuposReserva - registrados}`}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                        <p className="m-0 text-xs font-bold text-slate-300">
                          Cupos reservados (cantidad)
                        </p>
                        <div className="mt-2 flex gap-2">
                          <input
                            type="number"
                            min={1}
                            max={500}
                            value={cuposEdit}
                            onChange={(e) => setCuposEdit(e.target.value)}
                            className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
                          />
                          <button
                            type="button"
                            disabled={cuposBusy}
                            onClick={() => void guardarCuposReserva(reserva)}
                            className="shrink-0 rounded-lg bg-emerald-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                          >
                            {cuposBusy ? '…' : 'Guardar'}
                          </button>
                        </div>
                      </div>

                      {tienePagos ? (
                        <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3">
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                            {totalBs > 0 ? (
                              <div>
                                <div className="text-[11px] text-slate-400">
                                  Bs
                                </div>
                                <div className="text-base font-extrabold text-emerald-300">
                                  Bs {totalBs.toLocaleString('es-ES')}
                                </div>
                              </div>
                            ) : null}
                            {totalDolares > 0 ? (
                              <div>
                                <div className="text-[11px] text-slate-400">
                                  USD
                                </div>
                                <div className="text-base font-extrabold text-amber-300">
                                  ${totalDolares.toLocaleString('es-ES')}
                                </div>
                              </div>
                            ) : null}
                            {saldoUsado > 0 ? (
                              <div>
                                <div className="text-[11px] text-slate-400">
                                  Saldo €
                                </div>
                                <div className="text-base font-extrabold text-cyan-300">
                                  €
                                  {saldoUsado % 1 === 0
                                    ? saldoUsado
                                    : saldoUsado.toFixed(2)}
                                </div>
                              </div>
                            ) : null}
                          </div>
                          {numPagos > 0 ? (
                            <p className="mt-2 text-right text-[11px] text-slate-500">
                              {numPagos} pago{numPagos !== 1 ? 's' : ''}{' '}
                              registrado
                              {numPagos !== 1 ? 's' : ''}
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {reserva.pagos?.length > 0 ? (
                        <div className="mt-3">
                          <p className="m-0 text-xs font-bold text-slate-400">
                            Pagos registrados
                          </p>
                          <ul className="mt-2 max-h-32 list-none space-y-1 overflow-y-auto p-0 text-[11px] text-slate-300">
                            {reserva.pagos.map((pago, idx) => (
                              <li
                                key={`${reserva.id}-p-${idx}`}
                                className="rounded border border-white/[0.06] bg-black/20 px-2 py-1.5"
                              >
                                {pago.enDolares ? '$' : 'Bs'}{' '}
                                {Number(pago.monto || 0).toLocaleString('es-ES')}{' '}
                                · cupos {pago.cuposPagados ?? 0} ·{' '}
                                {(pago.referencia || '').slice(0, 40)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      <div className="mt-4 rounded-xl border border-teal-500/20 bg-teal-950/20 p-3">
                        <p className="m-0 text-xs font-bold text-teal-200/90">
                          Añadir pago
                        </p>
                        <div className="mt-2 flex gap-3 text-xs">
                          <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
                            <input
                              type="radio"
                              name={`pay-${reserva.id}`}
                              checked={payTipo === 'bs'}
                              onChange={() => setPayTipo('bs')}
                            />
                            Bs
                          </label>
                          <label className="flex cursor-pointer items-center gap-1.5 text-slate-300">
                            <input
                              type="radio"
                              name={`pay-${reserva.id}`}
                              checked={payTipo === 'usd'}
                              onChange={() => setPayTipo('usd')}
                            />
                            USD
                          </label>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={payMonto}
                          onChange={(e) => setPayMonto(e.target.value)}
                          placeholder={payTipo === 'bs' ? 'Monto Bs' : 'Monto USD'}
                          className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
                        />
                        {payTipo === 'bs' ? (
                          <input
                            type="number"
                            min={0}
                            value={payCupos}
                            onChange={(e) => setPayCupos(e.target.value)}
                            placeholder="Cupos pagados (Bs)"
                            className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
                          />
                        ) : null}
                        <input
                          type="text"
                          value={payRef}
                          onChange={(e) => setPayRef(e.target.value)}
                          placeholder="Referencia"
                          className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-sm text-white outline-none"
                        />
                        <button
                          type="button"
                          disabled={payBusy}
                          onClick={() => void registrarPago(reserva)}
                          className="mt-2 w-full rounded-lg bg-gradient-to-r from-teal-600 to-emerald-600 py-2 text-xs font-bold text-white disabled:opacity-60"
                        >
                          {payBusy ? 'Guardando…' : 'Registrar pago'}
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={delBusyId === reserva.id}
                        onClick={() => void eliminarReserva(reserva)}
                        className="mt-4 w-full rounded-xl border border-rose-500/35 bg-rose-950/25 py-2.5 text-sm font-bold text-rose-100 disabled:opacity-50"
                      >
                        {delBusyId === reserva.id
                          ? 'Eliminando…'
                          : '🗑️ Eliminar reserva'}
                      </button>

                      <p className="mt-3 text-center text-[10px] leading-relaxed text-slate-500">
                        Pago con saldo abonado (€) y WhatsApp siguen en la app
                        HTML si los necesitas.
                      </p>
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
      </ul>
    </section>
  )
}
