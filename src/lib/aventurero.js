import {
  findRutaPorParticipacion,
  nombreRutaDisplayParticipacion,
} from './resolverRutaParticipacion'

/** Rango por asistencias totales (misma escala que index.html). */
export function calcularRangoAventurado(asistenciasTotales) {
  const n = Number(asistenciasTotales) || 0
  if (n < 2)
    return { nombre: 'Novato', emoji: '🌱', color: '#22c55e', minRutas: 0 }
  if (n <= 4)
    return { nombre: 'Bronce', emoji: '🥉', color: '#CD7F32', minRutas: 2 }
  if (n <= 9)
    return { nombre: 'Plata', emoji: '🥈', color: '#C0C0C0', minRutas: 5 }
  if (n <= 14)
    return { nombre: 'Oro', emoji: '🥇', color: '#FFD700', minRutas: 10 }
  if (n <= 19)
    return { nombre: 'Platino', emoji: '💎', color: '#E5E4E2', minRutas: 15 }
  return { nombre: 'Diamante', emoji: '✨', color: '#b9f2ff', minRutas: 20 }
}

export function getSiguienteRango(rango) {
  if (!rango) return null
  if (rango.nombre === 'Novato') return calcularRangoAventurado(2)
  if (rango.nombre === 'Bronce') return calcularRangoAventurado(5)
  if (rango.nombre === 'Plata') return calcularRangoAventurado(10)
  if (rango.nombre === 'Oro') return calcularRangoAventurado(15)
  if (rango.nombre === 'Platino') return calcularRangoAventurado(20)
  return null
}

/** Orden cronológico por día de evento (fecha de ruta o de participación). */
function timestampOrdenDetalleParticipacion(row) {
  const s = row.fechaRuta || row.fecha
  if (s == null || s === '') return null
  const day = String(s).split('T')[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const [y, m, d] = day.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
  }
  const t = new Date(s).getTime()
  return Number.isNaN(t) ? null : t
}

/**
 * Historial y rango por nombre. Solo cuenta participaciones cuya ruta existe en `rutas`
 * (activa o archivada); reservas huérfanas (ruta borrada del catálogo) no aparecen.
 * @param {string} nombrePersona
 * @param {Array<Record<string, unknown>>} participantes
 * @param {Array<Record<string, unknown>>} rutas
 */
export function calcularRutasPorPersona(nombrePersona, participantes, rutas) {
  const nombreNormalizado = (nombrePersona || '').toLowerCase().trim()
  const todasParticipaciones = (participantes || []).filter(
    (p) => (p.nombre || '').toLowerCase().trim() === nombreNormalizado,
  )

  if (todasParticipaciones.length === 0) {
    return {
      totalRutas: 0,
      totalRutasAsistidas: 0,
      totalTodasLasRutas: 0,
      totalParticipaciones: 0,
      totalAsistidas: 0,
      totalNoAsistidas: 0,
      porcentajeAsistencia: 0,
      rutasAsistidas: [],
      todasLasRutas: [],
      participacionesDetalladas: [],
      rango: null,
      siguienteRango: null,
      progresoHaciaSiguiente: 0,
      totalParaSiguiente: 0,
    }
  }

  /** Solo filas cuya ruta sigue en catálogo (activa o archivada); borradas no entran al historial. */
  const participaciones = todasParticipaciones.filter((p) =>
    Boolean(findRutaPorParticipacion(p, rutas)),
  )

  if (participaciones.length === 0) {
    return {
      totalRutas: 0,
      totalRutasAsistidas: 0,
      totalTodasLasRutas: 0,
      totalParticipaciones: 0,
      totalAsistidas: 0,
      totalNoAsistidas: 0,
      porcentajeAsistencia: 0,
      rutasAsistidas: [],
      todasLasRutas: [],
      participacionesDetalladas: [],
      rango: null,
      siguienteRango: null,
      progresoHaciaSiguiente: 0,
      totalParaSiguiente: 0,
    }
  }

  const totalParticipaciones = participaciones.length
  const totalAsistidas = participaciones.filter((p) => p.asiste === true).length
  const totalNoAsistidas = participaciones.filter(
    (p) => p.asiste === false,
  ).length
  /** Igual que app/index.html calcularRutasPorPersona: tasa sobre todas las participaciones. */
  const porcentajeAsistencia =
    totalParticipaciones > 0
      ? ((totalAsistidas / totalParticipaciones) * 100).toFixed(0)
      : 0

  const todasLasRutasUnicas = new Set()
  const rutasAsistidasUnicas = new Set()
  const rutasAsistidasDetalle = []

  participaciones.forEach((p) => {
    const rutaObj = findRutaPorParticipacion(p, rutas)
    const nombreRuta = nombreRutaDisplayParticipacion(p, rutaObj)
    if (!nombreRuta) return

    todasLasRutasUnicas.add(nombreRuta)

    if (p.asiste === true) {
      if (!rutasAsistidasUnicas.has(nombreRuta)) {
        rutasAsistidasUnicas.add(nombreRuta)
        const ruta = rutaObj
        rutasAsistidasDetalle.push({
          nombre: nombreRuta,
          fecha: ruta ? ruta.fecha : p.fecha || null,
          archivada: ruta ? ruta.archivada : false,
          vecesAsistio: participaciones.filter((pa) => {
            if (!pa.asiste) return false
            const nombrePa = nombreRutaDisplayParticipacion(
              pa,
              findRutaPorParticipacion(pa, rutas),
            )
            return nombrePa === nombreRuta
          }).length,
          ultimaAsistencia: p.fecha || null,
          lider: p.lider,
        })
      }
    }
  })

  rutasAsistidasDetalle.sort((a, b) => {
    if (!a.fecha && !b.fecha) return 0
    if (!a.fecha) return 1
    if (!b.fecha) return -1
    return new Date(b.fecha) - new Date(a.fecha)
  })

  const rutasAsistidasCount = rutasAsistidasUnicas.size
  const rango = calcularRangoAventurado(totalAsistidas)
  const siguienteRango = rango ? getSiguienteRango(rango) : null

  const participacionesDetalladas = participaciones
    .map((p) => {
      const ro = findRutaPorParticipacion(p, rutas)
      return {
        ruta: nombreRutaDisplayParticipacion(p, ro) || null,
        /** Fecha del evento en catálogo (preferida en UI). */
        fechaRuta: ro?.fecha ?? null,
        asiste: p.asiste,
        fecha: p.fecha,
        lider: p.lider,
        rutaId: p.rutaId || p.ruta_id,
      }
    })
    .sort((a, b) => {
      const ta = timestampOrdenDetalleParticipacion(a)
      const tb = timestampOrdenDetalleParticipacion(b)
      if (ta == null && tb == null) {
        return String(a.rutaId ?? '').localeCompare(String(b.rutaId ?? ''), 'en', {
          numeric: true,
        })
      }
      if (ta == null) return 1
      if (tb == null) return -1
      if (ta !== tb) return ta - tb
      return String(a.ruta || '').localeCompare(String(b.ruta || ''), 'es', {
        sensitivity: 'base',
      })
    })

  return {
    totalRutas: rutasAsistidasCount,
    totalRutasAsistidas: rutasAsistidasCount,
    totalTodasLasRutas: todasLasRutasUnicas.size,
    totalParticipaciones,
    totalAsistidas,
    totalNoAsistidas,
    porcentajeAsistencia,
    rutasAsistidas: rutasAsistidasDetalle,
    todasLasRutas: Array.from(todasLasRutasUnicas),
    participacionesDetalladas,
    rango,
    siguienteRango,
    progresoHaciaSiguiente: rango ? totalAsistidas - rango.minRutas : 0,
    totalParaSiguiente:
      rango && siguienteRango
        ? siguienteRango.minRutas - rango.minRutas
        : 0,
  }
}
