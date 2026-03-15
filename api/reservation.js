/**
 * /api/reservation.js — Vercel Serverless Function
 * ─────────────────────────────────────────────────────────────
 * Optional server-side reservation handler.
 * Use this if you want to:
 *   - Send a confirmation email via Resend/SendGrid
 *   - Use the Supabase service_role key (bypasses RLS)
 *   - Add server-side rate limiting (Upstash Redis)
 *
 * The frontend api.js calls Supabase directly for the basic
 * case. Switch to this endpoint by updating api.js if you
 * want email confirmations.
 *
 * Method: POST /api/reservation
 * ─────────────────────────────────────────────────────────────
 */

// Input validation helpers (duplicated server-side for security)
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function sanitize(str, maxLen = 255) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLen).replace(/[<>"'`]/g, c =>
    ({ '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '`': '&#x60;' }[c])
  );
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, phone, date, time, guests, notes, _gotcha } = req.body || {};

  // ── Honeypot check ──
  if (_gotcha) {
    return res.status(200).json({ ok: true }); // Silently accept bots
  }

  // ── Validation ──
  if (!name || !email || !phone || !date || !time || !guests) {
    return res.status(400).json({ ok: false, message: 'Missing required fields.' });
  }
  if (!validateEmail(email)) {
    return res.status(400).json({ ok: false, message: 'Invalid email address.' });
  }
  const guestCount = parseInt(guests);
  if (isNaN(guestCount) || guestCount < 1 || guestCount > 20) {
    return res.status(400).json({ ok: false, message: 'Invalid guest count.' });
  }
  const reservationDate = new Date(date);
  if (isNaN(reservationDate) || reservationDate < new Date()) {
    return res.status(400).json({ ok: false, message: 'Please select a future date.' });
  }

  // ── Insert into Supabase using service_role key (server-side only) ──
  const supabaseUrl    = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Never expose this in the browser

  try {
    const dbRes = await fetch(`${supabaseUrl}/rest/v1/reservations`, {
      method: 'POST',
      headers: {
        'apikey':        serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type':  'application/json',
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        name:    sanitize(name, 100),
        email:   sanitize(email, 100),
        phone:   sanitize(phone, 30),
        date,
        time:    sanitize(time, 20),
        guests:  guestCount,
        notes:   sanitize(notes || '', 500),
        status:  'pending',
      }),
    });

    if (!dbRes.ok) {
      const err = await dbRes.json().catch(() => ({}));
      throw new Error(err.message || 'Database error');
    }

    // ── Optional: Send confirmation email via Resend ──
    // Uncomment and add RESEND_API_KEY to Vercel env vars to enable
    /*
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify({
          from:    'reservations@yourdomain.com',
          to:      [email],
          subject: 'Your Aurelia Reservation Request',
          html: `
            <p>Dear ${sanitize(name, 50)},</p>
            <p>We have received your reservation request for <strong>${date}</strong> at <strong>${time}</strong> for <strong>${guestCount} guest(s)</strong>.</p>
            <p>Our concierge will confirm your booking shortly.</p>
            <p>— The Aurelia Team</p>
          `,
        }),
      });
    }
    */

    return res.status(200).json({ ok: true, message: 'Reservation received.' });
  } catch (err) {
    console.error('[/api/reservation]', err);
    return res.status(500).json({ ok: false, message: 'Could not save reservation.' });
  }
}