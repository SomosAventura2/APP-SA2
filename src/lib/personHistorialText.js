/**
 * Texto plano para compartir (WhatsApp), alineado con verHistorialRutas en app/index.html.
 * @param {string} nombrePersona
 * @param {Record<string, unknown>} historial resultado de calcularRutasPorPersona
 */
export function buildPersonHistorialShareText(nombrePersona, historial) {
  if (!historial || historial.totalParticipaciones === 0) return ''

  const nombre = nombrePersona || ''
  let mensaje = `📊 HISTORIAL COMPLETO: ${nombre.toUpperCase()}\n\n`
  mensaje += `📈 RESUMEN ESTADÍSTICO:\n`
  mensaje += `• Rutas asistidas: ${historial.totalRutasAsistidas}\n`
  mensaje += `• Total de rutas participadas: ${historial.totalTodasLasRutas}\n`
  mensaje += `• Participaciones totales: ${historial.totalParticipaciones}\n`
  mensaje += `• ✅ Asistencias: ${historial.totalAsistidas}\n`
  mensaje += `• ❌ Ausencias: ${historial.totalNoAsistidas}\n`
  mensaje += `• Tasa de asistencia: ${historial.porcentajeAsistencia}%\n\n`

  if (historial.rutasAsistidas?.length > 0) {
    mensaje += `🏔️ RUTAS CON ASISTENCIA (${historial.rutasAsistidas.length}):\n\n`
    historial.rutasAsistidas.forEach((ruta, index) => {
      mensaje += `${index + 1}. ${ruta.nombre}\n`
      if (ruta.fecha) {
        const fechaFormateada = new Date(ruta.fecha).toLocaleDateString(
          'es-ES',
          { day: 'numeric', month: 'short', year: 'numeric' },
        )
        mensaje += `   📅 ${fechaFormateada}\n`
      }
      if (ruta.vecesAsistio > 1)
        mensaje += `   🔄 ${ruta.vecesAsistio} veces asistió\n`
      if (ruta.lider) mensaje += `   👤 ${ruta.lider}\n`
      mensaje += '\n'
    })
  }

  mensaje += `📋 DETALLE DE TODAS LAS PARTICIPACIONES:\n\n`
  const participacionesPorRuta = {}
  ;(historial.participacionesDetalladas || []).forEach((p) => {
    const r = String(p.ruta || '').trim()
    if (!r) return
    if (!participacionesPorRuta[r]) participacionesPorRuta[r] = []
    participacionesPorRuta[r].push(p)
  })

  Object.entries(participacionesPorRuta).forEach(
    ([nombreRuta, participaciones], rutaIndex) => {
      const totalEnRuta = participaciones.length
      const asistidasEnRuta = participaciones.filter(
        (pa) => pa.asiste === true,
      ).length
      mensaje += `${rutaIndex + 1}. ${nombreRuta}\n`
      mensaje += `   ${asistidasEnRuta}/${totalEnRuta} veces asistió\n`
      participaciones.forEach((part, pIndex) => {
        const estado = part.asiste === true ? '✅' : '❌'
        const fecha = part.fecha
          ? new Date(part.fecha).toLocaleDateString('es-ES', {
              day: 'numeric',
              month: 'short',
            })
          : 'Sin fecha'
        mensaje += `   ${pIndex + 1}) ${estado} ${fecha} - ${part.lider || 'Sin líder'}\n`
      })
      mensaje += '\n'
    },
  )

  return mensaje
}

/**
 * Texto corto para WhatsApp desde el perfil de ranking (verDetalleAventurero en app/index.html).
 * @param {string} nombrePersona
 * @param {Record<string, unknown>} historial resultado de calcularRutasPorPersona
 */
export function buildRankingHistorialShareText(nombrePersona, historial) {
  if (!historial?.rango) return ''

  const nombre = nombrePersona || ''
  let textoShare = `*${historial.rango.emoji} ${historial.rango.nombre}*\n\n`
  textoShare += `👤 ${(nombre || '').replace(/\*/g, '')}\n\n`
  textoShare += `📊 *Estadísticas* (rango por asistencias)\n`
  textoShare += `• Rutas diferentes: ${historial.totalRutas}\n`
  textoShare += `• Participaciones: ${historial.totalParticipaciones}\n\n`

  if (historial.rutasAsistidas?.length > 0) {
    textoShare += `🏔️ *Rutas asistidas:*\n`
    historial.rutasAsistidas.slice(0, 15).forEach((r) => {
      const veces = r.vecesAsistio || 1
      const sufijo = veces > 1 ? ` x${veces}` : ''
      textoShare += `• ${(r.nombre || '').replace(/\*/g, '')}${sufijo}\n`
    })
    if (historial.rutasAsistidas.length > 15)
      textoShare += `• +${historial.rutasAsistidas.length - 15} más\n`
  }

  if (historial.siguienteRango) {
    const faltan = historial.siguienteRango.minRutas - historial.totalAsistidas
    textoShare += `\n🎯 Próximo rango: ${historial.siguienteRango.emoji} ${historial.siguienteRango.nombre} (faltan ${faltan} asistencias)`
  }

  return textoShare
}
