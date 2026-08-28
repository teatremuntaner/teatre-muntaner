// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import remarkEspacios from './plugins/remark-espacios.mjs';

// https://astro.build/config
export default defineConfig({
  site: 'https://teatremuntaner.com',
  // Netlify sirve desde la raíz. Se puede sobreescribir con SITE_BASE.
  base: process.env.SITE_BASE ?? '/',
  // Los landings de campaña y las confirmaciones de formularios son noindex:
  // no deben consumir rastreo ni aparecer en el sitemap.
  integrations: [sitemap({
    filter: (page) => !page.includes('/landing/') && !page.includes('/aviso-recibido/'),
  })],
  // Las sinopsis se pegan en el gestor desde Word o Google Docs y traen espacios duros
  // y espacios delante de coma o punto. Se limpian al publicar, no en el archivo, y así
  // vale igual para la colección en catalán, que se genera sola.
  // El porqué está en plugins/remark-espacios.mjs.
  markdown: {
    remarkPlugins: [remarkEspacios],
  },
});
