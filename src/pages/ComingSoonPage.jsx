export default function ComingSoonPage({ title }) {
  return (
    <section className="sa-page pt-5">
      <div className="sa-card p-8 text-center shadow-xl shadow-black/30">
        <p className="m-0 text-xs font-semibold uppercase tracking-widest text-emerald-400/80">
          Próximamente
        </p>
        <h2 className="mt-2 text-xl font-extrabold tracking-tight text-white">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Esta pestaña se migrará desde la app HTML. Mientras tanto usa la versión
          clásica si necesitas editar aquí.
        </p>
      </div>
    </section>
  )
}
