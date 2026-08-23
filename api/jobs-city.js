// ============================================================
// Service Radar – SSR /jobs/[stadt]
// (Vercel rewrite: /jobs/:city -> /api/jobs-city?city=:city)
// Standort-SEO aus ECHTEN Daten: nur Städte mit genug aktiven Jobs
// werden indexiert (sonst noindex,follow -> kein Thin-Content-Spam).
// ============================================================
'use strict';
const S = require('./_ssr');

module.exports = async function handler(req, res) {
  const raw = (req.query && req.query.city ? String(req.query.city) : '').toLowerCase();
  const slug = S.slugify(raw);
  if (!slug) { res.setHeader('Location', S.SITE + '/#jobs'); return res.status(302).end(); }

  const phrase = slug.replace(/-/g, ' ');           // "esslingen am neckar"
  const cityName = phrase.replace(/\b\w/g, c => c.toUpperCase());

  let jobs = [], cities = [];
  try { jobs = await S.fetchJobs({ cityIlike: phrase, limit: 30 }); } catch (e) {}
  try { cities = await S.topCities(); } catch (e) {}

  const enough = jobs.length >= S.CITY_MIN_JOBS;
  const robots = enough ? 'index,follow,max-image-preview:large' : 'noindex,follow';

  const jobsHtml = jobs.length
    ? '<div class="grid">' + jobs.map(S.jobCardHtml).join('') + '</div>'
    : '<div class="empty">Aktuell keine offenen Aufträge in ' + S.esc(cityName) + '. <a href="' + S.SITE + '/#jobs">Auftrag einstellen</a> oder <a href="' + S.SITE + '/leistungen">Leistungen ansehen →</a></div>';

  const svcChips = S.SERVICE_ORDER.map(s =>
    '<a class="chip" href="' + S.SITE + '/leistungen/' + s + '">' + S.SERVICES[s].emoji + ' ' + S.esc(S.SERVICES[s].title) + '</a>').join('');
  const otherCities = (cities || []).filter(c => c.slug !== slug).slice(0, 10)
    .map(c => '<a class="chip" href="' + S.SITE + '/jobs/' + c.slug + '">📍 ' + S.esc(c.name) + '</a>').join('')
    || '<a class="chip" href="' + S.SITE + '/#jobs">Aufträge in deiner Nähe</a>';

  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Start', item: S.SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Aufträge', item: S.SITE + '/#jobs' },
    { '@type': 'ListItem', position: 3, name: cityName, item: S.SITE + '/jobs/' + slug }
  ]};
  const ld = [bc];
  if (enough) {
    ld.push({ '@context': 'https://schema.org', '@type': 'CollectionPage',
      name: 'Aufträge in ' + cityName, url: S.SITE + '/jobs/' + slug,
      about: { '@type': 'Place', name: cityName }, inLanguage: 'de-DE' });
  }

  const body = '<section class="hero"><div class="bc"><a href="' + S.SITE + '/">Start</a> › <a href="' + S.SITE + '/#jobs">Aufträge</a> › ' + S.esc(cityName) + '</div>'
    + '<h1>Aufträge & Helfer in ' + S.esc(cityName) + '</h1>'
    + '<p class="lead">Finde aktuelle lokale Aufgaben in ' + S.esc(cityName) + ' und Umgebung – Gartenarbeit, Reinigung, Haushaltshilfe, Umzug und mehr. Oder stelle selbst einen Auftrag ein.</p></section>'
    + '<section class="sec"><h2 class="h">Aktuelle Aufträge in ' + S.esc(cityName) + '</h2>' + jobsHtml + '</section>'
    + '<section class="sec"><h2 class="h">Beliebte Leistungen</h2><div class="chips">' + svcChips + '</div></section>'
    + '<section class="sec"><h2 class="h">Weitere Regionen</h2><div class="chips">' + otherCities + '</div></section>'
    + '<section class="sec">' + S.newsletterBlock() + '</section>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800');
  return res.status(200).send(S.page({
    title: 'Aufträge & Helfer in ' + cityName + ' | Service Radar',
    desc: 'Lokale Aufträge in ' + cityName + ' finden oder Helfer beauftragen: Gartenarbeit, Reinigung, Haushaltshilfe, Umzug u. v. m. – schnell, fair und sicher.',
    canonical: S.SITE + '/jobs/' + slug, robots: robots,
    bodyHtml: body, jsonld: ld, topCities: cities
  }));
};
