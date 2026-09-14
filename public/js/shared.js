(function (global) {
  'use strict';

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: 'manual',
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('Location');
      if (loc) {
        // support relative and absolute redirects
        window.location.href = loc;
        return {};
      }
    }

    // If the API explicitly returns 401, send the user to the login page.
    if (res.status === 401) {
      try {
        window.location.href = routeHref('login') || '/login';
      } catch (e) {
        window.location.href = '/login';
      }
      return {};
    }

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  const LOGO_SVG = (size, gradId) => `
    <svg width="${size}" height="${size}" viewBox="0 0 30 30" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="30" height="30" rx="9" fill="url(#${gradId})"/>
      <path d="M8 20V10.5L14 15.5L20 10.5V20" stroke="white" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/>
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="30" y2="30" gradientUnits="userSpaceOnUse">
          <stop stop-color="#635BFF"/><stop offset="0.5" stop-color="#8B5CF6"/><stop offset="1" stop-color="#38BDF8"/>
        </linearGradient>
      </defs>
    </svg>`;

  const ICONS = {
    tasks: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" stroke-width="1.6"/><path d="M6.5 10L9 12.5L13.5 7.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    settings: '<svg width="18" height="18" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="2.6" stroke="currentColor" stroke-width="1.6"/><path d="M10 2.5V4.5M10 15.5V17.5M17.5 10H15.5M4.5 10H2.5M15.4 4.6L14 6M6 14L4.6 15.4M15.4 15.4L14 14M6 6L4.6 4.6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    logout: '<svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M8 17H4.5C3.7 17 3 16.3 3 15.5V4.5C3 3.7 3.7 3 4.5 3H8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M13 14L17 10L13 6M17 10H8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };


  let currentLanguage = 'en';
  let stringsCache = null;
  let languagesCache = [{ code: 'en', name: 'English' }];

  function routeHref(target) {
    const currentPath = window.location.pathname || '/';
    const nestedTaskRoute = currentPath.startsWith('/tasks/');
    const base = nestedTaskRoute ? '../' : './';
    return `${base}${target.replace(/^\/+/, '')}`;
  }

  async function loadLocale() {
    try {
      const [{ user, languages }, { strings }] = await Promise.all([
        api('/api/session'),
        stringsCache ? Promise.resolve({ strings: stringsCache }) : api('/api/i18n/strings'),
      ]);
      if (languages) languagesCache = languages;
      if (strings) stringsCache = strings;
      currentLanguage = user?.language || 'en';
      return user;
    } catch {
      return null;
    }
  }

  function t(key) {
    const dict = (stringsCache && stringsCache[currentLanguage]) || {};
    return dict[key] || (stringsCache?.en || {})[key] || key;
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const has = hasTranslation(key);
      if (has) el.textContent = t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      const key = el.getAttribute('data-i18n-placeholder');
      const has = hasTranslation(key);
      if (has) el.placeholder = t(key);
    });
  }

  function hasTranslation(key) {
    if (!stringsCache) return false;
    return Boolean((stringsCache[currentLanguage] && stringsCache[currentLanguage][key]) || (stringsCache.en && stringsCache.en[key]));
  }

  async function setLanguage(code) {
    await api('/api/auth/language', { method: 'PATCH', body: { language: code } });
    location.reload();
  }

  function bindLanguageSelects() {
    document.querySelectorAll('[data-lang-select]').forEach((sel) => {
      try {
        sel.value = currentLanguage || 'en';
      } catch (e) { }
      sel.addEventListener('change', (e) => {
        setLanguage(e.target.value).catch((err) => console.error(err));
      });
    });
  }


  async function renderLayout(active, { title = '', subtitle = '', titleKey = null, subtitleKey = null } = {}) {
    const sidebar = document.getElementById('sidebar');
    const topbar = document.getElementById('topbar');

    const user = await loadLocale();
    const userEmail = user?.email || '';

    const resolvedTitle = titleKey ? t(titleKey) : title;
    const resolvedSubtitle = subtitleKey ? t(subtitleKey) : subtitle;

    if (sidebar) {
      sidebar.innerHTML = `
        <div class="flex flex-col h-full">
          <a href="${routeHref('dashboard')}" class="flex items-center gap-2.5 px-5 py-6">
            ${LOGO_SVG(26, 'sidebar-logo-grad')}
            <span class="text-[16px] font-semibold text-ink">Makit</span>
          </a>
          <nav class="flex-1 px-3 space-y-1">
            <a href="${routeHref('dashboard')}" class="${active === 'dashboard' ? 'sidebar-link-active' : 'sidebar-link'}">${ICONS.tasks}<span>${t('nav_intelligence')}</span></a>
            <a href="${routeHref('settings')}" class="${active === 'settings' ? 'sidebar-link-active' : 'sidebar-link'}">${ICONS.settings}<span>${t('nav_settings')}</span></a>
          </nav>
          <div class="px-3 pt-3 border-t border-line mx-3">
            <select id="lang-switch" class="w-full text-[13px] border border-line rounded-[8px] px-2.5 py-1.5 bg-surface text-ink-soft mb-2">
              ${languagesCache.map((l) => `<option value="${l.code}" ${l.code === currentLanguage ? 'selected' : ''}>${l.name}</option>`).join('')}
            </select>
          </div>
          <div class="px-3 pb-5 pt-1 mx-3">
            <div class="flex items-center justify-between px-2 py-2">
              <div class="min-w-0">
                <p class="text-[13px] font-medium text-ink truncate">${userEmail || 'Account'}</p>
              </div>
              <button id="logout-btn" class="text-ink-soft hover:text-ink shrink-0" title="${t('nav_logout')}">${ICONS.logout}</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById('logout-btn').addEventListener('click', async () => {
        await api('/api/auth/logout', { method: 'POST' });
        location.href = routeHref('login');
      });
      document.getElementById('lang-switch').addEventListener('change', (e) => {
        setLanguage(e.target.value).catch((err) => console.error(err));
      });
    }

    if (topbar) {
      topbar.innerHTML = `
        <div class="px-6 lg:px-10 py-5 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <button id="mobile-menu-btn" class="lg:hidden text-ink-soft"><svg width="22" height="22" viewBox="0 0 20 20" fill="none"><path d="M3 6H17M3 10H17M3 14H17" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>
            <div>
              <h1 class="text-[19px] font-semibold text-ink leading-tight">${resolvedTitle}</h1>
              ${resolvedSubtitle ? `<p class="text-[13px] text-ink-soft mt-0.5">${resolvedSubtitle}</p>` : ''}
            </div>
          </div>
          <div id="topbar-actions"></div>
        </div>
      `;
      const menuBtn = document.getElementById('mobile-menu-btn');
      if (menuBtn) {
        menuBtn.addEventListener('click', () => {
          document.getElementById('sidebar')?.classList.toggle('hidden');
          document.getElementById('sidebar')?.classList.toggle('flex');
        });
      }
    }

    applyI18n();
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function connectRealtime(onEvent) {
    let socket = null;
    let attempt = 0;
    let failCount = 0;
    const maxFail = 6;

    // Only attempt to open a WS when a session cookie is present. This avoids
    // continual reconnect attempts from public pages or when the user isn't
    // signed in (which spams the console if /ws is protected).
    if (!document.cookie || document.cookie.indexOf('makit_session=') === -1) {
      console.debug('No session cookie found — skipping realtime connection.');
      return () => { };
    }

    function connect() {
      try {
        const wsUrl = new URL('/ws', location.origin).toString();
        socket = new WebSocket(wsUrl);
      } catch (ex) {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${location.host}/ws`);
      }

      socket.addEventListener('open', () => {
        attempt = 0;
      });
      socket.addEventListener('message', (e) => {
        try {
          const { event, payload } = JSON.parse(e.data);
          onEvent(event, payload);
        } catch { }
      });
      socket.addEventListener('close', () => {
        failCount += 1;
        attempt += 1;
        if (failCount >= maxFail) {
          console.debug('Realtime socket failed too many times — stopping retries.');
          return;
        }
        const delay = Math.min(1000 * attempt, 10000);
        console.debug('Realtime socket closed, retrying in', delay, `(attempt ${attempt})`);
        setTimeout(connect, delay);
      });
      socket.addEventListener('error', () => socket.close());
    }

    connect();
    return () => socket && socket.close();
  }

  if (['/login', '/register'].includes(window.location.pathname)) {
    (async () => {
      try {
        const user = await loadLocale();
        if (user) {
          window.location.href = '/dashboard';
        }
      } catch (e) {
        // ignore — user is not authenticated
      }
    })();
  }

  function openModal(innerHtml) {
    closeModal(); // only one at a time
    const overlay = document.createElement('div');
    overlay.id = 'makit-modal-overlay';
    overlay.className = 'fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink/40 backdrop-blur-sm';
    overlay.innerHTML = `<div class="panel-raised max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 relative">${innerHtml}</div>`;
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', escHandler);
    document.body.appendChild(overlay);
  }

  function escHandler(e) {
    if (e.key === 'Escape') closeModal();
  }

  function closeModal() {
    const existing = document.getElementById('makit-modal-overlay');
    if (existing) existing.remove();
    document.removeEventListener('keydown', escHandler);
  }

  global.Makit = { api, renderLayout, escapeHtml, connectRealtime, openModal, closeModal, t, loadLocale, applyI18n, bindLanguageSelects, hasTranslation };
})(window);
