import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Coins,
  FileText,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNotify } from '../../context/NotifyContext.jsx'
import { useGestionRealtime } from '../../hooks/useGestionRealtime'
import { supabase } from '../../lib/supabase'

async function fetchAbonados() {
  const { data, error } = await supabase
    .from('abonados')
    .select('*')
    .order('saldo_euros', { ascending: false })
  if (error) throw error
  return data || []
}

async function fetchMovimientos(abonadoId) {
  const { data, error } = await supabase
    .from('movimientos_abonos')
    .select('*')
    .eq('abonado_id', abonadoId)
    .order('fecha', { ascending: true })
  if (error) throw error
  return data || []
}

function saldoColorClass(saldo) {
  if (saldo > 100) return 'text-emerald-400'
  if (saldo > 20) return 'text-amber-400'
  return 'text-white'
}

function formatFechaMov(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es-ES', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return String(iso)
  }
}

export default function AbonadosPage() {
  const { toast, confirm } = useNotify()
  const [abonados, setAbonados] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState(null)
  const [movimientos, setMovimientos] = useState({})
  const [movLoading, setMovLoading] = useState(null)
  const [formLider, setFormLider] = useState('')
  const [formSaldo, setFormSaldo] = useState('')
  const [formNotas, setFormNotas] = useState('')
  const [formMsg, setFormMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const refreshSilent = useCallback(async () => {
    try {
      const list = await fetchAbonados()
      setAbonados(list)
      setError('')
    } catch (e) {
      console.warn('[abonados] realtime refresh', e)
    }
  }, [])

  useGestionRealtime(refreshSilent, 'abonados')

  const loadAll = useCallback(async () => {
    const list = await fetchAbonados()
    setAbonados(list)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        await loadAll()
        if (cancelled) return
        setError('')
      } catch (e) {
        console.error(e)
        if (cancelled) return
        setError(e?.message || 'No se pudieron cargar los abonados')
        setAbonados([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [loadAll])

  const conSaldo = useMemo(
    () =>
      abonados.filter((a) => parseFloat(a.saldo_euros || 0) > 0),
    [abonados],
  )

  const filtrados = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return conSaldo
    return conSaldo.filter((a) =>
      String(a.lider || '')
        .toLowerCase()
        .includes(q),
    )
  }, [conSaldo, search])

  const resumen = useMemo(() => {
    const n = conSaldo.length
    const total = conSaldo.reduce(
      (s, a) => s + parseFloat(a.saldo_euros || 0),
      0,
    )
    const promedio = n > 0 ? total / n : 0
    return { n, total, promedio }
  }, [conSaldo])

  async function handleRetry() {
    setLoading(true)
    try {
      await loadAll()
      setError('')
    } catch (e) {
      console.error(e)
      setError(e?.message || 'Error al recargar')
    } finally {
      setLoading(false)
    }
  }

  async function openMovimientos(abonadoId) {
    if (expandedId === abonadoId) {
      setExpandedId(null)
      return
    }
    setExpandedId(abonadoId)
    if (movimientos[abonadoId]) return
    setMovLoading(abonadoId)
    try {
      const rows = await fetchMovimientos(abonadoId)
      setMovimientos((prev) => ({ ...prev, [abonadoId]: rows }))
    } catch (e) {
      console.error(e)
      toast(e?.message || 'No se pudieron cargar los movimientos', 'error')
    } finally {
      setMovLoading(null)
    }
  }

  async function cargarAbonadoManual() {
    setFormMsg('')
    const liderTrim = formLider.trim()
    const saldo = parseFloat(String(formSaldo).replace(',', '.'))
    const notas = formNotas.trim()
    if (!liderTrim || Number.isNaN(saldo) || saldo <= 0) {
      setFormMsg('Indica líder y un saldo en € mayor que cero.')
      return
    }
    setSubmitting(true)
    try {
      const { data: existente, error: errEx } = await supabase
        .from('abonados')
        .select('*')
        .eq('lider', liderTrim)
        .maybeSingle()
      if (errEx && errEx.code !== 'PGRST116') throw errEx

      let abonado
      let saldoAntes
      let saldoDespues
      let descripcion
      let referencia

      if (existente) {
        saldoAntes = parseFloat(existente.saldo_euros || 0)
        saldoDespues = saldoAntes + saldo
        const { data: updated, error: upErr } = await supabase
          .from('abonados')
          .update({
            saldo_euros: saldoDespues,
            notas: notas || existente.notas,
            ultima_actualizacion: new Date().toISOString(),
          })
          .eq('id', existente.id)
          .select()
          .single()
        if (upErr) throw upErr
        abonado = updated
        descripcion = 'Carga de saldo'
        referencia = 'CARGA'
      } else {
        saldoAntes = 0
        saldoDespues = saldo
        const { data: nuevo, error: insErr } = await supabase
          .from('abonados')
          .insert({
            lider: liderTrim,
            saldo_euros: saldo,
            notas: notas || null,
            ultima_actualizacion: new Date().toISOString(),
          })
          .select()
          .single()
        if (insErr) throw insErr
        abonado = nuevo
        descripcion = 'Carga inicial desde notas'
        referencia = 'INICIAL'
      }

      const { error: movErr } = await supabase.from('movimientos_abonos').insert({
        abonado_id: abonado.id,
        tipo: 'carga',
        monto_euros: saldo,
        saldo_antes: saldoAntes,
        saldo_despues: saldoDespues,
        descripcion,
        referencia,
        usuario: 'admin',
        fecha: new Date().toISOString(),
      })
      if (movErr) throw movErr

      setFormLider('')
      setFormSaldo('')
      setFormNotas('')
      const okMsg = `Cargados €${saldo.toFixed(2)} para ${liderTrim}.`
      setFormMsg(okMsg)
      toast(okMsg, 'success')
      await loadAll()
      setMovimientos((prev) => {
        const next = { ...prev }
        delete next[abonado.id]
        return next
      })
    } catch (e) {
      console.error(e)
      const msg = e?.message || 'Error al guardar.'
      setFormMsg(msg)
      toast(msg, 'error')
    } finally {
      setSubmitting(false)
    }
  }

  async function eliminarAbonado(abonadoId, lider) {
    const ok = await confirm({
      title: 'Eliminar abonado',
      message: `¿Eliminar el abono de ${lider}?\n\nSe borrarán el saldo y todos los movimientos.`,
      confirmLabel: 'Eliminar',
      cancelLabel: 'Cancelar',
      danger: true,
    })
    if (!ok) return
    try {
      const { error: d1 } = await supabase
        .from('movimientos_abonos')
        .delete()
        .eq('abonado_id', abonadoId)
      if (d1) throw d1
      const { error: d2 } = await supabase.from('abonados').delete().eq('id', abonadoId)
      if (d2) throw d2
      setExpandedId(null)
      setMovimientos((prev) => {
        const next = { ...prev }
        delete next[abonadoId]
        return next
      })
      await loadAll()
      toast('Abonado eliminado.', 'success')
    } catch (e) {
      console.error(e)
      toast(e?.message || 'Error al eliminar', 'error')
    }
  }

  return (
    <section className="sa-page">
      <div className="sa-card mb-4 p-4 shadow-lg">
        <h2 className="m-0 flex items-center gap-2 text-sm font-extrabold text-white">
          <Coins
            className="h-4 w-4 shrink-0 text-amber-400/90"
            strokeWidth={2}
            aria-hidden
          />
          Resumen de abonados
        </h2>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2 py-3 text-center">
            <span className="block text-lg font-extrabold text-emerald-300">
              {resumen.n}
            </span>
            <span className="text-[10px] font-medium text-slate-500">
              Con saldo
            </span>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2 py-3 text-center">
            <span className="block text-lg font-extrabold text-emerald-300">
              €{resumen.total.toFixed(2)}
            </span>
            <span className="text-[10px] font-medium text-slate-500">
              Total €
            </span>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.04] px-2 py-3 text-center">
            <span className="block text-lg font-extrabold text-emerald-300">
              €{resumen.promedio.toFixed(2)}
            </span>
            <span className="text-[10px] font-medium text-slate-500">
              Promedio
            </span>
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          void cargarAbonadoManual()
        }}
        className="sa-card mb-6 p-4 shadow-lg"
      >
        <h2 className="m-0 text-sm font-extrabold text-white">+ Cargar saldo</h2>
        <p className="mt-1 text-[11px] text-slate-500">
          Misma lógica que la app HTML: si el líder no existe, se crea el registro.
        </p>
        <div className="mt-3 flex flex-col gap-3">
          <input
            type="text"
            value={formLider}
            onChange={(e) => setFormLider(e.target.value)}
            placeholder="Líder"
            className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
          />
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={formSaldo}
            onChange={(e) => setFormSaldo(e.target.value)}
            placeholder="Monto € a cargar"
            className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
          />
          <input
            type="text"
            value={formNotas}
            onChange={(e) => setFormNotas(e.target.value)}
            placeholder="Notas (opcional)"
            className="w-full rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2.5 text-base text-white outline-none placeholder:text-slate-500 focus:border-emerald-500/40"
          />
          <button
            type="submit"
            disabled={submitting}
            className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 py-2.5 text-sm font-bold text-white shadow-lg shadow-emerald-950/30 disabled:opacity-60"
          >
            {submitting ? 'Guardando…' : 'Guardar carga'}
          </button>
          {formMsg ? (
            <p className="m-0 text-center text-xs text-slate-400">{formMsg}</p>
          ) : null}
        </div>
      </form>

      <div className="mb-4">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar líder..."
          className="sa-input-search"
        />
      </div>

      {loading ? (
        <p className="text-center text-sm text-slate-400">Cargando…</p>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-500/25 bg-red-950/35 p-4 text-sm text-red-100">
          {error}
          <button
            type="button"
            onClick={() => void handleRetry()}
            className="mt-3 block w-full rounded-xl border border-white/15 py-2.5 text-white hover:bg-white/10"
          >
            Reintentar
          </button>
        </div>
      ) : null}

      {!loading && !error && filtrados.length === 0 ? (
        <div className="sa-card p-10 text-center">
          <div className="flex justify-center">
            <Coins
              className="h-14 w-14 text-slate-600"
              strokeWidth={1.25}
              aria-hidden
            />
          </div>
          <p className="mt-3 text-sm text-slate-400">
            {search.trim()
              ? 'No hay abonados que coincidan.'
              : 'No hay abonados con saldo. Usa el formulario de arriba.'}
          </p>
        </div>
      ) : null}

      <ul className="flex list-none flex-col gap-2 p-0">
        {!loading &&
          !error &&
          filtrados.map((a) => {
            const saldo = parseFloat(a.saldo_euros || 0)
            const ultima = a.ultima_actualizacion
              ? new Date(a.ultima_actualizacion).toLocaleDateString('es-ES')
              : '—'
            const notas = a.notas
              ? `${String(a.notas).slice(0, 40)}${String(a.notas).length > 40 ? '…' : ''}`
              : ''
            const open = expandedId === a.id
            const rows = movimientos[a.id] || []
            return (
              <li
                key={a.id}
                className="overflow-hidden rounded-xl border border-white/10 bg-slate-900/50 backdrop-blur-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-white">{a.lider}</div>
                    <div
                      className={`mt-1 text-xl font-extrabold ${saldoColorClass(saldo)}`}
                    >
                      €{saldo.toFixed(2)}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar
                          className="h-3 w-3 shrink-0 opacity-80"
                          strokeWidth={2}
                          aria-hidden
                        />
                        {ultima}
                      </span>
                      {notas ? (
                        <span className="inline-flex min-w-0 items-center gap-1">
                          <FileText
                            className="h-3 w-3 shrink-0 opacity-80"
                            strokeWidth={2}
                            aria-hidden
                          />
                          <span className="truncate">{notas}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => void openMovimientos(a.id)}
                      className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                      title="Movimientos"
                    >
                      {movLoading === a.id ? (
                        '…'
                      ) : open ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormLider(a.lider || '')
                        setFormSaldo('')
                        setFormNotas('')
                        setFormMsg('')
                        window.scrollTo({ top: 0, behavior: 'smooth' })
                      }}
                      className="rounded-lg border border-emerald-500/30 bg-emerald-500/15 px-3 py-2 text-xs font-bold text-emerald-200"
                    >
                      +€
                    </button>
                    <button
                      type="button"
                      onClick={() => void eliminarAbonado(a.id, a.lider)}
                      className="rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-200"
                      title="Eliminar abonado"
                    >
                      <Trash2 className="h-4 w-4" strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                </div>
                {open ? (
                  <div className="border-t border-white/10 bg-black/25 px-3 py-3">
                    <p className="m-0 text-xs font-bold text-slate-300">
                      Movimientos
                    </p>
                    {rows.length === 0 && movLoading !== a.id ? (
                      <p className="mt-2 text-xs text-slate-500">Sin movimientos</p>
                    ) : (
                      <ul className="mt-2 max-h-52 list-none space-y-2 overflow-y-auto p-0">
                        {rows.map((m) => {
                          const esCarga = m.tipo === 'carga'
                          const color = esCarga ? 'text-emerald-400' : 'text-rose-400'
                          const signo = esCarga ? '+' : '−'
                          return (
                            <li
                              key={m.id}
                              className="rounded-lg border border-white/[0.06] bg-white/[0.04] px-2 py-2 text-[11px]"
                            >
                              <div className="flex justify-between gap-2">
                                <span className={`font-bold ${color}`}>
                                  {signo}€
                                  {parseFloat(m.monto_euros || 0).toFixed(2)}{' '}
                                  {m.tipo}
                                </span>
                                <span className="shrink-0 text-slate-500">
                                  {formatFechaMov(m.fecha)}
                                </span>
                              </div>
                              {m.descripcion ? (
                                <div className="mt-1 text-slate-400">{m.descripcion}</div>
                              ) : null}
                              <div className="mt-1 text-slate-500">
                                €{parseFloat(m.saldo_antes || 0).toFixed(2)} → €
                                {parseFloat(m.saldo_despues || 0).toFixed(2)}
                              </div>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                ) : null}
              </li>
            )
          })}
      </ul>
    </section>
  )
}
