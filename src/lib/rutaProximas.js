/**
 * Misma regla que la landing (`index.html` → `debeMostrarRutaEnProximas`):
 * el día del evento la ruta deja de mostrarse en “próximas” a las 8:00 local;
 * si el nombre incluye “nocturna”, a las 16:00.
 */

export function fechaLocalYYYYMMDD(d) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  )
}

/**
 * @param {{ fecha?: string, nombre?: string }} ruta
 * @param {Date} [ahora]
 */
export function debeMostrarRutaEnProximas(ruta, ahora = new Date()) {
  const fechaEvento = String(ruta?.fecha || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaEvento)) return true
  const hoyLocal = fechaLocalYYYYMMDD(ahora)
  if (fechaEvento > hoyLocal) return true
  if (fechaEvento < hoyLocal) return false
  const esNocturna = /nocturna/i.test(String(ruta?.nombre || ''))
  const horaCorte = esNocturna ? 16 : 8
  const limite = new Date(
    ahora.getFullYear(),
    ahora.getMonth(),
    ahora.getDate(),
    horaCorte,
    0,
    0,
    0,
  )
  return ahora < limite
}

/** Inversa de “próximas”: la ruta ya ocurrió para fines de tasa de asistencia. */
export function rutaYaPasadaParaTasaAsistencia(ruta, ahora = new Date()) {
  return !debeMostrarRutaEnProximas(ruta, ahora)
}
