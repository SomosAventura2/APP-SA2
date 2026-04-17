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

/**
 * Historial y rango de un aventurero por nombre (usa todas sus filas en `participantes`).
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

  const totalParticipaciones = todasParticipaciones.length
  const totalAsistidas = todasParticipaciones.filter((p) => p.asiste === true).length
  const totalNoAsistidas = todasParticipaciones.filter(
    (p) => p.asiste === false,
  ).length
  const porcentajeAsistencia =
    totalParticipaciones > 0
      ? ((totalAsistidas / totalParticipaciones) * 100).toFixed(0)
      : 0

  const todasLasRutasUnicas = new Set()
  const rutasAsistidasUnicas = new Set()
  const rutasAsistidasDetalle = []

  todasParticipaciones.forEach((p) => {
    const rutaObj = rutas.find((r) => r.id === (p.rutaId || p.ruta_id))
    const nombreRuta = (rutaObj && rutaObj.nombre
      ? rutaObj.nombre
      : (p.ruta_nombre || p.ruta || '')
    ).trim()
    if (!nombreRuta) return

    todasLasRutasUnicas.add(nombreRuta)

    if (p.asiste === true) {
      if (!rutasAsistidasUnicas.has(nombreRuta)) {
        rutasAsistidasUnicas.add(nombreRuta)
        const ruta = rutas.find(
          (r) => r.nombre === nombreRuta || r.id === (p.rutaId || p.ruta_id),
        )
        rutasAsistidasDetalle.push({
          nombre: nombreRuta,
          fecha: ruta ? ruta.fecha : null,
          archivada: ruta ? ruta.archivada : false,
          vecesAsistio: todasParticipaciones.filter((pa) => {
            const ro = rutas.find((r) => r.id === (pa.rutaId || pa.ruta_id))
            const nr = (ro && ro.nombre ? ro.nombre : pa.ruta_nombre || pa.ruta)
            return nr === nombreRuta && pa.asiste === true
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
    participacionesDetalladas: todasParticipaciones.map((p) => ({
      ruta:
        (rutas.find((r) => r.id === (p.rutaId || p.ruta_id)) || {}).nombre ||
        p.ruta_nombre ||
        p.ruta,
      asiste: p.asiste,
      fecha: p.fecha,
      lider: p.lider,
      rutaId: p.rutaId || p.ruta_id,
    })),
    rango,
    siguienteRango,
    progresoHaciaSiguiente: rango ? totalAsistidas - rango.minRutas : 0,
    totalParaSiguiente:
      rango && siguienteRango
        ? siguienteRango.minRutas - rango.minRutas
        : 0,
  }
}
