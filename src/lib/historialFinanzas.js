import { getCuposReserva, getReservaRutaId } from './reservas'

/**
 * @param {Array<Record<string, unknown>>} participantes
 * @param {string} rutaId
 */
export function participantesPorRutaId(participantes, rutaId) {
  if (rutaId == null || rutaId === '') return []
  const id = String(rutaId)
  return (participantes || []).filter(
    (p) => String(p.rutaId ?? p.ruta_id ?? '') === id,
  )
}

/**
 * @param {Array<Record<string, unknown>>} participantes
 * @param {string} lider
 * @param {string} rutaId
 */
export function participantesPorReservaSorted(participantes, lider, rutaId) {
  const rid = rutaId == null || rutaId === '' ? '' : String(rutaId)
  const list = (participantes || []).filter(
    (p) =>
      p.lider === lider && String(p.rutaId ?? p.ruta_id ?? '') === rid,
  )
  return list.slice().sort((a, b) =>
    String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es', {
      sensitivity: 'base',
    }),
  )
}

/**
 * @param {string} rutaId
 * @param {Array<Record<string, unknown>>} reservas
 */
export function calcularTotalRecaudado(rutaId, reservas) {
  return (reservas || [])
    .filter((r) => getReservaRutaId(r) === rutaId)
    .reduce((sum, r) => {
      const totalBs = (r.pagos || [])
        .filter((p) => !p.enDolares)
        .reduce((s, p) => s + (Number(p.monto) || 0), 0)
      return sum + totalBs
    }, 0)
}

/**
 * @param {string} rutaId
 * @param {Array<Record<string, unknown>>} reservas
 */
export function calcularTotalDolares(rutaId, reservas) {
  return (reservas || [])
    .filter((r) => getReservaRutaId(r) === rutaId)
    .reduce((sum, r) => {
      const totalDolares = (r.pagos || [])
        .filter((p) => p.enDolares)
        .reduce((s, p) => s + (Number(p.monto) || 0), 0)
      return sum + totalDolares
    }, 0)
}

/**
 * @param {string} rutaId
 * @param {Array<Record<string, unknown>>} gastos
 */
export function calcularTotalGastos(rutaId, gastos) {
  return (gastos || [])
    .filter((g) => g.rutaId === rutaId || g.ruta_id === rutaId)
    .reduce((sum, g) => sum + (Number(g.monto) || 0), 0)
}

export function calcularProfitNeto(rutaId, reservas, gastos) {
  return (
    calcularTotalRecaudado(rutaId, reservas) -
    calcularTotalGastos(rutaId, gastos)
  )
}

/** Cupos reservados en una ruta (suma cantidades de reservas). */
export function cuposReservadosEnRuta(rutaId, reservas) {
  return (reservas || [])
    .filter((r) => getReservaRutaId(r) === rutaId)
    .reduce((sum, r) => sum + getCuposReserva(r), 0)
}

/** Misma fecha límite que app/index.html (no navegar estadísticas antes). */
export const PRIMERA_SEMANA_INICIO = new Date(2025, 7, 25, 0, 0, 0, 0)
export const PRIMER_MES_INICIO = new Date(2025, 7, 1, 0, 0, 0, 0)

export function getInicioFinSemanaActual() {
  const now = new Date()
  const day = now.getDay()
  const diffLunes = day === 0 ? -6 : 1 - day
  const inicio = new Date(now)
  inicio.setDate(now.getDate() + diffLunes)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(inicio)
  fin.setDate(inicio.getDate() + 6)
  fin.setHours(23, 59, 59, 999)
  return { inicio, fin }
}

/** @param {number} offset 0 = actual, -1 = anterior */
export function getInicioFinSemanaConOffset(offset) {
  const { inicio: baseInicio } = getInicioFinSemanaActual()
  const inicio = new Date(baseInicio)
  inicio.setDate(baseInicio.getDate() + offset * 7)
  inicio.setHours(0, 0, 0, 0)
  const fin = new Date(inicio)
  fin.setDate(inicio.getDate() + 6)
  fin.setHours(23, 59, 59, 999)
  return { inicio, fin }
}

export function getInicioFinMesConOffset(offset) {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + offset
  const inicio = new Date(y, m, 1, 0, 0, 0, 0)
  const fin = new Date(y, m + 1, 0, 23, 59, 59, 999)
  return { inicio, fin }
}

export function fechaRutaDentroRango(rutaFechaStr, inicio, fin) {
  if (!rutaFechaStr) return false
  const d = new Date(`${String(rutaFechaStr).split('T')[0]}T12:00:00`)
  return d >= inicio && d <= fin
}

export function formatSemanaRango(inicio, fin) {
  const d1 = inicio.getDate()
  const d2 = fin.getDate()
  const mes = inicio
    .toLocaleDateString('es-ES', { month: 'short' })
    .replace('.', '')
  const mesCap = mes ? mes.charAt(0).toUpperCase() + mes.slice(1) : mes
  return d1 === d2 ? `${d1} ${mesCap}` : `${d1} - ${d2} ${mesCap}`
}

export function formatMesRango(inicio) {
  const año = inicio.getFullYear()
  const mes = inicio.toLocaleDateString('es-ES', { month: 'long' })
  const mesCap = mes ? mes.charAt(0).toUpperCase() + mes.slice(1) : mes
  const añoActual = new Date().getFullYear()
  return año === añoActual ? mesCap : `${mesCap} ${año}`
}

/**
 * Estadísticas agregadas solo de rutas archivadas cuya fecha cae en [desde, hasta].
 * @param {Date} desde
 * @param {Date} hasta
 * @param {Array<Record<string, unknown>>} rutas
 * @param {Array<Record<string, unknown>>} reservas
 * @param {Array<Record<string, unknown>>} gastos
 * @param {Array<Record<string, unknown>>} participantes
 */
export function estadisticasHistorialArchivado(
  desde,
  hasta,
  rutas,
  reservas,
  gastos,
  participantes,
) {
  const rutasEnRango = (rutas || []).filter(
    (r) =>
      r.archivada &&
      fechaRutaDentroRango(r.fecha, desde, hasta),
  )
  let profit = 0
  let recaudado = 0
  let gastosSum = 0
  let participantesCount = 0
  rutasEnRango.forEach((ruta) => {
    const id = ruta.id
    recaudado += calcularTotalRecaudado(id, reservas)
    gastosSum += calcularTotalGastos(id, gastos)
    profit += calcularProfitNeto(id, reservas, gastos)
    participantesCount += participantesPorRutaId(participantes, id).length
  })
  return {
    rutasCount: rutasEnRango.length,
    profit,
    recaudado,
    gastos: gastosSum,
    participantesCount,
  }
}
