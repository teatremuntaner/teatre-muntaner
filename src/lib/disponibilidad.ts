// LA VENTA DE CADA FUNCIÓN: «Agotada», «Últimas entradas» o nada (Carlos, 05/11/2026).
// Es la misma pieza que la web del Teatro Sofía; si se cambia el criterio, en las dos.
//
// Sale de dos sitios, y la web los junta aquí y en ningún otro:
//
//  - `ventaQwantic`: lo escribe solo el sincronizador (scripts/sync_qwantic.py) cada hora, con
//    lo que queda a la venta en Qwantic. Sin butacas libres, «agotada»; con el 10 % del aforo
//    o menos (mínimo 10), «ultimas». En el gestor no se ve ni se toca.
//  - `ventaManual`: lo pone a mano quien lleva el gestor («Venta por función»). MANDA sobre lo
//    automático, porque a veces la compañía pide cerrar con una butaca suelta o la casa guarda
//    entradas que Qwantic da por libres. Con «normal» se quita el aviso automático de esa
//    función.
//
// Los dos van en campos propios, y no dentro de `dates`, a propósito: el sincronizador
// reescribe el bloque `dates` entero cada hora y se habría llevado por delante la marca.
// La ficha catalana (espectaculosCa) no los lleva: la venta es la misma en los dos idiomas y
// se lee siempre de la castellana.
//
// Una marca a mano sin hora vale para el día entero. Una marca de una función que ya no está
// en `dates` no pinta nada.
import type { Session } from './schedule';
import type { Lang } from '../i18n';

export type Venta = 'agotada' | 'ultimas' | null;
type Marca = { date: string; time?: string; estado?: string };
export type ConVenta = { dates: Session[]; ventaManual?: Marca[]; ventaQwantic?: Marca[] };

/** 'Últimas entradas', 'ULTIMAS', 'agotado'… todo a una de las tres palabras. */
function normaliza(estado?: string): Venta | 'normal' | undefined {
  const e = (estado ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  if (e.startsWith('agotad')) return 'agotada';
  if (e.startsWith('ultima')) return 'ultimas';
  if (e === 'normal' || e.startsWith('a la venta')) return 'normal';
  return undefined; // vacío o desconocido: como si no hubiera marca
}

const casa = (m: Marca, date: string, time?: string) =>
  m.date === date && (!m.time || !time || m.time === time);

/** La venta de la función de `date` a la hora `time`. */
export function ventaDe(d: ConVenta, date: string, time?: string): Venta {
  // A mano primero; si hay una marca con hora y otra del día entero, gana la de la hora.
  const manuales = (d.ventaManual ?? []).filter((m) => casa(m, date, time) && normaliza(m.estado));
  const manual = manuales.find((m) => m.time) ?? manuales[0];
  if (manual) {
    const e = normaliza(manual.estado);
    return e === 'normal' ? null : (e as Venta);
  }
  const auto = (d.ventaQwantic ?? []).find((m) => casa(m, date, time));
  const e = normaliza(auto?.estado);
  return e === 'agotada' || e === 'ultimas' ? e : null;
}

const porVenir = (d: ConVenta, hoy: string) =>
  [...(d.dates ?? [])]
    .filter((s) => s.date >= hoy)
    .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));

/** Las funciones por venir agotadas y las que están en últimas entradas, en orden. */
export function avisosPorVenir(d: ConVenta, hoy: string): { agotadas: Session[]; ultimas: Session[] } {
  const f = porVenir(d, hoy);
  return {
    agotadas: f.filter((s) => ventaDe(d, s.date, s.time) === 'agotada'),
    ultimas: f.filter((s) => ventaDe(d, s.date, s.time) === 'ultimas'),
  };
}

/** ¿No queda ninguna función por venir con entradas? Solo si hay alguna por venir. */
export function todoAgotado(d: ConVenta, hoy: string): boolean {
  const f = porVenir(d, hoy);
  return f.length > 0 && f.every((s) => ventaDe(d, s.date, s.time) === 'agotada');
}

const DOW: Record<Lang, string[]> = {
  es: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
  ca: ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'],
};
const MES: Record<Lang, string[]> = {
  es: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
  ca: ['gen', 'febr', 'març', 'abr', 'maig', 'juny', 'jul', 'ag', 'set', 'oct', 'nov', 'des'],
};

/** «sáb 16 ene · 17:00» (o «ds 16 gen · 17:00»), para el sello del cartel. */
export function fechaCorta(s: Session, lang: Lang = 'es'): string {
  const [a, m, d] = s.date.split('-').map(Number);
  const dia = DOW[lang][new Date(Date.UTC(a, m - 1, d)).getUTCDay()];
  return `${dia} ${d} ${MES[lang][m - 1]}${s.time ? ` · ${s.time}` : ''}`;
}
