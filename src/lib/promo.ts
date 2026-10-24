/**
 * Campañas de promoción (Black Friday, «Regala por Navidad», San Valentín).
 *
 * Petición de Lucas (Nave8), aprobada por Sandra, 24/10/2026: durante la campaña, el
 * espectáculo en promo lleva una etiqueta con el nombre de la campaña sobre su cartel en
 * la cartelera, y en su ficha esa misma etiqueta y la promo en la caja informativa.
 *
 * El campo de la ficha es `promoCampana` (el nombre `promo` ya lo usa la píldora de aviso
 * libre de siempre y no se toca):
 *
 *   promoCampana:
 *     campana: "Black Friday"        # lista cerrada, CAMPANAS
 *     texto: "-30 %"                 # lo que ofrece
 *     desde: "2026-11-27"            # primer día en que se puede COMPRAR con la promo
 *     hasta: "2026-11-30"            # último día (incluido)
 *     funciones: "Funciones de febrero"   # opcional: para qué funciones vale
 *     textoCa / funcionesCa                 # opcionales: lo mismo en catalán (si faltan,
 *                                           # la web catalana enseña el castellano, como avisoCa)
 *
 * `desde` y `hasta` son días de COMPRA, no de función: la promo puede valer para funciones
 * de meses después. Los días se cuentan en hora de Madrid.
 *
 * Caducidad: la web solo se recompila cuando alguien publica o el sincronizador sube
 * fechas, así que el corte se decide dos veces. En la compilación no se pinta nada si
 * `hasta` ya pasó; si `desde` aún no ha llegado, la etiqueta sale oculta. Y en el
 * navegador un script la enseña o la quita con la fecha del día (`data-promo-desde` /
 * `data-promo-hasta`), así que empieza y caduca sola aunque nadie recompile.
 */

export const CAMPANAS = ['Black Friday', 'Regala por Navidad', 'San Valentín'] as const;
export type Campana = (typeof CAMPANAS)[number];

export interface PromoCampana {
  campana: Campana;
  texto?: string;
  desde: string; // AAAA-MM-DD
  hasta: string; // AAAA-MM-DD
  funciones?: string;
  textoCa?: string;
  funcionesCa?: string;
}

const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const aFecha = (v: unknown): string | undefined => {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === 'string' && FECHA.test(v.trim())) return v.trim();
  return undefined;
};
const aTexto = (v: unknown): string | undefined => {
  if (v === null || v === undefined) return undefined;
  const s = String(v).trim();
  return s ? s : undefined;
};

/**
 * Lo que venga del gestor, normalizado; o `undefined` si no hay promo completa.
 * NUNCA lanza: una promo a medias no puede tumbar la compilación de toda la web (ya pasó
 * con `priority` y con `avisoHasta`). Si está a medias, se avisa en el log y no se pinta.
 */
export function limpiaPromo(v: unknown): PromoCampana | undefined {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  const campana = aTexto(o.campana);
  const desde = aFecha(o.desde);
  const hasta = aFecha(o.hasta);
  const texto = aTexto(o.texto);
  const funciones = aTexto(o.funciones);
  const textoCa = aTexto(o.textoCa);
  const funcionesCa = aTexto(o.funcionesCa);
  // Nada rellenado (el gestor a veces guarda el bloque vacío): no hay promo, sin aviso.
  if (!campana && !desde && !hasta && !texto && !funciones) return undefined;
  const fallo = !campana
    ? 'falta la campaña'
    : !(CAMPANAS as readonly string[]).includes(campana)
      ? `campaña desconocida «${campana}»`
      : !desde || !hasta
        ? 'faltan las fechas desde/hasta (AAAA-MM-DD)'
        : desde > hasta
          ? '«desde» es posterior a «hasta»'
          : '';
  if (fallo) {
    console.warn(`[promoCampana] promo ignorada: ${fallo}.`);
    return undefined;
  }
  return { campana: campana as Campana, texto, desde: desde!, hasta: hasta!, funciones, textoCa, funcionesCa };
}

/** 'activa' (se pinta), 'futura' (se pinta oculta: la enseña el navegador) o null. */
export function estadoPromo(p: PromoCampana | undefined, hoy: string): 'activa' | 'futura' | null {
  if (!p || p.hasta < hoy) return null;
  return p.desde > hoy ? 'futura' : 'activa';
}

/** Clave de i18n del nombre de cada campaña (src/i18n/parts/promo.es.json). */
export const CLAVE_CAMPANA: Record<Campana, string> = {
  'Black Friday': 'promo.campana.blackFriday',
  'Regala por Navidad': 'promo.campana.navidad',
  'San Valentín': 'promo.campana.sanValentin',
};

/** «30 de noviembre» / «30 de novembre» (sin año, salvo que no sea el del día de hoy). */
export function fechaCorta(iso: string, hoy: string, lang: 'es' | 'ca' = 'es'): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', timeZone: 'UTC' };
  if (iso.slice(0, 4) !== hoy.slice(0, 4)) opts.year = 'numeric';
  return d.toLocaleDateString(lang === 'ca' ? 'ca-ES' : 'es-ES', opts);
}
