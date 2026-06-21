'use strict';

const S = require('./_ssr');

module.exports = async function handler(req, res) {
  const city = (req.query && req.query.city ? String(req.query.city) : 'stuttgart')
    .toLowerCase()
    .replace(/[^a-zäöüß-]/gi, '');

  const cityName = city
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const title = `Jobs und Aufträge in ${cityName}`;
  const desc = `Finde lokale Aufträge, Helfer und Dienstleistungen in ${cityName} über Service Radar.`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=3600');

  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">

<title>${S.esc(title)} | Service Radar</title>
<meta name="description" content="${S.esc(desc)}">
<link rel="canonical" href="${S.SITE}/jobs/${S.esc(city)}">

<meta name="robots" content="index,follow,max-image-preview:large">

<meta property="og:type" content="website">
<meta property="og:title" content="${S.esc(title)}">
<meta property="og:description" content="${S.esc(desc)}">
<meta property="og:url" content="${S.SITE}/jobs/${S.esc(city)}">
<meta property="og:site_name" content="Service Radar">

<style>
body{font-family:Inter,Arial,sans-serif;margin:0;background:#fff;color:#101418}
header{border-bottom:1px solid #eef0f3;padding:18px 24px}
main{max-width:980px;margin:0 auto;padding:56px 24px}
a{color:#0b66d8;text-decoration:none}
h1{font-size:44px;line-height:1.08;margin:0 0 18px}
p{font-size:18px;line-height:1.65;color:#586069}
.card{border:1px solid #d8dee4;border-radius:16px;padding:22px;background:#fff;margin-top:20px}
.btn{display:inline-block;background:#101418;color:#fff;padding:12px 18px;border-radius:10px;margin-top:16px}
footer{border-top:1px solid #eef0f3;margin-top:60px;padding:24px;color:#586069}
</style>
</head>
<body>

<header>
<strong>Service Radar</strong>
</header>

<main>
<h1>${S.esc(title)}</h1>

<p>${S.esc(desc)}</p>

<div class="card">
  <h2>Lokale Hilfe in ${S.esc(cityName)} finden</h2>
  <p>
    Über Service Radar kannst du Aufträge in deiner Nähe entdecken oder selbst einen Auftrag einstellen.
    Geeignet für Gartenarbeit, Reinigung, Haushaltshilfe, Umzugshilfe, Nachhilfe, Handwerk und weitere lokale Aufgaben.
  </p>
  <a class="btn" href="/">Aufträge ansehen</a>
</div>

<div class="card">
  <h2>Auftrag einstellen</h2>
  <p>
    Beschreibe kurz, wobei du Hilfe brauchst, lege Ort und Vergütung fest und finde passende Helfer in deiner Umgebung.
  </p>
  <a class="btn" href="/">Jetzt starten</a>
</div>
</main>

<footer>
service-radar.com
</footer>

</body>
</html>`;

  return res.status(200).send(html);
};
