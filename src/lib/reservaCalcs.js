/** Migra pagos sin `cuposPagados` (misma lógica que index.html). */
function migrarPagosAntiguos(reserva, ruta) {
  if (!reserva.pagos || !Array.isArray(reserva.pagos)) return reserva
  const precioCupo =
    ruta && ruta.precioEuros != null ? Number(ruta.precioEuros) : 10
  const pagos = reserva.pagos.map((pago) => {
    if (pago.cuposPagados !== undefined) return pago
    if (pago.enDolares) return { ...pago, cuposPagados: 0 }
    const tasaPromedio = 400
    const eurosAprox = (pago.monto || 0) / tasaPromedio
    const cuposAprox = Math.floor(eurosAprox / precioCupo)
    return { ...pago, cuposPagados: Math.max(1, cuposAprox), _cuposCalculado: true }
  })
  return { ...reserva, pagos }
}

export function calcularTotalesPorMoneda(reserva) {
  if (!reserva.pagos || !Array.isArray(reserva.pagos)) {
    return { totalBs: 0, totalDolares: 0, cuposPagados: 0 }
  }
  return reserva.pagos.reduce(
    (totales, pago) => {
      totales.cuposPagados += pago.cuposPagados || 0
      if (pago.enDolares) {
        totales.totalDolares += pago.monto || 0
      } else {
        totales.totalBs += pago.monto || 0
      }
      return totales
    },
    { totalBs: 0, totalDolares: 0, cuposPagados: 0 },
  )
}

export function calcularCuposPagadosDesdePagos(reserva) {
  return calcularTotalesPorMoneda(reserva).cuposPagados
}

export function calcularEurosRecibidos(reserva, ruta) {
  const cuposPagados = calcularCuposPagadosDesdePagos(reserva)
  const precioCupoEuros = ruta ? Number(ruta.precioEuros || 0) : 0
  return cuposPagados * precioCupoEuros
}

/** Orden en lista (verde primero, amarillo, rojo) — misma prioridad que index.html. */
export function rankPagoCompletitud(cuposPagados, cuposReservados) {
  if (cuposReservados === 0) return 0
  if (cuposPagados === 0) return 2
  if (cuposPagados < cuposReservados) return 1
  if (cuposPagados === cuposReservados) return 0
  return 2
}

export function saldoUsadoEnReserva(reserva) {
  const ab = Number(reserva.abonado_euros) || 0
  if (ab > 0) return ab
  if (!reserva.pagos || !Array.isArray(reserva.pagos)) return 0
  return reserva.pagos.reduce((s, p) => s + (Number(p.saldo_usado) || 0), 0)
}

export function countParticipantesReserva(participantes, lider, rutaId) {
  return participantes.filter(
    (p) =>
      p.lider === lider &&
      (p.rutaId === rutaId || p.ruta_id === rutaId),
  ).length
}

/** Color cupos pagados vs cupos reservados (texto UI). */
export function cuposPagoTextClass(cuposPagados, cuposReservados) {
  const r = rankPagoCompletitud(cuposPagados, cuposReservados)
  if (r === 2) return 'text-rose-400 font-bold'
  if (r === 1) return 'text-amber-400'
  return 'text-emerald-400'
}

/** Personas registradas vs cupos de la reserva. */
export function personasCuposTextClass(registrados, cuposReserva) {
  if (registrados === 0) return 'text-rose-400'
  if (registrados < cuposReserva) return 'text-amber-400'
  if (registrados === cuposReserva) return 'text-emerald-400'
  return 'text-rose-400 font-bold'
}

export function normalizeReserva(raw, rutas) {
  const rutaId = raw.ruta_id ?? raw.rutaId
  const ruta = rutas.find((rt) => rt.id === rutaId)
  const pagosRaw = raw.pagos || []
  const pagos = pagosRaw.map((p) => ({
    ...p,
    cuposPagados: p.cuposPagados !== undefined ? p.cuposPagados : 0,
  }))
  let reserva = {
    ...raw,
    rutaId,
    ruta: ruta ? ruta.nombre : null,
    cantidad: Number(
      (raw.cantidad_personas ?? raw.cupos ?? raw.cantidad) ?? 0,
    ),
    montoPagado: raw.monto_pagado || 0,
    pagos,
  }
  reserva = migrarPagosAntiguos(reserva, ruta)
  return reserva
}

export function normalizeReservas(rawList, rutas) {
  return (rawList || []).map((r) => normalizeReserva(r, rutas))
}
