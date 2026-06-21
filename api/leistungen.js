// ============================================================
// Service Radar – SSR /leistungen  und  /leistungen/[kategorie]
// (Vercel rewrite: /leistungen/:cat -> /api/leistungen?cat=:cat)
// Rendert SEO-Seiten mit echten aktiven Jobs aus Supabase.
// ============================================================
'use strict';
const S = require('./_ssr');

module.exports = async function handler(req, res) {
  const cat = (req.query && req.query.cat ? String(req.query.cat) : '').toLowerCase().replace(/[^a-z]/g, '');
  let cities = [];
  try { cities = await S.topCities(); } catch (e) {}

  // ---------- Index: /leistungen ----------
  if (!cat) {
    const cards = S.SERVICE_ORDER.map(slug => {
      const s = S.SERVICES[slug];
      return '<a class="card" href="' + S.SITE + '/leistungen/' + slug + '"><div class="e">' + s.emoji + '</div>'
        + '<h3>' + S.esc(s.title) + '</h3><p>' + S.esc(s.desc) + '</p></a>';
    }).join('');
    const itemList = {
      '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: S.SERVICE_ORDER.map((slug, i) => ({
        '@type': 'ListItem', position: i + 1, name: S.SERVICES[slug].title, url: S.SITE + '/leistungen/' + slug
      }))
    };
    const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Start', item: S.SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'Leistungen', item: S.SITE + '/leistungen' }
    ]};
    const body = '<section class="hero"><div class="bc"><a href="' + S.SITE + '/">Start</a> › Leistungen</div>'
      + '<h1>Leistungen auf Service Radar</h1>'
      + '<p class="lead">Finde lokale Helfer für jede Aufgabe – oder biete deine Dienstleistung an. Wähle eine Kategorie und sieh aktuelle Aufträge in deiner Nähe.</p></section>'
      + '<section class="sec"><div class="cards">' + cards + '</div></section>'
      + '<section class="sec">' + S.newsletterBlock() + '</section>';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');
    return res.status(200).send(S.page({
      title: 'Leistungen – lokale Aufträge & Helfer | Service Radar',
      desc: 'Alle Leistungen auf Service Radar: Gartenarbeit, Reinigung, Haushaltshilfe, Umzugshilfe, Nachhilfe, Handwerk & mehr – lokale Helfer in deiner Nähe finden.',
      canonical: S.SITE + '/leistungen', h1: 'Leistungen',
      bodyHtml: body, jsonld: [bc, itemList], topCities: cities
    }));
  }

  // ---------- Detail: /leistungen/[kategorie] ----------
  const svc = S.SERVICES[cat];
  if (!svc) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(404).send(S.page({
      title: 'Leistung nicht gefunden | Service Radar',
      desc: 'Diese Leistung gibt es nicht. Sieh dir alle Leistungen auf Service Radar an.',
      canonical: S.SITE + '/leistungen', robots: 'noindex,follow',
      bodyHtml: '<section class="hero"><h1>Leistung nicht gefunden</h1><p class="lead">Diese Seite existiert nicht. <a href="' + S.SITE + '/leistungen">Alle Leistungen ansehen →</a></p></section>',
      jsonld: [], topCities: cities
    }));
  }

  let jobs = [];
  try { jobs = await S.fetchJobs({ cats: svc.cats, kw: svc.kw, limit: 24 }); } catch (e) {}

  const jobsHtml = jobs.length
    ? '<div class="grid">' + jobs.map(S.jobCardHtml).join('') + '</div>'
    : '<div class="empty">Aktuell keine offenen ' + S.esc(svc.title) + '-Aufträge. <a href="' + S.SITE + '/#jobs">Jetzt Auftrag einstellen →</a></div>';

  const others = S.SERVICE_ORDER.filter(s => s !== cat)
    .map(s => '<a class="chip" href="' + S.SITE + '/leistungen/' + s + '">' + S.SERVICES[s].emoji + ' ' + S.esc(S.SERVICES[s].title) + '</a>').join('');

  const bc = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Start', item: S.SITE + '/' },
    { '@type': 'ListItem', position: 2, name: 'Leistungen', item: S.SITE + '/leistungen' },
    { '@type': 'ListItem', position: 3, name: svc.title, item: S.SITE + '/leistungen/' + cat }
  ]};
  const serviceLd = { '@context': 'https://schema.org', '@type': 'Service', name: svc.title + ' – Service Radar',
    serviceType: svc.title, areaServed: 'DE', description: svc.desc,
    provider: { '@type': 'Organization', name: 'Service Radar', url: S.SITE + '/' } };

  const body = '<section class="hero"><div class="bc"><a href="' + S.SITE + '/">Start</a> › <a href="' + S.SITE + '/leistungen">Leistungen</a> › ' + S.esc(svc.title) + '</div>'
    + '<h1>' + svc.emoji + ' ' + S.esc(svc.title) + ' in deiner Nähe</h1>'
    + '<p class="lead">' + S.esc(svc.desc) + '</p></section>'
    + '<section class="sec"><h2 class="h">Aktuelle ' + S.esc(svc.title) + '-Aufträge</h2>' + jobsHtml + '</section>'
    + '<section class="sec"><h2 class="h">Weitere Leistungen</h2><div class="chips">' + others + '</div></section>'
    + '<section class="sec">' + S.newsletterBlock() + '</section>';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=1800');
  return res.status(200).send(S.page({
    title: svc.title + ' in deiner Nähe finden | Service Radar',
    desc: svc.desc + ' Jetzt Helfer für ' + svc.title + ' finden oder Auftrag einstellen.',
    canonical: S.SITE + '/leistungen/' + cat, h1: svc.title,
    bodyHtml: body, jsonld: [bc, serviceLd], topCities: cities
  }));
};
