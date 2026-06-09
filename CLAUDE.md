# Teatre Muntaner — web (Astro) · nota para Claude Code

Web del Teatre Muntaner (Barcelona) migrada de **Mobirise** a **Astro** (estática) + **Decap CMS**.
Clon del sistema del Teatro Sofía (`C:\Users\carlo\dev\teatro-sofia`), adaptado.
**EN PRODUCCIÓN desde 2026-06-09: https://teatremuntaner.com** (Netlify, deploy auto al `git push` a `main`).

## Diferencias clave vs Teatro Sofía
- **NO hay piano bar** (ni landing, ni bloque, ni menú). No reintroducir.
- **Marca Muntaner**: rojo `#bd221f` + oro `#d5a846` + crema `#f9f6e0` + tinta `#14100e` (sacados del logo oficial). Fuente body **Reddit Sans**, display **Oswald**. Logo en `public/logo-muntaner.png` (+ `-negativo`).
- **GTM propio**: `GTM-TR52LK75` (el del Sofía era GTM-WDFWX99H).
- **Venue**: Carrer de Muntaner 4, 08011 Barcelona. Razón social **La Muntaner Teatre, S.L.** (CIF B55438550). Tel taquilla +34 614402738. Emails info@/entradas@teatremuntaner.com. IG/TikTok @teatremuntaner. El Teatro Sofía aparece como "teatro hermano" en el footer (intencional).
- **Weglot**: la web se hace en **castellano**; el **catalán** lo traduce Weglot automáticamente. Integración latente en `BaseLayout.astro`: se activa poniendo `WEGLOT_API_KEY` como variable de entorno en Netlify (pedir la key a Carlos).

## Stack
- Astro 6. Colección `espectaculos`: `src/content/espectaculos/*.md` (+ su `.jpg` de cartel). Schema: `src/content.config.ts`.
- Campos: title, artist, category, genres[], priority, poster, photo?, gallery[], youtube?, video?, accent/accentInk, dates[], dateText?, ticketUrl, qwanticEventId, promo?, ticketAlarm, externalUrl?, duration?, price?, featured, draft, venue.
- Shows con todas las fechas pasadas se ocultan solos de la cartelera. Borradores (draft:true) no se publican.
- Front: GSAP+SplitText (títulos, tilt del cartel), GLightbox (galerías). Tema oscuro.

## Comandos (en este equipo, usuario carlo)
- **Compilar**: `npm run build` en **PowerShell** (NO `bash scripts/build.sh`: aquí bash es WSL sin distro). Node está en el PATH de PowerShell.
- **Python/imágenes**: scripts `.py` en disco + ffmpeg/ffprobe (PowerShell rompe el inline). `/tmp` no persiste entre comandos Bash → usar carpeta local `.qtmp`.
- **Sincronizar con Qwantic**: `python scripts/sync_qwantic.py` (`--dry` para simular). Crea borradores de altas y actualiza fechas.
- **Regenerar legales** desde el Mobirise: `python scripts/gen_legal.py`.
- Netlify publica solo al `git push origin main`. **CRÉDITOS LIMITADOS**: agrupar cambios y hacer POCOS pushes (en Sofía se agotaron y se acabó pagando). Confirmar con Carlos antes de ráfagas de deploys.

## Qwantic (entradas.plus) — verificado en vivo
- idProvider **2079**, idRecinto/idVenue **5500**, segmento API **2**. Subdominio `lamuntaner.entradas.plus`.
- API: `https://es.entradas.plus/api2/events/2?idProvider=2079` (cabecera `Accept: application/json`, si no da 500).
- Cartel: `https://lamuntaner.entradas.plus/entradas/img_web/2079/5500/{idEvento}/m_poster.jpg`
- OJO: hay un provider viejo (`teatremuntaner.entradas.plus`, idProvider 1824) SIN eventos activos; NO usar.

## Origen de contenido
- Mobirise export en `H:\OneDrive\Muntaner\WEB\mobirise\web`. Logos en `H:\OneDrive\Muntaner\Logo\LOGO MUNTANER TEATRE\formatos`.
- Catálogo inicial creado desde la **API de Qwantic** (11 shows) con `sync_qwantic.py` (cartel oficial 2:3, fechas, sinopsis de longDescription). Géneros/artista se afinan luego (con Carlos) como en Sofía.

## Infraestructura (EN PRODUCCIÓN desde 2026-06-09)
- **GitHub:** `github.com/teatremuntaner/teatre-muntaner` (Public, org `teatremuntaner` bajo la cuenta personal de Carlos). Branch `main`.
- **Netlify:** proyecto `teatre-muntaner` en el equipo "Teatro Sofía" (plan de pago). Deploy automático desde `main`. Dominio apex+www en Netlify (DNS en cdmon: solo el registro A del @ → 75.2.60.5; MX/correo intactos). `INDEXABLE=true`; redirect `teatre-muntaner.netlify.app → teatremuntaner.com` activo. Form detection ON; 2 forms (ticketalarm + newsletter); avisos → entradas@teatremuntaner.com.
- **Cookies:** banner Consent Mode v2 + vanilla-cookieconsent (ES, marca), default denegado, "Configurar cookies" en footer.
- **Weglot:** activo (`WEGLOT_API_KEY` en variables de Netlify), idiomas es+ca.
- **CMS (/admin/):** Identity + Git Gateway activos, Invite only, 3 usuarios (Carlos + 2 de Nave8).
- **Search Console:** propiedad `https://teatremuntaner.com/` verificada; sitemap-index.xml enviado.
- **Verificado en el cutover:** HTTPS ok, robots Allow+sitemap, sin noindex (salvo /admin y /actualizar), 301s de shows/legales, netlify.app→dominio, www→apex.
- **Correos (decidido):** footer/contacto visible = `info@teatremuntaner.com`; avisos de Netlify Forms (newsletter + "Avísame") = `entradas@teatremuntaner.com`.

## Actualización automática de la cartelera (validado 2026-06-10)
- **Cron diario:** `.github/workflows/sync-qwantic.yml` corre cada día ~06:00 UTC (08 h España): sincroniza con Qwantic y SOLO commitea/despliega si hay cambios. Al pasar una fecha, el sync la elimina del `.md` (solo guarda funciones futuras) → ese diff ya provoca el deploy que oculta el show pasado y actualiza la "próxima fecha" de las tarjetas.
- **Botón del personal:** `/actualizar/` (Netlify Identity) → función `trigger-sync.js` → dispara el workflow. Usa la variable `GH_DISPATCH_TOKEN` en Netlify (fine-grained PAT `teatre-muntaner-trigger-sync`, org teatremuntaner, solo este repo, Actions read+write). **Caduca el 11-jun-2027** → regenerar en GitHub y actualizar la variable en Netlify.
- **Caso no cubierto (revisión manual):** si un show desaparece del feed de Qwantic ("baja") o su página deja de exponer sesiones, su ficha NO se toca — sale avisado en el log del workflow (pestaña Actions).
- Carteles: se usa el oficial 2:3 de Qwantic (decidido 2026-06-10; descartados A4 propios).

## Hecho
- Catálogo: 11 shows desde Qwantic (sync_qwantic.py), géneros+artista clasificados (set_generos.py), títulos sin repetir el artista (fix_titulos.py).
- Marca: tema LUMINOSO crema + rojo/oro; fotos reales del local; banda damasco (pared real) en "El Teatro" y footer; marquesina teatral; animaciones (hero letra a letra, parallax, brillos). Email de contacto: info@teatremuntaner.com.
