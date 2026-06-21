// ============================================================
// Service Radar – dynamische sitemap.xml
// (Vercel rewrite: /sitemap.xml -> /api/sitemap)
// Statische Kernseiten + Leistungen + Blog + Stadtseiten aus ECHTEN
// Daten (nur Städte mit genug aktiven Jobs).
// ============================================================
'use strict';
const S = require('./_ssr');

const BLOG_SLUGS = [
  'nebenjob-finden-in-deiner-region',
  'haushaltshilfe-finden',
  'was-kostet-gartenarbeit',
  'tipps-fuer-auftraggeber',
  'tipps-fuer-helfer',
];

function url(loc, changefreq, priority) {
  return '<url><loc>' + S.esc(loc) + '</loc>'
    + (changefreq ? '<changefreq>' + changefreq + '</changefreq>' : '')
    + (priority ? '<priority>' + priority + '</priority>' : '')
    + '</url>';
}

module.exports = async function handler(req, res) {
  let cities = [];
  try { cities = await S.topCities(); } catch (e) {}

  const urls = [];
  urls.push(url(S.SITE + '/', 'daily', '1.0'));
  urls.push(url(S.SITE + '/leistungen', 'weekly', '0.8'));
  S.SERVICE_ORDER.forEach(s => urls.push(url(S.SITE + '/leistungen/' + s, 'weekly', '0.7')));
  urls.push(url(S.SITE + '/blog', 'weekly', '0.6'));
  BLOG_SLUGS.forEach(s => urls.push(url(S.SITE + '/blog/' + s, 'monthly', '0.6')));
  cities.forEach(c => urls.push(url(S.SITE + '/jobs/' + c.slug, 'daily', '0.7')));

  const xml = '<?xml version="1.0" encoding="UTF-8"?>'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
    + urls.join('')
    + '</urlset>';

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=21600');
  return res.status(200).send(xml);
};
