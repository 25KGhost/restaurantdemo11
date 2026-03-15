/**
 * AURELIA RESTAURANT — admin.js
 * Admin dashboard: auth, reservations with full lifecycle,
 * no-show detection, analytics, menu, gallery, subscribers, reviews.
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

// ─── TOAST ───────────────────────────────────────────────────
function toast(message, type = 'success') {
  let el = document.querySelector('.admin-toast');
  if (!el) { el = document.createElement('div'); el.className = 'admin-toast'; document.body.appendChild(el); }
  el.className = `admin-toast ${type}`;
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ─── AUTH GUARD ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const loginScreen = document.getElementById('admin-login-screen');
  const dashboard   = document.getElementById('admin-dashboard');
  const loginForm   = document.getElementById('login-form');
  const loginError  = document.getElementById('login-error');
  const loginBtn    = document.getElementById('login-btn');
  const logoutBtn   = document.getElementById('logout-btn');

  if (adminGetToken()) showDashboard();

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const trap = loginForm.querySelector('[name="website"]');
    if (trap?.value) return;
    const email    = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-password').value;
    loginBtn.disabled    = true;
    loginBtn.textContent = 'Signing in…';
    loginError.textContent = '';
    const result = await adminLogin(email, password);
    if (result.ok) {
      showDashboard();
    } else {
      loginError.textContent = result.message;
      loginBtn.disabled      = false;
      loginBtn.textContent   = 'Sign In';
    }
  });

  logoutBtn?.addEventListener('click', () => {
    adminLogout();
    dashboard.style.display   = 'none';
    loginScreen.style.display = 'flex';
    loginForm.reset();
    loginBtn.disabled    = false;
    loginBtn.textContent = 'Sign In';
  });

  function showDashboard() {
    loginScreen.style.display = 'none';
    dashboard.style.display   = 'flex';
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
      menu:         { title: 'Menu Manager',     sub: 'Add, edit, and toggle menu items' },
      gallery:      { title: 'Gallery',          sub: 'Upload and manage restaurant images' },
      subscribers:  { title: 'Newsletter',       sub: 'View and export subscriber list' },
      reviews:      { title: 'Internal Reviews', sub: 'Private customer feedback' },
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

    // Auto-detect no-shows every 5 minutes
    setInterval(detectNoShows, 5 * 60 * 1000);
  }

  function loadSection(key) {
    switch (key) {
      case 'reservations': loadReservations('all');  break;
      case 'analytics':    loadAnalytics();           break;
      case 'menu':         loadMenuItems();           break;
      case 'gallery':      loadAdminGallery();        break;
      case 'subscribers':  loadSubscribers();         break;
      case 'reviews':      loadReviews();             break;
    }
  }

  // ─────────────────────────────────────────────────────────
  // RESERVATIONS
  // ─────────────────────────────────────────────────────────
  let currentFilter = 'all';
  let pendingCancelId = null;
  let pendingTimeChangeId = null;

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

    try {
      let rows = await adminFetchReservations();
      if (!rows) rows = [];

      // Detect no-shows before rendering
      await autoFlagNoShows(rows);

      // Filter
      const now = new Date();
      if (filter === 'current') {
        // Show reservations within ±45 min of now
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
                <th>Date</th>
                <th>Time</th>
                <th>Guests</th>
                <th>Contact</th>
                <th>Notes</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => renderReservationRow(r)).join('')}
            </tbody>
          </table>
        </div>`;

      // Bind action buttons
      wrap.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', () => handleReservationAction(btn.dataset.action, btn.dataset.id, rows));
      });

    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  function renderReservationRow(r) {
    const statusLabel = {
      pending:   'pending',
      confirmed: 'confirmed',
      cancelled: 'cancelled',
      arrived:   'arrived',
      no_show:   'no-show',
    }[r.status] || r.status;

    const statusCls = {
      pending:   'status-pending',
      confirmed: 'status-confirmed',
      cancelled: 'status-rejected',
      arrived:   'status-arrived',
      no_show:   'status-noshow',
    }[r.status] || 'status-pending';

    const canCancel  = !['cancelled','arrived'].includes(r.status);
    const canArrive  = r.status === 'confirmed';
    const canNoShow  = r.status === 'confirmed';
    const canTime    = !['cancelled','arrived','no_show'].includes(r.status);

    return `
      <tr data-id="${r.id}">
        <td class="td-name">${esc(r.name)}</td>
        <td>${formatDate(r.date)}</td>
        <td>${formatTime(r.time)}</td>
        <td>${r.guests}</td>
        <td title="${esc(r.email)}">${esc(r.email)}<br><small>${esc(r.phone || '')}</small></td>
        <td title="${esc(r.notes || '')}">${truncate(r.notes, 35)}</td>
        <td><span class="status-badge ${statusCls}">${statusLabel}</span></td>
        <td>
          ${canArrive  ? `<button class="tbl-btn confirm" data-action="arrived"  data-id="${r.id}" title="Mark Arrived">✓ Arrived</button>` : ''}
          ${canNoShow  ? `<button class="tbl-btn reject"  data-action="no_show"  data-id="${r.id}" title="Mark No-show">No-show</button>` : ''}
          ${canTime    ? `<button class="tbl-btn edit"     data-action="time"     data-id="${r.id}" title="Change Time">⏱ Time</button>` : ''}
          ${canCancel  ? `<button class="tbl-btn delete"   data-action="cancel"   data-id="${r.id}" title="Cancel">✕ Cancel</button>` : ''}
        </td>
      </tr>`;
  }

  async function handleReservationAction(action, id, rows) {
    const res = rows?.find(r => String(r.id) === String(id));

    if (action === 'arrived') {
      try {
        await adminMarkArrival(id, true);
        toast('Guest marked as arrived.');
        loadReservations(currentFilter);
      } catch (err) { toast(err.message, 'error'); }

    } else if (action === 'no_show') {
      if (!confirm('Mark this guest as a no-show?')) return;
      try {
        await adminUpdateReservationStatus(id, 'no_show');
        toast('Reservation marked as no-show.');
        if (res) await sendCustomerEmail(res, 'no_show', '').catch(() => {});
        loadReservations(currentFilter);
      } catch (err) { toast(err.message, 'error'); }

    } else if (action === 'cancel') {
      pendingCancelId = id;
      document.getElementById('cancel-reason-input').value = '';
      document.getElementById('cancel-error').textContent  = '';
      const modal = document.getElementById('cancel-modal');
      modal.style.display     = 'flex';

    } else if (action === 'time') {
      pendingTimeChangeId = id;
      // Pre-fill current values
      if (res) {
        document.getElementById('new-res-date').value  = res.date || '';
        document.getElementById('new-res-time').value  = res.time || '19:30';
      }
      document.getElementById('time-change-reason').value = '';
      document.getElementById('time-change-error').textContent = '';
      const modal = document.getElementById('time-change-modal');
      modal.style.display = 'flex';
    }
  }

  // Cancel modal
  document.getElementById('cancel-modal-dismiss')?.addEventListener('click', () => {
    document.getElementById('cancel-modal').style.display = 'none';
    pendingCancelId = null;
  });
  document.getElementById('cancel-modal-confirm')?.addEventListener('click', async () => {
    const reason = document.getElementById('cancel-reason-input').value.trim();
    const errEl  = document.getElementById('cancel-error');
    if (!reason) { errEl.textContent = 'Please provide a cancellation reason.'; return; }
    const btn = document.getElementById('cancel-modal-confirm');
    btn.disabled = true;
    try {
      await adminUpdateReservationStatus(pendingCancelId, 'cancelled', reason);
      // Send email notification
      const rows = await adminFetchReservations().catch(() => []);
      const res  = (rows || []).find(r => String(r.id) === String(pendingCancelId));
      if (res) await sendCustomerEmail(res, 'cancelled', reason).catch(() => {});
      toast('Reservation cancelled. Guest notified.');
      document.getElementById('cancel-modal').style.display = 'none';
      pendingCancelId = null;
      loadReservations(currentFilter);
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // Time change modal
  document.getElementById('time-modal-dismiss')?.addEventListener('click', () => {
    document.getElementById('time-change-modal').style.display = 'none';
    pendingTimeChangeId = null;
  });
  document.getElementById('time-modal-confirm')?.addEventListener('click', async () => {
    const newDate   = document.getElementById('new-res-date').value;
    const newTime   = document.getElementById('new-res-time').value;
    const reason    = document.getElementById('time-change-reason').value.trim();
    const errEl     = document.getElementById('time-change-error');
    if (!newDate || !newTime) { errEl.textContent = 'Please select a date and time.'; return; }
    const btn = document.getElementById('time-modal-confirm');
    btn.disabled = true;
    try {
      await adminUpdateReservationTime(pendingTimeChangeId, newDate, newTime);
      const rows = await adminFetchReservations().catch(() => []);
      const res  = (rows || []).find(r => String(r.id) === String(pendingTimeChangeId));
      if (res) await sendCustomerEmail({ ...res, date: newDate, time: newTime }, 'time_changed', reason).catch(() => {});
      toast('Reservation time updated. Guest notified.');
      document.getElementById('time-change-modal').style.display = 'none';
      pendingTimeChangeId = null;
      loadReservations(currentFilter);
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  // ─── NO-SHOW AUTO-DETECTION ──────────────────────────────
  async function autoFlagNoShows(rows) {
    const now       = new Date();
    const tolerance = 30 * 60 * 1000; // 30 min past reservation time
    const candidates = (rows || []).filter(r => {
      if (r.status !== 'confirmed') return false;
      if (!r.date || !r.time) return false;
      const resTime = new Date(`${r.date}T${r.time}`);
      return now - resTime > tolerance;
    });
    for (const r of candidates) {
      try {
        await adminUpdateReservationStatus(r.id, 'no_show');
        r.status = 'no_show'; // Update local
      } catch {}
    }
  }

  async function detectNoShows() {
    try {
      const rows = await adminFetchReservations();
      await autoFlagNoShows(rows || []);
    } catch {}
  }

  // ─────────────────────────────────────────────────────────
  // ANALYTICS
  // ─────────────────────────────────────────────────────────
  async function loadAnalytics() {
    const wrap = document.getElementById('analytics-wrap');
    wrap.innerHTML = '<p class="loading-msg">Computing analytics…</p>';

    try {
      const rows = await adminFetchAnalytics();
      if (!rows?.length) {
        wrap.innerHTML = '<p class="empty-state">No reservation data available yet.</p>';
        return;
      }

      const stats = computeStats(rows);
      wrap.innerHTML = renderAnalytics(stats, rows);

    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  function computeStats(rows) {
    const confirmed = rows.filter(r => ['confirmed','arrived','no_show'].includes(r.status));
    const total     = rows.length;
    const totalConf = rows.filter(r => r.status === 'confirmed' || r.status === 'arrived').length;
    const arrived   = rows.filter(r => r.status === 'arrived').length;
    const noShows   = rows.filter(r => r.status === 'no_show').length;
    const cancelled = rows.filter(r => r.status === 'cancelled').length;

    // Days of week
    const dayNames    = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const dayCount    = Array(7).fill(0);
    const hourCount   = Array(24).fill(0);
    const monthCount  = {};

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

    // Last 6 months trend
    const sortedMonths = Object.keys(monthCount).sort().slice(-6);

    return { total, totalConf, arrived, noShows, cancelled, dayCount, dayNames, maxDay, hourCount, maxHour, busyDay, busyHour, monthCount, sortedMonths };
  }

  function renderAnalytics(s, rows) {
    const arrivedPct   = s.totalConf ? Math.round(s.arrived / (s.totalConf + s.noShows) * 100) : 0;
    const cancelledPct = s.total     ? Math.round(s.cancelled / s.total * 100) : 0;
    const noShowPct    = s.totalConf ? Math.round(s.noShows / (s.totalConf + s.noShows) * 100) : 0;

    const formatHour = h => {
      const d = new Date(); d.setHours(h, 0);
      return d.toLocaleTimeString('en-US', { hour: 'numeric' });
    };

    // Monthly sparkline data
    const monthlyMax = Math.max(...s.sortedMonths.map(m => s.monthCount[m]), 1);

    return `
      <!-- KPI Cards -->
      <div class="analytics-kpis">
        <div class="kpi-card glass-panel">
          <div class="kpi-value">${s.total}</div>
          <div class="kpi-label">Total Reservations</div>
        </div>
        <div class="kpi-card glass-panel">
          <div class="kpi-value">${arrivedPct}%</div>
          <div class="kpi-label">Show Rate</div>
        </div>
        <div class="kpi-card glass-panel">
          <div class="kpi-value">${noShowPct}%</div>
          <div class="kpi-label">No-show Rate</div>
        </div>
        <div class="kpi-card glass-panel">
          <div class="kpi-value">${cancelledPct}%</div>
          <div class="kpi-label">Cancellation Rate</div>
        </div>
      </div>

      <!-- Charts Row -->
      <div class="analytics-charts">

        <!-- Busy Days Chart -->
        <div class="analytics-chart-card glass-panel">
          <h4 class="chart-title">Reservations by Day of Week</h4>
          <div class="bar-chart">
            ${s.dayCount.map((count, i) => `
              <div class="bar-col">
                <div class="bar-track">
                  <div class="bar-fill" style="height:${Math.round(count/s.maxDay*100)}%" title="${count} reservations"></div>
                </div>
                <div class="bar-label ${s.dayNames[i] === s.busyDay ? 'bar-label-peak' : ''}">${s.dayNames[i]}</div>
              </div>
            `).join('')}
          </div>
          <p class="chart-note">Busiest day: <strong>${s.busyDay}</strong></p>
        </div>

        <!-- Busy Hours Chart -->
        <div class="analytics-chart-card glass-panel">
          <h4 class="chart-title">Reservations by Hour</h4>
          <div class="bar-chart bar-chart-sm">
            ${s.hourCount.slice(16, 24).map((count, i) => {
              const h = i + 16;
              return `
              <div class="bar-col">
                <div class="bar-track">
                  <div class="bar-fill" style="height:${Math.round(count/s.maxHour*100)}%" title="${count} reservations"></div>
                </div>
                <div class="bar-label ${h === s.busyHour ? 'bar-label-peak' : ''}">${formatHour(h)}</div>
              </div>`;
            }).join('')}
          </div>
          <p class="chart-note">Peak hour: <strong>${formatHour(s.busyHour)}</strong></p>
        </div>

      </div>

      <!-- Monthly Trend -->
      ${s.sortedMonths.length > 0 ? `
      <div class="analytics-chart-card glass-panel" style="margin-top:1.5rem">
        <h4 class="chart-title">Monthly Reservation Trend</h4>
        <div class="trend-chart">
          ${s.sortedMonths.map(m => {
            const count = s.monthCount[m];
            const label = new Date(m + '-15').toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
            return `
              <div class="bar-col">
                <div class="bar-count">${count}</div>
                <div class="bar-track">
                  <div class="bar-fill bar-fill-accent" style="height:${Math.round(count/monthlyMax*100)}%"></div>
                </div>
                <div class="bar-label">${label}</div>
              </div>`;
          }).join('')}
        </div>
      </div>` : ''}

      <!-- Status Breakdown -->
      <div class="analytics-chart-card glass-panel" style="margin-top:1.5rem">
        <h4 class="chart-title">Reservation Status Breakdown</h4>
        <div class="status-breakdown">
          ${[
            { label: 'Confirmed', count: s.totalConf, cls: 'status-confirmed' },
            { label: 'Arrived',   count: s.arrived,   cls: 'status-arrived' },
            { label: 'No-show',   count: s.noShows,   cls: 'status-noshow' },
            { label: 'Cancelled', count: s.cancelled, cls: 'status-rejected' },
          ].map(item => `
            <div class="status-breakdown-item">
              <span class="status-badge ${item.cls}" style="min-width:90px;text-align:center">${item.label}</span>
              <div class="status-bar-track">
                <div class="status-bar-fill ${item.cls}" style="width:${s.total ? Math.round(item.count/s.total*100) : 0}%"></div>
              </div>
              <span class="status-count">${item.count}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // ─────────────────────────────────────────────────────────
  // MENU MANAGER
  // ─────────────────────────────────────────────────────────
  const menuFormWrap  = document.getElementById('menu-form-wrap');
  const menuItemForm  = document.getElementById('menu-item-form');
  const addItemBtn    = document.getElementById('add-item-btn');
  const cancelMenuBtn = document.getElementById('cancel-menu-form');
  let   cachedMenuItems = [];

  addItemBtn?.addEventListener('click',  () => openMenuForm(null));
  cancelMenuBtn?.addEventListener('click', () => { menuFormWrap.style.display = 'none'; });

  function openMenuForm(item) {
    document.getElementById('menu-form-title').textContent  = item ? 'Edit Menu Item' : 'Add Menu Item';
    document.getElementById('mi-id').value                  = item?.id          || '';
    document.getElementById('mi-name').value                = item?.name        || '';
    document.getElementById('mi-category').value            = item?.category    || 'starters';
    document.getElementById('mi-price').value               = item?.price       || '';
    document.getElementById('mi-description').value         = item?.description || '';
    document.getElementById('mi-available').value           = String(item?.available ?? true);
    menuFormWrap.style.display = 'block';
    document.getElementById('mi-name').focus();
  }

  menuItemForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = menuItemForm.querySelector('[type="submit"]');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await adminUpdateMenu({
        id:          document.getElementById('mi-id').value || null,
        name:        document.getElementById('mi-name').value,
        category:    document.getElementById('mi-category').value,
        price:       document.getElementById('mi-price').value,
        description: document.getElementById('mi-description').value,
        available:   document.getElementById('mi-available').value === 'true',
      });
      menuFormWrap.style.display = 'none';
      menuItemForm.reset();
      toast('Menu item saved.');
      loadMenuItems();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false; btn.textContent = 'Save Item';
    }
  });

  async function loadMenuItems() {
    const wrap = document.getElementById('menu-table-wrap');
    wrap.innerHTML = '<p class="loading-msg">Loading…</p>';
    try {
      const items = await adminFetchMenuItems();
      cachedMenuItems = items || [];
      if (!items?.length) {
        wrap.innerHTML = '<p class="empty-state">No menu items yet. Add your first item above.</p>';
        return;
      }
      wrap.innerHTML = `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead>
              <tr><th>Name</th><th>Category</th><th>Price</th><th>Description</th><th>Available</th><th>Actions</th></tr>
            </thead>
            <tbody>
              ${items.map(item => `
                <tr>
                  <td class="td-name">${esc(item.name)}</td>
                  <td>${esc(item.category)}</td>
                  <td>$${parseFloat(item.price).toFixed(2)}</td>
                  <td title="${esc(item.description || '')}">${truncate(item.description, 50)}</td>
                  <td>${item.available ? '✓' : '—'}</td>
                  <td>
                    <button class="tbl-btn edit"   data-action="edit"   data-id="${item.id}">Edit</button>
                    <button class="tbl-btn delete" data-action="delete" data-id="${item.id}">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
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
          try {
            await adminDeleteMenuItem(btn.dataset.id);
            toast('Item deleted.');
            loadMenuItems();
          } catch (err) { toast(err.message, 'error'); btn.disabled = false; }
        });
      });
    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // GALLERY
  // ─────────────────────────────────────────────────────────
  const galleryUpload  = document.getElementById('gallery-upload');
  const uploadProgress = document.getElementById('upload-progress');

  galleryUpload?.addEventListener('change', async (e) => {
    const file    = e.target.files[0];
    const caption = document.getElementById('gallery-caption').value.trim();
    if (!file) return;
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
          <img src="${img.url}" alt="${esc(img.caption || '')}" loading="lazy">
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
          try {
            await adminDeleteImage(btn.dataset.id);
            toast('Image removed.');
            loadAdminGallery();
          } catch (err) { toast(err.message, 'error'); }
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
        <p style="color:var(--clr-text-muted);font-size:.85rem;margin-bottom:1.5rem;letter-spacing:1px;">
          ${rows.length} subscriber${rows.length !== 1 ? 's' : ''}
        </p>
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Email</th><th>Subscribed</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td class="td-name" style="font-family:var(--font-body);font-size:.9rem">${esc(r.email)}</td>
                  <td>${formatDate(r.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // REVIEWS
  // ─────────────────────────────────────────────────────────
  async function loadReviews() {
    const wrap = document.getElementById('reviews-wrap');
    wrap.innerHTML = '<p class="loading-msg">Loading…</p>';
    try {
      const rows = await adminFetchReviews();
      if (!rows?.length) { wrap.innerHTML = '<p class="empty-state">No private reviews yet.</p>'; return; }
      wrap.innerHTML = `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Rating</th><th>Message</th><th>Date</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td><span class="star-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</span></td>
                  <td style="max-width:500px;white-space:normal">${esc(r.message || '—')}</td>
                  <td>${formatDate(r.created_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // UTILITIES
  // ─────────────────────────────────────────────────────────
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
});

function adminGetToken() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.includes('-auth-token'));
    if (!keys.length) return null;
    return JSON.parse(localStorage.getItem(keys[0]))?.access_token || null;
  } catch { return null; }
}