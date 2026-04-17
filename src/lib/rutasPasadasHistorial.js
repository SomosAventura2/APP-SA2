/**
 * Rutas pasadas o archivadas (misma lógica que getRutasPasadasParaHistorial en app/index.html).
 * @param {Array<Record<string, unknown>>} rutas
 */
export function getRutasPasadasParaHistorial(rutas) {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return (rutas || [])
    .filter((r) => {
      const archivada = r.archivada === true
      const fechaPasada =
        r.fecha &&
        new Date(`${String(r.fecha).split('T')[0]}T12:00:00`) < hoy
      return archivada || fechaPasada
    })
    .slice()
    .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')))
}
