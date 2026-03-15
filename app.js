/**
 * AURELIA RESTAURANT — app.js
 * Main frontend controller.
 */

document.addEventListener('DOMContentLoaded', () => {
  document.body.classList.add('loaded');
  loadAPI().then(api => init(api)).catch(() => init(null));
});

async function loadAPI() {
  try { return await import('./api.js'); }
  catch (err) { console.warn('[Aurelia] api.js could not be loaded:', err.message); return null; }
}

function init(api) {

  // ─── CUSTOM CURSOR ─────────────────────────────────────────
  const dot     = document.querySelector('.cursor-dot');
  const outline = document.querySelector('.cursor-outline');
  if (dot && outline) {
    window.addEventListener('mousemove', (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top  = `${e.clientY}px`;
      outline.animate(
        { left: `${e.clientX}px`, top: `${e.clientY}px` },
        { duration: 600, fill: 'forwards' }
      );
    });
  }
  document.querySelectorAll('a, button, input, select, textarea, .sensory-card').forEach(el => {
    el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
    el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
  });

  // ─── NAVIGATION ─────────────────────────────────────────────
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => navbar.classList.toggle('scrolled', window.scrollY > 50));
  }
  const menuToggle = document.querySelector('.menu-toggle');
  const navLinks   = document.querySelector('.nav-links');
  if (menuToggle && navLinks) {
    menuToggle.addEventListener('click', () => {
      navLinks.classList.toggle('mobile-open');
      menuToggle.classList.toggle('open');
    });
  }

  // ─── SPA ROUTING ───────────────────────────────────────────
  const routeLinks = document.querySelectorAll('.route-link');
  const pages      = document.querySelectorAll('.page-view');

  function navigateTo(hash) {
    if (!hash || hash === '#') hash = '#home';
    pages.forEach(p     => p.classList.remove('active'));
    routeLinks.forEach(l => l.classList.remove('active'));
    const target = document.querySelector(hash);
    if (target) {
      target.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      observeElements();
      onPageEnter(hash);
    } else {
      document.getElementById('home')?.classList.add('active');
    }
    document.querySelectorAll(`.route-link[href="${hash}"]`).forEach(l => {
      if (l.closest('.nav-links')) l.classList.add('active');
    });
    navLinks?.classList.remove('mobile-open');
    menuToggle?.classList.remove('open');
  }

  routeLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href?.startsWith('#')) {
        e.preventDefault();
        history.pushState(null, null, href);
        navigateTo(href);
      }
    });
  });

  window.addEventListener('popstate', () => navigateTo(window.location.hash));
  navigateTo(window.location.hash);

  function onPageEnter(hash) {
    if (hash === '#menu'    && api) initMenu();
    if (hash === '#gallery' && api) initGallery();
  }

  // ─── SCROLL REVEAL ─────────────────────────────────────────
  function observeElements() {
    const els = document.querySelectorAll('.page-view.active .reveal-on-scroll:not(.is-visible)');
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    els.forEach(el => observer.observe(el));
  }

  // ─── MENU TABS ─────────────────────────────────────────────
  document.querySelectorAll('.menu-nav button').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.menu-nav button').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.menu-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = document.getElementById(`menu-${tab.getAttribute('data-tab')}`);
      if (content) { content.classList.add('active'); observeElements(); }
    });
  });

  // ─── SENSORY CARDS ─────────────────────────────────────────
  document.querySelectorAll('.sensory-card').forEach(card => {
    card.addEventListener('mouseenter', () => {
      card.style.setProperty('--hover-aura', card.getAttribute('data-aura'));
    });
  });

  // ─── DYNAMIC MENU ──────────────────────────────────────────
  let menuLoaded = false;
  async function initMenu() {
    if (menuLoaded || !api?.loadMenu) return;
    const grouped = await api.loadMenu();
    if (!grouped) return;
    menuLoaded = true;

    const renderCategory = (label, items) => {
      if (!items?.length) return '';
      return `
        <div class="menu-section reveal-on-scroll">
          <h3 class="menu-category">${label}</h3>
          ${items.map(item => `
            <div class="menu-item">
              <div class="menu-item-header">
                <h4>${esc(item.name)}</h4>
                <span class="price">$${parseFloat(item.price).toFixed(0)}</span>
              </div>
              <p>${esc(item.description || '')}</p>
            </div>
          `).join('')}
        </div>`;
    };

    const alaCarteEl = document.getElementById('menu-alacarte');
    if (alaCarteEl && (grouped.starters?.length || grouped.mains?.length || grouped.desserts?.length)) {
      alaCarteEl.innerHTML =
        renderCategory('Starters',     grouped.starters) +
        renderCategory('Main Courses', grouped.mains) +
        renderCategory('Desserts',     grouped.desserts);
      observeElements();
    }
    const wineEl = document.getElementById('menu-wine');
    if (wineEl && grouped.drinks?.length) {
      wineEl.innerHTML = `
        <div class="menu-section reveal-on-scroll">
          <h3 class="menu-category">Sommelier Selection</h3>
          ${grouped.drinks.map(item => `
            <div class="menu-item">
              <div class="menu-item-header">
                <h4>${esc(item.name)}</h4>
                <span class="price">$${parseFloat(item.price).toFixed(0)}</span>
              </div>
              <p>${esc(item.description || '')}</p>
            </div>
          `).join('')}
        </div>`;
      observeElements();
    }
  }

  // ─── DYNAMIC GALLERY ───────────────────────────────────────
  let galleryLoaded = false;
  async function initGallery() {
    if (galleryLoaded || !api?.loadGallery) return;
    const images = await api.loadGallery();
    if (!images?.length) return;
    galleryLoaded = true;

    const grid = document.getElementById('public-gallery-grid');
    if (!grid) return;
    grid.innerHTML = images.map(img => `
      <div class="masonry-item relative-glow" data-caption="${esc(img.caption || '')}">
        <img src="${img.url}" alt="${esc(img.caption || 'Gallery image')}" loading="lazy">
      </div>
    `).join('');
    grid.querySelectorAll('.masonry-item').forEach(item => {
      item.addEventListener('click', () =>
        openLightbox(item.querySelector('img').src, item.dataset.caption)
      );
    });
    observeElements();
  }

  // ─── LIGHTBOX ──────────────────────────────────────────────
  function openLightbox(src, caption) {
    const lb = document.createElement('div');
    lb.className = 'lightbox';
    lb.innerHTML = `
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-content">
        <img src="${src}" alt="${esc(caption)}">
        ${caption ? `<p class="lightbox-caption">${esc(caption)}</p>` : ''}
        <button class="lightbox-close" aria-label="Close">✕</button>
      </div>`;
    document.body.appendChild(lb);
    requestAnimationFrame(() => lb.classList.add('open'));
    const close = () => { lb.classList.remove('open'); setTimeout(() => lb.remove(), 400); };
    lb.querySelector('.lightbox-backdrop').addEventListener('click', close);
    lb.querySelector('.lightbox-close').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });
  }

  // ─── RESERVATION FORM ──────────────────────────────────────
  const step1       = document.getElementById('step-1');
  const step2       = document.getElementById('step-2');
  const formSuccess = document.getElementById('form-success');
  const nextBtn     = document.getElementById('next-step-btn');
  const prevBtn     = document.getElementById('prev-step-btn');
  const bookingForm = document.getElementById('booking-form');
  let   step1Data   = {};

  // Time slot selection
  document.querySelectorAll('.time-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  nextBtn?.addEventListener('click', () => {
    const dateInput   = document.getElementById('res-date')?.value;
    const guestSelect = document.getElementById('res-guests')?.value;
    const activeTime  = document.querySelector('.time-btn.active');

    if (!dateInput || !guestSelect) {
      showFormError('step1-error', 'Please select a date and party size.');
      return;
    }
    if (!activeTime) {
      showFormError('step1-error', 'Please select a time slot.');
      return;
    }

    // Validate date range
    const selected = new Date(dateInput);
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const maxDate  = new Date(today); maxDate.setDate(maxDate.getDate() + 60);
    if (selected < today) { showFormError('step1-error', 'Please select a future date.'); return; }
    if (selected > maxDate) { showFormError('step1-error', 'Reservations are available up to 60 days ahead.'); return; }

    step1Data = {
      date:       dateInput,
      guests:     guestSelect,
      time:       activeTime.dataset.time || activeTime.textContent.trim(),
      experience: document.getElementById('res-experience')?.value || 'Main Dining Room',
    };
    step1.style.display = 'none';
    step2.style.display = 'block';
  });

  prevBtn?.addEventListener('click', () => {
    step2.style.display = 'none';
    step1.style.display = 'block';
  });

  bookingForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');

    if (!api?.submitReservation) {
      // Demo mode
      step2.style.display       = 'none';
      formSuccess.style.display = 'block';
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Confirming…';

    const result = await api.submitReservation(bookingForm, {
      ...step1Data,
      name:  document.getElementById('res-name')?.value  || '',
      email: document.getElementById('res-email')?.value || '',
      phone: document.getElementById('res-phone')?.value || '',
      notes: document.getElementById('res-notes')?.value || '',
    });

    if (result.ok) {
      step2.style.display = 'none';
      // Show ticket
      showTicket(result.reservation || {
        id:     'N/A',
        name:   document.getElementById('res-name')?.value || '',
        date:   step1Data.date,
        time:   step1Data.time,
        guests: step1Data.guests,
      }, step1Data.experience);
    } else {
      showFormError('step2-error', result.message);
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Confirm Booking';
    }
  });

  // ─── TICKET MODAL ──────────────────────────────────────────
  function showTicket(res, experience) {
    const modal = document.getElementById('ticket-modal');
    if (!modal) {
      // Fallback if modal missing
      formSuccess.style.display = 'block';
      return;
    }
    // Format ID to be short but unique
    const shortId = res.id ? String(res.id).slice(-8).toUpperCase() : 'N/A';
    document.getElementById('t-name').textContent   = res.name   || '—';
    document.getElementById('t-id').textContent     = shortId;
    document.getElementById('t-date').textContent   = formatDateDisplay(res.date);
    document.getElementById('t-time').textContent   = formatTimeDisplay(res.time);
    document.getElementById('t-guests').textContent = res.guests + ' guest' + (res.guests > 1 ? 's' : '');
    document.getElementById('t-exp').textContent    = experience || 'Main Dining Room';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    requestAnimationFrame(() => modal.querySelector('.ticket-container')?.classList.add('open'));

    document.getElementById('ticket-close-btn')?.addEventListener('click', closeTicket);
    modal.querySelector('.ticket-backdrop')?.addEventListener('click', closeTicket);
  }

  function closeTicket() {
    const modal = document.getElementById('ticket-modal');
    if (modal) modal.style.display = 'none';
    formSuccess.style.display = 'block';
  }

  function formatDateDisplay(dateStr) {
    if (!dateStr) return '—';
    try {
      return new Intl.DateTimeFormat('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        .format(new Date(dateStr + 'T12:00:00'));
    } catch { return dateStr; }
  }

  function formatTimeDisplay(timeStr) {
    if (!timeStr) return '—';
    // Convert 24h "19:30" → "7:30 PM"
    try {
      const [h, m] = timeStr.split(':').map(Number);
      const d = new Date(); d.setHours(h, m);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } catch { return timeStr; }
  }

  // ─── NEWSLETTER ────────────────────────────────────────────
  const newsletterForm = document.querySelector('.newsletter-form');
  newsletterForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = newsletterForm.querySelector('input[type="email"]');
    const btn   = newsletterForm.querySelector('button');
    const email = input?.value?.trim();
    if (!api?.submitNewsletter) { if (input) input.value = ''; return; }
    if (btn) btn.disabled = true;
    const result = await api.submitNewsletter(newsletterForm, email);
    let msgEl = newsletterForm.nextElementSibling;
    if (!msgEl?.classList.contains('newsletter-msg')) {
      msgEl = document.createElement('p');
      msgEl.className = 'newsletter-msg';
      newsletterForm.insertAdjacentElement('afterend', msgEl);
    }
    msgEl.textContent = result.message;
    msgEl.style.color = result.ok ? 'var(--clr-accent)' : '#ef9a9a';
    if (result.ok) {
      if (input) input.value = '';
      newsletterForm.style.display = 'none';
    } else {
      if (btn) btn.disabled = false;
    }
  });

  // ─── UTILITY ───────────────────────────────────────────────
  function showFormError(id, message) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = message;
    setTimeout(() => { el.textContent = ''; }, 5000);
  }

  function esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#x27;' }[c]));
  }

} // end init()