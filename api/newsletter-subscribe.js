// ============================================================
// Service Radar – POST /api/newsletter-subscribe
// Einfache Newsletter-/Wartelisten-Anmeldung:
// Speichert die E-Mail direkt in Supabase.
// Keine Bestätigungsmail.
// Kein Resend.
// Kein Double-Opt-in.
// ============================================================
'use strict';

const { createClient } = require('@supabase/supabase-js');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      error: 'Method not allowed'
    });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return res.status(500).json({
      ok: false,
      error: 'Server nicht konfiguriert.'
    });
  }

  let body = {};

  try {
    body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});
  } catch (e) {
    body = {};
  }

  const email = String(body.email || '').trim().toLowerCase();
  const source = String(body.source || 'web').slice(0, 40);

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({
      ok: false,
      error: 'Bitte gib eine gültige E-Mail-Adresse ein.'
    });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false }
  });

  try {
    const { data: existing, error: findError } = await sb
      .from('newsletter_subscribers')
      .select('id,email')
      .eq('email', email)
      .maybeSingle();

    if (findError) {
      console.error('Newsletter lookup error:', findError);
      return res.status(500).json({
        ok: false,
        error: findError.message
      });
    }

    if (existing) {
      return res.status(200).json({
        ok: true,
        already: true,
        message: '🎉 Danke! Du bist bereits für zukünftige Updates von Service Radar eingetragen.'
      });
    }

    const { error: insertError } = await sb
      .from('newsletter_subscribers')
      .insert({
        email,
        source,
        confirmed: true
      });

    if (insertError) {
      console.error('Newsletter insert error:', insertError);
      return res.status(500).json({
        ok: false,
        error: insertError.message
      });
    }

    return res.status(200).json({
      ok: true,
      message: '🎉 Danke! Du wurdest erfolgreich für zukünftige Updates von Service Radar eingetragen.'
    });

  } catch (e) {
    console.error('Newsletter subscribe error:', e);
    return res.status(500).json({
      ok: false,
      error: (e && e.message) || 'error'
    });
  }
};
