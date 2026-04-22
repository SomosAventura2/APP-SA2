import {
  AlertTriangle,
  Banknote,
  BarChart3,
  ChevronDown,
  ChevronUp,
  Coins,
  CreditCard,
  MapPin,
  Pencil,
  Plus,
  Ticket,
  Trash2,
  User,
  UserPlus,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  SA_MODAL_BTN_CLOSE,
  SA_MODAL_PANEL_COMPACT,
  SA_MODAL_PANEL_SCROLL,
  saModalBackdropClass,
} from '../../lib/saModalLayout'
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
  const [rutasRes, reservasRes, participantesRes, abonadosRes] =
    await Promise.all([
      supabase.from('rutas').select('*').order('fecha', { ascending: true }),
      supabase.from('reservas').select('*'),
      supabase.from('participantes').select('*'),
      supabase.from('abonados').select('*').order('saldo_euros', { ascending: false }),
    ])
  if (rutasRes.error) throw rutasRes.error
  if (reservasRes.error) throw reservasRes.error
  if (participantesRes.error) throw participantesRes.error
  if (abonadosRes.error) throw abonadosRes.error
  const rutas = (rutasRes.data || []).map(mapRuta)
  const reservas = normalizeReservas(reservasRes.data || [], rutas)
  return {
    rutas,
    reservas,
    participantes: participantesRes.data || [],
    abonados: abonadosRes.data || [],
  }
}

function normalizarNombreAbonado(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Abonado cuyo `lider` coincide (normalizado) con el texto del formulario. */
function abonadoCoincidenteConLider(liderForm, abonadosList) {
  const key = normalizarNombreAbonado(liderForm)
  if (!key) return null
  return (
    (abonadosList || []).find(
      (a) => normalizarNombreAbonado(a.lider) === key,
    ) ?? null
  )
}

/**
 * Descuenta saldo del abonado y registra movimiento (misma idea que app HTML).
 * @param {{ liderDb: string, montoEuros: number, descripcion: string, referencia: string | null, ruta_id: string, reserva_id: string }} p
 */
async function registrarUsoSaldoAbono(p) {
  const { liderDb, montoEuros, descripcion, referencia, ruta_id, reserva_id } = p
  if (!(montoEuros > 0)) return { saldoDespues: null }

  const { data: abonado, error: errAb } = await supabase
    .from('abonados')
    .select('*')
    .eq('lider', liderDb)
    .maybeSingle()
  if (errAb) throw errAb
  if (!abonado) throw new Error('No se encontró el abonado para descontar saldo.')

  const saldoAntes = parseFloat(abonado.saldo_euros || 0)
  if (saldoAntes < montoEuros) {
    throw new Error(
      `Saldo insuficiente (disponible €${saldoAntes.toFixed(2)}, se pidieron €${montoEuros.toFixed(2)}).`,
    )
  }
  const saldoDespues = saldoAntes - montoEuros

  const { error: upErr } = await supabase
    .from('abonados')
    .update({
      saldo_euros: saldoDespues,
      ultima_actualizacion: new Date().toISOString(),
    })
    .eq('id', abonado.id)
  if (upErr) throw upErr

  const movRow = {
    abonado_id: abonado.id,
    tipo: 'uso',
    monto_euros: montoEuros,
    saldo_antes: saldoAntes,
    saldo_despues: saldoDespues,
    descripcion: descripcion || null,
    referencia: referencia || null,
    usuario: 'admin',
    fecha: new Date().toISOString(),
  }
  if (ruta_id) movRow.ruta_id = ruta_id
  if (reserva_id) movRow.reserva_id = reserva_id

  const { error: movErr } = await supabase.from('movimientos_abonos').insert(movRow)
  if (movErr) throw movErr

  if (saldoDespues <= 0 && abonado.id) {
    await supabase.from('abonados').delete().eq('id', abonado.id)
  }

  return { saldoDespues }
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

/** Resumen tipo app HTML (modal de pagos). */
function resumenPagosParaModal(reserva, ruta) {
  const { totalBs, totalDolares, cuposPagados } = calcularTotalesPorMoneda(reserva)
  const precioCupo = ruta ? Number(ruta.precioEuros || 0) : 0
  const cuposReservados = getCuposReserva(reserva)
  const eurosRecibidos = cuposPagados * precioCupo
  const eurosEsperados = cuposReservados * precioCupo
  const pendiente = eurosEsperados - eurosRecibidos
  const porcentaje =
    cuposReservados > 0
      ? Math.min(100, (cuposPagados / cuposReservados) * 100)
      : 0
  return {
    totalBs,
    totalDolares,
    cuposPagados,
    precioCupo,
    cuposReservados,
    eurosRecibidos,
    eurosEsperados,
    pendiente,
    porcentaje,
  }
}

export default function ReservasPage() {
  const { toast, confirm } = useNotify()
  const [rutas, setRutas] = useState([])
  const [reservas, setReservas] = useState([])
  const [participantes, setParticipantes] = useState([])
  const [abonados, setAbonados] = useState([])
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
  const [personasTemp, setPersonasTemp] = useState([])
  const [nPersonaNombre, setNPersonaNombre] = useState('')
  const [nCuposUsdIni, setNCuposUsdIni] = useState('0')
  const [nSaldoConsumir, setNSaldoConsumir] = useState('')

  const [editOpen, setEditOpen] = useState(false)
  const [editReserva, setEditReserva] = useState(null)
  const [editLider, setEditLider] = useState('')
  const [editCantidad, setEditCantidad] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const [quickAddReservaId, setQuickAddReservaId] = useState(null)
  const [quickAddNombre, setQuickAddNombre] = useState('')
  const [quickAddBusy, setQuickAddBusy] = useState(false)

  const [pagosModalId, setPagosModalId] = useState(null)
  const [delPagoBusy, setDelPagoBusy] = useState(null)

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
    setAbonados(bundle.abonados)
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
    if (pagosModalId && !reservas.some((r) => r.id === pagosModalId)) {
      setPagosModalId(null)
    }
  }, [pagosModalId, reservas])

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
        setAbonados([])
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

  function agregarPersonaTemporal() {
    const nombre = nPersonaNombre.trim()
    const lider = nLider.trim()
    const cantidad = parseInt(String(nCantidad), 10) || 0
    if (!nombre) {
      toast('Escribe el nombre de la persona.', 'info')
      return
    }
    if (!lider) {
      toast('Primero indica el líder.', 'info')
      return
    }
    if (nombre.toLowerCase() === lider.toLowerCase()) {
      toast('El líder se registra al crear la reserva.', 'info')
      setNPersonaNombre('')
      return
    }
    if (
      personasTemp.some((n) => n.toLowerCase() === nombre.toLowerCase())
    ) {
      toast('Esa persona ya está en la lista.', 'info')
      return
    }
    const totalPersonas = personasTemp.length + 1
    if (cantidad > 0 && totalPersonas >= cantidad) {
      toast(
        `Cupos reservados: ${cantidad}. El líder cuenta como 1. No puedes añadir más nombres sin sobreventa.`,
        'info',
      )
      return
    }
    setPersonasTemp((prev) => [...prev, nombre])
    setNPersonaNombre('')
  }

  async function crearNuevaReserva(e) {
    e.preventDefault()
    setNMsg('')
    const lider = nLider.trim()
    const rutaId = nRutaId
    const cantidad = parseInt(String(nCantidad), 10)
    const monto = parseFloat(String(nMonto).replace(',', '.')) || 0

    const partesLider = lider.split(/\s+/).filter(Boolean)
    if (!lider || partesLider.length < 2) {
      setNMsg('Indica nombre y apellido del líder.')
      return
    }
    if (!rutaId) {
      setNMsg('Selecciona una ruta.')
      return
    }
    if (!Number.isFinite(cantidad) || cantidad < 0 || cantidad > 500) {
      setNMsg('Cupos reservados entre 0 y 500.')
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

    const totalPersonas = personasTemp.length + 1
    if (cantidad > 0 && totalPersonas > cantidad) {
      const ok = await confirm({
        title: 'Sobreventa de nombres',
        message:
          `Hay ${totalPersonas} personas (líder + lista) y solo ${cantidad} cupos reservados.\n\n` +
          '¿Crear la reserva igualmente?',
        confirmLabel: 'Sí, crear',
        cancelLabel: 'Cancelar',
        danger: true,
      })
      if (!ok) return
    }

    const precioCupo = Number(ruta.precioEuros || 0)
    const abonLider = abonadoCoincidenteConLider(lider, abonados)
    const saldoPedido = parseFloat(String(nSaldoConsumir).replace(',', '.')) || 0
    let saldoUsar = 0
    if (saldoPedido > 0) {
      if (!abonLider) {
        setNMsg('No hay un abonado con el mismo nombre que el líder.')
        return
      }
      const saldoDisponible =
        parseFloat(String(abonLider.saldo_euros || 0)) || 0
      if (saldoPedido > saldoDisponible + 1e-9) {
        setNMsg(
          `Saldo insuficiente. Disponible: €${saldoDisponible.toFixed(2)}; indicaste €${saldoPedido.toFixed(2)}.`,
        )
        return
      }
      const maxPorCupos =
        cantidad > 0 && precioCupo > 0 ? cantidad * precioCupo : null
      if (maxPorCupos != null && saldoPedido - maxPorCupos > 1e-9) {
        setNMsg(
          `Con ${cantidad} cupo(s) a €${precioCupo}/cupo el máximo en saldo es €${maxPorCupos.toFixed(2)}.`,
        )
        return
      }
      saldoUsar = saldoPedido
    }

    setNBusy(true)
    let nuevaId = null
    try {
      const pagosIniciales = []
      let montoPagadoBs = 0
      if (monto > 0) {
        const cuposIniBs = parseInt(String(nCuposPago), 10)
        const cuposIniUsd = parseInt(String(nCuposUsdIni), 10)
        const cuposPagados = nEnDolares
          ? Number.isFinite(cuposIniUsd) && cuposIniUsd >= 0
            ? cuposIniUsd
            : 0
          : Number.isFinite(cuposIniBs) && cuposIniBs >= 0
            ? cuposIniBs
            : 0
        pagosIniciales.push({
          monto,
          referencia: nReferencia.trim() || 'Pago inicial',
          fecha: new Date().toISOString(),
          enDolares: nEnDolares,
          cuposPagados,
        })
        if (!nEnDolares) montoPagadoBs = monto
      }

      if (saldoUsar > 0) {
        const cuposSaldo =
          precioCupo > 0 ? saldoUsar / precioCupo : 0
        pagosIniciales.push({
          monto: 0,
          cuposPagados: cuposSaldo,
          enDolares: false,
          saldo_usado: saldoUsar,
          referencia: nReferencia.trim() || 'Pago con saldo €',
          fecha: new Date().toISOString(),
        })
      }

      const { data: nueva, error: insErr } = await supabase
        .from('reservas')
        .insert({
          lider,
          ruta_id: rutaId,
          cantidad,
          monto_pagado: montoPagadoBs,
          pagos: pagosIniciales,
          abonado_euros: saldoUsar > 0 ? saldoUsar : null,
          pagado_con_abono: saldoUsar > 0,
        })
        .select()
        .single()
      if (insErr) throw insErr
      nuevaId = nueva?.id ?? null

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

      const participantesInsert = personasTemp
        .filter((nombre) => {
          const existe = participantes.some(
            (p) =>
              String(p.nombre || '').trim().toLowerCase() ===
                nombre.toLowerCase() &&
              p.lider === lider &&
              (p.rutaId === rutaId || p.ruta_id === rutaId),
          )
          return !existe
        })
        .map((nombre) => ({
          nombre,
          lider,
          ruta_id: rutaId,
          ruta_nombre: ruta.nombre,
          asiste: false,
        }))
      if (participantesInsert.length > 0) {
        const { error: ptErr } = await supabase
          .from('participantes')
          .insert(participantesInsert)
        if (ptErr) throw ptErr
      }

      if (saldoUsar > 0 && abonLider) {
        await registrarUsoSaldoAbono({
          liderDb: abonLider.lider,
          montoEuros: saldoUsar,
          descripcion: 'Pago al crear reserva',
          referencia: nReferencia.trim() || null,
          ruta_id: rutaId,
          reserva_id: nueva.id,
        })
      }

      setNLider('')
      setNRutaId('')
      setNCantidad('')
      setNMonto('')
      setNEnDolares(false)
      setNCuposPago('1')
      setNCuposUsdIni('0')
      setNReferencia('')
      setNSaldoConsumir('')
      setPersonasTemp([])
      setNPersonaNombre('')
      setNMsg('Reserva creada.')
      toast(
        saldoUsar > 0
          ? 'Reserva creada con uso de saldo €. Líder y personas en participantes.'
          : 'Reserva creada. Líder y personas agregadas en participantes.',
        'success',
      )
      await reload()
      if (nueva?.id) setExpandedId(nueva.id)
    } catch (e) {
      console.error(e)
      if (nuevaId) {
        try {
          await supabase
            .from('participantes')
            .delete()
            .eq('lider', lider)
            .eq('ruta_id', rutaId)
          await supabase.from('reservas').delete().eq('id', nuevaId)
        } catch (rb) {
          console.error('[reservas] rollback crear', rb)
        }
      }
      const msg = e?.message || 'Error al crear la reserva.'
      setNMsg(msg)
      toast(msg, 'error')
    } finally {
      setNBusy(false)
    }
  }

  async function registrarPago(reserva) {
    const monto = parseFloat(String(payMonto).replace(',', '.'))
    if (!Number.isFinite(monto) || monto < 0) {
      toast('Indica un monto válido.', 'error')
      return
    }
    const enDolares = payTipo === 'usd'
    const cupos = Math.max(0, parseInt(String(payCupos), 10) || 0)
    const referencia = payRef.trim()

    setPayBusy(true)
    try {
      const pagosActuales = [...(reserva.pagos || [])]
      pagosActuales.push({
        monto,
        referencia: referencia || (enDolares ? 'Pago USD' : 'Pago Bs'),
        fecha: new Date().toISOString(),
        enDolares,
        cuposPagados: cupos,
      })
      const montoPagadoBs = montoPagadoBsDesdePagos(pagosActuales)
      const { error: upErr } = await supabase
        .from('reservas')
        .update({ pagos: pagosActuales, monto_pagado: montoPagadoBs })
        .eq('id', reserva.id)
      if (upErr) throw upErr
      setPayMonto('')
      setPayCupos(enDolares ? '0' : '1')
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

  async function eliminarPagoAtIndex(reservaId, index) {
    const reserva = reservas.find((r) => r.id === reservaId)
    if (!reserva) return
    const pagosActuales = Array.isArray(reserva.pagos) ? [...reserva.pagos] : []
    if (index < 0 || index >= pagosActuales.length) {
      toast('Pago no encontrado.', 'error')
      return
    }
    const pago = pagosActuales[index]
    const esSaldo = Number(pago.saldo_usado) > 0
    const simbolo = esSaldo ? '€ saldo' : pago.enDolares ? '$' : 'Bs'
    const montoLabel = esSaldo
      ? `€${Number(pago.saldo_usado).toFixed(2)}`
      : pago.enDolares
        ? `$${Number(pago.monto || 0).toLocaleString('es-ES')}`
        : `Bs ${Number(pago.monto || 0).toLocaleString('es-ES')}`
    const ok = await confirm({
      title: 'Eliminar pago',
      message:
        `¿Eliminar este pago?\n\n• ${montoLabel} (${simbolo})` +
        (pago.referencia ? `\n• Ref: ${pago.referencia}` : '') +
        `\n• Líder: ${reserva.lider}`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    setDelPagoBusy(index)
    try {
      pagosActuales.splice(index, 1)
      const montoPagadoBs = montoPagadoBsDesdePagos(pagosActuales)
      const { error: upErr } = await supabase
        .from('reservas')
        .update({ pagos: pagosActuales, monto_pagado: montoPagadoBs })
        .eq('id', reservaId)
      if (upErr) throw upErr
      await reload()
      toast('Pago eliminado.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'No se pudo eliminar el pago.', 'error')
    } finally {
      setDelPagoBusy(null)
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
      if (pagosModalId === reserva.id) setPagosModalId(null)
      await reload()
      toast('Reserva eliminada.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Error al eliminar.', 'error')
    } finally {
      setDelBusyId(null)
    }
  }

  function abrirModalPagos(reserva) {
    setPagosModalId(reserva.id)
    setPayMonto('')
    setPayRef('')
    setPayTipo('bs')
    setPayCupos('1')
  }

  async function agregarPersonaRapida(reserva, nombreRaw) {
    const nombre = nombreRaw.trim()
    const ruta = rutas.find((rt) => rt.id === reserva.rutaId)
    if (!ruta) return
    if (nombre.length < 2) {
      toast('Escribe el nombre completo.', 'info')
      return
    }
    const dup = participantes.some(
      (p) =>
        String(p.nombre || '').trim().toLowerCase() === nombre.toLowerCase() &&
        p.lider === reserva.lider &&
        (p.rutaId === reserva.rutaId || p.ruta_id === reserva.rutaId),
    )
    if (dup) {
      toast('Esa persona ya está en la lista.', 'info')
      return
    }
    setQuickAddBusy(true)
    try {
      const { error } = await supabase.from('participantes').insert({
        nombre,
        lider: reserva.lider,
        ruta_id: reserva.rutaId,
        ruta_nombre: ruta.nombre,
        asiste: false,
      })
      if (error) throw error
      setQuickAddNombre('')
      setQuickAddReservaId(null)
      await reload()
      toast('Persona agregada.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'No se pudo agregar.', 'error')
    } finally {
      setQuickAddBusy(false)
    }
  }

  function abrirEditarReserva(reserva) {
    setEditReserva(reserva)
    setEditLider(reserva.lider || '')
    setEditCantidad(String(getCuposReserva(reserva)))
    setEditOpen(true)
  }

  async function guardarEdicionReserva() {
    if (!editReserva) return
    const nuevoLider = editLider.trim()
    const viejoLider = editReserva.lider
    const rutaId = editReserva.rutaId
    const n = parseInt(String(editCantidad), 10)
    const partes = nuevoLider.split(/\s+/).filter(Boolean)
    if (!nuevoLider || partes.length < 2) {
      toast('Indica nombre y apellido del líder.', 'info')
      return
    }
    if (!Number.isFinite(n) || n < 0 || n > 500) {
      toast('Cupos entre 0 y 500.', 'error')
      return
    }
    setEditBusy(true)
    try {
      if (nuevoLider !== viejoLider) {
        const { error: e1 } = await supabase
          .from('participantes')
          .update({ lider: nuevoLider })
          .eq('lider', viejoLider)
          .eq('ruta_id', rutaId)
        if (e1) throw e1
      }
      const { error: e2 } = await supabase
        .from('reservas')
        .update({ lider: nuevoLider, cantidad: n })
        .eq('id', editReserva.id)
      if (e2) throw e2
      setEditOpen(false)
      setEditReserva(null)
      await reload()
      toast('Reserva actualizada.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Error al guardar.', 'error')
    } finally {
      setEditBusy(false)
    }
  }

  const rutasActivas = useMemo(
    () => rutas.filter((r) => !r.archivada),
    [rutas],
  )

  const abonadoNuevaReserva = useMemo(
    () => abonadoCoincidenteConLider(nLider, abonados),
    [nLider, abonados],
  )
  const saldoDisponibleNuevaReserva = useMemo(() => {
    if (!abonadoNuevaReserva) return 0
    return Math.max(
      0,
      parseFloat(String(abonadoNuevaReserva.saldo_euros || 0)) || 0,
    )
  }, [abonadoNuevaReserva])

  /** Tope en € para esta reserva: saldo del abonado y, si aplica, cupos × precio/cupo. */
  const maxSaldoConsumirForm = useMemo(() => {
    if (!abonadoNuevaReserva || saldoDisponibleNuevaReserva <= 0) return null
    const cant = parseInt(String(nCantidad), 10)
    const rutaSel = rutas.find(
      (rt) => rt.id === nRutaId || String(rt.id) === String(nRutaId),
    )
    const precio = rutaSel ? Number(rutaSel.precioEuros || 0) : 0
    if (Number.isFinite(cant) && cant > 0 && precio > 0) {
      return Math.min(saldoDisponibleNuevaReserva, cant * precio)
    }
    return saldoDisponibleNuevaReserva
  }, [
    abonadoNuevaReserva,
    saldoDisponibleNuevaReserva,
    nCantidad,
    nRutaId,
    rutas,
  ])

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

  const reservaPagosModal = useMemo(
    () =>
      pagosModalId
        ? (reservas.find((r) => r.id === pagosModalId) ?? null)
        : null,
    [reservas, pagosModalId],
  )
  const rutaPagosModal = useMemo(() => {
    if (!reservaPagosModal) return null
    const id = reservaPagosModal.rutaId
    const found =
      id != null
        ? rutas.find(
            (rt) => rt.id === id || String(rt.id) === String(id),
          ) ?? null
        : null
    if (found) return found
    return {
      id: id ?? '',
      nombre: reservaPagosModal.ruta || 'Ruta',
      fecha: null,
      precioEuros: 0,
    }
  }, [rutas, reservaPagosModal])

  useEffect(() => {
    if (!pagosModalId) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [pagosModalId])

  useEffect(() => {
    if (!pagosModalId) return
    function onKey(e) {
      if (e.key !== 'Escape') return
      if (payBusy || delPagoBusy !== null) return
      setPagosModalId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pagosModalId, payBusy, delPagoBusy])

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
            Nueva reserva
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
              placeholder="Líder (nombre y apellido)"
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
            />
            <select
              value={nRutaId}
              onChange={(e) => setNRutaId(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none focus:border-emerald-500/40"
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
              min={0}
              max={500}
              inputMode="numeric"
              value={nCantidad}
              onChange={(e) => setNCantidad(e.target.value)}
              placeholder="Cupos reservados (0 = sin cupos)"
              className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
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
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-base text-white outline-none"
              />
              {!nEnDolares ? (
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={nCuposPago}
                  onChange={(e) => setNCuposPago(e.target.value)}
                  placeholder="Cupos pagados con este monto (Bs)"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-base text-white outline-none"
                />
              ) : (
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={nCuposUsdIni}
                  onChange={(e) => setNCuposUsdIni(e.target.value)}
                  placeholder="Cupos pagados con este monto (USD)"
                  className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-base text-white outline-none"
                />
              )}
              <input
                type="text"
                value={nReferencia}
                onChange={(e) => setNReferencia(e.target.value)}
                placeholder="Referencia / nota"
                className="mt-2 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-base text-white outline-none"
              />
            </div>
            {abonadoNuevaReserva && saldoDisponibleNuevaReserva > 0 ? (
              <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/20 p-3">
                <p className="m-0 text-[11px] font-bold uppercase tracking-wide text-cyan-200/95">
                  Líder con saldo
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-400">
                  Coincide con el abonado{' '}
                  <span className="font-semibold text-slate-200">
                    {abonadoNuevaReserva.lider}
                  </span>
                  . Saldo disponible:{' '}
                  <span className="tabular-nums font-semibold text-cyan-200">
                    €{saldoDisponibleNuevaReserva.toFixed(2)}
                  </span>
                  {maxSaldoConsumirForm != null &&
                  maxSaldoConsumirForm + 1e-9 <
                    saldoDisponibleNuevaReserva ? (
                    <>
                      {' '}
                      · Máximo en esta reserva (cupos × precio):{' '}
                      <span className="tabular-nums font-semibold text-cyan-100">
                        €{maxSaldoConsumirForm.toFixed(2)}
                      </span>
                    </>
                  ) : null}
                </p>
                <label
                  className="mt-2 block text-[11px] font-medium text-slate-400"
                  htmlFor="nueva-saldo-consumir"
                >
                  ¿Cuánto saldo (€) deseas consumir en esta reserva?
                </label>
                <input
                  id="nueva-saldo-consumir"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={nSaldoConsumir}
                  onChange={(e) => setNSaldoConsumir(e.target.value)}
                  placeholder="0"
                  className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-base text-white outline-none placeholder:text-slate-500"
                />
              </div>
            ) : null}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
              <p className="m-0 text-[11px] font-medium text-slate-400">
                Agregar personas (opcional)
              </p>
              <p className="mt-1 text-[10px] text-slate-500">
                El líder se guarda al crear la reserva. Añade aquí el resto del
                grupo. Enter para añadir rápido.
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={nPersonaNombre}
                  onChange={(e) => setNPersonaNombre(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      agregarPersonaTemporal()
                    }
                  }}
                  placeholder="Nombre completo"
                  className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-base text-white outline-none placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={() => agregarPersonaTemporal()}
                  className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
                >
                  + Agregar
                </button>
              </div>
              {personasTemp.length > 0 ? (
                <ul className="mt-2 max-h-28 list-none space-y-1 overflow-y-auto p-0 text-xs text-slate-300">
                  {personasTemp.map((nom, idx) => (
                    <li
                      key={`${nom}-${idx}`}
                      className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/20 px-2 py-1.5"
                    >
                      <span className="min-w-0 truncate">{nom}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPersonasTemp((prev) =>
                            prev.filter((_, i) => i !== idx),
                          )
                        }
                        className="shrink-0 text-rose-300 hover:text-rose-200"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
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
          <div className="flex justify-center drop-shadow-md">
            <Ticket
              className="h-14 w-14 text-slate-500"
              strokeWidth={1.25}
              aria-hidden
            />
          </div>
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
                      <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
                        <User
                          className="h-5 w-5 shrink-0 text-teal-400/90"
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="min-w-0 truncate">{reserva.lider}</span>
                      </h2>
                      <p className="mt-1 flex items-start gap-1.5 text-sm text-slate-400">
                        <MapPin
                          className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
                          strokeWidth={2}
                          aria-hidden
                        />
                        <span className="min-w-0">
                          {ruta.nombre}
                          {ruta.fecha
                            ? ` · ${formatRutaDateShort(ruta.fecha)}`
                            : ''}
                        </span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-slate-400">
                        <span
                          className={`inline-flex items-center gap-1.5 ${cuposPagoTextClass(
                            cuposPagados,
                            cuposReserva,
                          )}`}
                          title="Cupos pagados / reservados · € recibidos / esperados"
                        >
                          <BarChart3
                            className="h-3.5 w-3.5 shrink-0 opacity-90"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span>
                            {cuposPagados}/{cuposReserva} ({eurosRecibidos}€/
                            {eurosEsperados}€)
                          </span>
                        </span>
                        {tienePagos ? (
                          <span className="inline-flex items-center gap-1.5 text-slate-300">
                            <Banknote
                              className="h-3.5 w-3.5 shrink-0 text-amber-400/90"
                              strokeWidth={2}
                              aria-hidden
                            />
                            <span>
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
                          </span>
                        ) : (
                          <span className="text-slate-500">Sin pagos</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => abrirEditarReserva(reserva)}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
                        title="Editar reserva"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (expandida) {
                            setExpandedId(null)
                            setQuickAddReservaId(null)
                          } else {
                            setPayMonto('')
                            setPayCupos('1')
                            setPayRef('')
                            setPayTipo('bs')
                            setQuickAddReservaId(null)
                            setExpandedId(reserva.id)
                          }
                        }}
                        className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
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
                            className={`flex items-center justify-center gap-1 text-lg font-extrabold tabular-nums ${personasCuposTextClass(registrados, cuposReserva)}`}
                          >
                            <span>
                              {registrados}/{cuposReserva}
                            </span>
                            {haySobrePersonas ? (
                              <AlertTriangle
                                className="h-4 w-4 shrink-0 text-amber-400"
                                strokeWidth={2}
                                aria-hidden
                              />
                            ) : null}
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

                      <div className="mt-4 grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          disabled={quickAddBusy}
                          onClick={() =>
                            setQuickAddReservaId((prev) =>
                              prev === reserva.id ? null : reserva.id,
                            )
                          }
                          className="flex items-center justify-center gap-1 rounded-xl bg-emerald-600/85 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-600 disabled:opacity-50"
                          title="Agregar persona"
                        >
                          <UserPlus className="h-3.5 w-3.5" />
                          +1
                        </button>
                        <button
                          type="button"
                          onClick={() => abrirModalPagos(reserva)}
                          className="flex items-center justify-center gap-1 rounded-xl bg-sky-600/85 py-2.5 text-xs font-bold text-white shadow hover:bg-sky-600"
                          title="Gestión de pagos"
                        >
                          <CreditCard className="h-3.5 w-3.5" />
                          Pagos
                        </button>
                        <button
                          type="button"
                          disabled={delBusyId === reserva.id}
                          onClick={() => void eliminarReserva(reserva)}
                          className="flex items-center justify-center gap-1 rounded-xl border border-rose-500/40 bg-rose-950/40 py-2.5 text-xs font-bold text-rose-100 hover:bg-rose-950/60 disabled:opacity-50"
                          title="Eliminar reserva"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </button>
                      </div>

                      {quickAddReservaId === reserva.id ? (
                        <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
                          <p className="m-0 text-[11px] font-medium text-slate-400">
                            Nueva persona en esta reserva
                          </p>
                          <div className="mt-2 flex gap-2">
                            <input
                              type="text"
                              value={quickAddNombre}
                              onChange={(e) => setQuickAddNombre(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  void agregarPersonaRapida(
                                    reserva,
                                    quickAddNombre,
                                  )
                                }
                              }}
                              placeholder="Nombre completo"
                              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/50 px-3 py-2 text-base text-white outline-none"
                            />
                            <button
                              type="button"
                              disabled={quickAddBusy}
                              onClick={() =>
                                void agregarPersonaRapida(
                                  reserva,
                                  quickAddNombre,
                                )
                              }
                              className="shrink-0 rounded-lg bg-emerald-600/80 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
                            >
                              {quickAddBusy ? '…' : 'Añadir'}
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </li>
            )
          })}
      </ul>

      {pagosModalId && reservaPagosModal
        ? createPortal(
            <div
              className={saModalBackdropClass('pagos')}
              role="presentation"
              onClick={() => {
                if (!payBusy && delPagoBusy === null) setPagosModalId(null)
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="pagos-modal-title"
                className={SA_MODAL_PANEL_SCROLL}
                onClick={(e) => e.stopPropagation()}
              >
            <div className="flex items-start justify-between gap-3">
              <h2
                id="pagos-modal-title"
                className="m-0 flex items-center gap-2 text-lg font-extrabold tracking-tight text-white"
              >
                <Coins
                  className="h-5 w-5 shrink-0 text-amber-400/90"
                  strokeWidth={2}
                  aria-hidden
                />
                Gestión de pagos
              </h2>
              <button
                type="button"
                disabled={payBusy || delPagoBusy !== null}
                onClick={() => setPagosModalId(null)}
                className={SA_MODAL_BTN_CLOSE}
                aria-label="Cerrar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-2 text-sm text-slate-400">
              <span className="font-medium text-slate-300">
                {reservaPagosModal.lider}
              </span>
              {' · '}
              {rutaPagosModal.nombre}
              {rutaPagosModal.fecha
                ? ` · ${formatRutaDateShort(rutaPagosModal.fecha)}`
                : ''}
            </p>
            <div className="my-4 border-t border-white/10" />

            {(() => {
              const sm = resumenPagosParaModal(
                reservaPagosModal,
                rutaPagosModal,
              )
              const saldoU = saldoUsadoEnReserva(reservaPagosModal)
              return (
                <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4">
                  <p className="m-0 text-xs font-bold uppercase tracking-wide text-emerald-200/90">
                    Resumen
                  </p>
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[13px] text-slate-300">
                      <span>Cupos pagados</span>
                      <span className="font-semibold tabular-nums text-white">
                        {sm.cuposPagados}/{sm.cuposReservados} (
                        {sm.porcentaje.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-[width]"
                        style={{ width: `${sm.porcentaje}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <div className="text-[11px] text-slate-500">
                        Precio/cupo
                      </div>
                      <div className="font-extrabold text-white">
                        {sm.precioCupo}€
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">
                        Total esperado
                      </div>
                      <div className="font-extrabold text-white">
                        {sm.eurosEsperados % 1 === 0
                          ? sm.eurosEsperados
                          : sm.eurosEsperados.toFixed(2)}
                        €
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">
                        Total recibido
                      </div>
                      <div className="font-extrabold text-emerald-300">
                        {sm.eurosRecibidos % 1 === 0
                          ? sm.eurosRecibidos
                          : sm.eurosRecibidos.toFixed(2)}
                        €
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500">
                        Pendiente
                      </div>
                      <div
                        className={`font-extrabold ${sm.pendiente > 0 ? 'text-amber-300' : 'text-slate-300'}`}
                      >
                        {sm.pendiente % 1 === 0
                          ? sm.pendiente
                          : sm.pendiente.toFixed(2)}
                        €
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-white/10 pt-3">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <div>
                        <div className="text-[11px] text-slate-500">
                          Bs recibidos
                        </div>
                        <div className="font-extrabold text-emerald-300">
                          Bs {sm.totalBs.toLocaleString('es-ES')}
                        </div>
                      </div>
                      {sm.totalDolares > 0 ? (
                        <div>
                          <div className="text-[11px] text-slate-500">
                            USD efectivo
                          </div>
                          <div className="font-extrabold text-amber-300">
                            ${sm.totalDolares.toLocaleString('es-ES')}
                          </div>
                        </div>
                      ) : null}
                      {saldoU > 0 ? (
                        <div>
                          <div className="text-[11px] text-slate-500">
                            Saldo € usado
                          </div>
                          <div className="font-extrabold text-cyan-300">
                            €{saldoU % 1 === 0 ? saldoU : saldoU.toFixed(2)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })()}

            {(reservaPagosModal.pagos || []).length > 0 ? (
              <div className="mt-5">
                <p className="m-0 text-xs font-bold text-slate-300">
                  Historial de pagos
                </p>
                <ul className="mt-2 list-none space-y-2 p-0">
                  {(reservaPagosModal.pagos || []).map((pago, idx) => {
                    const esSaldo = Number(pago.saldo_usado) > 0
                    const esDolares = !esSaldo && !!pago.enDolares
                    const precioCupo = Number(rutaPagosModal.precioEuros || 0)
                    const cuposNum = pago.cuposPagados || 0
                    const migrado = !esSaldo && pago._cuposCalculado
                    let lineaPrincipal = ''
                    if (esSaldo) {
                      lineaPrincipal = `€${Number(pago.saldo_usado || 0).toFixed(2)} € saldo (${cuposNum} cupo${cuposNum !== 1 ? 's' : ''})`
                    } else if (esDolares) {
                      lineaPrincipal = `$${Number(pago.monto || 0).toLocaleString('es-ES')}`
                      if (cuposNum > 0) {
                        lineaPrincipal += ` · ${cuposNum} cupo${cuposNum !== 1 ? 's' : ''} (= ${(cuposNum * precioCupo).toFixed(2)}€)`
                      }
                    } else {
                      lineaPrincipal = `Bs ${Number(pago.monto || 0).toLocaleString('es-ES')} · ${cuposNum} cupo${cuposNum !== 1 ? 's' : ''} (= ${(cuposNum * precioCupo).toFixed(2)}€)`
                    }
                    const fechaStr = pago.fecha
                      ? new Date(pago.fecha).toLocaleString('es-ES', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : '—'
                    return (
                      <li
                        key={`pago-${idx}-${String(pago.fecha)}`}
                        className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div
                            className={`text-sm font-bold ${
                              esSaldo
                                ? 'text-cyan-300'
                                : esDolares
                                  ? 'text-amber-300'
                                  : 'text-emerald-300'
                            }`}
                          >
                            {lineaPrincipal}
                            {migrado ? (
                              <span className="ml-1 text-[10px] font-normal text-slate-500">
                                (calculado automáticamente)
                              </span>
                            ) : null}
                          </div>
                          {pago.referencia ? (
                            <div className="mt-0.5 text-xs text-slate-400">
                              Ref: {pago.referencia}
                            </div>
                          ) : null}
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {fechaStr}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={
                            payBusy ||
                            delPagoBusy !== null ||
                            delBusyId === reservaPagosModal.id
                          }
                          onClick={() =>
                            void eliminarPagoAtIndex(reservaPagosModal.id, idx)
                          }
                          className="shrink-0 rounded-lg border border-rose-500/30 bg-rose-950/30 p-2 text-rose-200 hover:bg-rose-950/50 disabled:opacity-40"
                          title="Eliminar pago"
                        >
                          {delPagoBusy === idx ? (
                            <span className="text-xs">…</span>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-center text-sm text-slate-500">
                Sin pagos registrados todavía.
              </p>
            )}

            <div className="my-4 border-t border-white/10" />

            <div className="rounded-xl border border-teal-500/25 bg-teal-950/25 p-4">
              <p className="m-0 text-xs font-bold text-teal-100">
                Registrar nuevo pago
              </p>
              <div className="mt-3 flex gap-4 text-xs">
                <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                  <input
                    type="radio"
                    name="modal-pay-tipo"
                    checked={payTipo === 'bs'}
                    onChange={() => {
                      setPayTipo('bs')
                      setPayCupos('1')
                    }}
                  />
                  Bs
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-slate-300">
                  <input
                    type="radio"
                    name="modal-pay-tipo"
                    checked={payTipo === 'usd'}
                    onChange={() => {
                      setPayTipo('usd')
                      setPayCupos('0')
                    }}
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
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none"
              />
              <input
                type="number"
                min={0}
                value={payCupos}
                onChange={(e) => setPayCupos(e.target.value)}
                placeholder={
                  payTipo === 'usd'
                    ? 'Cupos pagados (USD)'
                    : 'Cupos pagados (Bs)'
                }
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none"
              />
              <input
                type="text"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Referencia (opcional)"
                className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none"
              />
              <button
                type="button"
                disabled={payBusy}
                onClick={() => void registrarPago(reservaPagosModal)}
                className="mt-3 w-full rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              >
                {payBusy ? 'Guardando…' : 'Registrar pago'}
              </button>
            </div>

            <button
              type="button"
              disabled={payBusy || delPagoBusy !== null}
              onClick={() => setPagosModalId(null)}
              className="sa-btn-ghost mt-4 w-full py-2.5 text-sm"
            >
              Cerrar
            </button>
          </div>
            </div>,
            document.body,
          )
        : null}

      {editOpen && editReserva ? (
        <div
          className={saModalBackdropClass('editReserva')}
          role="presentation"
          onClick={() => {
            if (!editBusy) {
              setEditOpen(false)
              setEditReserva(null)
            }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' && !editBusy) {
              setEditOpen(false)
              setEditReserva(null)
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="edit-reserva-title"
            className={SA_MODAL_PANEL_COMPACT}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="edit-reserva-title"
              className="m-0 text-lg font-extrabold tracking-tight text-white"
            >
              Editar reserva
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {rutas.find((rt) => rt.id === editReserva.rutaId)?.nombre ?? '—'}
            </p>
            <label className="mt-4 block text-xs font-medium text-slate-400">
              Líder (nombre y apellido)
            </label>
            <input
              type="text"
              value={editLider}
              onChange={(e) => setEditLider(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none focus:border-emerald-500/40"
            />
            <label className="mt-3 block text-xs font-medium text-slate-400">
              Cupos reservados
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={editCantidad}
              onChange={(e) => setEditCantidad(e.target.value)}
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none focus:border-emerald-500/40"
            />
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                disabled={editBusy}
                onClick={() => {
                  if (!editBusy) {
                    setEditOpen(false)
                    setEditReserva(null)
                  }
                }}
                className="sa-btn-ghost flex-1 py-2.5 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={editBusy}
                onClick={() => void guardarEdicionReserva()}
                className="sa-btn-primary flex-1 py-2.5 text-sm text-slate-950 disabled:opacity-50"
              >
                {editBusy ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
