// Las etiquetas de género de la cartelera, en un solo sitio y en orden preferente.
//
// Esta lista MANDA. De ella salen las tres cosas que tienen que decir lo mismo:
//   · los filtros de la portada (src/pages/index.astro)
//   · las opciones del campo «Géneros» del CMS (public/admin/config.yml)
//   · lo único que el sincronizador se permite escribir (scripts/sync_qwantic.py)
// y además se publica en /funciones.json (`genreFilters`) para que madteatro
// sepa qué etiquetas valen sin tener que adivinarlas.
//
// Una etiqueta que no esté aquí NO filtra: el espectáculo se ve en su tarjeta,
// parece bien puesto y no aparece al filtrar la cartelera. Eso es justo lo que
// pasó en agosto de 2026 con «Teatre», que es la etiqueta en catalán.
//
// Para añadir un género: se pone aquí Y en config.yml (que es YAML estático y no
// puede importar esto). `npm run check:generos` avisa si se olvida uno de los dos.
export const GENRE_ORDER: string[] = [
  'Comedia',
  'Monólogos',
  'Improvisación',
  'Magia',
  'Teatro',
  'Familiar',
  'Música',
  'Flamenco',
  'Bienestar emocional',
];
