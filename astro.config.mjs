// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://teatremuntaner.com',
  // Netlify sirve desde la raíz. Se puede sobreescribir con SITE_BASE.
  base: process.env.SITE_BASE ?? '/',
  // Los landings de campaña (/landing/*) son noindex: fuera del sitemap.
  integrations: [sitemap({ filter: (page) => !page.includes('/landing/') })],
});
