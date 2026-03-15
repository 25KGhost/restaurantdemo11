/**
 * AURELIA RESTAURANT — api.js
 * ─────────────────────────────────────────────────────────────
 * Central API module. All Supabase & Cloudinary interactions.
 * Config is fetched from /api/config (Vercel serverless function).
 * ─────────────────────────────────────────────────────────────
 */

// ─── CONFIG LOADER ───────────────────────────────────────────
let _config = null;

async function getConfig() {
  if (_config) return _config;
  try {
    const res = await fetch('/api/config');
    _config   = await res.json();
    return _config;
  } catch (err) {
    console.error('[api] Could not load config:', err);
    _config = window.__ENV || {};
    return _config;
  }
}

// ─── SUPABASE CLIENT ─────────────────────────────────────────
const sb = {
  async _req(path, options = {}) {
    const cfg   = await getConfig();
    const token = this._getToken();
    const authKey = token || cfg.supabaseAnonKey;

    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/${path}`, {
      headers: {
        'apikey':        cfg.supabaseAnonKey,
        'Authorization': `Bearer ${authKey}`,
        'Content-Type':  'application/json',
        'Prefer':        options.prefer || 'return=representation',
        ...options.headers,
      },
      method: options.method || 'GET',
      body:   options.body   ? JSON.stringify(options.body) : undefined,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Supabase error ${res.status}`);
    }
    return res.status === 204 ? null : res.json();
  },

  _getToken() {
    try {
      const keys = Object.keys(localStorage).filter(k => k.endsWith('-auth-token'));
      if (!keys.length) return null;
      return JSON.parse(localStorage.getItem(keys[0]))?.access_token || null;
    } catch { return null; }
  },

  query(path, options = {})     { return this._req(path, options); },
  authQuery(path, options = {}) {
    const token = this._getToken();
    if (!token) throw new Error('Not authenticated');
    return this._req(path, options);
  },
};

// ─── RATE LIMITER ────────────────────────────────────────────
const RateLimit = {
  _store: {},
  check(key, max = 3, windowMs = 60_000) {
    const now = Date.now();
    if (!this._store[key]) this._store[key] = [];
    this._store[key] = this._store[key].filter(t => now - t < windowMs);
    if (this._store[key].length >= max) return false;
    this._store[key].push(now);
    return true;
  },
};

// ─── INPUT SANITIZER ─────────────────────────────────────────
function sanitize(str, maxLen = 255) {
  if (typeof str !== 'string') return '';
  return str.slice(0, maxLen).replace(/[<>"'`]/g, c =>
    ({ '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#x27;', '`':'&#x60;' }[c]));
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function detectHoneypot(formEl) {
  const trap = formEl?.querySelector('[name="website"], [name="url"], [name="_gotcha"]');
  return !!(trap && trap.value.trim());
}

// ─────────────────────────────────────────────────────────────
// PUBLIC API FUNCTIONS
// ─────────────────────────────────────────────────────────────

/**
 * submitReservation()
 * Auto-confirms reservation. Returns full reservation record including ID.
 */
export async function submitReservation(formEl, data) {
  if (detectHoneypot(formEl)) return { ok: false, message: 'Blocked.' };
  if (!RateLimit.check('reservation', 2, 60_000))
    return { ok: false, message: 'Too many requests. Please wait a moment.' };

  const { name, email, phone, date, time, guests, notes = '' } = data;
  if (!name || !email || !phone || !date || !time || !guests)
    return { ok: false, message: 'Please fill in all required fields.' };
  if (!validateEmail(email))
    return { ok: false, message: 'Please enter a valid email address.' };
  if (parseInt(guests) < 1 || parseInt(guests) > 20)
    return { ok: false, message: 'Guest count must be between 1 and 20.' };

  const reservationDate = new Date(date);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + 60);
  if (reservationDate < today)
    return { ok: false, message: 'Please select a future date.' };
  if (reservationDate > maxDate)
    return { ok: false, message: 'Reservations can only be made up to 60 days in advance.' };

  const payload = {
    name:    sanitize(name, 100),
    email:   sanitize(email, 100),
    phone:   sanitize(phone, 30),
    date,
    time:    sanitize(time, 20),
    guests:  parseInt(guests),
    notes:   sanitize(notes, 500),
    status:  'confirmed',  // Auto-confirm
  };

  // Try serverless first
  try {
    const apiRes = await fetch('/api/reservation', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (apiRes.ok) {
      const result = await apiRes.json();
      return result;
    }
    throw new Error('Serverless unavailable');
  } catch {
    // Fallback: direct Supabase
    try {
      const rows = await sb.query('reservations', {
        method: 'POST',
        body:   payload,
        prefer: 'return=representation',
      });
      const reservation = Array.isArray(rows) ? rows[0] : rows;
      return {
        ok:          true,
        reservation,
        message:     'Reservation confirmed!',
      };
    } catch (err) {
      console.error('[submitReservation]', err);
      return { ok: false, message: 'Something went wrong. Please try again.' };
    }
  }
}

/**
 * loadMenu()
 */
export async function loadMenu() {
  try {
    const items = await sb.query('menu_items?available=eq.true&order=category,name');
    const grouped = { starters: [], mains: [], desserts: [], drinks: [] };
    (items || []).forEach(item => {
      const cat = item.category?.toLowerCase();
      if (grouped[cat]) grouped[cat].push(item);
    });
    return grouped;
  } catch (err) {
    console.error('[loadMenu]', err);
    return null;
  }
}

/**
 * submitNewsletter()
 */
export async function submitNewsletter(formEl, email) {
  if (detectHoneypot(formEl)) return { ok: false, message: 'Blocked.' };
  if (!RateLimit.check('newsletter', 1, 120_000))
    return { ok: false, message: 'Please wait before trying again.' };
  if (!validateEmail(email))
    return { ok: false, message: 'Please enter a valid email address.' };

  try {
    await sb.query('newsletter_subscribers', {
      method: 'POST',
      body:   { email: sanitize(email, 100) },
      prefer: 'return=minimal',
    });
    return { ok: true, message: "You're on the list." };
  } catch (err) {
    if (err.message?.includes('duplicate') || err.message?.includes('unique'))
      return { ok: true, message: "You're already subscribed." };
    console.error('[submitNewsletter]', err);
    return { ok: false, message: 'Could not subscribe. Please try again.' };
  }
}

/**
 * submitReview()
 */
export async function submitReview(data) {
  if (!RateLimit.check('review', 2, 300_000))
    return { ok: false, message: 'Feedback already received. Thank you.' };

  const { rating, message = '' } = data;
  if (!rating || rating < 1 || rating > 5)
    return { ok: false, message: 'Invalid rating.' };

  try {
    await sb.query('reviews', {
      method: 'POST',
      body:   { rating: parseInt(rating), message: sanitize(message, 1000) },
      prefer: 'return=minimal',
    });
    return { ok: true, message: 'Feedback received. We appreciate your honesty.' };
  } catch (err) {
    console.error('[submitReview]', err);
    return { ok: false, message: 'Could not submit. Please try again.' };
  }
}

/**
 * loadGallery()
 */
export async function loadGallery() {
  try {
    return await sb.query('gallery_images?order=created_at.desc') || [];
  } catch (err) {
    console.error('[loadGallery]', err);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────
// ADMIN FUNCTIONS
// ─────────────────────────────────────────────────────────────

export async function adminLogin(email, password) {
  if (!validateEmail(email)) return { ok: false, message: 'Invalid email.' };
  try {
    const cfg = await getConfig();
    const res = await fetch(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
      method:  'POST',
      headers: { 'apikey': cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.msg || 'Login failed');
    const host = new URL(cfg.supabaseUrl).hostname.split('.')[0];
    localStorage.setItem(`sb-${host}-auth-token`, JSON.stringify(data));
    return { ok: true, user: data.user };
  } catch (err) {
    return { ok: false, message: err.message || 'Login failed.' };
  }
}

export function adminLogout() {
  Object.keys(localStorage)
    .filter(k => k.endsWith('-auth-token'))
    .forEach(k => localStorage.removeItem(k));
}

export async function adminFetchReservations(status) {
  let filter = '?order=date.asc,time.asc';
  if (status && status !== 'all') filter = `?status=eq.${status}&order=date.asc,time.asc`;
  return sb.authQuery(`reservations${filter}`);
}

export async function adminUpdateReservationStatus(id, status, reason = '') {
  const body = { status };
  if (reason) body.cancel_reason = sanitize(reason, 500);
  return sb.authQuery(`reservations?id=eq.${id}`, {
    method: 'PATCH', body, prefer: 'return=minimal',
  });
}

export async function adminUpdateReservationTime(id, newDate, newTime) {
  return sb.authQuery(`reservations?id=eq.${id}`, {
    method: 'PATCH',
    body:   { date: newDate, time: sanitize(newTime, 20), status: 'confirmed' },
    prefer: 'return=minimal',
  });
}

export async function adminMarkArrival(id, arrived) {
  return sb.authQuery(`reservations?id=eq.${id}`, {
    method: 'PATCH',
    body:   { arrived_at: arrived ? new Date().toISOString() : null, status: arrived ? 'arrived' : 'confirmed' },
    prefer: 'return=minimal',
  });
}

export async function adminFetchMenuItems() {
  return sb.authQuery('menu_items?order=category,name');
}

export async function adminUpdateMenu(item) {
  const payload = {
    category:    sanitize(item.category, 50),
    name:        sanitize(item.name, 100),
    description: sanitize(item.description || '', 500),
    price:       parseFloat(item.price),
    available:   Boolean(item.available),
  };
  if (item.id) {
    return sb.authQuery(`menu_items?id=eq.${item.id}`, {
      method: 'PATCH', body: payload, prefer: 'return=minimal',
    });
  }
  return sb.authQuery('menu_items', { method: 'POST', body: payload });
}

export async function adminDeleteMenuItem(id) {
  return sb.authQuery(`menu_items?id=eq.${id}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function adminFetchSubscribers() {
  return sb.authQuery('newsletter_subscribers?order=created_at.desc');
}

export async function adminExportSubscribersCSV() {
  const rows = await adminFetchSubscribers();
  const csv  = 'email,created_at\n' +
    (rows || []).map(r => `${r.email},${r.created_at}`).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), {
    href: url, download: `subscribers-${Date.now()}.csv`,
  });
  a.click();
  URL.revokeObjectURL(url);
}

export async function adminUploadImage(file, caption = '') {
  if (!file) return { ok: false, message: 'No file selected.' };
  if (!['image/jpeg','image/png','image/webp'].includes(file.type))
    return { ok: false, message: 'Only JPEG, PNG, WEBP allowed.' };
  if (file.size > 10 * 1024 * 1024)
    return { ok: false, message: 'File must be under 10MB.' };

  try {
    const cfg = await getConfig();
    const formData = new FormData();
    formData.append('file',           file);
    formData.append('upload_preset',  cfg.cloudinaryUploadPreset);
    formData.append('folder',         'aurelia-gallery');

    const cdnRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cfg.cloudinaryCloudName}/image/upload`,
      { method: 'POST', body: formData }
    );
    if (!cdnRes.ok) throw new Error('Cloudinary upload failed');
    const { secure_url: imageUrl } = await cdnRes.json();

    await sb.authQuery('gallery_images', {
      method: 'POST',
      body:   { url: imageUrl, caption: sanitize(caption, 200) },
    });
    return { ok: true, url: imageUrl, message: 'Image uploaded.' };
  } catch (err) {
    console.error('[adminUploadImage]', err);
    return { ok: false, message: 'Upload failed. Please try again.' };
  }
}

export async function adminDeleteImage(id) {
  return sb.authQuery(`gallery_images?id=eq.${id}`, {
    method: 'DELETE', prefer: 'return=minimal',
  });
}

export async function adminFetchReviews() {
  return sb.authQuery('reviews?order=created_at.desc');
}

/**
 * adminFetchAnalytics()
 * Fetches all reservations for analytics computation.
 */
export async function adminFetchAnalytics() {
  try {
    return await sb.authQuery('reservations?order=created_at.desc') || [];
  } catch (err) {
    console.error('[adminFetchAnalytics]', err);
    return [];
  }
}

/**
 * sendCustomerEmail()
 * Calls the serverless /api/notify endpoint.
 * Falls back gracefully if serverless is unavailable.
 */
export async function sendCustomerEmail(reservation, updateType, reason = '') {
  try {
    const res = await fetch('/api/notify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reservation, updateType, reason }),
    });
    if (!res.ok) throw new Error('Notify endpoint error');
    return { ok: true };
  } catch {
    // Email is best-effort; don't block UI
    return { ok: false };
  }
}

export { getConfig };