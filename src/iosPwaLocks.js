/**
 * Mitigaciones iOS PWA / Safari: gestos de pellizco y zoom por rueda+Ctrl (trackpad).
 * Complementa viewport user-scalable=no en index.html.
 *
 * Accesibilidad: user-scalable=no impide el zoom manual del usuario; el producto
 * compensa con tipografía base legible y font-size ≥16px en campos (#root en index.css).
 */

function preventGesture(ev) {
  ev.preventDefault()
}

function onWheelZoom(ev) {
  if (ev.ctrlKey) ev.preventDefault()
}

if (typeof document !== 'undefined') {
  const opts = { passive: false }
  const el = document.documentElement
  el.addEventListener('gesturestart', preventGesture, opts)
  el.addEventListener('gesturechange', preventGesture, opts)
  el.addEventListener('gestureend', preventGesture, opts)
}

if (typeof window !== 'undefined') {
  window.addEventListener('wheel', onWheelZoom, { passive: false })
}
