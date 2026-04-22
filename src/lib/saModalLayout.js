/**
 * Clases compartidas de modales — mismo criterio que el modal de pagos en Reservas.
 * Backdrop: slate 80% + blur md + padding inferior respetando toasts.
 * Panel: gradiente slate-900 → slate-950, borde sutil, sa-motion-modal.
 */

export const SA_MODAL_Z = {
  confirm: 'z-[10100]',
  editReserva: 'z-[10130]',
  pagos: 'z-[10190]',
  personHistorial: 'z-[10200]',
  historialStats: 'z-[10210]',
}

/** Contenedor de fondo (suele llevar role="presentation" y onClick para cerrar). */
export function saModalBackdropClass(zKey) {
  const z = SA_MODAL_Z[zKey] ?? SA_MODAL_Z.pagos
  return `${z} fixed inset-0 flex items-end justify-center bg-slate-950/80 p-4 pb-[max(1rem,var(--sa-toast-offset))] backdrop-blur-md sm:items-center`
}

/** Panel con scroll (pagos, estadísticas, confirmación). */
export const SA_MODAL_PANEL_SCROLL =
  'sa-motion-modal max-h-[min(85vh,720px)] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-5 shadow-2xl sm:p-6'

/** Panel compacto (editar reserva). */
export const SA_MODAL_PANEL_COMPACT =
  'sa-motion-modal w-full max-w-md rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl'

/** Diálogo de confirmación (ancho fijo ~400px). */
export const SA_MODAL_PANEL_CONFIRM =
  'sa-motion-modal w-full max-w-[400px] rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl'

/**
 * Panel tipo columna: cabecera fija + cuerpo con scroll interno
 * (perfil / historial de persona).
 */
export const SA_MODAL_PANEL_COLUMN =
  'sa-motion-modal flex max-h-[min(88vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl'

/** Botón cerrar (X) alineado con modal de pagos. */
export const SA_MODAL_BTN_CLOSE =
  'shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white disabled:opacity-40'
