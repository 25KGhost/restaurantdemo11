/**
 * AURELIA RESTAURANT — app.js  (enhanced)
 * Main frontend controller.
 * Enhancements: calendar-style date picker (0–60 days),
 * real-time email + phone validation with clear error messages.
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
    if (hash === '#menu'         && api) initMenu();
    if (hash === '#gallery'      && api) initGallery();
    if (hash === '#reservations')        initCalendarPicker();
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
              ${item.image_url ? `<img src="${esc(item.image_url)}" alt="${esc(item.name)}" style="width:100%;height:180px;object-fit:cover;border-radius:6px;margin:0.8rem 0" loading="lazy">` : ''}
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

  // ─────────────────────────────────────────────────────────
  // CALENDAR DATE PICKER
  // Replaces the native <input type="date"> with a styled
  // calendar limited to today → +60 days.
  // ─────────────────────────────────────────────────────────
  let pickerInitialized = false;
  let selectedDate = null; // YYYY-MM-DD string

  function initCalendarPicker() {
    if (pickerInitialized) return;
    const nativeInput = document.getElementById('res-date');
    if (!nativeInput) return;
    pickerInitialized = true;

    // Build calendar widget
    const wrapper = document.createElement('div');
    wrapper.id = 'cal-picker-wrap';
    wrapper.innerHTML = `
      <div id="cal-display" class="cal-display custom-input" tabindex="0" role="button" aria-haspopup="true" style="cursor:pointer;display:flex;align-items:center;justify-content:space-between">
        <span id="cal-display-text" style="color:rgba(255,255,255,0.25)">Select date</span>
        <span style="font-size:0.9rem;opacity:0.5">▾</span>
      </div>
      <div id="cal-popup" style="display:none" class="cal-popup glass-panel">
        <div class="cal-header">
          <button type="button" id="cal-prev" class="cal-nav-btn">‹</button>
          <span id="cal-month-label" class="cal-month-label"></span>
          <button type="button" id="cal-next" class="cal-nav-btn">›</button>
        </div>
        <div class="cal-weekdays">
          ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<span>${d}</span>`).join('')}
        </div>
        <div id="cal-days" class="cal-days"></div>
      </div>`;

    nativeInput.parentNode.insertBefore(wrapper, nativeInput);
    nativeInput.style.display = 'none';

    // Inject calendar styles
    if (!document.getElementById('cal-styles')) {
      const style = document.createElement('style');
      style.id = 'cal-styles';
      style.textContent = `
        #cal-picker-wrap { position: relative; }
        .cal-display { user-select: none; }
        .cal-popup {
          position: absolute; top: calc(100% + 8px); left: 0;
          width: 100%; min-width: 280px; z-index: 500;
          padding: 1.2rem; border-radius: 12px;
          background: rgba(12,12,16,0.97);
          border: 1px solid rgba(255,255,255,0.1);
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
          animation: calFade 0.2s ease;
        }
        @keyframes calFade { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .cal-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 1rem;
        }
        .cal-month-label { font-family: var(--font-heading); font-size: 1.1rem; color: var(--clr-accent); }
        .cal-nav-btn {
          background: none; border: 1px solid rgba(255,255,255,0.08);
          color: var(--clr-text-muted); border-radius: 6px;
          width: 28px; height: 28px; cursor: pointer; font-size: 1rem;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.2s;
        }
        .cal-nav-btn:hover { background: rgba(255,255,255,0.06); color: var(--clr-text); }
        .cal-weekdays {
          display: grid; grid-template-columns: repeat(7, 1fr);
          gap: 2px; margin-bottom: 0.5rem;
        }
        .cal-weekdays span {
          text-align: center; font-size: 0.7rem; text-transform: uppercase;
          letter-spacing: 0.06em; color: var(--clr-text-muted); padding: 0.3rem 0;
        }
        .cal-days {
          display: grid; grid-template-columns: repeat(7, 1fr);
          gap: 3px;
        }
        .cal-day {
          aspect-ratio: 1; display: flex; align-items: center; justify-content: center;
          border-radius: 6px; font-size: 0.85rem; cursor: pointer;
          color: var(--clr-text-muted); transition: all 0.15s;
          border: 1px solid transparent;
        }
        .cal-day:hover:not(.cal-day-disabled):not(.cal-day-other) {
          background: rgba(208,195,173,0.1); color: var(--clr-text);
          border-color: rgba(208,195,173,0.2);
        }
        .cal-day-available { color: var(--clr-text); }
        .cal-day-selected {
          background: var(--clr-accent) !important;
          color: #050507 !important; font-weight: 500;
          border-color: transparent !important;
        }
        .cal-day-today { border-color: rgba(208,195,173,0.3); color: var(--clr-accent); }
        .cal-day-disabled { opacity: 0.2; cursor: not-allowed; pointer-events: none; }
        .cal-day-other { opacity: 0; pointer-events: none; }
        .cal-day-weekend { color: rgba(208,195,173,0.8); }
      `;
      document.head.appendChild(style);
    }

    const today   = new Date(); today.setHours(0, 0, 0, 0);
    const maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + 60);
    let viewYear  = today.getFullYear();
    let viewMonth = today.getMonth();

    function renderCalendar() {
      const label = document.getElementById('cal-month-label');
      label.textContent = new Date(viewYear, viewMonth, 1)
        .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

      const firstDay   = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const grid = document.getElementById('cal-days');
      grid.innerHTML = '';

      // Empty cells before first day
      for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'cal-day cal-day-other';
        grid.appendChild(el);
      }

      for (let d = 1; d <= daysInMonth; d++) {
        const date    = new Date(viewYear, viewMonth, d);
        const dateStr = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const el      = document.createElement('div');
        el.textContent = d;
        el.className = 'cal-day';
        const isToday    = date.toDateString() === today.toDateString();
        const isSelected = dateStr === selectedDate;
        const isPast     = date < today;
        const isFuture   = date > maxDate;
        const isWeekend  = date.getDay() === 0 || date.getDay() === 6;

        if (isPast || isFuture) {
          el.classList.add('cal-day-disabled');
        } else {
          el.classList.add('cal-day-available');
          if (isWeekend) el.classList.add('cal-day-weekend');
        }
        if (isToday)    el.classList.add('cal-day-today');
        if (isSelected) el.classList.add('cal-day-selected');

        if (!isPast && !isFuture) {
          el.addEventListener('click', () => {
            selectedDate = dateStr;
            nativeInput.value = dateStr;
            document.getElementById('cal-display-text').textContent = formatDateDisplay(dateStr);
            document.getElementById('cal-display-text').style.color = 'var(--clr-text)';
            closeCalendar();
            renderCalendar(); // re-render to show selection
          });
        }
        grid.appendChild(el);
      }

      // Prev/Next visibility
      const prevBtn = document.getElementById('cal-prev');
      const nextBtn = document.getElementById('cal-next');
      const prevMonthEnd = new Date(viewYear, viewMonth, 0);
      prevBtn.disabled = prevMonthEnd < today;
      prevBtn.style.opacity = prevBtn.disabled ? '0.2' : '1';
      const nextMonthStart = new Date(viewYear, viewMonth + 1, 1);
      nextBtn.disabled = nextMonthStart > maxDate;
      nextBtn.style.opacity = nextBtn.disabled ? '0.2' : '1';
    }

    function openCalendar() {
      document.getElementById('cal-popup').style.display = 'block';
      renderCalendar();
    }
    function closeCalendar() {
      document.getElementById('cal-popup').style.display = 'none';
    }

    document.getElementById('cal-display').addEventListener('click', () => {
      const popup = document.getElementById('cal-popup');
      if (popup.style.display === 'none') openCalendar(); else closeCalendar();
    });
    document.getElementById('cal-display').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCalendar(); }
    });
    document.getElementById('cal-prev').addEventListener('click', () => {
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      renderCalendar();
    });
    document.getElementById('cal-next').addEventListener('click', () => {
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      renderCalendar();
    });
    // Close on outside click
    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target)) closeCalendar();
    });
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
    const errEl       = document.getElementById('step1-error');

    if (!dateInput) {
      showFormError('step1-error', 'Please select a date from the calendar.'); return;
    }
    if (!guestSelect) {
      showFormError('step1-error', 'Please select a party size.'); return;
    }
    if (!activeTime) {
      showFormError('step1-error', 'Please select a time slot.'); return;
    }

    const selected = new Date(dateInput + 'T12:00:00');
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const maxDate  = new Date(today); maxDate.setDate(maxDate.getDate() + 60);
    if (selected < today) { showFormError('step1-error', 'Please select a future date.'); return; }
    if (selected > maxDate) { showFormError('step1-error', 'Reservations are available up to 60 days ahead.'); return; }

    if (errEl) errEl.textContent = '';
    step1Data = {
      date:       dateInput,
      guests:     guestSelect,
      time:       activeTime.dataset.time || activeTime.textContent.trim(),
      experience: document.getElementById('res-experience')?.value || 'Main Dining Room',
    };
    step1.style.display = 'none';
    step2.style.display = 'block';
    // Reset step 2 errors
    const emailInp = document.getElementById('res-email');
    const phoneInp = document.getElementById('res-phone');
    if (emailInp) { emailInp.classList.remove('input-error', 'input-ok'); }
    if (phoneInp) { phoneInp.classList.remove('input-error', 'input-ok'); }
  });

  prevBtn?.addEventListener('click', () => {
    step2.style.display = 'none';
    step1.style.display = 'block';
  });

  // ── Real-time validation on step 2 ──
  const emailInput = document.getElementById('res-email');
  const phoneInput = document.getElementById('res-phone');

  emailInput?.addEventListener('blur', () => {
    const val = emailInput.value.trim();
    if (!val) return;
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
    setInputState(emailInput, ok, ok ? '' : 'Please enter a valid email address (e.g. jane@example.com)');
  });
  emailInput?.addEventListener('input', () => {
    if (emailInput.classList.contains('input-error')) {
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailInput.value.trim());
      if (ok) setInputState(emailInput, true, '');
    }
  });

  phoneInput?.addEventListener('blur', () => {
    const val = phoneInput.value.trim();
    if (!val) return;
    // Allow international formats: +1 (212) 555-0000, +44 7700 000000, etc.
    const cleaned = val.replace(/[\s\-().+]/g, '');
    const ok = /^\+?[0-9]{7,15}$/.test(cleaned);
    setInputState(phoneInput, ok, ok ? '' : 'Enter a valid phone number (7–15 digits, spaces and + allowed)');
  });
  phoneInput?.addEventListener('input', () => {
    // Strip non-numeric/formatting chars as typed (allow +, digits, spaces, -, ())
    const safe = phoneInput.value.replace(/[^0-9+\s\-().]/g, '');
    if (safe !== phoneInput.value) phoneInput.value = safe;
    if (phoneInput.classList.contains('input-error')) {
      const cleaned = safe.replace(/[\s\-().+]/g, '');
      if (/^\+?[0-9]{7,15}$/.test(cleaned)) setInputState(phoneInput, true, '');
    }
  });

  function setInputState(el, isOk, errorMsg) {
    el.classList.toggle('input-ok', isOk);
    el.classList.toggle('input-error', !isOk);
    let hint = el.nextElementSibling;
    if (!hint || !hint.classList.contains('field-hint')) {
      hint = document.createElement('p');
      hint.className = 'field-hint';
      el.insertAdjacentElement('afterend', hint);
    }
    hint.textContent = errorMsg;
    hint.style.color  = isOk ? '#81c784' : '#ef9a9a';
  }

  // Inject input validation styles
  if (!document.getElementById('validation-styles')) {
    const s = document.createElement('style');
    s.id = 'validation-styles';
    s.textContent = `
      .custom-input.input-ok    { border-color: rgba(129,199,132,0.5) !important; }
      .custom-input.input-error { border-color: rgba(229,57,53,0.5)   !important; }
      .field-hint { font-size: 0.78rem; margin-top: 0.3rem; min-height: 1em; transition: color 0.2s; }
    `;
    document.head.appendChild(s);
  }

  bookingForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('submit-btn');

    // Validate email + phone before submitting
    const emailVal   = emailInput?.value.trim() || '';
    const phoneVal   = phoneInput?.value.trim() || '';
    const emailOk    = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailVal);
    const phoneCl    = phoneVal.replace(/[\s\-().+]/g, '');
    const phoneOk    = /^\+?[0-9]{7,15}$/.test(phoneCl);

    if (!emailOk) { setInputState(emailInput, false, 'Please enter a valid email address.'); emailInput.focus(); return; }
    if (!phoneOk) { setInputState(phoneInput, false, 'Please enter a valid phone number.'); phoneInput.focus(); return; }

    if (!api?.submitReservation) {
      step2.style.display       = 'none';
      formSuccess.style.display = 'block';
      return;
    }

    submitBtn.disabled    = true;
    submitBtn.textContent = 'Confirming…';

    const result = await api.submitReservation(bookingForm, {
      ...step1Data,
      name:  document.getElementById('res-name')?.value  || '',
      email: emailVal,
      phone: phoneVal,
      notes: document.getElementById('res-notes')?.value || '',
    });

    if (result.ok) {
      step2.style.display = 'none';
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
    if (!modal) { formSuccess.style.display = 'block'; return; }
    const shortId = res.id ? String(res.id).slice(-8).toUpperCase() : 'N/A';
    document.getElementById('t-name').textContent   = res.name   || '—';
    document.getElementById('t-id').textContent     = shortId;
    document.getElementById('t-date').textContent   = formatDateDisplay(res.date);
    document.getElementById('t-time').textContent   = formatTimeDisplay(res.time);
    document.getElementById('t-guests').textContent = res.guests + ' guest' + (res.guests > 1 ? 's' : '');
    document.getElementById('t-exp').textContent    = experience || 'Main Dining Room';
    modal.style.display      = 'flex';
    modal.style.alignItems   = 'center';
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
    setTimeout(() => { if (el.textContent === message) el.textContent = ''; }, 6000);
  }

  function esc(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"']/g, c =>
      ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#x27;' }[c]));
  }

} // end init()