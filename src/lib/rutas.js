/** Normaliza una fila `rutas` al formato usado en la app (alineado con app/index.html). */
export function mapRuta(r, index) {
  return {
    ...r,
    archivada: r.archivada === true,
    precioEuros: r.precio_euros ?? r.precioEuros ?? 0,
    numero: r.numero ?? index + 1,
  }
}
