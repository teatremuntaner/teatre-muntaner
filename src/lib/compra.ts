// EL ENLACE DE COMPRA DE UNA FUNCIÓN CONCRETA.
//
// Carlos, 19/11/2026: pulsar un día y una hora en la web tiene que llevar a ESA función en la
// venta, no a la página general del espectáculo, donde había que volver a elegir la fecha.
//
// En Qwantic basta con abrir `comprarEvento?idEvento=<espectáculo>&idSesion=<función>`: la
// página llega con esa función ya elegida. Comprobado el 19/11/2026 en la venta del Sofía y
// en la del Muntaner. El número de la función lo escribe el sincronizador en cada fecha de la
// ficha (`session:`), y el del espectáculo es su `qwanticEventId`.
//
// Cuándo se arma y cuándo no:
//   · El enlace de entradas de la ficha es la compra de ese espectáculo
//     (`comprarEvento?idEvento=<el mismo>`): se le añade la función.
//   · Es otra página de la MISMA venta, sin espectáculo en la dirección (el calendario de
//     Clap o de Umberto, que Carlos quiso como botón general): la hora abre igualmente la
//     compra de su función en esa venta. El botón general de la ficha no cambia.
//   · Apunta a otro espectáculo, a otra web o ya lleva función: se respeta tal cual. Una
//     función de otro espectáculo sería peor que la página general.
//   · La fecha no trae número: el enlace de siempre.

const ES_VENTA = /(^|\.)entradas\.plus$/i;
const NUM = /^\d+$/;

export function urlDeLaFuncion(
  ticketUrl: string | undefined,
  eventoId: string | undefined,
  sesionId: string | undefined,
): string | undefined {
  if (!ticketUrl || !sesionId || !eventoId || !NUM.test(sesionId) || !NUM.test(String(eventoId))) return ticketUrl;
  let u: URL;
  try {
    u = new URL(ticketUrl);
  } catch {
    return ticketUrl;
  }
  if (u.protocol !== 'https:' || !ES_VENTA.test(u.hostname)) return ticketUrl;
  if (u.searchParams.has('idSesion')) return ticketUrl;
  const evento = u.searchParams.get('idEvento');
  if (evento !== null) {
    if (evento !== String(eventoId) || !/\/comprarEvento$/i.test(u.pathname)) return ticketUrl;
    u.searchParams.set('idSesion', sesionId);
    return u.toString();
  }
  const compra = new URL('/entradas/comprarEvento', u.origin);
  compra.searchParams.set('idEvento', String(eventoId));
  compra.searchParams.set('idSesion', sesionId);
  return compra.toString();
}
