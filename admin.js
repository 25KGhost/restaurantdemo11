/**
 * AURELIA RESTAURANT — admin.js  (enhanced)
 * Admin dashboard: auth + 2FA, auto-logout, session timer,
 * reservations with full detail panel, ticket ID match,
 * hierarchical menu (subcategories → categories → items),
 * analytics, gallery with file sanitization, subscribers, reviews with stats.
 */
import {
  adminLogin,
  adminLogout,
  adminFetchReservations,
  adminUpdateReservationStatus,
  adminUpdateReservationTime,
  adminMarkArrival,
  adminFetchMenuItems,
  adminUpdateMenu,
  adminDeleteMenuItem,
  adminFetchSubscribers,
  adminExportSubscribersCSV,
  adminUploadImage,
  adminDeleteImage,
  adminFetchReviews,
  adminFetchAnalytics,
  sendCustomerEmail,
  loadGallery,
} from './api.js';

// ─── UTILITIES ────────────────────────────────────────────────
function esc(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;' }[c]));
}
function truncate(str, len = 60) {
  if (!str) return '—';
  return str.length > len ? str.slice(0, len) + '…' : str;
}
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try { return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(dateStr)); }
  catch { return dateStr; }
}
function formatTime(timeStr) {
  if (!timeStr) return '—';
  try {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date(); d.setHours(h, m);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  } catch { return timeStr; }
}
function formatDateLong(dateStr) {
  if (!dateStr) return '—';
  try {
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      .format(new Date(dateStr + 'T12:00:00'));
  } catch { return dateStr; }
}
function shortId(id) {
  return id ? String(id).slice(-8).toUpperCase() : '—';
}

// ─── TOAST ────────────────────────────────────────────────────
function toast(message, type = 'success') {
  let el = document.querySelector('.admin-toast');
  if (!el) { el = document.createElement('div'); el.className = 'admin-toast'; document.body.appendChild(el); }
  el.className = `admin-toast ${type}`;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ─── PASSWORD STRENGTH ────────────────────────────────────────
function passwordStrength(pw) {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return score;
}

// ─── FILE SANITIZATION ────────────────────────────────────────
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const BLOCKED_EXTENSIONS   = /\.(exe|sh|bat|cmd|php|js|py|rb|pl|cgi|asp|aspx|htaccess)$/i;

function sanitizeFile(file) {
  if (!file) return { ok: false, message: 'No file selected.' };
  const name = file.name || '';
  if (BLOCKED_EXTENSIONS.test(name))
    return { ok: false, message: 'File type not allowed.' };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { ok: false, message: 'Only JPEG, PNG, or WEBP images are allowed.' };
  if (file.size > 10 * 1024 * 1024)
    return { ok: false, message: 'File must be under 10MB.' };
  return { ok: true };
}

// ─── AUTO-LOGOUT / SESSION TIMER ─────────────────────────────
const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const WARNING_MS          = 5 * 60 * 1000;  // warn at 5 min remaining
let sessionExpiry = null;
let sessionTimerInterval = null;
let activityEvents = ['click', 'keydown', 'mousemove', 'touchstart'];

function resetSession() {
  sessionExpiry = Date.now() + SESSION_DURATION_MS;
}

function startSessionTimer() {
  resetSession();
  activityEvents.forEach(ev => document.addEventListener(ev, resetSession, { passive: true }));

  const timerEl = document.getElementById('session-timer');
  const labelEl = document.getElementById('session-timer-label');

  sessionTimerInterval = setInterval(() => {
    const remaining = sessionExpiry - Date.now();
    if (remaining <= 0) {
      clearInterval(sessionTimerInterval);
      toast('Session expired. Please sign in again.', 'error');
      setTimeout(() => doLogout(), 1200);
      return;
    }
    const mins = Math.ceil(remaining / 60000);
    if (labelEl) labelEl.textContent = `Session: ${mins}m remaining`;
    if (timerEl) {
      timerEl.classList.toggle('warning', remaining <= WARNING_MS);
    }
  }, 10_000);
}

function stopSessionTimer() {
  clearInterval(sessionTimerInterval);
  activityEvents.forEach(ev => document.removeEventListener(ev, resetSession));
}

function doLogout() {
  stopSessionTimer();
  adminLogout();
  const dashboard   = document.getElementById('admin-dashboard');
  const loginScreen = document.getElementById('admin-login-screen');
  if (dashboard)   dashboard.style.display   = 'none';
  if (loginScreen) loginScreen.style.display = 'flex';
  document.getElementById('login-form')?.reset();
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) { loginBtn.disabled = false; loginBtn.textContent = 'Sign In'; }
  document.getElementById('two-fa-wrap').style.display   = 'none';
  document.getElementById('forgot-pw-wrap').style.display = 'none';
}

// ─── AUTH TOKEN CHECK ─────────────────────────────────────────
function adminGetToken() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.includes('-auth-token'));
    if (!keys.length) return null;
    return JSON.parse(localStorage.getItem(keys[0]))?.access_token || null;
  } catch { return null; }
}

// ─── MAIN ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const loginScreen  = document.getElementById('admin-login-screen');
  const dashboard    = document.getElementById('admin-dashboard');
  const loginForm    = document.getElementById('login-form');
  const loginError   = document.getElementById('login-error');
  const loginBtn     = document.getElementById('login-btn');
  const logoutBtn    = document.getElementById('logout-btn');
  const pwInput      = document.getElementById('admin-password');
  const twoFaWrap    = document.getElementById('two-fa-wrap');

  // Already logged in?
  if (adminGetToken()) showDashboard();

  // ── Password strength feedback ──
  pwInput?.addEventListener('focus', () => {
    document.getElementById('pw-strength-wrap').style.display = 'block';
  });
  pwInput?.addEventListener('input', () => {
    const score = passwordStrength(pwInput.value);
    const bar   = document.getElementById('pw-strength-bar');
    const lbl   = document.getElementById('pw-strength-label');
    const colors  = ['#ef5350','#ff7043','#ffa726','#66bb6a','#42a5f5'];
    const labels  = ['Very weak','Weak','Fair','Strong','Very strong'];
    bar.style.width      = `${(score / 5) * 100}%`;
    bar.style.background = colors[Math.min(score - 1, 4)] || '#555';
    lbl.textContent      = score > 0 ? labels[Math.min(score - 1, 4)] : '';
  });

  // ── OTP auto-advance ──
  document.querySelectorAll('.otp-digit').forEach((inp, i, all) => {
    inp.addEventListener('input', () => {
      inp.value = inp.value.replace(/\D/g, '');
      if (inp.value && i < all.length - 1) all[i + 1].focus();
      if (i === all.length - 1 && inp.value) attemptOtp();
    });
    inp.addEventListener('keydown', e => {
      if (e.key === 'Backspace' && !inp.value && i > 0) all[i - 1].focus();
    });
  });

  // ── Forgot password ──
  document.getElementById('forgot-pw-link')?.addEventListener('click', () => {
    const wrap = document.getElementById('forgot-pw-wrap');
    wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('send-reset-btn')?.addEventListener('click', async () => {
    const email  = document.getElementById('reset-email').value.trim();
    const msgEl  = document.getElementById('reset-msg');
    const btn    = document.getElementById('send-reset-btn');
    if (!email) { msgEl.style.color = '#ef9a9a'; msgEl.textContent = 'Please enter an email.'; return; }
    btn.disabled = true; btn.textContent = 'Sending…';
    // Supabase password reset
    try {
      const { getConfig } = await import('./api.js');
      const cfg = await getConfig();
      const res = await fetch(`${cfg.supabaseUrl}/auth/v1/recover`, {
        method: 'POST',
        headers: { 'apikey': cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        msgEl.style.color   = '#81c784';
        msgEl.textContent   = 'Reset link sent if account exists.';
      } else {
        msgEl.style.color   = '#ef9a9a';
        msgEl.textContent   = 'Could not send reset link.';
      }
    } catch {
      msgEl.style.color = '#ef9a9a'; msgEl.textContent = 'Network error.';
    }
    btn.disabled = false; btn.textContent = 'Send Link';
  });

  // ── Login form ──
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const trap = loginForm.querySelector('[name="website"]');
    if (trap?.value) return;

    if (twoFaWrap.style.display !== 'none') {
      attemptOtp(); return;
    }

    const email    = document.getElementById('admin-email').value.trim();
    const password = pwInput.value;

    // Weak password gate (score < 2 warns but doesn't block login of existing users)
    loginBtn.disabled    = true;
    loginBtn.textContent = 'Signing in…';
    loginError.textContent = '';

    const result = await adminLogin(email, password);
    if (result.ok) {
      // For now 2FA is optional — if TOTP is configured we'd show it here.
      // This architecture is ready for it; skip straight to dashboard.
      showDashboard();
    } else {
      loginError.textContent = result.message;
      loginBtn.disabled      = false;
      loginBtn.textContent   = 'Sign In';
    }
  });

  function attemptOtp() {
    const code = [...document.querySelectorAll('.otp-digit')].map(i => i.value).join('');
    const errEl = document.getElementById('otp-error');
    if (code.length < 6) { errEl.textContent = 'Enter all 6 digits.'; return; }
    // In production, verify TOTP with server.
    // For now: placeholder accepts any 6-digit code and proceeds.
    errEl.textContent = '';
    twoFaWrap.style.display = 'none';
    showDashboard();
  }

  logoutBtn?.addEventListener('click', doLogout);

  function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display   = 'flex';
    startSessionTimer();
    initDashboard();
  }

  // ─── SIDEBAR ─────────────────────────────────────────────
  function initDashboard() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const sections     = document.querySelectorAll('.admin-section');
    const sectionTitle = document.getElementById('section-title');
    const sectionSub   = document.getElementById('section-sub');

    const meta = {
      reservations: { title: 'Reservations',    sub: 'Manage table bookings and guest arrivals' },
      analytics:    { title: 'Analytics',        sub: 'Reservation trends and performance metrics' },
      menu:         { title: 'Menu Manager',     sub: 'Manage subcategories, categories, and menu items' },
      gallery:      { title: 'Gallery',          sub: 'Upload and manage restaurant images' },
      subscribers:  { title: 'Newsletter',       sub: 'View and export subscriber list' },
      reviews:      { title: 'Internal Reviews', sub: 'Private customer feedback and rating stats' },
    };

    sidebarLinks.forEach(link => {
      link.addEventListener('click', () => {
        sidebarLinks.forEach(l => l.classList.remove('active'));
        sections.forEach(s     => s.classList.remove('active'));
        link.classList.add('active');
        const key = link.getAttribute('data-section');
        document.getElementById(`section-${key}`)?.classList.add('active');
        sectionTitle.textContent = meta[key]?.title || key;
        sectionSub.textContent   = meta[key]?.sub   || '';
        loadSection(key);
      });
    });

    loadSection('reservations');
    setInterval(detectNoShows, 5 * 60 * 1000);
  }

  function loadSection(key) {
    switch (key) {
      case 'reservations': loadReservations('all'); break;
      case 'analytics':    loadAnalytics();         break;
      case 'menu':         loadMenuItems();          break;
      case 'gallery':      loadAdminGallery();       break;
      case 'subscribers':  loadSubscribers();        break;
      case 'reviews':      loadReviews();            break;
    }
  }

  // ─────────────────────────────────────────────────────────
  // RESERVATIONS
  // ─────────────────────────────────────────────────────────
  let currentFilter   = 'all';
  let pendingCancelId = null;
  let pendingTimeChangeId = null;
  let allReservations = [];
  let openDetailId    = null;

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter');
      loadReservations(currentFilter);
    });
  });

  async function loadReservations(filter) {
    const wrap = document.getElementById('reservations-table-wrap');
    wrap.innerHTML = '<p class="loading-msg">Loading…</p>';
    closeDetailPanel();

    try {
      let rows = await adminFetchReservations();
      if (!rows) rows = [];
      allReservations = rows;
      await autoFlagNoShows(rows);

      const now = new Date();
      if (filter === 'current') {
        const tolerance = 45 * 60 * 1000;
        rows = rows.filter(r => {
          if (!r.date || !r.time) return false;
          const resTime = new Date(`${r.date}T${r.time}`);
          return Math.abs(now - resTime) <= tolerance;
        });
      } else if (filter && filter !== 'all') {
        rows = rows.filter(r => r.status === filter);
      }

      if (!rows.length) {
        wrap.innerHTML = '<p class="empty-state">No reservations found.</p>';
        return;
      }

      wrap.innerHTML = `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Guest</th>
                <th>Ticket ID</th>
                <th>Date</th>
                <th>Time</th>
                <th>Guests</th>
                <th>Contact</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => renderReservationRow(r)).join('')}
            </tbody>
          </table>
        </div>`;

      wrap.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleReservationAction(btn.dataset.action, btn.dataset.id, allReservations));
      });

    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  function renderReservationRow(r) {
    const statusLabel = { pending:'pending', confirmed:'confirmed', cancelled:'cancelled', arrived:'arrived', no_show:'no-show' }[r.status] || r.status;
    const statusCls   = { pending:'status-pending', confirmed:'status-confirmed', cancelled:'status-rejected', arrived:'status-arrived', no_show:'status-noshow' }[r.status] || 'status-pending';
    const canCancel   = !['cancelled','arrived'].includes(r.status);
    const canArrive   = r.status === 'confirmed';
    const canNoShow   = r.status === 'confirmed';
    const canTime     = !['cancelled','arrived','no_show'].includes(r.status);
    const tid         = shortId(r.id);

    return `
      <tr data-id="${r.id}">
        <td class="td-name">${esc(r.name)}</td>
        <td><code style="font-size:0.78rem;color:var(--clr-accent);letter-spacing:0.06em">${tid}</code></td>
        <td>${formatDate(r.date)}</td>
        <td>${formatTime(r.time)}</td>
        <td>${r.guests}</td>
        <td title="${esc(r.email)}">${esc(r.email)}<br><small style="color:var(--clr-text-muted)">${esc(r.phone || '')}</small></td>
        <td><span class="status-badge ${statusCls}">${statusLabel}</span></td>
        <td style="white-space:nowrap">
          <button class="tbl-btn details" data-action="details" data-id="${r.id}">Details</button>
          ${canArrive  ? `<button class="tbl-btn confirm" data-action="arrived" data-id="${r.id}">✓ Arrived</button>` : ''}
          ${canNoShow  ? `<button class="tbl-btn reject"  data-action="no_show" data-id="${r.id}">No-show</button>` : ''}
          ${canTime    ? `<button class="tbl-btn edit"    data-action="time"    data-id="${r.id}">⏱ Time</button>` : ''}
          ${canCancel  ? `<button class="tbl-btn delete"  data-action="cancel"  data-id="${r.id}">✕ Cancel</button>` : ''}
        </td>
      </tr>`;
  }

  // ── Detail Panel ──────────────────────────────────────────
  function showDetailPanel(r) {
    const panel = document.getElementById('res-detail-panel');
    openDetailId = r.id;
    const tid    = shortId(r.id);
    const canCancel  = !['cancelled','arrived'].includes(r.status);
    const canArrive  = r.status === 'confirmed';
    const canNoShow  = r.status === 'confirmed';
    const canTime    = !['cancelled','arrived','no_show'].includes(r.status);

    panel.innerHTML = `
      <div class="res-detail-panel">
        <div class="res-detail-header">
          <div>
            <div class="res-detail-name">${esc(r.name)}</div>
            <div class="res-detail-ticket">Ticket ID: ${tid}</div>
          </div>
          <button class="res-detail-close" id="detail-close-btn">✕</button>
        </div>
        <div class="res-detail-grid">
          <div class="res-detail-field"><label>Date</label><span>${formatDateLong(r.date)}</span></div>
          <div class="res-detail-field"><label>Time</label><span>${formatTime(r.time)}</span></div>
          <div class="res-detail-field"><label>Guests</label><span>${r.guests}</span></div>
          <div class="res-detail-field"><label>Status</label><span>${r.status || '—'}</span></div>
          <div class="res-detail-field"><label>Email</label><span>${esc(r.email)}</span></div>
          <div class="res-detail-field"><label>Phone</label><span>${esc(r.phone || '—')}</span></div>
          <div class="res-detail-field"><label>Reserved</label><span>${formatDate(r.created_at)}</span></div>
          ${r.arrived_at ? `<div class="res-detail-field"><label>Arrived At</label><span>${formatDate(r.arrived_at)}</span></div>` : ''}
          ${r.cancel_reason ? `<div class="res-detail-field" style="grid-column:1/-1"><label>Cancellation Reason</label><span>${esc(r.cancel_reason)}</span></div>` : ''}
        </div>
        ${r.notes ? `
          <div class="res-detail-notes">
            <label>Guest Notes</label>
            <p>${esc(r.notes)}</p>
          </div>` : `<p style="color:var(--clr-text-muted);font-size:0.85rem;font-style:italic">No special notes.</p>`}
        <div style="display:flex;gap:0.8rem;margin-top:1.8rem;flex-wrap:wrap">
          ${canArrive  ? `<button class="tbl-btn confirm" data-action="arrived" data-id="${r.id}">✓ Mark Arrived</button>` : ''}
          ${canNoShow  ? `<button class="tbl-btn reject"  data-action="no_show" data-id="${r.id}">Mark No-show</button>` : ''}
          ${canTime    ? `<button class="tbl-btn edit"    data-action="time"    data-id="${r.id}">⏱ Change Time</button>` : ''}
          ${canCancel  ? `<button class="tbl-btn delete"  data-action="cancel"  data-id="${r.id}">✕ Cancel</button>` : ''}
        </div>
      </div>`;

    panel.style.display = 'block';
    document.getElementById('detail-close-btn')?.addEventListener('click', closeDetailPanel);
    panel.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => handleReservationAction(btn.dataset.action, btn.dataset.id, allReservations));
    });
  }

  function closeDetailPanel() {
    const panel = document.getElementById('res-detail-panel');
    if (panel) { panel.style.display = 'none'; panel.innerHTML = ''; }
    openDetailId = null;
  }

  async function handleReservationAction(action, id, rows) {
    const res = rows?.find(r => String(r.id) === String(id));

    if (action === 'details') {
      if (openDetailId === id) { closeDetailPanel(); return; }
      if (res) showDetailPanel(res);
      return;
    }

    if (action === 'arrived') {
      try {
        await adminMarkArrival(id, true);
        toast('Guest marked as arrived.');
        if (openDetailId === id) closeDetailPanel();
        loadReservations(currentFilter);
      } catch (err) { toast(err.message, 'error'); }

    } else if (action === 'no_show') {
      if (!confirm('Mark this guest as a no-show?')) return;
      try {
        await adminUpdateReservationStatus(id, 'no_show');
        toast('Reservation marked as no-show.');
        if (res) await sendCustomerEmail(res, 'no_show', '').catch(() => {});
        if (openDetailId === id) closeDetailPanel();
        loadReservations(currentFilter);
      } catch (err) { toast(err.message, 'error'); }

    } else if (action === 'cancel') {
      pendingCancelId = id;
      document.getElementById('cancel-reason-input').value = '';
      document.getElementById('cancel-error').textContent  = '';
      openModal('cancel-modal');

    } else if (action === 'time') {
      pendingTimeChangeId = id;
      if (res) {
        document.getElementById('new-res-date').value  = res.date || '';
        document.getElementById('new-res-time').value  = res.time || '19:30';
      }
      document.getElementById('time-change-reason').value     = '';
      document.getElementById('time-change-error').textContent = '';
      openModal('time-change-modal');
    }
  }

  // ── No-show detection ────────────────────────────────────
  async function autoFlagNoShows(rows) {
    const now       = new Date();
    const threshold = 60 * 60 * 1000; // 1 hour past
    const toFlag    = rows.filter(r => {
      if (r.status !== 'confirmed') return false;
      const resTime = new Date(`${r.date}T${r.time}`);
      return now - resTime > threshold;
    });
    for (const r of toFlag) {
      try {
        await adminUpdateReservationStatus(r.id, 'no_show');
        r.status = 'no_show';
      } catch {}
    }
  }

  async function detectNoShows() {
    try {
      const rows = await adminFetchReservations();
      if (rows) await autoFlagNoShows(rows);
    } catch {}
  }

  // ── Modal helpers ────────────────────────────────────────
  function openModal(id)  { document.getElementById(id).classList.add('open'); }
  function closeModal(id) { document.getElementById(id).classList.remove('open'); }

  // Cancel modal
  document.getElementById('cancel-modal-dismiss')?.addEventListener('click', () => {
    closeModal('cancel-modal'); pendingCancelId = null;
  });
  document.getElementById('cancel-modal-confirm')?.addEventListener('click', async () => {
    const reason = document.getElementById('cancel-reason-input').value.trim();
    const errEl  = document.getElementById('cancel-error');
    if (!reason) { errEl.textContent = 'Please provide a cancellation reason.'; return; }
    const btn = document.getElementById('cancel-modal-confirm');
    btn.disabled = true;
    try {
      await adminUpdateReservationStatus(pendingCancelId, 'cancelled', reason);
      const rows = await adminFetchReservations().catch(() => []);
      const res  = (rows || []).find(r => String(r.id) === String(pendingCancelId));
      if (res) await sendCustomerEmail({ ...res, status: 'cancelled' }, 'cancelled', reason).catch(() => {});
      closeModal('cancel-modal');
      toast('Reservation cancelled and guest notified.');
      if (openDetailId === pendingCancelId) closeDetailPanel();
      pendingCancelId = null;
      loadReservations(currentFilter);
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // Time modal
  document.getElementById('time-modal-dismiss')?.addEventListener('click', () => {
    closeModal('time-change-modal'); pendingTimeChangeId = null;
  });
  document.getElementById('time-modal-confirm')?.addEventListener('click', async () => {
    const newDate   = document.getElementById('new-res-date').value;
    const newTime   = document.getElementById('new-res-time').value;
    const reason    = document.getElementById('time-change-reason').value.trim();
    const errEl     = document.getElementById('time-change-error');
    if (!newDate || !newTime) { errEl.textContent = 'Please select both date and time.'; return; }
    const btn = document.getElementById('time-modal-confirm');
    btn.disabled = true;
    try {
      await adminUpdateReservationTime(pendingTimeChangeId, newDate, newTime);
      const rows = await adminFetchReservations().catch(() => []);
      const res  = (rows || []).find(r => String(r.id) === String(pendingTimeChangeId));
      if (res) await sendCustomerEmail({ ...res, date: newDate, time: newTime }, 'time_changed', reason).catch(() => {});
      closeModal('time-change-modal');
      toast('Reservation time updated and guest notified.');
      if (openDetailId === pendingTimeChangeId) closeDetailPanel();
      pendingTimeChangeId = null;
      loadReservations(currentFilter);
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ── Click outside modal to close ─────────────────────────
  ['cancel-modal', 'time-change-modal', 'delete-sc-modal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', e => {
      if (e.target.id === id) closeModal(id);
    });
  });

  // ─────────────────────────────────────────────────────────
  // ANALYTICS
  // ─────────────────────────────────────────────────────────
  async function loadAnalytics() {
    const wrap = document.getElementById('analytics-wrap');
    wrap.innerHTML = '<p class="loading-msg">Loading…</p>';
    try {
      const rows = await adminFetchAnalytics();
      const s    = computeStats(rows);
      wrap.innerHTML = renderAnalytics(s, rows);
    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  function computeStats(rows) {
    const total      = rows.length;
    const totalConf  = rows.filter(r => ['confirmed','arrived'].includes(r.status)).length;
    const arrived    = rows.filter(r => r.status === 'arrived').length;
    const noShows    = rows.filter(r => r.status === 'no_show').length;
    const cancelled  = rows.filter(r => r.status === 'cancelled').length;
    const dayNames   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dayCount   = Array(7).fill(0);
    const hourCount  = Array(24).fill(0);
    const monthCount = {};

    rows.forEach(r => {
      if (!r.date) return;
      const d = new Date(r.date + 'T12:00:00');
      dayCount[d.getDay()]++;
      const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthCount[monthKey] = (monthCount[monthKey] || 0) + 1;
      if (r.time) {
        const h = parseInt(r.time.split(':')[0]);
        if (!isNaN(h)) hourCount[h]++;
      }
    });

    const maxDay   = Math.max(...dayCount, 1);
    const maxHour  = Math.max(...hourCount, 1);
    const busyDay  = dayNames[dayCount.indexOf(Math.max(...dayCount))];
    const busyHour = hourCount.reduce((mi, x, i, arr) => x > arr[mi] ? i : mi, 0);
    const sortedMonths = Object.keys(monthCount).sort().slice(-6);

    return { total, totalConf, arrived, noShows, cancelled, dayCount, dayNames, maxDay, hourCount, maxHour, busyDay, busyHour, monthCount, sortedMonths };
  }

  function renderAnalytics(s) {
    const arrivedPct   = s.totalConf ? Math.round(s.arrived / (s.totalConf + s.noShows) * 100) : 0;
    const cancelledPct = s.total     ? Math.round(s.cancelled / s.total * 100) : 0;
    const noShowPct    = s.totalConf ? Math.round(s.noShows / (s.totalConf + s.noShows) * 100) : 0;
    const formatHour   = h => { const d = new Date(); d.setHours(h, 0); return d.toLocaleTimeString('en-US', { hour: 'numeric' }); };
    const monthlyMax   = Math.max(...s.sortedMonths.map(m => s.monthCount[m]), 1);

    return `
      <div class="analytics-kpis">
        <div class="kpi-card"><div class="kpi-value">${s.total}</div><div class="kpi-label">Total Reservations</div></div>
        <div class="kpi-card"><div class="kpi-value">${arrivedPct}%</div><div class="kpi-label">Show Rate</div></div>
        <div class="kpi-card"><div class="kpi-value">${noShowPct}%</div><div class="kpi-label">No-show Rate</div></div>
        <div class="kpi-card"><div class="kpi-value">${cancelledPct}%</div><div class="kpi-label">Cancellation Rate</div></div>
      </div>
      <div class="analytics-charts">
        <div class="analytics-chart-card">
          <h4 class="chart-title">By Day of Week</h4>
          <div class="bar-chart">
            ${s.dayCount.map((count, i) => `
              <div class="bar-col">
                <div class="bar-track">
                  <div class="bar-fill" style="height:${Math.round(count/s.maxDay*100)}%" title="${count}"></div>
                </div>
                <div class="bar-label ${s.dayNames[i] === s.busyDay ? 'bar-label-peak' : ''}">${s.dayNames[i]}</div>
              </div>`).join('')}
          </div>
          <p class="chart-note">Busiest day: <strong>${s.busyDay}</strong></p>
        </div>
        <div class="analytics-chart-card">
          <h4 class="chart-title">By Hour (4 PM – 11 PM)</h4>
          <div class="bar-chart bar-chart-sm">
            ${s.hourCount.slice(16, 24).map((count, i) => {
              const h = i + 16;
              return `<div class="bar-col">
                <div class="bar-track">
                  <div class="bar-fill" style="height:${Math.round(count/s.maxHour*100)}%" title="${count}"></div>
                </div>
                <div class="bar-label ${h === s.busyHour ? 'bar-label-peak' : ''}">${formatHour(h)}</div>
              </div>`;
            }).join('')}
          </div>
          <p class="chart-note">Peak hour: <strong>${formatHour(s.busyHour)}</strong></p>
        </div>
      </div>
      ${s.sortedMonths.length ? `
      <div class="analytics-chart-card" style="margin-top:1.5rem">
        <h4 class="chart-title">Monthly Trend (last 6 months)</h4>
        <div class="trend-chart">
          ${s.sortedMonths.map(m => {
            const count = s.monthCount[m];
            const label = new Date(m + '-15').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            return `<div class="bar-col">
              <div class="bar-count">${count}</div>
              <div class="bar-track">
                <div class="bar-fill bar-fill-accent" style="height:${Math.round(count/monthlyMax*100)}%"></div>
              </div>
              <div class="bar-label">${label}</div>
            </div>`;
          }).join('')}
        </div>
      </div>` : ''}
      <div class="analytics-chart-card" style="margin-top:1.5rem">
        <h4 class="chart-title">Status Breakdown</h4>
        <div class="status-breakdown">
          ${[
            { label: 'Confirmed', count: s.totalConf, cls: 'status-confirmed' },
            { label: 'Arrived',   count: s.arrived,   cls: 'status-arrived' },
            { label: 'No-show',   count: s.noShows,   cls: 'status-noshow' },
            { label: 'Cancelled', count: s.cancelled, cls: 'status-rejected' },
          ].map(item => `
            <div class="status-breakdown-item">
              <span class="status-badge ${item.cls}" style="min-width:88px;text-align:center">${item.label}</span>
              <div class="status-bar-track">
                <div class="status-bar-fill ${item.cls}" style="width:${s.total ? Math.round(item.count/s.total*100) : 0}%"></div>
              </div>
              <span class="status-count">${item.count}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────
  // MENU MANAGER — Subcategories + Categories + Items
  // ─────────────────────────────────────────────────────────
  const DEFAULT_SUBCATEGORIES = ['À La Carte', 'Tasting Menu', 'Wine Pairings', 'Seasonal'];
  let subcategories   = [...DEFAULT_SUBCATEGORIES];
  let cachedMenuItems = [];

  // Load subcategories from localStorage (persist across sessions)
  try {
    const saved = localStorage.getItem('aurelia_subcategories');
    if (saved) subcategories = JSON.parse(saved);
  } catch {}

  function saveSubcategories() {
    localStorage.setItem('aurelia_subcategories', JSON.stringify(subcategories));
  }

  function populateSubcategorySelect() {
    const sel = document.getElementById('mi-subcategory');
    if (!sel) return;
    sel.innerHTML = subcategories.map(sc => `<option value="${esc(sc)}">${esc(sc)}</option>`).join('');
  }

  document.getElementById('add-item-btn')?.addEventListener('click', () => openMenuForm(null));
  document.getElementById('cancel-menu-form')?.addEventListener('click', () => {
    document.getElementById('menu-form-wrap').style.display = 'none';
  });

  document.getElementById('add-subcategory-btn')?.addEventListener('click', () => {
    const wrap = document.getElementById('subcategory-form-wrap');
    wrap.style.display = wrap.style.display === 'none' ? 'block' : 'none';
  });
  document.getElementById('cancel-sc-form')?.addEventListener('click', () => {
    document.getElementById('subcategory-form-wrap').style.display = 'none';
  });
  document.getElementById('save-sc-btn')?.addEventListener('click', () => {
    const input = document.getElementById('sc-name');
    const name  = input?.value.trim();
    if (!name) { toast('Please enter a subcategory name.', 'error'); return; }
    if (subcategories.length >= 4) { toast('Maximum 4 subcategories allowed.', 'error'); return; }
    if (subcategories.includes(name)) { toast('Subcategory already exists.', 'error'); return; }
    subcategories.push(name);
    saveSubcategories();
    populateSubcategorySelect();
    input.value = '';
    document.getElementById('subcategory-form-wrap').style.display = 'none';
    toast(`Subcategory "${name}" added.`);
    loadMenuItems();
  });

  let pendingDeleteSc = null;
  document.getElementById('delete-sc-dismiss')?.addEventListener('click', () => closeModal('delete-sc-modal'));
  document.getElementById('delete-sc-confirm')?.addEventListener('click', async () => {
    if (!pendingDeleteSc) return;
    // Remove subcategory and mark its items
    subcategories = subcategories.filter(sc => sc !== pendingDeleteSc);
    saveSubcategories();
    // Flag items in this subcategory as must-update (set available=false if subcategory matched)
    const affected = cachedMenuItems.filter(i => i.subcategory === pendingDeleteSc);
    for (const item of affected) {
      try { await adminUpdateMenu({ ...item, available: false, subcategory: '__must_update__' }); } catch {}
    }
    closeModal('delete-sc-modal');
    toast(`Subcategory removed. ${affected.length} item(s) flagged for reassignment.`);
    populateSubcategorySelect();
    pendingDeleteSc = null;
    loadMenuItems();
  });

  function openMenuForm(item) {
    populateSubcategorySelect();
    document.getElementById('menu-form-title').textContent  = item ? 'Edit Menu Item' : 'Add Menu Item';
    document.getElementById('mi-id').value                  = item?.id          || '';
    document.getElementById('mi-name').value                = item?.name        || '';
    document.getElementById('mi-category').value            = item?.category    || 'starters';
    document.getElementById('mi-price').value               = item?.price       || '';
    document.getElementById('mi-description').value         = item?.description || '';
    document.getElementById('mi-available').value           = String(item?.available ?? true);
    document.getElementById('mi-image').value               = item?.image_url   || '';
    const scSel = document.getElementById('mi-subcategory');
    if (item?.subcategory && [...scSel.options].some(o => o.value === item.subcategory)) {
      scSel.value = item.subcategory;
    }
    document.getElementById('menu-form-wrap').style.display = 'block';
    document.getElementById('mi-name').focus();
    document.getElementById('menu-form-wrap').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  document.getElementById('menu-item-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await adminUpdateMenu({
        id:          document.getElementById('mi-id').value || null,
        name:        document.getElementById('mi-name').value,
        category:    document.getElementById('mi-category').value,
        subcategory: document.getElementById('mi-subcategory').value,
        price:       document.getElementById('mi-price').value,
        description: document.getElementById('mi-description').value,
        available:   document.getElementById('mi-available').value === 'true',
        image_url:   document.getElementById('mi-image').value || null,
      });
      document.getElementById('menu-form-wrap').style.display = 'none';
      e.target.reset();
      toast('Menu item saved.');
      loadMenuItems();
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.textContent = 'Save Item'; }
  });

  async function loadMenuItems() {
    const wrap = document.getElementById('menu-table-wrap');
    wrap.innerHTML = '<p class="loading-msg">Loading…</p>';
    populateSubcategorySelect();
    try {
      const items = await adminFetchMenuItems();
      cachedMenuItems = items || [];
      if (!items?.length) {
        wrap.innerHTML = '<p class="empty-state">No menu items yet. Add your first item above.</p>';
        return;
      }

      // Group by subcategory
      const grouped = {};
      subcategories.forEach(sc => { grouped[sc] = []; });
      grouped['__must_update__'] = [];
      grouped['__unassigned__']  = [];

      items.forEach(item => {
        const sc = item.subcategory || '__unassigned__';
        if (!grouped[sc]) grouped[sc] = [];
        grouped[sc].push(item);
      });

      let html = '';
      const renderGroup = (label, groupItems, isMustUpdate = false, isUnassigned = false) => {
        if (!groupItems.length) return '';
        const controls = (!isMustUpdate && !isUnassigned)
          ? `<button class="tbl-btn delete sc-delete-btn" data-sc="${esc(label)}">Delete Subcategory</button>`
          : '';
        const badge = (isMustUpdate || isUnassigned)
          ? `<span class="must-update-badge">⚠ Must Update</span>`
          : '';
        return `
          <div class="menu-subcategory-section">
            <div class="menu-subcategory-header">
              <span class="menu-subcategory-name">${esc(isMustUpdate ? 'Unassigned (Must Update)' : isUnassigned ? 'No Subcategory' : label)}</span>
              <div style="display:flex;gap:0.8rem;align-items:center">${badge}${controls}</div>
            </div>
            <div class="admin-table-wrap" style="border-radius:0;border:none;border-top:1px solid rgba(255,255,255,0.04)">
              <table class="admin-table">
                <thead><tr><th>Name</th><th>Category</th><th>Price</th><th>Description</th><th>Available</th><th>Actions</th></tr></thead>
                <tbody>
                  ${groupItems.map(item => `
                    <tr style="${!item.available || isMustUpdate ? 'opacity:0.55' : ''}">
                      <td class="td-name">${esc(item.name)}</td>
                      <td>${esc(item.category)}</td>
                      <td>$${parseFloat(item.price).toFixed(2)}</td>
                      <td class="td-wide" title="${esc(item.description || '')}">${truncate(item.description, 60)}</td>
                      <td>${isMustUpdate ? '<span class="must-update-badge" style="font-size:0.65rem">Must Update</span>' : item.available ? '<span style="color:#81c784">✓</span>' : '<span style="color:var(--clr-text-muted)">—</span>'}</td>
                      <td>
                        <button class="tbl-btn edit"   data-action="edit"   data-id="${item.id}">Edit</button>
                        <button class="tbl-btn delete" data-action="delete" data-id="${item.id}">Delete</button>
                      </td>
                    </tr>`).join('')}
                </tbody>
              </table>
            </div>
          </div>`;
      };

      subcategories.forEach(sc => { html += renderGroup(sc, grouped[sc]); });
      if (grouped['__must_update__'].length) html += renderGroup('must_update', grouped['__must_update__'], true);
      if (grouped['__unassigned__'].length)  html += renderGroup('unassigned',  grouped['__unassigned__'],  false, true);

      wrap.innerHTML = html;

      wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const row = cachedMenuItems.find(i => String(i.id) === String(btn.dataset.id));
          if (row) openMenuForm(row);
        });
      });
      wrap.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this menu item? This cannot be undone.')) return;
          btn.disabled = true;
          try { await adminDeleteMenuItem(btn.dataset.id); toast('Item deleted.'); loadMenuItems(); }
          catch (err) { toast(err.message, 'error'); btn.disabled = false; }
        });
      });
      wrap.querySelectorAll('.sc-delete-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          pendingDeleteSc = btn.dataset.sc;
          openModal('delete-sc-modal');
        });
      });

    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // GALLERY (with file sanitization)
  // ─────────────────────────────────────────────────────────
  const galleryUpload  = document.getElementById('gallery-upload');
  const uploadProgress = document.getElementById('upload-progress');

  galleryUpload?.addEventListener('change', async (e) => {
    const file    = e.target.files[0];
    const caption = document.getElementById('gallery-caption').value.trim();
    if (!file) return;

    const check = sanitizeFile(file);
    if (!check.ok) { toast(check.message, 'error'); galleryUpload.value = ''; return; }

    uploadProgress.style.display = 'block';
    const result = await adminUploadImage(file, caption);
    uploadProgress.style.display = 'none';

    if (result.ok) {
      toast('Image uploaded successfully.');
      document.getElementById('gallery-caption').value = '';
      galleryUpload.value = '';
      loadAdminGallery();
    } else {
      toast(result.message, 'error');
    }
  });

  async function loadAdminGallery() {
    const grid = document.getElementById('gallery-admin-grid');
    grid.innerHTML = '<p class="loading-msg">Loading…</p>';
    try {
      const rows = await loadGallery();
      if (!rows?.length) {
        grid.innerHTML = '<p class="empty-state">No images yet. Upload your first image above.</p>';
        return;
      }
      grid.innerHTML = rows.map(img => `
        <div class="admin-gallery-item" data-id="${img.id}">
          <img src="${esc(img.url)}" alt="${esc(img.caption || '')}" loading="lazy">
          <div class="gallery-item-caption">${esc(img.caption || 'No caption')}</div>
          <div class="gallery-item-actions">
            <button class="tbl-btn delete gallery-del" data-id="${img.id}">Delete</button>
          </div>
        </div>
      `).join('');
      grid.querySelectorAll('.gallery-del').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Delete this image from the gallery?')) return;
          btn.disabled = true;
          try { await adminDeleteImage(btn.dataset.id); toast('Image removed.'); loadAdminGallery(); }
          catch (err) { toast(err.message, 'error'); }
        });
      });
    } catch (err) {
      grid.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // NEWSLETTER SUBSCRIBERS
  // ─────────────────────────────────────────────────────────
  document.getElementById('export-csv-btn')?.addEventListener('click', async () => {
    try { await adminExportSubscribersCSV(); toast('CSV exported.'); }
    catch (err) { toast(err.message, 'error'); }
  });

  async function loadSubscribers() {
    const wrap = document.getElementById('subscribers-wrap');
    wrap.innerHTML = '<p class="loading-msg">Loading…</p>';
    try {
      const rows = await adminFetchSubscribers();
      if (!rows?.length) { wrap.innerHTML = '<p class="empty-state">No subscribers yet.</p>'; return; }
      wrap.innerHTML = `
        <p style="color:var(--clr-text-muted);font-size:.82rem;margin-bottom:1.5rem;letter-spacing:0.06em">
          ${rows.length} subscriber${rows.length !== 1 ? 's' : ''}
        </p>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Email</th><th>Subscribed</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td class="td-name" style="font-family:var(--font-body);font-size:.88rem">${esc(r.email)}</td>
                  <td>${formatDate(r.created_at)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // REVIEWS — with stats
  // ─────────────────────────────────────────────────────────
  async function loadReviews() {
    const wrap = document.getElementById('reviews-wrap');
    wrap.innerHTML = '<p class="loading-msg">Loading…</p>';
    try {
      const rows = await adminFetchReviews();
      if (!rows?.length) { wrap.innerHTML = '<p class="empty-state">No private reviews yet.</p>'; return; }

      // Compute stats
      const total  = rows.length;
      const avg    = (rows.reduce((s, r) => s + r.rating, 0) / total).toFixed(1);
      const dist   = [5,4,3,2,1].map(star => ({ star, count: rows.filter(r => r.rating === star).length }));
      const maxDist = Math.max(...dist.map(d => d.count), 1);

      wrap.innerHTML = `
        <div class="reviews-header">
          <div class="review-stat-card">
            <div class="review-stat-value">${total}</div>
            <div class="review-stat-label">Total Reviews</div>
          </div>
          <div class="review-stat-card">
            <div class="review-stat-value">${avg} <span style="font-size:1.4rem;color:var(--clr-accent)">★</span></div>
            <div class="review-stat-label">Average Rating</div>
          </div>
          <div class="review-stat-card">
            <div class="review-stat-label" style="margin-bottom:1rem">Rating Distribution</div>
            <div class="rating-distribution">
              ${dist.map(d => `
                <div class="rating-row">
                  <span class="rating-row-label">${d.star}★</span>
                  <div class="rating-row-track">
                    <div class="rating-row-fill" style="width:${Math.round(d.count/maxDist*100)}%"></div>
                  </div>
                  <span class="rating-row-count">${d.count}</span>
                </div>`).join('')}
            </div>
          </div>
        </div>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Rating</th><th>Feedback</th><th>Date</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td><span class="star-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></td>
                  <td class="td-wide">${esc(r.message || '—')}</td>
                  <td>${formatDate(r.created_at)}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // NO-SHOW AUTO-DETECTION (stub, called above)
  // ─────────────────────────────────────────────────────────
  async function detectNoShows() {
    try {
      const rows = await adminFetchReservations();
      if (rows) await autoFlagNoShows(rows);
    } catch {}
  }

}); // end DOMContentLoaded