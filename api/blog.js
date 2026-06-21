'use strict';

const S = require('./_ssr');

const ARTICLES = [
  {
    slug: 'nebenjob-finden-in-deiner-region',
    title: 'Nebenjob finden in deiner Region',
    desc: 'So findest du flexible lokale Aufträge in deiner Nähe.',
    body: 'Service Radar hilft dir, lokale Aufträge in deiner Umgebung zu finden. Ob Gartenarbeit, Haushaltshilfe, Umzugshilfe, Reinigung oder Nachhilfe – du kannst passende Aufgaben entdecken und direkt Kontakt aufnehmen.'
  },
  {
    slug: 'haushaltshilfe-finden',
    title: 'Haushaltshilfe finden',
    desc: 'Worauf du achten solltest, wenn du Unterstützung im Haushalt suchst.',
    body: 'Eine gute Haushaltshilfe spart Zeit und sorgt für Entlastung im Alltag. Über Service Radar kannst du lokale Hilfe finden oder selbst Unterstützung anbieten.'
  },
  {
    slug: 'was-kostet-gartenarbeit',
    title: 'Was kostet Gartenarbeit?',
    desc: 'Ein Überblick über typische Aufgaben und faire Vergütung.',
    body: 'Gartenarbeit kann je nach Aufgabe unterschiedlich vergütet werden. Rasen mähen, Hecken schneiden oder Unkraut jäten sind typische lokale Aufträge, die über Service Radar eingestellt werden können.'
  },
  {
    slug: 'tipps-fuer-auftraggeber',
    title: 'Tipps für Auftraggeber',
    desc: 'So formulierst du einen guten Auftrag.',
    body: 'Ein guter Auftrag sollte klar beschreiben, was gemacht werden soll, wo der Auftrag stattfindet, wann Hilfe benötigt wird und welche Vergütung angeboten wird.'
  },
  {
    slug: 'tipps-fuer-helfer',
    title: 'Tipps für Helfer',
    desc: 'So findest du passende lokale Aufträge.',
    body: 'Als Helfer solltest du dein Profil ordentlich ausfüllen, zuverlässig kommunizieren und nur Aufträge annehmen, die du wirklich erfüllen kannst.'
  }
];

function layout(title, desc, content) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${S.esc(title)} | Service Radar</title>
<meta name="description" content="${S.esc(desc)}">
<link rel="canonical" href="${S.SITE}/blog">
<style>
body{font-family:Inter,Arial,sans-serif;margin:0;background:#fff;color:#101418}
header{border-bottom:1px solid #eef0f3;padding:18px 24px}
main{max-width:980px;margin:0 auto;padding:56px 24px}
a{color:#0b66d8;text-decoration:none}
h1{font-size:44px;line-height:1.08;margin:0 0 18px}
p{font-size:18px;line-height:1.65;color:#586069}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px;margin-top:28px}
.card{border:1px solid #d8dee4;border-radius:16px;padding:22px;background:#fff}
.btn{display:inline-block;background:#101418;color:#fff;padding:12px 18px;border-radius:10px;margin-top:16px}
footer{border-top:1px solid #eef0f3;margin-top:60px;padding:24px;color:#586069}
</style>
</head>
<body>
<header><strong>Service Radar</strong></header>
<main>${content}</main>
<footer>service-radar.com</footer>
</body>
</html>`;
}

module.exports = async function handler(req, res) {
  const slug = req.query && req.query.slug;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');

  if (slug) {
    const article = ARTICLES.find(a => a.slug === slug);
    if (!article) {
      return res.status(404).send('Artikel nicht gefunden');
    }

    return res.status(200).send(layout(
      article.title,
      article.desc,
      `<p><a href="/blog">← Zurück zum Blog</a></p>
       <h1>${S.esc(article.title)}</h1>
       <p>${S.esc(article.desc)}</p>
       <p>${S.esc(article.body)}</p>
       <p><a class="btn" href="/">Aufträge entdecken</a></p>`
    ));
  }

  const cards = ARTICLES.map(a => `
    <article class="card">
      <h2>${S.esc(a.title)}</h2>
      <p>${S.esc(a.desc)}</p>
      <a href="/blog/${a.slug}">Artikel lesen →</a>
    </article>
  `).join('');

  return res.status(200).send(layout(
    'Blog',
    'Tipps, Informationen und Ratgeber rund um lokale Hilfe, Aufträge und Nebenjobs.',
    `<h1>Service Radar Blog</h1>
     <p>Tipps, Informationen und Ratgeber rund um lokale Hilfe, Aufträge und Nebenjobs.</p>
     <div class="grid">${cards}</div>`
  ));
};
