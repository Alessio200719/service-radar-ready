// ============================================================
// Service Radar – Shared SSR helpers (KEINE Route: führendes "_")
// Wird von /api/leistungen, /api/jobs-city und /api/sitemap genutzt.
// Liest Jobs öffentlich (anon key, RLS schützt) aus Supabase REST.
// ============================================================
'use strict';

const SITE = (process.env.SITE_URL || 'https://service-radar.com').replace(/\/$/, '');
const SUPA_URL = (process.env.SUPABASE_URL || 'https://myatdrjwcydowtlxcoyz.supabase.co').replace(/\/$/, '');
// Öffentlicher anon/publishable Key (darf clientseitig stehen – RLS schützt die Daten):
const SUPA_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_Pl3xwsNbuj75LQICJ9ACPw_duac4rhC';

// Schwelle: ab wievielen aktiven Jobs eine Stadtseite indexiert wird (kein Thin-Content-Spam)
const CITY_MIN_JOBS = parseInt(process.env.SEO_CITY_MIN_JOBS || '3', 10);

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escAttr(s){ return esc(s); }

// Leistungs-Taxonomie (SEO-Slugs -> Job-Kategorien g/h/s/m bzw. Keywords)
const SERVICES = {
  gartenarbeit:   { title: 'Gartenarbeit',   emoji: '🌿', cats: ['g'],          desc: 'Rasen mähen, Hecken schneiden, Unkraut jäten, Beete pflegen – finde Helfer für deinen Garten oder biete deine Hilfe an.' },
  reinigung:      { title: 'Reinigung',      emoji: '🧽', cats: ['h'], kw: ['reinig','putz','sauber','fenster'], desc: 'Wohnungsreinigung, Fensterputzen, Grundreinigung und mehr – lokale Reinigungskräfte in deiner Nähe.' },
  haushaltshilfe: { title: 'Haushaltshilfe', emoji: '🏠', cats: ['h'],          desc: 'Unterstützung im Haushalt: aufräumen, waschen, bügeln, einkaufen. Finde verlässliche Haushaltshilfen vor Ort.' },
  umzugshilfe:    { title: 'Umzugshilfe',    emoji: '📦', cats: ['m'],          desc: 'Möbel tragen, Umzugskartons schleppen, Transport – kräftige Helfer für deinen Umzug in der Region.' },
  nachhilfe:      { title: 'Nachhilfe',      emoji: '📚', cats: [], kw: ['nachhilfe','lernen','mathe','vokabel','tutor','schule','prüfung'], desc: 'Lernunterstützung für Schule, Studium und Sprachen – qualifizierte Nachhilfe in deiner Nähe.' },
  handwerk:       { title: 'Handwerk',       emoji: '🔧', cats: [], kw: ['handwerk','montage','reparatur','aufbau','renovier','streichen','bohren'], desc: 'Kleine Reparaturen, Möbelmontage, Renovierung und Aufbau – geschickte Hände für jede Aufgabe.' },
  sonstiges:      { title: 'Sonstiges',      emoji: '✨', cats: [],              desc: 'Weitere lokale Aufgaben und Dienstleistungen – von Einkaufshilfe bis Tierbetreuung.' },
};
const SERVICE_ORDER = ['gartenarbeit','reinigung','haushaltshilfe','umzugshilfe','nachhilfe','handwerk','sonstiges'];
const CAT_LABEL = { g: 'Garten', h: 'Haushalt', s: 'Einkaufen', m: 'Möbel/Umzug' };

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
// "73734 Esslingen am Neckar" / "Musterstr. 1, Stuttgart" -> { name, slug }
function normalizeCity(raw) {
  let s = String(raw || '').trim();
  if (!s) return null;
  if (s.indexOf(',') >= 0) s = s.split(',').pop().trim();        // letzter Teil nach Komma
  s = s.replace(/\b\d{4,5}\b/g, '').replace(/\s+/g, ' ').trim(); // PLZ entfernen
  if (!s) return null;
  const name = s.replace(/\b\w/g, c => c.toUpperCase());
  return { name, slug: slugify(name) };
}

async function sbFetch(path) {
  const url = SUPA_URL + '/rest/v1/' + path;
  const r = await fetch(url, { headers: { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY, Accept: 'application/json' } });
  if (!r.ok) return [];
  try { return await r.json(); } catch (e) { return []; }
}
// Aktive Jobs laden (optional gefiltert). cols schlank halten.
async function fetchJobs({ cats, kw, cityIlike, limit = 24 } = {}) {
  let q = 'jobs?select=id,title,description,price,city,category,created_at&status=eq.active&order=created_at.desc&limit=' + limit;
  if (cats && cats.length) q += '&category=in.(' + cats.map(encodeURIComponent).join(',') + ')';
  if (cityIlike) q += '&city=ilike.' + encodeURIComponent('%' + cityIlike + '%');
  if (kw && kw.length && !(cats && cats.length)) {
    const ors = kw.map(k => 'title.ilike.%' + k + '%,description.ilike.%' + k + '%').join(',');
    q += '&or=(' + encodeURIComponent(ors) + ')';
  }
  return await sbFetch(q);
}

function jobCardHtml(j) {
  const cat = CAT_LABEL[j.category] || 'Aufgabe';
  const price = (j.price == null) ? '' : (Number(j.price) + ' €');
  const city = j.city ? esc(j.city) : '';
  const desc = j.description ? esc(String(j.description).slice(0, 120)) : '';
  return '<article class="jc">'
    + '<div class="jc-top"><span class="jc-cat">' + esc(cat) + '</span>' + (price ? '<span class="jc-price">' + esc(price) + '</span>' : '') + '</div>'
    + '<h3 class="jc-title">' + esc(j.title || 'Aufgabe') + '</h3>'
    + (desc ? '<p class="jc-desc">' + desc + '…</p>' : '')
    + (city ? '<div class="jc-city">📍 ' + city + '</div>' : '')
    + '<a class="jc-cta" href="' + SITE + '/#jobs">Auftrag ansehen →</a>'
    + '</article>';
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--ink:#0f1117;--ink3:#586069;--ink4:#8b949e;--bg:#fff;--bg1:#f6f8fa;--bd:#d0d7de;--blue:#0969da;--green:#1a7f37}
html{scroll-behavior:smooth}
body{font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:var(--ink);line-height:1.65;background:var(--bg);-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration:none}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header.nav{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.95);backdrop-filter:blur(12px);border-bottom:1px solid #eaeef2}
.nav-in{display:flex;align-items:center;justify-content:space-between;height:60px}
.logo{display:flex;align-items:center;gap:9px;font-weight:800;font-size:17px;color:var(--ink)}
.logo .ic{width:32px;height:32px;border-radius:8px;background:var(--ink);display:flex;align-items:center;justify-content:center;font-size:15px}
.nav-cta{background:var(--ink);color:#fff;padding:9px 16px;border-radius:10px;font-weight:600;font-size:14px}
.hero{padding:48px 0 8px}
.bc{font-size:13px;color:var(--ink4);margin-bottom:14px}
.bc a:hover{color:var(--blue)}
h1{font-size:clamp(28px,4.4vw,42px);font-weight:800;letter-spacing:-.02em;line-height:1.1;margin-bottom:14px}
.lead{font-size:17px;color:var(--ink3);max-width:680px}
.sec{padding:30px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
.jc{border:1px solid var(--bd);border-radius:14px;padding:16px;background:var(--bg);display:flex;flex-direction:column;gap:8px}
.jc-top{display:flex;justify-content:space-between;align-items:center}
.jc-cat{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--green);background:#d1f7c4;padding:3px 9px;border-radius:100px}
.jc-price{font-weight:800;font-size:17px}
.jc-title{font-size:16px;font-weight:700}
.jc-desc{font-size:13.5px;color:var(--ink3)}
.jc-city{font-size:13px;color:var(--ink4)}
.jc-cta{font-size:13.5px;font-weight:600;color:var(--blue);margin-top:auto}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.card{border:1px solid var(--bd);border-radius:14px;padding:18px;background:var(--bg);transition:border-color .15s,transform .15s}
.card:hover{border-color:var(--ink4);transform:translateY(-2px)}
.card .e{font-size:24px}
.card h3{font-size:16px;font-weight:700;margin:8px 0 4px}
.card p{font-size:13.5px;color:var(--ink3)}
.empty{border:1px dashed var(--bd);border-radius:14px;padding:28px;text-align:center;color:var(--ink3);background:var(--bg1)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.chip{border:1px solid var(--bd);border-radius:100px;padding:7px 14px;font-size:13.5px;font-weight:600;color:var(--ink);background:var(--bg)}
.chip:hover{border-color:var(--blue);color:var(--blue)}
h2.h{font-size:22px;font-weight:800;margin-bottom:14px;letter-spacing:-.01em}
.nl{background:var(--bg1);border:1px solid #eaeef2;border-radius:16px;padding:22px;margin:28px 0}
.nl h3{font-size:18px;font-weight:800;margin-bottom:6px}
.nl p{font-size:14px;color:var(--ink3);margin-bottom:12px}
.nl form{display:flex;gap:8px;flex-wrap:wrap}
.nl input{flex:1;min-width:200px;border:1px solid var(--bd);border-radius:10px;padding:11px 14px;font-size:16px;font-family:inherit}
.nl button{background:var(--ink);color:#fff;border:none;border-radius:10px;padding:11px 18px;font-weight:700;font-size:14px;cursor:pointer}
.nl .msg{font-size:13px;margin-top:8px}
footer{border-top:1px solid #eaeef2;margin-top:40px;padding:30px 0;color:var(--ink4);font-size:13.5px}
.fcols{display:flex;flex-wrap:wrap;gap:22px;margin-bottom:18px}
.fcols a{color:var(--ink3)}.fcols a:hover{color:var(--blue)}
.fcols b{display:block;color:var(--ink);font-size:12px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.fcol{display:flex;flex-direction:column;gap:6px}
@media(max-width:600px){.hero{padding:30px 0 4px}.sec{padding:22px 0}}
`;

function header() {
  return '<header class="nav"><div class="wrap nav-in">'
    + '<a class="logo" href="' + SITE + '/"><span class="ic">📡</span>Service Radar</a>'
    + '<a class="nav-cta" href="' + SITE + '/#jobs">Aufträge entdecken</a>'
    + '</div></header>';
}
function newsletterBlock() {
  return '<div class="nl"><h3>📬 Newsletter</h3>'
    + '<p>Neue Aufträge & Tipps aus deiner Region – kostenlos, jederzeit abbestellbar.</p>'
    + '<form id="nlf" onsubmit="return nlSub(event)">'
    + '<input id="nle" type="email" required placeholder="Deine E-Mail-Adresse" aria-label="E-Mail">'
    + '<button type="submit">Abonnieren</button></form>'
    + '<div class="msg" id="nlm" role="status"></div></div>'
    + '<script>function nlSub(e){e.preventDefault();var m=document.getElementById("nlm"),b=document.getElementById("nle").value;'
    + 'm.textContent="Senden…";fetch("/api/newsletter-subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:b})})'
    + '.then(r=>r.json()).then(d=>{m.style.color=d.ok?"#1a7f37":"#cf222e";m.textContent=d.ok?"✅ Fast geschafft – bitte bestätige die E-Mail in deinem Postfach.":(d.error||"Fehler.");if(d.ok)document.getElementById("nlf").reset();})'
    + '.catch(()=>{m.style.color="#cf222e";m.textContent="Netzwerkfehler.";});return false;}</script>';
}
function footer(topCities) {
  const svc = SERVICE_ORDER.map(s => '<a href="' + SITE + '/leistungen/' + s + '">' + esc(SERVICES[s].title) + '</a>').join('');
  const cities = (topCities && topCities.length)
    ? topCities.slice(0, 8).map(c => '<a href="' + SITE + '/jobs/' + c.slug + '">' + esc(c.name) + '</a>').join('')
    : '<a href="' + SITE + '/#jobs">Aufträge in deiner Nähe</a>';
  return '<footer><div class="wrap"><div class="fcols">'
    + '<div class="fcol"><b>Leistungen</b>' + svc + '</div>'
    + '<div class="fcol"><b>Regionen</b>' + cities + '</div>'
    + '<div class="fcol"><b>Service Radar</b>'
      + '<a href="' + SITE + '/">Startseite</a><a href="' + SITE + '/leistungen">Alle Leistungen</a>'
      + '<a href="' + SITE + '/blog">Blog</a><a href="' + SITE + '/#impressum">Impressum</a></div>'
    + '</div><div>© ' + new Date().getFullYear() + ' Service Radar – Alessio Cicatello. Alle Rechte vorbehalten.</div></div></footer>';
}

function page({ title, desc, canonical, robots, h1, bodyHtml, jsonld, topCities }) {
  const ld = (jsonld || []).map(o => '<script type="application/ld+json">' + JSON.stringify(o) + '</script>').join('');
  return '<!DOCTYPE html><html lang="de"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<title>' + esc(title) + '</title>'
    + '<meta name="description" content="' + escAttr(desc) + '">'
    + '<link rel="canonical" href="' + escAttr(canonical) + '">'
    + '<meta name="robots" content="' + (robots || 'index,follow,max-image-preview:large') + '">'
    + '<meta name="theme-color" content="#0f1117">'
    + '<meta property="og:type" content="website"><meta property="og:site_name" content="Service Radar">'
    + '<meta property="og:title" content="' + escAttr(title) + '"><meta property="og:description" content="' + escAttr(desc) + '">'
    + '<meta property="og:url" content="' + escAttr(canonical) + '"><meta property="og:image" content="' + SITE + '/og-image.png">'
    + '<meta name="twitter:card" content="summary_large_image">'
    + '<link rel="icon" type="image/png" href="' + SITE + '/icon-192.png">'
    + '<link rel="apple-touch-icon" href="' + SITE + '/icon-192.png">'
    + ld
    + '<style>' + BASE_CSS + '</style></head><body>'
    + header()
    + '<main class="wrap">' + bodyHtml + '</main>'
    + footer(topCities)
    + '</body></html>';
}

// Top-Städte (für Footer/Sitemap) aus echten aktiven Jobs aggregieren
async function topCities(minJobs = CITY_MIN_JOBS, max = 60) {
  const rows = await sbFetch('jobs?select=city&status=eq.active&limit=2000');
  const counts = {};
  for (const r of rows) {
    const c = normalizeCity(r.city);
    if (!c) continue;
    if (!counts[c.slug]) counts[c.slug] = { name: c.name, slug: c.slug, n: 0 };
    counts[c.slug].n++;
  }
  return Object.values(counts).filter(c => c.n >= minJobs).sort((a, b) => b.n - a.n).slice(0, max);
}

module.exports = {
  SITE, esc, escAttr, SERVICES, SERVICE_ORDER, CAT_LABEL, slugify, normalizeCity,
  fetchJobs, jobCardHtml, page, newsletterBlock, header, footer, topCities, CITY_MIN_JOBS,
};
