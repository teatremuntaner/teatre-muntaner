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

      featured: z.boolean().default(false),
      ticketAlarm: z.boolean().default(false), // próximamente: sin venta aún, captar avisos
      unlisted: z.boolean().default(false), // oculto de la cartelera, pero su página/URL sigue viva
      draft: z.boolean().default(false),
    }),
});

export const collections = { espectaculos };
