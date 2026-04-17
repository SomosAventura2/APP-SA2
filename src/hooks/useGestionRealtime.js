import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

const TABLES = [
  'participantes',
  'reservas',
  'rutas',
  'gastos',
  'abonados',
  'movimientos_abonos',
]

/**
 * Escucha cambios en tablas clave y llama a `onInvalidate` (debounced).
 * No muestra loaders: pensado para refrescar datos en segundo plano.
 * @param {() => void | Promise<void>} onInvalidate
 * @param {string} channelSuffix sufijo único por pantalla (evita colisiones de canal)
 */
export function useGestionRealtime(onInvalidate, channelSuffix = 'app') {
  const callbackRef = useRef(onInvalidate)
  const debounceRef = useRef(null)

  useEffect(() => {
    callbackRef.current = onInvalidate
  }, [onInvalidate])

  useEffect(() => {
    const schedule = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null
        const fn = callbackRef.current
        if (typeof fn === 'function') void fn()
      }, 450)
    }

    const channel = supabase.channel(`gestion-v2-${channelSuffix}`)
    for (const table of TABLES) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        schedule,
      )
    }

    channel.subscribe((status) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[gestion realtime]', status)
      }
    })

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      void supabase.removeChannel(channel)
    }
  }, [channelSuffix])
}
