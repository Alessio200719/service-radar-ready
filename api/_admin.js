// ============================================================
// Service Radar – Admin-Prüfung für Serverless Functions
// Erlaubte Betreiber-Adressen kommen aus der Umgebungsvariable ADMIN_EMAILS
// (kommagetrennt). Fehlt sie, gilt info@service-radar.com.
// ============================================================
const { verifyUser } = require('./_auth');

function adminList() {
  const raw = process.env.ADMIN_EMAILS || 'info@service-radar.com';
  return raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

/** Liefert den Nutzer, wenn er Betreiber ist – sonst null. */
async function verifyAdmin(req) {
  const u = await verifyUser(req);
  if (!u) return null;
  return adminList().indexOf((u.email || '').toLowerCase()) >= 0 ? u : null;
}

module.exports = { verifyAdmin, adminList };
