// Resume una lista de funciones (fecha + hora) en un texto legible:
//   "Viernes a las 19:00 y sábados a las 21:00"  + fechas sueltas que no encajan.
// Para la cartelera devuelve una versión compacta; si no hay patrón, "Consultar fechas".

export type Session = { date: string; time?: string };

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DOW_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MONTH = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const dateOf = (iso: string) => new Date(iso + 'T00:00:00');
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const plural = (name: string) => (name.endsWith('s') ? name : name + 's');
// Lunes primero
const monKey = (dow: number) => (dow + 6) % 7;

function joinY(arr: string[]): string {
  if (arr.length <= 1) return arr.join('');
  return arr.slice(0, -1).join(', ') + ' y ' + arr[arr.length - 1];
}
function dayMonthFull(iso: string): string {
  const d = dateOf(iso);
  return `${d.getDate()} de ${MONTH[d.getMonth()]}`;
}
function looseLabel(iso: string): string {
  const d = dateOf(iso);
  return `${DOW_SHORT[d.getDay()]} ${d.getDate()} ${MONTH_SHORT[d.getMonth()]}`;
}

export interface ScheduleSummary {
  card: string;       // compacto para la cartelera
  full: string;       // patrón recurrente para la ficha ("Viernes a las 19:00 y sábados…")
  loose: string[];    // fechas sueltas que no encajan en el patrón
  hasPattern: boolean;
}

export function summarize(sessions: Session[] = []): ScheduleSummary {
  const list = sessions.filter((s) => s && s.date);
  if (!list.length) return { card: 'Consultar fechas', full: '', loose: [], hasPattern: false };

  // Agrupa por (día de la semana | hora)
  const combos = new Map<string, string[]>();
  for (const s of list) {
    const key = `${dateOf(s.date).getDay()}|${s.time || ''}`;
    (combos.get(key) ?? combos.set(key, []).get(key)!).push(s.date);
  }

  const recurring: { dow: number; time: string }[] = [];
  const looseIsos: string[] = [];
  for (const [key, isos] of combos) {
    const [dowStr, time] = key.split('|');
    if (isos.length >= 2) recurring.push({ dow: +dowStr, time });
    else looseIsos.push(...isos);
  }

  // Construye frases del patrón, agrupando días que comparten hora
  const byTime = new Map<string, number[]>();
  for (const r of recurring) (byTime.get(r.time) ?? byTime.set(r.time, []).get(r.time)!).push(r.dow);

  const times = [...byTime.keys()].sort();
  const phrases = times.map((time) => {
    const dows = byTime.get(time)!.sort((a, b) => monKey(a) - monKey(b));
    const names = joinY(dows.map((d) => plural(DOW[d])));
    return time ? `${names} a las ${time}` : names;
  });
  const full = cap(joinY(phrases));

  const looseSorted = [...new Set(looseIsos)].sort();
  const loose = looseSorted.map(looseLabel);

  // Tarjeta (compacta)
  let card: string;
  if (recurring.length) {
    const allDows = [...new Set(recurring.map((r) => r.dow))].sort((a, b) => monKey(a) - monKey(b));
    const names = cap(joinY(allDows.map((d) => plural(DOW[d]))));
    card = byTime.size === 1 && times[0] ? `${names} · ${times[0]}` : names;
  } else if (list.length <= 3) {
    card = cap(joinY(looseSorted.map(dayMonthFull)));
  } else {
    card = 'Consultar fechas';
  }

  return { card, full, loose, hasPattern: recurring.length > 0 };
}
