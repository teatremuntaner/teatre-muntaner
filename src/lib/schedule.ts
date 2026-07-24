// Resume una lista de funciones (fecha + hora) en un texto legible:
//   "Viernes a las 19:00 y sábados a las 21:00"  + fechas sueltas que no encajan.
// Para la cartelera devuelve una versión compacta; si no hay patrón, "Consultar fechas".
//
// Las frases se construyen aquí (no en el diccionario de i18n) porque dependen
// de la gramática de cada idioma: plurales, conjunción y contracciones.

import type { Lang } from '../i18n';

export type Session = { date: string; time?: string };

interface Locale {
  dow: string[];
  dowShort: string[];
  month: string[];
  monthShort: string[];
  y: string;              // conjunción final ("y" / "i")
  aLas: string;           // "a las" / "a les"
  consultar: string;      // "Consultar fechas" / "Consultar dates"
  /** Une "3" y "abril" -> "3 de abril" / "3 d'abril" (elisión catalana). */
  dayOfMonth: (day: number, month: string) => string;
}

const LOCALES: Record<Lang, Locale> = {
  es: {
    dow: ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
    dowShort: ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'],
    month: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'],
    monthShort: ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'],
    y: 'y',
    aLas: 'a las',
    consultar: 'Consultar fechas',
    dayOfMonth: (day, month) => `${day} de ${month}`,
  },
  ca: {
    dow: ['diumenge', 'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte'],
    dowShort: ['dg', 'dl', 'dt', 'dc', 'dj', 'dv', 'ds'],
    month: ['gener', 'febrer', 'març', 'abril', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre'],
    monthShort: ['gen', 'feb', 'març', 'abr', 'maig', 'juny', 'jul', 'ago', 'set', 'oct', 'nov', 'des'],
    y: 'i',
    aLas: 'a les',
    consultar: 'Consultar dates',
    // En catalán "de" se apostrofa ante vocal: 1 de gener, però 2 d'abril.
    dayOfMonth: (day, month) =>
      /^[aeiouàèéíòóú]/i.test(month) ? `${day} d'${month}` : `${day} de ${month}`,
  },
};

const dateOf = (iso: string) => new Date(iso + 'T00:00:00');
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
// Vale para los dos idiomas: los días acabados en -s son invariables
// (lunes/martes en es; dilluns/dimarts/dimecres/dijous/divendres en ca).
const plural = (name: string) => (name.endsWith('s') ? name : name + 's');
// Lunes primero
const monKey = (dow: number) => (dow + 6) % 7;

export interface ScheduleSummary {
  card: string;       // compacto para la cartelera
  full: string;       // patrón recurrente para la ficha ("Viernes a las 19:00 y sábados…")
  loose: string[];    // fechas sueltas que no encajan en el patrón
  hasPattern: boolean;
}

export function summarize(sessions: Session[] = [], lang: Lang = 'es'): ScheduleSummary {
  const L = LOCALES[lang] ?? LOCALES.es;

  const joinY = (arr: string[]): string => {
    if (arr.length <= 1) return arr.join('');
    return arr.slice(0, -1).join(', ') + ` ${L.y} ` + arr[arr.length - 1];
  };
  const dayMonthFull = (iso: string): string => {
    const d = dateOf(iso);
    return L.dayOfMonth(d.getDate(), L.month[d.getMonth()]);
  };
  const looseLabel = (iso: string): string => {
    const d = dateOf(iso);
    return `${L.dowShort[d.getDay()]} ${d.getDate()} ${L.monthShort[d.getMonth()]}`;
  };

  const list = sessions.filter((s) => s && s.date);
  if (!list.length) return { card: L.consultar, full: '', loose: [], hasPattern: false };

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
    const names = joinY(dows.map((d) => plural(L.dow[d])));
    return time ? `${names} ${L.aLas} ${time}` : names;
  });
  const full = cap(joinY(phrases));

  const looseSorted = [...new Set(looseIsos)].sort();
  const loose = looseSorted.map(looseLabel);

  // Tarjeta (compacta)
  let card: string;
  if (recurring.length) {
    const allDows = [...new Set(recurring.map((r) => r.dow))].sort((a, b) => monKey(a) - monKey(b));
    const names = cap(joinY(allDows.map((d) => plural(L.dow[d]))));
    card = byTime.size === 1 && times[0] ? `${names} · ${times[0]}` : names;
  } else if (list.length <= 3) {
    card = cap(joinY(looseSorted.map(dayMonthFull)));
  } else {
    card = L.consultar;
  }

  return { card, full, loose, hasPattern: recurring.length > 0 };
}
