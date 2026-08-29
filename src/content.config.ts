import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

/**
 * Colección "espectaculos": cada archivo .md en src/content/espectaculos
 * es una ficha. Estos son los campos que aparecerán en el CMS.
 */
const espectaculos = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/espectaculos' }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      tagline: z.string().optional(),
      promo: z.string().optional(), // promo/descuento destacado (ej. "20% de descuento")
      artist: z.string().optional(), // intérprete/compañía
      category: z.string().default('Espectáculo'),
      genres: z.array(z.string()).default([]), // géneros (varios); si vacío, se usa category
      lang: z.string().optional(), // idioma de la función: "Castellano" | "Catalán" | "Bilingüe"
      priority: z.number().default(0), // jerarquía en cartelera (mayor = más arriba)

      // Cartel del espectáculo (se optimiza solo a WebP/AVIF en el build)
      poster: image(),
      photo: image().optional(), // foto que acompaña a la sinopsis, si existe
      youtube: z.string().optional(), // ID o URL de vídeo de YouTube, si existe
      youtubeUploadDate: z.string().optional(), // fecha de subida del vídeo (la rellena el sync; para el VideoObject)
      video: z.string().optional(), // vídeo subido (ruta /uploads/...), alternativa a YouTube
      videoUploadDate: z.string().optional(), // fecha de publicación del vídeo subido (uploadDate del VideoObject; obligatorio para Google)
      gallery: z.array(image()).default([]), // galería de fotos (se optimizan en el build)

      /* Las notas que el espectáculo tiene en las webs de venta y en Google, en una fila.
         Cada una puede traer dos cosas: la nota, y la dirección donde se escribe una reseña.

         La NOTA es opcional: un perfil recién creado no tiene ninguna, y entonces la
         pastilla sirve solo para invitar a opinar. Y las notas se escriben a mano, así que
         envejecen: la de Atrápalo de «Clap» decía 9,4 con 118 opiniones cuando ya iban 146.
         Conviene repasarlas de vez en cuando, o no ponerlas y dejar solo el enlace. */
      ratings: z
        .array(
          z.object({
            source: z.string(),   // "Atrápalo", "Google", "taquilla.com"…
            score: z.number().optional(),
            max: z.number().default(5),
            count: z.number().optional(),   // nº de opiniones, si se sabe
            url: z.string().optional(),     // la ficha de esa web, para ir a leerlas
            // Y la dirección donde se ESCRIBE la reseña, en las webs que lo permiten. Va
            // aparte del enlace de arriba porque no siempre coinciden: la de Google abre
            // directamente el cuadro de puntuar, sin pasar por la ficha.
            votar: z.string().optional(),
            logo: image().optional(),
          }),
        )
        .default([]),

      // Píldoras de redes (reels de Instagram / TikTok). Se incrustan con
      // fachada: hasta que el visitante pulsa no se carga nada de la red social.
      reels: z
        .array(
          z.object({
            url: z.string(),
            caption: z.string().optional(),
            poster: image().optional(), // portada; sin ella la fachada sale lisa
          }),
        )
        .default([]),

      // --- Arte por espectáculo: color y tipografía del cartel ---
      accent: z.string().default('#b3122a'),
      accentInk: z.string().default('#ffffff'),
      titleFont: z.string().optional(),
      titleFontUrl: z.string().url().optional(),

      // --- Fechas y entradas (Qwantic) ---
      dates: z
        .array(
          z.object({
            date: z.string(), // YYYY-MM-DD
            time: z.string().optional(), // HH:MM
          }),
        )
        .default([]),
      dateText: z.string().optional(), // horario recurrente en texto ("Viernes y Sábados")
      ticketUrl: z.string().url().optional(),
      qwanticEventId: z.string().optional(),
      priceFrom: z.number().optional(), // precio mínimo numérico (lo rellena el sync; para el Offer del JSON-LD)
      saleStart: z.string().optional(), // inicio de venta ISO (lo rellena el sync; validFrom del Offer)

      // Si está, la tarjeta de la cartelera enlaza aquí (p. ej. la landing del
      // Piano Bar) en vez de a una ficha propia, y no se genera página de ficha.
      externalUrl: z.string().optional(),

      links: z
        .array(z.object({ label: z.string(), url: z.string() }))
        .default([]),
      venue: z.string().default('Teatre Muntaner · Carrer de Muntaner 4, Barcelona'),
      duration: z.string().optional(),
      price: z.string().optional(),

      // Reparto / artistas, como en la web del Sofía (lo pidió Lucas, 29/07/2026).
      // La foto es opcional: sin ella se listan los nombres y ya.
      // Los NOMBRES son nombres propios y no se traducen nunca: por eso el reparto
      // vive solo en esta colección y no en la catalana, igual que title/artist.
      // El `role` sí es texto común, pero de momento se muestra en castellano
      // también en catalán, porque translate_ca.py solo sabe con campos sueltos y
      // listas de texto, no con listas de objetos. Ver docs al final del script.
      cast: z
        .array(
          z.object({
            name: z.string(),
            role: z.string().optional(),
            photo: image().optional(),
            // Quien no sale a escena (dirección, música…): mismo tamaño que el
            // resto, pero algo separado para no dar a entender que actúa.
            offstage: z.boolean().default(false),
          }),
        )
        .default([]),
      castNote: z.string().optional(), // "El elenco cambia cada semana", etc.

      featured: z.boolean().default(false),
      ticketAlarm: z.boolean().default(false), // próximamente: sin venta aún, captar avisos
      unlisted: z.boolean().default(false), // oculto de la cartelera, pero su página/URL sigue viva
      draft: z.boolean().default(false),
    }),
});

/**
 * Coleccion "espectaculosCa": SOLO el texto en catalan de cada ficha.
 *
 * La genera scripts/translate_ca.py con Apertium a partir de la ficha
 * castellana; no se edita a mano ni aparece en el CMS. Deliberadamente NO
 * incluye title, artist ni venue: los nombres propios no se traducen, y al no
 * existir aqui es imposible que se traduzcan por descuido. Tampoco duplica
 * imagenes, fechas ni precios: eso lo coge la pagina de la ficha castellana.
 */
const espectaculosCa = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/espectaculos-ca' }),
  schema: z.object({
    tagline: z.string().optional(),
    promo: z.string().optional(),
    category: z.string().optional(),
    genres: z.array(z.string()).default([]),
    lang: z.string().optional(),
    duration: z.string().optional(),
    price: z.string().optional(),
    dateText: z.string().optional(),
    sourceHash: z.string().optional(),
    generated: z.boolean().default(true),
  }),
});

export const collections = { espectaculos, espectaculosCa };
