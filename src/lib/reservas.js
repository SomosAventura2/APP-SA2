/**
 * Cupos de una reserva (misma lógica que app/index.html).
 * @param {Record<string, unknown>} reserva
 * @returns {number}
 */
export function getCuposReserva(reserva) {
  if (!reserva) return 0
  const val =
    reserva.cantidad_personas ??
    reserva.cupos ??
    reserva.cantidad ??
    0
  const n = Number(val)
  return Number.isFinite(n) ? n : 0
}

/** @param {Record<string, unknown>} reserva */
export function getReservaRutaId(reserva) {
  return reserva.ruta_id ?? reserva.rutaId ?? null
}
