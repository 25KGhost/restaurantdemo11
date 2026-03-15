/**
 * AURELIA RESTAURANT — admin.js
 * ─────────────────────────────────────────────────────────────
 * Admin dashboard controller. Handles auth, all CRUD operations,
 * image uploads, and data export.
 * ─────────────────────────────────────────────────────────────
 */
import {
  adminLogin,
  adminLogout,
  adminFetchReservations,
  adminUpdateReservationStatus,
  adminFetchMenuItems,
  adminUpdateMenu,
  adminDeleteMenuItem,
  adminFetchSubscribers,
  adminExportSubscribersCSV,
  adminUploadImage,
  adminDeleteImage,
  adminFetchReviews,
  loadGallery,           // FIX 6: import loadGallery directly — no more broken double-import hack
} from './api.js';

// ─── TOAST NOTIFICATION ──────────────────────────────────────
function toast(message, type = 'success') {
  let el = document.querySelector('.admin-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'admin-toast';
    document.body.appendChild(el);
  }
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

  // Check if already authenticated
  const alreadyAuthed = !!adminGetToken();
  if (alreadyAuthed) {
    showDashboard();
  }

  // ─── LOGIN ───────────────────────────────────────────────
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Honeypot check
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
      loginError.textContent    = result.message;
      loginBtn.disabled         = false;
      loginBtn.textContent      = 'Sign In';
    }
  });

  // ─── LOGOUT ──────────────────────────────────────────────
  logoutBtn?.addEventListener('click', () => {
    adminLogout();
    dashboard.style.display    = 'none';
    loginScreen.style.display  = 'flex';
    loginForm.reset();
    loginBtn.disabled          = false;
    loginBtn.textContent       = 'Sign In';
  });

  function showDashboard() {
    loginScreen.style.display  = 'none';
    dashboard.style.display    = 'flex';
    initDashboard();
  }

  // ─── SIDEBAR NAVIGATION ──────────────────────────────────
  function initDashboard() {
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const sections     = document.querySelectorAll('.admin-section');
    const sectionTitle = document.getElementById('section-title');
    const sectionSub   = document.getElementById('section-sub');

    const meta = {
      reservations: { title: 'Reservations',    sub: 'Manage incoming table requests' },
      menu:         { title: 'Menu Manager',     sub: 'Add, edit, and toggle menu items' },
      gallery:      { title: 'Gallery',          sub: 'Upload and manage restaurant images' },
      subscribers:  { title: 'Newsletter',       sub: 'View and export subscriber list' },
      reviews:      { title: 'Internal Reviews', sub: 'Private customer feedback' },
    };

    sidebarLinks.forEach(link => {
      link.addEventListener('click', () => {
        sidebarLinks.forEach(l => l.classList.remove('active'));
        sections.forEach(s => s.classList.remove('active'));
        link.classList.add('active');

        const key = link.getAttribute('data-section');
        document.getElementById(`section-${key}`)?.classList.add('active');
        sectionTitle.textContent = meta[key]?.title || key;
        sectionSub.textContent   = meta[key]?.sub   || '';

        loadSection(key);
      });
    });

    // Load default section
    loadSection('reservations');
  }

  // ─── SECTION LOADER ──────────────────────────────────────
  function loadSection(key) {
    switch (key) {
      case 'reservations': loadReservations('all'); break;
      case 'menu':         loadMenuItems();         break;
      case 'gallery':      loadAdminGallery();      break;
      case 'subscribers':  loadSubscribers();       break;
      case 'reviews':      loadReviews();           break;
    }
  }

  // ─────────────────────────────────────────────────────────
  // RESERVATIONS
  // ─────────────────────────────────────────────────────────
  let currentFilter = 'all';

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
      const rows = await adminFetchReservations(filter === 'all' ? undefined : filter);
      if (!rows?.length) {
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
              ${rows.map(r => `
                <tr data-id="${r.id}">
                  <td class="td-name">${esc(r.name)}</td>
                  <td>${formatDate(r.date)}</td>
                  <td>${esc(r.time)}</td>
                  <td>${r.guests}</td>
                  <td title="${esc(r.email)}">${esc(r.email)}<br><small>${esc(r.phone || '')}</small></td>
                  <td title="${esc(r.notes || '')}">${truncate(r.notes, 40)}</td>
                  <td><span class="status-badge status-${r.status}">${r.status}</span></td>
                  <td>
                    ${r.status !== 'confirmed' ? `<button class="tbl-btn confirm" data-action="confirm" data-id="${r.id}">Confirm</button>` : ''}
                    ${r.status !== 'rejected'  ? `<button class="tbl-btn reject"  data-action="reject"  data-id="${r.id}">Reject</button>`  : ''}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;

      // Bind action buttons
      wrap.querySelectorAll('[data-action]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const { action, id } = btn.dataset;
          const status = action === 'confirm' ? 'confirmed' : 'rejected';
          btn.disabled = true;
          try {
            await adminUpdateReservationStatus(id, status);
            toast(`Reservation ${status}.`);
            loadReservations(currentFilter);
          } catch (err) {
            toast(err.message, 'error');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // MENU MANAGER
  // ─────────────────────────────────────────────────────────
  const menuFormWrap  = document.getElementById('menu-form-wrap');
  const menuItemForm  = document.getElementById('menu-item-form');
  const addItemBtn    = document.getElementById('add-item-btn');
  const cancelMenuBtn = document.getElementById('cancel-menu-form');

  // Cache fetched items so edit lookups work correctly
  let cachedMenuItems = [];

  addItemBtn?.addEventListener('click', () => openMenuForm(null));
  cancelMenuBtn?.addEventListener('click', () => menuFormWrap.style.display = 'none');

  function openMenuForm(item) {
    document.getElementById('menu-form-title').textContent = item ? 'Edit Menu Item' : 'Add Menu Item';
    document.getElementById('mi-id').value          = item?.id          || '';
    document.getElementById('mi-name').value        = item?.name        || '';
    document.getElementById('mi-category').value    = item?.category    || 'starters';
    document.getElementById('mi-price').value       = item?.price       || '';
    document.getElementById('mi-description').value = item?.description || '';
    document.getElementById('mi-available').value   = String(item?.available ?? true);
    menuFormWrap.style.display = 'block';
    document.getElementById('mi-name').focus();
  }

  menuItemForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = menuItemForm.querySelector('[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Saving…';

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
      btn.disabled    = false;
      btn.textContent = 'Save Item';
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
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Description</th>
                <th>Available</th>
                <th>Actions</th>
              </tr>
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
                    <button class="tbl-btn edit" data-action="edit" data-id="${item.id}">Edit</button>
                    <button class="tbl-btn delete" data-action="delete" data-id="${item.id}">Delete</button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>`;

      // FIX 7: Supabase returns numeric IDs; dataset.id is always a string.
      // Use loose == comparison (or String coercion) so the find() works correctly.
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
          } catch (err) {
            toast(err.message, 'error');
            btn.disabled = false;
          }
        });
      });
    } catch (err) {
      wrap.innerHTML = `<p class="loading-msg" style="color:#ef9a9a">${esc(err.message)}</p>`;
    }
  }

  // ─────────────────────────────────────────────────────────
  // GALLERY MANAGER
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
      // FIX 6: loadGallery is now properly imported at the top of this file.
      // The old adminFetchGallery() was a broken double-dynamic-import workaround.
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
          } catch (err) {
            toast(err.message, 'error');
          }
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
    try {
      await adminExportSubscribersCSV();
      toast('CSV exported.');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  async function loadSubscribers() {
    const wrap = document.getElementById('subscribers-wrap');
    wrap.innerHTML = '<p class="loading-msg">Loading…</p>';

    try {
      const rows = await adminFetchSubscribers();
      if (!rows?.length) {
        wrap.innerHTML = '<p class="empty-state">No subscribers yet.</p>';
        return;
      }

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
  // INTERNAL REVIEWS
  // ─────────────────────────────────────────────────────────
  async function loadReviews() {
    const wrap = document.getElementById('reviews-wrap');
    wrap.innerHTML = '<p class="loading-msg">Loading…</p>';

    try {
      const rows = await adminFetchReviews();
      if (!rows?.length) {
        wrap.innerHTML = '<p class="empty-state">No private reviews yet.</p>';
        return;
      }

      wrap.innerHTML = `
        <div class="admin-table-wrap">
          <table class="admin-table">
            <thead><tr><th>Rating</th><th>Message</th><th>Date</th></tr></thead>
            <tbody>
              ${rows.map(r => `
                <tr>
                  <td><span class="star-rating">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span></td>
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
  // UTILITY HELPERS
  // ─────────────────────────────────────────────────────────
  function esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, c =>
      ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'}[c]));
  }

  function truncate(str, len = 60) {
    if (!str) return '—';
    return str.length > len ? str.slice(0, len) + '…' : str;
  }

  function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(new Date(dateStr));
    } catch { return dateStr; }
  }
});

// Helper to read auth token (mirrors api.js logic)
function adminGetToken() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.includes('-auth-token'));
    if (!keys.length) return null;
    return JSON.parse(localStorage.getItem(keys[0]))?.access_token || null;
  } catch { return null; }
}
