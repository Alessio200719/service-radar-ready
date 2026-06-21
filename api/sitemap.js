'use strict';

const S = require('./_ssr');

const SITE = 'https://service-radar.com';

const SERVICE_SLUGS = [
  'gartenarbeit',
  'reinigung',
  'haushaltshilfe',
  'umzugshilfe',
  'nachhilfe',
  'handwerk',
  'sonstiges'
];

const BLOG_SLUGS = [
  'nebenjob-finden-in-deiner-region',
  'haushaltshilfe-finden',
  'was-kostet-gartenarbeit',
  'tipps-fuer-auftraggeber',
  'tipps-fuer-helfer'
];

function escXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function url(loc, changefreq, priority) {
  return `
  <url>
    <loc>${escXml(loc)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

module.exports = async function handler(req, res) {
  let urls = [];

  urls.push(url(`${SITE}/`, 'daily', '1.0'));
  urls.push(url(`${SITE}/leistungen`, 'weekly', '0.8'));

  SERVICE_SLUGS.forEach(slug => {
    urls.push(url(`${SITE}/leistungen/${slug}`, 'weekly', '0.7'));
  });

  urls.push(url(`${SITE}/blog`, 'weekly', '0.6'));

  BLOG_SLUGS.forEach(slug => {
    urls.push(url(`${SITE}/blog/${slug}`, 'monthly', '0.6'));
  });

  try {
    if (S.topCities) {
      const cities = await S.topCities();
      cities.forEach(city => {
        if (city && city.slug) {
          urls.push(url(`${SITE}/jobs/${city.slug}`, 'daily', '0.7'));
        }
      });
    }
  } catch (e) {
    // Sitemap soll trotzdem funktionieren
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>`;

  res.writeHead(200, {
    'Content-Type': 'application/xml; charset=utf-8',
    'Cache-Control': 'public, max-age=3600, s-maxage=21600'
  });

  res.end(xml);
};
