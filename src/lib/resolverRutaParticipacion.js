/**
 * Resuelve la fila `rutas` de una participación (activa o archivada).
 * Unifica `rutaId` / `ruta_id` y evita fallos por id numérico vs string desde Supabase.
 *
 * @param {Record<string, unknown>} p fila participantes
 * @param {Array<Record<string, unknown>>} rutas
 * @returns {Record<string, unknown> | null}
 */
export function findRutaPorParticipacion(p, rutas) {
  const list = rutas || []
  const id = p.rutaId ?? p.ruta_id
  if (id != null && id !== '') {
    /** No buscar por nombre si hay id: evita ligar reservas de una ruta borrada a otra nueva con el mismo nombre. */
    return list.find((r) => String(r.id) === String(id)) ?? null
  }
  const nom = (p.ruta_nombre || p.ruta || '').trim()
  if (!nom) return null
  return list.find((r) => (r.nombre || '').trim() === nom) ?? null
}

/**
 * Nombre para UI / historial: solo si la ruta existe en catálogo (`rutaObj`).
 * No se usa `ruta_nombre` huérfano (ruta borrada de la BD) para no mostrar rutas inexistentes.
 */
export function nombreRutaDisplayParticipacion(p, rutaObj) {
  if (!rutaObj) return ''
  return (
    String(rutaObj.nombre || '').trim() ||
    (p.ruta_nombre || p.ruta || '').trim() ||
    ''
  )
}
