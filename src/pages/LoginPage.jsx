import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function resolveEmailFromUsername(raw) {
  const usuarioNorm = (raw || '').trim().toLowerCase()
  if (usuarioNorm === 'luifer') return 'luisfer@somosaventura2.com'
  if (usuarioNorm === 'chanti') return 'chantal@somosaventura2.com'
  return usuarioNorm
}

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      if (!cancelled && data?.session) navigate('/rutas', { replace: true })
    })()
    return () => {
      cancelled = true
    }
  }, [navigate])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!password.trim()) {
      setError('Introduce la contraseña')
      return
    }
    setLoading(true)
    try {
      const email = resolveEmailFromUsername(username)
      const { data, error: signErr } = await supabase.auth.signInWithPassword({
        email,
        password: password.trim(),
      })
      if (signErr) throw signErr
      if (data?.session) {
        navigate('/rutas', { replace: true })
        return
      }
      setError('Usuario o contraseña incorrectos')
    } catch (err) {
      console.error('Login error:', err)
      setError(err?.message || 'Usuario o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-12">
      <div
        className="sa-ambient-orb pointer-events-none absolute -left-24 top-0 h-72 w-72 rounded-full bg-teal-400/25 blur-[100px]"
        aria-hidden
      />
      <div
        className="sa-ambient-orb sa-ambient-orb--b pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-emerald-500/20 blur-[110px]"
        aria-hidden
      />
      <div
        className="sa-ambient-orb sa-ambient-orb--c pointer-events-none absolute left-1/2 top-1/3 h-48 w-48 -translate-x-1/2 rounded-full bg-cyan-400/15 blur-[80px]"
        aria-hidden
      />

      <div className="sa-login-card sa-motion-login">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/35 to-transparent"
          aria-hidden
        />
        <div className="mb-8 text-center">
          <img
            src="/logo.png"
            alt="SomosAventura"
            className="mx-auto h-28 w-auto max-w-[min(280px,calc(100vw-3rem))] object-contain drop-shadow-[0_8px_32px_rgba(0,0,0,0.45)] sm:h-32 sm:max-w-[300px]"
            width={300}
            height={120}
            onError={(e) => {
              const el = e.currentTarget
              if (el.getAttribute('src') === '/favicon.svg') return
              el.setAttribute('src', '/favicon.svg')
            }}
          />
          <h1 className="mt-6 text-xl font-extrabold tracking-tight text-white sm:text-2xl">
            Iniciar sesión
          </h1>
          <p className="mt-1.5 text-sm font-medium text-slate-400">
            Accede al panel de gestión
          </p>
        </div>
        <form
          onSubmit={handleSubmit}
          className="sa-motion-stagger flex flex-col gap-3.5"
        >
          <input
            type="text"
            autoComplete="username"
            placeholder="Usuario"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded-xl border border-white/[0.12] bg-slate-950/50 px-4 py-3.5 text-base text-white shadow-inner shadow-black/40 outline-none ring-0 transition-[border-color,box-shadow] placeholder:text-slate-500 focus:border-teal-400/45 focus:shadow-[0_0_0_3px_rgba(45,212,191,0.18)]"
          />
          <input
            type="password"
            autoComplete="current-password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/[0.12] bg-slate-950/50 px-4 py-3.5 text-base text-white shadow-inner shadow-black/40 outline-none placeholder:text-slate-500 focus:border-teal-400/45 focus:shadow-[0_0_0_3px_rgba(45,212,191,0.18)]"
          />
          <button
            type="submit"
            disabled={loading}
            className="sa-btn-primary mt-1 w-full py-3.5 text-base"
          >
            {loading ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>
        {error ? (
          <p className="mt-5 rounded-xl border border-rose-500/30 bg-rose-950/45 px-3 py-3 text-center text-sm text-rose-100">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  )
}
