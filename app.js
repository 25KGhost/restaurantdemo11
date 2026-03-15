/**
 * AURELIA RESTAURANT — app.js
 * ─────────────────────────────────────────────────────────────
 * Main frontend controller.
 *
 * ARCHITECTURE NOTE ON THE LOADER:
 * The loader is dismissed by an inline <script> in index.html
 * that runs as plain JavaScript (not a module). This means it
 * executes synchronously and is immune to ES module errors.
 * This file handles all interactive behaviour AFTER the loader.
 * ─────────────────────────────────────────────────────────────
 */

// ─── Dynamic import wrapper ───────────────────────────────────
// We import api.js dynamically inside DOMContentLoaded so that
// a network/parse failure in api.js cannot block this file from
// running. If api.js fails, the site degrades gracefully to
// static HTML — forms show errors but the UI still renders.

document.addEventListener('DOMContentLoaded', () => {

  // Ensure loaded class is set (belt-and-braces — primary is the
  // inline script in index.html that handles the 1800ms timing)
  document.body.classList.add('loaded');

  // Boot with or without the API module
  loadAPI().then(api => init(api)).catch(() => init(null));

});

async function loadAPI() {
  try {
    return await import('./api.js');
  } catch (err) {
    console.warn('[Aurelia] api.js could not be loaded:', err.message);
    return null;
  }
}

// ─── MAIN INIT ───────────────────────────────────────────────
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

  document.querySelectorAll('a, button, input, select, textarea, .sensory-card')
    .forEach(el => {
      el.addEventListener('mouseenter', () => document.body.classList.add('cursor-hover'));
      el.addEventListener('mouseleave', () => document.body.classList.remove('cursor-hover'));
    });

  // ─── NAVIGATION SCROLL EFFECT ──────────────────────────────
  const navbar = document.getElementById('navbar');
  if (navbar) {
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > 50);
    });
  }

  // Mobile hamburger menu
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

    // Close mobile nav
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

  // Called each time a new page becomes active
  function onPageEnter(hash) {
    if (hash === '#menu'    && api) initMenu();
    if (hash === '#gallery' && api) initGallery();
  }

  // ─── SCROLL REVEAL ─────────────────────────────────────────
  function observeElements() {
    const els = document.querySelectorAll(
      '.page-view.active .reveal-on-scroll:not(.is-visible)'
    );
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

  // ─── DYNAMIC MENU (requires api) ───────────────────────────
  let menuLoaded = false;

  async function initMenu() {
    if (menuLoaded || !api?.loadMenu) return;
    const grouped = await api.loadMenu();
    if (!grouped) return; // fall back to static HTML

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
        renderCategory('Starters',    grouped.starters) +
        renderCategory('Main Courses', grouped.mains) +
        renderCategory('Desserts',    grouped.desserts);
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

  // ─── DYNAMIC GALLERY (requires api) ────────────────────────
  let galleryLoaded = false;

  async function initGallery() {
    if (galleryLoaded || !api?.loadGallery) return;
    const images = await api.loadGallery();
    if (!images?.length) return; // fall back to static HTML

    galleryLoaded = true;
    const grid = document.querySelector('.masonry-grid');
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

    const close = () => {
      lb.classList.remove('open');
      setTimeout(() => lb.remove(), 400);
    };
    lb.querySelector('.lightbox-backdrop').addEventListener('click', close);
    lb.querySelector('.lightbox-close').addEventListener('click', close);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); }, { once: true });
  }

  // ─── RESERVATION FORM ──────────────────────────────────────
  const step1        = document.getElementById('step-1');
  const step2        = document.getElementById('step-2');
  const formSuccess  = document.getElementById('form-success');
  const nextBtn      = document.getElementById('next-step-btn');
  const prevBtn      = document.getElementById('prev-step-btn');
  const bookingForm  = document.getElementById('booking-form');

  let reservationStep1Data = {};

  nextBtn?.addEventListener('click', () => {
    const dateInput   = step1?.querySelector('input[type="date"]')?.value;
    const guestSelect = step1?.querySelector('select')?.value;
    const activeTime  = step1?.querySelector('.time-btn.active');

    if (!dateInput || !guestSelect) {
      showFormError(step1, 'Please select a date and party size.');
      return;
    }
    if (!activeTime) {
      showFormError(step1, 'Please select a time slot.');
      return;
    }

    reservationStep1Data = {
      date:   dateInput,
      guests: guestSelect.split(' ')[0],
      time:   activeTime.textContent.trim(),
    };

    if (step1) step1.style.display = 'none';
    if (step2) step2.style.display = 'block';
  });

  prevBtn?.addEventListener('click', () => {
    if (step2) step2.style.display = 'none';
    if (step1) step1.style.display = 'block';
  });

  bookingForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = bookingForm.querySelector('[type="submit"]');

    // If no API, just show success (demo mode)
    if (!api?.submitReservation) {
      if (step2) step2.style.display = 'none';
      if (formSuccess) formSuccess.style.display = 'block';
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Sending…';

    const result = await api.submitReservation(bookingForm, {
      ...reservationStep1Data,
      name:  step2?.querySelector('input[type="text"]')?.value  || '',
      email: step2?.querySelector('input[type="email"]')?.value || '',
      phone: step2?.querySelector('input[type="tel"]')?.value   || '',
      notes: step2?.querySelector('textarea')?.value            || '',
    });

    if (result.ok) {
      if (step2) step2.style.display = 'none';
      if (formSuccess) formSuccess.style.display = 'block';
    } else {
      showFormError(step2, result.message);
      submitBtn.disabled    = false;
      submitBtn.textContent = 'Confirm Booking';
    }
  });

  // Time slot buttons
  document.querySelectorAll('.time-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // ─── NEWSLETTER FORM ───────────────────────────────────────
  const newsletterForm = document.querySelector('.newsletter-form');
  newsletterForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = newsletterForm.querySelector('input[type="email"]');
    const btn   = newsletterForm.querySelector('button');
    const email = input?.value?.trim();

    if (!api?.submitNewsletter) {
      // Demo mode — just clear the field
      if (input) input.value = '';
      return;
    }

    if (btn) btn.disabled = true;
    const result = await api.submitNewsletter(newsletterForm, email);

    let msgEl = newsletterForm.nextElementSibling;
    if (!msgEl?.classList.contains('newsletter-msg')) {
      msgEl = document.createElement('p');
      msgEl.className = 'newsletter-msg';
      newsletterForm.insertAdjacentElement('afterend', msgEl);
    }

    msgEl.textContent  = result.message;
    msgEl.style.color  = result.ok ? 'var(--clr-accent)' : '#ef9a9a';

    if (result.ok) {
      if (input) input.value = '';
      newsletterForm.style.display = 'none';
    } else {
      if (btn) btn.disabled = false;
    }
  });

  // ─── UTILITY HELPERS ───────────────────────────────────────
  function showFormError(container, message) {
    if (!container) return;
    let errEl = container.querySelector('.form-error');
    if (!errEl) {
      errEl = document.createElement('p');
      errEl.className = 'form-error';
      container.appendChild(errEl);
    }
    errEl.textContent = message;
    setTimeout(() => { if (errEl) errEl.textContent = ''; }, 5000);
  }

  function esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#x27;' }[c])
    );
  }

} // end init()