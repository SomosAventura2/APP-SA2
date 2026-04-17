import { calcularRangoAventurado, getSiguienteRango } from './aventurero'

/**
 * Ranking de aventureros (misma lógica que `generarRankingAventurados` en index.html).
 * @param {Array<Record<string, unknown>>} participantes
 */
export function generarRankingAventurados(participantes) {
  const personasMap = new Map()
  ;(participantes || []).forEach((p) => {
    const nombre = (p.nombre || '').trim()
    if (!nombre) return
    if (!personasMap.has(nombre)) {
      personasMap.set(nombre, {
        nombre,
        rutasAsistidasSet: new Set(),
        participaciones: [],
      })
    }
    const persona = personasMap.get(nombre)
    persona.participaciones.push(p)
    if (p.asiste === true) {
      const claveRuta = p.rutaId || p.ruta_id || (p.ruta_nombre || p.ruta)
      if (claveRuta) persona.rutasAsistidasSet.add(claveRuta)
    }
  })

  const ordenRangos = {
    Diamante: 6,
    Platino: 5,
    Oro: 4,
    Plata: 3,
    Bronce: 2,
    Novato: 1,
  }

  const ranking = Array.from(personasMap.values())
    .map((persona) => {
      const rutasAsistidas = persona.rutasAsistidasSet.size
      const totalParticipaciones = persona.participaciones.length
      const totalAsistidas = persona.participaciones.filter(
        (pa) => pa.asiste === true,
      ).length
      const porcentajeAsistencia =
        totalParticipaciones > 0
          ? Math.round((totalAsistidas / totalParticipaciones) * 100)
          : 0
      const rango = calcularRangoAventurado(totalAsistidas)
      const siguienteRango = rango ? getSiguienteRango(rango) : null
      return {
        nombre: persona.nombre,
        rutasAsistidas,
        totalParticipaciones,
        totalAsistidas,
        porcentajeAsistencia,
        rango,
        siguienteRango,
        progreso: rango ? totalAsistidas - rango.minRutas : 0,
        totalParaSiguiente:
          rango && siguienteRango
            ? siguienteRango.minRutas - rango.minRutas
            : 0,
      }
    })
    .filter((p) => p.rango != null && p.totalAsistidas >= 2)

  ranking.sort((a, b) => {
    const pesoA = ordenRangos[a.rango.nombre] || 0
    const pesoB = ordenRangos[b.rango.nombre] || 0
    if (pesoB !== pesoA) return pesoB - pesoA
    if (b.totalAsistidas !== a.totalAsistidas)
      return b.totalAsistidas - a.totalAsistidas
    if (b.porcentajeAsistencia !== a.porcentajeAsistencia)
      return b.porcentajeAsistencia - a.porcentajeAsistencia
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', {
      sensitivity: 'base',
    })
  })

  return ranking
}
