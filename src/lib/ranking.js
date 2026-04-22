import { calcularRangoAventurado, getSiguienteRango } from './aventurero'
import { findRutaPorParticipacion } from './resolverRutaParticipacion'
import { rutaYaPasadaParaTasaAsistencia } from './rutaProximas'

function participacionAsisteValor(pa) {
  const v = pa?.asiste
  return v === true || v === 1 || v === 'true' || v === 't'
}

/** Mediodía local en el día del evento (o parse ISO). */
function timestampMsEventoRutaOParticipacion(ruta, pa) {
  const s = (ruta?.fecha ?? pa?.fecha ?? '').toString()
  if (!s) return null
  const day = s.split('T')[0]
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    const t = new Date(s).getTime()
    return Number.isFinite(t) ? t : null
  }
  const [y, m, d] = day.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0).getTime()
}

/**
 * Fecha en que alcanzó la N-ésima ruta distinta con asistencia (cronología de primeras asistencias).
 * N más pequeño en el tiempo = mejor “antigüedad” en el desempate.
 */
function milestoneAlcanzoNRutasDistintas(
  participaciones,
  rutasList,
  nRutas,
  findRuta,
  asisteFn,
) {
  if (!nRutas || nRutas < 1) return Number.POSITIVE_INFINITY
  const primeraPorRuta = new Map()
  for (const pa of participaciones) {
    if (!asisteFn(pa)) continue
    const ruta = findRuta(pa, rutasList)
    if (!ruta || ruta.id == null || ruta.id === '') continue
    const id = String(ruta.id)
    const ms = timestampMsEventoRutaOParticipacion(ruta, pa)
    if (ms == null) continue
    const prev = primeraPorRuta.get(id)
    if (prev == null || ms < prev) primeraPorRuta.set(id, ms)
  }
  const fechas = [...primeraPorRuta.values()].sort((a, b) => a - b)
  if (fechas.length < nRutas) return Number.POSITIVE_INFINITY
  return fechas[nRutas - 1]
}

/**
 * Ranking de aventureros (orden alineado con landings).
 * Ignora participaciones huérfanas (ruta borrada del catálogo).
 *
 * Orden: 1) más rutas distintas asistidas · 2) mayor tasa (solo rutas pasadas/archivadas) ·
 * 3) antes alcanzó ese número de rutas · 4) nombre.
 *
 * @param {Array<Record<string, unknown>>} participantes
 * @param {Array<Record<string, unknown>>} rutas
 */
export function generarRankingAventurados(participantes, rutas = []) {
  const rutasList = rutas || []
  const raw = participantes || []
  const filas =
    rutasList.length > 0
      ? raw.filter((p) => Boolean(findRutaPorParticipacion(p, rutasList)))
      : raw

  function participacionCuentaParaTasa(pa) {
    const ruta = findRutaPorParticipacion(pa, rutasList)
    if (!ruta) return false
    if (ruta.archivada === true) return true
    return rutaYaPasadaParaTasaAsistencia(ruta)
  }

  const personasMap = new Map()
  filas.forEach((p) => {
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
    if (participacionAsisteValor(p)) {
      const ruta = findRutaPorParticipacion(p, rutasList)
      if (ruta != null && ruta.id != null && ruta.id !== '') {
        persona.rutasAsistidasSet.add(String(ruta.id))
      }
    }
  })

  const ranking = Array.from(personasMap.values())
    .map((persona) => {
      const rutasAsistidas = persona.rutasAsistidasSet.size
      const totalParticipaciones = persona.participaciones.length
      const totalAsistidas = persona.participaciones.filter(
        participacionAsisteValor,
      ).length
      const participacionesPasadas = persona.participaciones.filter(
        participacionCuentaParaTasa,
      )
      const totalPartTasa = participacionesPasadas.length
      const totalAsistTasa = participacionesPasadas.filter(
        participacionAsisteValor,
      ).length
      const porcentajeAsistencia =
        totalPartTasa > 0
          ? Math.round((totalAsistTasa / totalPartTasa) * 100)
          : 0
      const rango = calcularRangoAventurado(totalAsistidas)
      const siguienteRango = rango ? getSiguienteRango(rango) : null
      const milestoneMs = milestoneAlcanzoNRutasDistintas(
        persona.participaciones,
        rutasList,
        rutasAsistidas,
        findRutaPorParticipacion,
        participacionAsisteValor,
      )
      return {
        nombre: persona.nombre,
        rutasAsistidas,
        totalParticipaciones,
        totalAsistidas,
        porcentajeAsistencia,
        _tasaPart: totalPartTasa,
        _tasaAsis: totalAsistTasa,
        _milestoneMs: milestoneMs,
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
    if (b.rutasAsistidas !== a.rutasAsistidas)
      return b.rutasAsistidas - a.rutasAsistidas
    const pctB = Number(b.porcentajeAsistencia) || 0
    const pctA = Number(a.porcentajeAsistencia) || 0
    if (pctB !== pctA) return pctB - pctA
    const rawB =
      (b._tasaPart || 0) > 0 ? (b._tasaAsis || 0) / b._tasaPart : -1
    const rawA =
      (a._tasaPart || 0) > 0 ? (a._tasaAsis || 0) / a._tasaPart : -1
    if (rawB !== rawA) return rawB > rawA ? 1 : rawB < rawA ? -1 : 0
    const mileA = a._milestoneMs ?? Number.POSITIVE_INFINITY
    const mileB = b._milestoneMs ?? Number.POSITIVE_INFINITY
    if (mileA !== mileB) return mileA - mileB
    return (a.nombre || '').localeCompare(b.nombre || '', 'es', {
      sensitivity: 'base',
    })
  })

  return ranking
}
