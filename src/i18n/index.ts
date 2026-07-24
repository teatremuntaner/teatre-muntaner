/**
 * Capa de idiomas del sitio.
 *
 * El CASTELLANO es la fuente: los textos se escriben en `ui.es.json`.
 * El CATALAN (`ui.ca.json`) lo genera `scripts/translate_ca.py` con Apertium;
 * no se edita a mano salvo para corregir un matiz concreto (ver README del
 * script: las claves marcadas en `ui.ca.lock.json` no se resobrescriben).
 *
 * Regla: los NOMBRES PROPIOS no se traducen nunca (titulos de espectaculo,
 * artistas, "Teatre Muntaner"). Por eso no viven aqui: salen de la ficha.
 */

import es from './ui.es.json';
import ca from './ui.ca.json';

export const LANGS = ['es', 'ca'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'es';

/** Prefijo de URL de cada idioma. El castellano vive en la raiz. */
export const LANG_PREFIX: Record<Lang, string> = { es: '', ca: '/ca' };

/** Codigo para <html lang> y hreflang. */
export const HTML_LANG: Record<Lang, string> = { es: 'es', ca: 'ca' };

/** Nombre del idioma en su propia lengua (para el selector). */
export const LANG_NAME: Record<Lang, string> = { es: 'Castellano', ca: 'Català' };

/** og:locale */
export const OG_LOCALE: Record<Lang, string> = { es: 'es_ES', ca: 'ca_ES' };

type Dict = Record<string, string>;
const DICTS: Record<Lang, Dict> = { es: es as Dict, ca: ca as Dict };

/**
 * Devuelve la funcion de traduccion para un idioma.
 * Si falta una clave en catalan, cae al castellano (nunca deja un hueco).
 */
export function useT(lang: Lang) {
  const dict = DICTS[lang] ?? DICTS[DEFAULT_LANG];
  const fallback = DICTS[DEFAULT_LANG];
  return function t(key: string, vars?: Record<string, string | number>): string {
    let out = dict[key] ?? fallback[key] ?? key;
    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        out = out.replaceAll(`{${k}}`, String(v));
      }
    }
    return out;
  };
}

/** Deduce el idioma a partir de la URL. */
export function langFromPath(pathname: string): Lang {
  return pathname === '/ca' || pathname.startsWith('/ca/') ? 'ca' : 'es';
}

/**
 * Construye una ruta en el idioma indicado.
 * `path` se da SIEMPRE en su forma castellana con barra inicial ("/alquiler/").
 */
export function localePath(lang: Lang, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (lang === DEFAULT_LANG) return clean;
  return `${LANG_PREFIX[lang]}${clean}`;
}

/** Quita el prefijo de idioma de una ruta ("/ca/alquiler/" -> "/alquiler/"). */
export function stripLocale(pathname: string): string {
  if (pathname === '/ca' || pathname === '/ca/') return '/';
  if (pathname.startsWith('/ca/')) return pathname.slice(3);
  return pathname;
}

/** La misma pagina en el otro idioma (para el selector y el hreflang). */
export function equivalentPath(pathname: string, target: Lang): string {
  return localePath(target, stripLocale(pathname));
}
