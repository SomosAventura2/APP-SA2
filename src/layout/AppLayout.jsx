import {
  ClipboardCheck,
  Coins,
  History,
  LogOut,
  MapPinned,
  Receipt,
  Ticket,
  Trophy,
  UsersRound,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const TABS = [
  { to: '/rutas', label: 'Rutas', Icon: MapPinned, end: true },
  { to: '/reservas', label: 'Reservas', Icon: Ticket },
  { to: '/participantes', label: 'Personas', Icon: UsersRound },
  { to: '/asistencia', label: 'Asistencia', Icon: ClipboardCheck },
  { to: '/gastos', label: 'Gastos', Icon: Receipt },
  { to: '/ranking', label: 'Ranking', Icon: Trophy },
  { to: '/abonados', label: 'Abonados', Icon: Coins },
  { to: '/historial', label: 'Historial', Icon: History },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-dvh text-slate-100">
      <header className="fixed inset-x-0 top-0 z-[9999] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex min-h-[56px] w-full max-w-[520px] items-center justify-between gap-3 px-4 py-2 sm:px-5">
          <div className="sa-motion-header flex min-w-0 flex-1 items-center gap-3 rounded-2xl border border-white/[0.08] bg-slate-950/55 px-3 py-2 shadow-lg shadow-black/30 ring-1 ring-white/[0.04] backdrop-blur-xl">
            <img
              src="/logo.png"
              alt=""
              className="h-9 w-auto max-w-[88px] shrink-0 object-contain"
              onError={(e) => {
                e.currentTarget.style.display = 'none'
              }}
            />
            <div className="min-w-0">
              <h1 className="truncate text-[15px] font-extrabold leading-tight tracking-tight text-white">
                Gestión de rutas
              </h1>
              <p className="truncate text-[11px] font-medium text-slate-400">
                Operaciones y reservas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            title="Cerrar sesión"
            className="sa-motion-header-delay flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-2xl border border-white/[0.1] bg-white/[0.06] text-slate-200 shadow-md shadow-black/25 backdrop-blur-md transition-[background,border-color,color,transform] duration-200 hover:border-teal-400/35 hover:bg-teal-500/15 hover:text-teal-50 active:scale-[0.96]"
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={2.25} aria-hidden />
            <span className="sr-only">Salir</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-[520px] pb-[var(--sa-bottom-nav)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] pt-[var(--sa-header-total)]">
        <div key={pathname} className="sa-motion-page">
          <Outlet />
        </div>
      </div>

      <nav
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[9980] flex justify-center px-3 pb-[max(10px,env(safe-area-inset-bottom))] pt-2"
        aria-label="Secciones principales"
      >
        <div className="sa-motion-dock pointer-events-auto flex w-full max-w-[min(520px,calc(100vw-20px))] rounded-[1.25rem] border border-white/[0.09] bg-slate-950/72 px-1 py-1.5 shadow-[0_18px_48px_-12px_rgba(0,0,0,0.72)] ring-1 ring-white/[0.05] backdrop-blur-2xl">
          <div className="grid w-full grid-cols-8 gap-0">
            {TABS.map((tab) => {
              const { to, label, end, Icon: TabIcon } = tab
              return (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  title={label}
                  className={({ isActive }) =>
                    [
                      'group relative flex min-h-[48px] min-w-0 flex-col items-center justify-center rounded-xl py-1 transition-colors duration-200 ease-out',
                      isActive
                        ? 'text-teal-300'
                        : 'text-slate-500 hover:text-slate-300',
                    ].join(' ')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <span
                          className="sa-motion-nav-pill absolute inset-x-1 top-1 bottom-1 -z-0 rounded-lg bg-gradient-to-b from-teal-400/18 to-emerald-600/10 ring-1 ring-teal-400/20"
                          aria-hidden
                        />
                      ) : null}
                      <TabIcon
                        className="relative z-[1] h-[21px] w-[21px] shrink-0 stroke-[2.1] transition-transform duration-200 ease-out group-active:scale-[0.92]"
                        aria-hidden
                      />
                      <span className="sr-only">{label}</span>
                    </>
                  )}
                </NavLink>
              )
            })}
          </div>
        </div>
      </nav>
    </div>
  )
}
