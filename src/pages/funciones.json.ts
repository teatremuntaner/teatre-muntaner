// Fuente de datos compartida: cartelera + funciones, ya normalizada.
// Pensada para reutilizar desde el escaparate (señalización) y cualquier otro
// consumidor, SIN volver a llamar a Qwantic ni parsear los .md.
//   URL pública: https://teatremuntaner.com/funciones.json
//
// Ordena los espectáculos por su PRÓXIMA función (hoy/pronto primero; los que ya
// no tienen funciones futuras, al final). Incluye un texto comprimido del horario
// (nextLabel / scheduleFull) listo para mostrar.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { summarize } from '../lib/schedule';

export const GET: APIRoute = async ({ site }) => {
  const base = site ?? new URL('https://teatremuntaner.com');
  const today = new Date().toISOString().slice(0, 10);

  // Solo borradores fuera; los "unlisted" se incluyen con su flag por si el
  // escaparate los quiere (siguen teniendo funciones reales).
  const shows = await getCollection('espectaculos', ({ data }) => !data.draft);

  const out = shows.map((s) => {
    const d = s.data;
    const future = d.dates
      .filter((x) => x.date >= today)
      .sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
    const sched = summarize(d.dates);
    return {
      id: s.id,                              // slug = identificador de la ficha
      qwanticEventId: d.qwanticEventId ?? null, // id de Qwantic (para emparejar)
      title: d.title,
      lang: d.lang ?? null,                  // "Castellano" | "Catalán" | "Bilingüe"
      poster: new URL(d.poster.src, base).href, // cartel 2:3 (retrato), URL absoluta
      accent: d.accent,                      // color predominante del cartel
      accentInk: d.accentInk,
      ticketUrl: d.ticketUrl ?? null,
      pageUrl: new URL(`${import.meta.env.BASE_URL}espectaculos/${s.id}/`, base).href,
      unlisted: d.unlisted,
      priority: d.priority ?? 0,             // jerarquía de cartelera (mayor = más importante)
      ticketAlarm: d.ticketAlarm,            // true = próximamente, sin venta aún
      dates: d.dates,                        // todas [{date:"YYYY-MM-DD", time:"HH:MM"}]
      future,                                // solo futuras, ordenadas
      nextDate: future[0]?.date ?? null,     // para priorizar (ASC)
      nextTime: future[0]?.time ?? null,
      nextLabel: sched.card,                 // compacto: "Sábados · 22:30" / "22 de junio"
      scheduleFull: sched.full,              // "Viernes a las 19:00 y sábados a las 21:00"
    };
  });

  // Próxima función primero; sin futuras → al final.
  out.sort((a, b) => (a.nextDate ?? '9999').localeCompare(b.nextDate ?? '9999'));

  return new Response(
    JSON.stringify({ venue: 'Teatre Muntaner', generated: today, shows: out }, null, 2),
    { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' } },
  );
};
