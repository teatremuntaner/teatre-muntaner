# Teatre Muntaner — web (Astro) · nota para Claude Code

Web del Teatre Muntaner (Barcelona) migrada de **Mobirise** a **Astro** (estática) + **Decap CMS**.
Clon del sistema del Teatro Sofía (`C:\Users\carlo\dev\teatro-sofia`), adaptado.
Deploy previsto: **Netlify** (auto al `git push` a `main`) → dominio final `teatremuntaner.com`.
El dominio aún NO apunta a esta web (sigue el Mobirise) hasta aprobación del cliente.

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

## EN MARCHA (preview, aún NO producción)
- **GitHub:** `github.com/teatremuntaner/teatre-muntaner` (Public, org `teatremuntaner` bajo la cuenta personal de Carlos). Branch `main`.
- **Netlify:** proyecto `teatre-muntaner` en el equipo "Teatro Sofía" (plan de pago). Deploy automático desde `main`. Preview en **teatre-muntaner.netlify.app** (noindex, INDEXABLE=false). Form detection ON; 2 forms (ticketalarm + newsletter); avisos → entradas@teatremuntaner.com.

## Pendiente / producción
- **CONSENTIMIENTO DE COOKIES (hacer antes de producción):** la web carga GTM + embeds (YouTube/Maps/calendario) + Weglot → necesita banner de consentimiento (LSSI/RGPD). Ya tienen **CookieBot** pero el dominio de Netlify NO está dado de alta ahí (por eso se aplaza). Al pasar a producción: añadir el dominio en CookieBot, o (recomendado) banner gratuito **Consent Mode v2 + CookieConsent (vanilla)**. Política de cookies ya existe (`/politica-de-cookies`).

### CHECKLIST DE CUTOVER (lecciones del cutover de Teatro Sofía, ya en producción)
1. **Netlify Forms — gotcha:** la detección de formularios viene **DESACTIVADA**. Ir a Forms → Enable form detection, **redesplegar**, y en Notifications → Form submission notifications poner **entradas@teatremuntaner.com** (decidido por Carlos: avisos de newsletter y "Avísame" van ahí). Si no, los envíos se pierden sin avisar.
2. **DNS (en cdmon, mismo panel que teatremuntaner.com/.cat):** añadir dominio en Netlify (apex + www). Cambiar **solo el registro A del @ → 75.2.60.5**. NO tocar MX ni mail/imap/smtp. www como CNAME al apex.
3. **Hueco de SSL:** tras el DNS hay ~30 min en que el dominio va a Netlify pero el cert aún no está → "SSL Error" en HTTPS estricto. Es normal; esperar a que Netlify emita el cert (Domain management).
4. **Activar producción DESPUÉS del SSL:** `INDEXABLE="true"` en netlify.toml + **descomentar el redirect `*.netlify.app → teatremuntaner.com`** en `public/_redirects` (rellenar el nombre del sitio); un solo push/build.
5. **Verificar:** HTTPS válido, 301s viejas (legales + shows), robots.txt + sitemap, que no quede ningún noindex (salvo /admin y /actualizar).
6. **Search Console:** dar de alta la propiedad y enviar `sitemap-index.xml`.
7. **Resto:** activar Weglot (`WEGLOT_API_KEY`), `GH_DISPATCH_TOKEN` para el botón "Actualizar cartelera".
- Opción: el agente con navegador (el que hizo el cutover de Sofía) puede encargarse del cutover de Muntaner cuando llegue el momento.
- **Correos (decidido):** footer/contacto visible = `info@teatremuntaner.com`; avisos de Netlify Forms (newsletter + "Avísame") = `entradas@teatremuntaner.com`.

## Hecho
- Catálogo: 11 shows desde Qwantic (sync_qwantic.py), géneros+artista clasificados (set_generos.py), títulos sin repetir el artista (fix_titulos.py).
- Marca: tema LUMINOSO crema + rojo/oro; fotos reales del local; banda damasco (pared real) en "El Teatro" y footer; marquesina teatral; animaciones (hero letra a letra, parallax, brillos). Email de contacto: info@teatremuntaner.com.
