// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

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
});
