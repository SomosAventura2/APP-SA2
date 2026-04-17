/** @param {string | null | undefined} iso */
export function formatRutaDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return new Intl.DateTimeFormat('es', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d)
}

/** Fecha corta tipo listas (evita desfases TZ como en index.html). */
export function formatRutaDateShort(fechaString) {
  if (!fechaString) return ''
  try {
    const fechaStr = String(fechaString).split('T')[0]
    const partes = fechaStr.split('-')
    if (partes.length === 3) {
      const año = parseInt(partes[0], 10)
      const mes = parseInt(partes[1], 10) - 1
      const dia = parseInt(partes[2], 10)
      const fecha = new Date(año, mes, dia)
      return fecha.toLocaleDateString('es-ES', {
        day: 'numeric',
        month: 'short',
      })
    }
    const fecha = new Date(fechaString)
    const fechaAjustada = new Date(
      fecha.getTime() + fecha.getTimezoneOffset() * 60000,
    )
    return fechaAjustada.toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
    })
  } catch {
    return String(fechaString)
  }
}
