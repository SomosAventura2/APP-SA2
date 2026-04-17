/** Participantes de una reserva concreta (líder + rutaId). */
export function participantesPorReserva(participantes, lider, rutaId) {
  return (participantes || []).filter(
    (p) =>
      p.lider === lider &&
      (p.rutaId === rutaId || p.ruta_id === rutaId),
  )
}

export function cardIdAsistencia(lider, rutaId) {
  const slug = (lider || '').replace(/\s+/g, '-').toLowerCase()
  return `asistencia-card-${slug}-${rutaId || ''}`
}
