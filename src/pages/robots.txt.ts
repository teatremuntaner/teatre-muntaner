import type { APIRoute } from 'astro';

// Web de pruebas: bloquea el rastreo. Al poner INDEXABLE=true (producción en
// teatremuntaner.com) permite el rastreo y publica el sitemap.
const indexable = process.env.INDEXABLE === 'true';

export const GET: APIRoute = ({ site }) => {
  // En pruebas: rastreable (Allow) pero cada página lleva noindex -> no se indexa
  // (sin duplicado) y las herramientas SEO pueden leerla. En producción, + sitemap.
  const body = indexable
    ? `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site).href}\n`
    : `User-agent: *\nAllow: /\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
