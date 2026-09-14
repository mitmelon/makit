function statusBadge(task) {
    const map = { completed: 'badge-good', failed: 'badge-slow' };
    if (!task.lastRunStatus) return '<span class="badge-neutral"><span class="dot bg-ink-faint"></span>Not run yet</span>';
    const cls = map[task.lastRunStatus] || 'badge-neutral';
    const label = task.lastRunStatus === 'completed' ? 'Last run OK' : 'Last run failed';
    return `<span class="${cls}"><span class="dot bg-current"></span>${label}</span>`;
}

function scheduleLabel(schedule) {
    if (schedule.type === 'daily') return `Daily at ${schedule.time} (${schedule.timezone})`;
    if (schedule.type === 'interval') return `Every ${schedule.minutes} min`;
    return '';
}

function timeAgo(ts) {
    if (!ts) return 'never';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    return `${Math.round(s / 86400)}d ago`;
}

function statIcon(path, gradient) {
    return `<div class="w-9 h-9 rounded-[10px] ${gradient ? 'bg-grad-accent' : 'bg-surface-sunken'} flex items-center justify-center mb-4">
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">${path}</svg>
  </div>`;
}

function renderStatCards(tasks) {
    const el = document.getElementById('stat-cards');
    if (!tasks.length) {
        el.classList.add('hidden');
        return;
    }
    el.classList.remove('hidden');

    const total = tasks.length;
    const active = tasks.filter((t) => t.status === 'active').length;
    const healthy = tasks.filter((t) => t.lastRunStatus === 'completed').length;
    const attention = tasks.filter((t) => t.lastRunStatus === 'failed').length;

    const cards = [
        { label: 'Total Intelligence', value: total, icon: statIcon('<rect x="3" y="3" width="14" height="14" rx="3" stroke="white" stroke-width="1.6"/><path d="M6.5 10L9 12.5L13.5 7.5" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>', true) },
        { label: 'Actively scanning', value: active, icon: statIcon('<circle cx="10" cy="10" r="3" stroke="currentColor" stroke-width="1.6" class="text-ink"/><path d="M10 2.5V5M10 15V17.5M17.5 10H15M5 10H2.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" class="text-ink"/>') },
        { label: 'Reporting healthy', value: healthy, icon: statIcon('<path d="M4 10.5L8 14.5L16 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" class="text-signal-good"/>') },
        { label: 'Needs attention', value: attention, icon: statIcon('<path d="M10 7V11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" class="text-signal-slow"/><circle cx="10" cy="14" r="0.9" fill="currentColor" class="text-signal-slow"/><circle cx="10" cy="10" r="7" stroke="currentColor" stroke-width="1.6" class="text-signal-slow"/>') },
    ];

    el.innerHTML = cards.map((c) => `
    <div class="bento p-5">
      ${c.icon}
      <p class="stat-value !text-[26px]">${c.value}</p>
      <p class="stat-label mt-1">${c.label}</p>
    </div>
  `).join('');
}

function faviconFor(url) {
    try {
        const host = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
    } catch {
        return '';
    }
}

function openFeedModal(feed) {
    Makit.openModal(`
    <button onclick="Makit.closeModal()" class="absolute top-4 right-4 text-ink-soft hover:text-ink">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <div class="flex items-center gap-3 mb-4">
      <img src="${faviconFor(feed.url)}" class="w-8 h-8 rounded-[8px]" alt="" onerror="this.style.display='none'" />
      <span class="text-[13px] text-ink-soft">${Makit.escapeHtml(feed.source)}</span>
    </div>
    <h3 class="text-[18px] font-semibold text-ink mb-3 leading-snug">${Makit.escapeHtml(feed.title)}</h3>
    <p class="text-[14px] text-ink-soft leading-relaxed mb-4">${Makit.escapeHtml(feed.snippet)}</p>
    <div class="bg-surface-sunken rounded-[10px] p-4 mb-5">
      <p class="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-1">Why this matters</p>
      <p class="text-[14px] text-ink">${Makit.escapeHtml(feed.relevance)}</p>
    </div>
    <a href="${feed.url}" target="_blank" rel="noopener noreferrer" class="btn-secondary btn-sm">Read full source &rarr;</a>
  `);
}

async function loadFeeds() {
    const { feeds } = await Makit.api('/api/tasks/feeds/latest?limit=12');
    const section = document.getElementById('feeds-section');
    const table = document.getElementById('feeds-table');
    if (!feeds.length) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    table.innerHTML = feeds.map((f, i) => `
    <button data-idx="${i}" class="feed-row w-full text-left flex items-center gap-4 px-5 py-4 hover:bg-surface-sunken transition-colors ${i > 0 ? 'border-t border-line' : ''}">
      <img src="${faviconFor(f.url)}" class="w-9 h-9 rounded-[8px] shrink-0" alt="" onerror="this.style.display='none'" />
      <div class="min-w-0 flex-1">
        <p class="text-[14px] font-medium text-ink truncate">${Makit.escapeHtml(f.title)}</p>
        <p class="text-[12px] text-ink-soft truncate">${Makit.escapeHtml(f.source)} &middot; ${Makit.escapeHtml(f.snippet)}</p>
      </div>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" class="shrink-0 text-ink-faint"><path d="M7.5 5L12.5 10L7.5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </button>
  `).join('');
    table.querySelectorAll('.feed-row').forEach((btn) =>
        btn.addEventListener('click', () => openFeedModal(feeds[Number(btn.dataset.idx)]))
    );
}

async function loadDashboardTasks() {
    const { tasks } = await Makit.api('/api/tasks');
    const list = document.getElementById('task-list');
    const empty = document.getElementById('empty-state');

    renderStatCards(tasks);

    if (!tasks.length) {
        empty.classList.remove('hidden');
        return;
    }

    list.innerHTML = tasks.map((t) => `
    <a href="./tasks/${t.id}" class="panel p-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between hover:shadow-raised hover:-translate-y-px transition-all block">
      <div class="flex items-start gap-4 min-w-0">
        <div class="w-10 h-10 rounded-[10px] bg-grad-accent flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3 15L7 9L11 12L17 4" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2.5 mb-1">
            <p class="text-[15px] font-semibold text-ink break-words">${Makit.escapeHtml(t.name)}</p>
            ${t.status === 'paused' ? '<span class="badge-neutral">Paused</span>' : ''}
          </div>
          <p class="text-[13px] text-ink-soft break-words">${Makit.escapeHtml(t.businessName)} &middot; ${Makit.escapeHtml(scheduleLabel(t.schedule))}</p>
        </div>
      </div>
      <div class="flex items-center gap-4 sm:justify-end">
        <p class="text-[13px] text-ink-faint hidden sm:block">Last run ${timeAgo(t.lastRunAt)}</p>
        ${statusBadge(t)}
      </div>
    </a>
  `).join('');
}

Makit.renderLayout('dashboard', { titleKey: 'dashboard_title', subtitleKey: 'dashboard_subtitle' }).then(() => {
    document.getElementById('topbar-actions').innerHTML = `<a href="./tasks/new" class="btn-accent btn-sm">${Makit.t('new_intelligence')}</a>`;
    document.getElementById('empty-title').textContent = Makit.t('no_intelligence_yet');
    document.getElementById('empty-body').textContent = Makit.t('empty_state_body');
    document.getElementById('empty-cta').textContent = Makit.t('create_first');
    document.getElementById('feeds-heading').textContent = Makit.t('latest_feeds');
});

loadDashboardTasks().catch((err) => console.error(err));
loadFeeds().catch((err) => console.error(err));

Makit.connectRealtime((event) => {
    if (['run:started', 'run:completed', 'run:failed'].includes(event)) {
        loadDashboardTasks().catch((err) => console.error(err));
    }
    if (event === 'feed:discovered') {
        loadFeeds().catch((err) => console.error(err));
    }
});
