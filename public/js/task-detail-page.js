const taskId = window.location.pathname.split('/').pop();
let task = null;
let currentWebhookUrl = '';
let activeDevDocsLang = 'curl';

const STATUS_META = {
    buy: { badgeClass: 'badge-buy', dotClass: 'bg-signal-buy', labelKey: 'status_buy_label', explainKey: 'status_buy_explain' },
    cautious: { badgeClass: 'badge-caution', dotClass: 'bg-signal-caution', labelKey: 'status_cautious_label', explainKey: 'status_cautious_explain' },
    slow: { badgeClass: 'badge-slow', dotClass: 'bg-signal-slow', labelKey: 'status_slow_label', explainKey: 'status_slow_explain' },
    rest: { badgeClass: 'badge-rest', dotClass: 'bg-signal-rest', labelKey: 'status_rest_label', explainKey: 'status_rest_explain' },
    danger: { badgeClass: 'badge-danger', dotClass: 'bg-signal-danger', labelKey: 'status_danger_label', explainKey: 'status_danger_explain' },
};

function statusPill(status) {
    const meta = STATUS_META[status];
    if (!meta) return `<span class="badge-neutral">${Makit.escapeHtml(status || '')}</span>`;
    return `<span class="${meta.badgeClass}"><span class="dot bg-current"></span>${Makit.t(meta.labelKey)}</span>`;
}

function renderMarketStrengthCard(status) {
    const section = document.getElementById('market-strength-section');
    const meta = STATUS_META[status];
    if (!meta) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    section.innerHTML = `
    <div class="relative group inline-block">
      <div class="${meta.badgeClass} !text-[15px] !px-4 !py-2 cursor-help shadow-card">
        <span class="dot ${meta.dotClass}" style="width:8px;height:8px"></span>
        ${Makit.t(meta.labelKey)}
      </div>
      <div class="absolute left-0 top-full mt-2 w-80 max-w-[85vw] panel-raised p-4 z-30 opacity-0 invisible scale-95 origin-top-left group-hover:opacity-100 group-hover:visible group-hover:scale-100 transition-all duration-200 ease-out">
        <p class="text-[13px] text-ink leading-relaxed">${Makit.escapeHtml(Makit.t(meta.explainKey))}</p>
      </div>
    </div>
  `;
}

function renderDigest(digest) {
    return `
    <div class="flex items-center justify-between mb-4">
      ${statusPill(digest.status)}
      <span class="text-[12px] text-ink-faint">Confidence ${Math.round(digest.confidence * 100)}%</span>
    </div>
    <p class="text-[16px] text-ink font-medium mb-4">${Makit.escapeHtml(digest.headline)}</p>
    <ul class="space-y-1.5 mb-5">
      ${digest.whats_happening.map((s) => `<li class="text-[14px] text-ink-soft leading-relaxed">&middot; ${Makit.escapeHtml(s)}</li>`).join('')}
    </ul>
    <div class="border-t border-line pt-4">
      <p class="text-[13px] font-semibold text-ink-soft uppercase tracking-wide mb-1">What to do today</p>
      <p class="text-[14px] text-ink">${Makit.escapeHtml(digest.what_to_do)}</p>
    </div>
  `;
}

function marketStatusColor(status) {
    const value = String(status || '').toLowerCase();
    const palette = {
        buy: '#22c55e', good: '#22c55e', positive: '#22c55e',
        cautious: '#f59e0b', neutral: '#f59e0b',
        slow: '#f97316', danger: '#ef4444', negative: '#ef4444',
        failed: '#cbd5e1', rest: '#64748b',
    };
    return palette[value] || '#a3a3a3';
}

function renderTrend(runs) {
    const el = document.getElementById('trend-chart');
    const ordered = [...runs].reverse();
    if (!ordered.length) {
        el.innerHTML = '<p class="text-[13px] text-ink-faint">No runs yet.</p>';
        return;
    }

    function normalizeTs(v) {
        const n = Number(v || 0);
        if (!Number.isFinite(n)) return 0;
        // if timestamp looks like seconds (10 digits) convert to ms
        if (n < 1e12) return n * 1000;
        return n;
    }

    const scores = ordered.map((r) => {
        const base = Number(r.digest?.confidence ?? (r.status === 'completed' ? 0.7 : 0.15));
        return Math.max(0, Math.min(1, Number.isFinite(base) ? base : 0.15));
    });
    const maxScore = Math.max(...scores, 0.2);

    el.innerHTML = `
    <div class="flex h-full w-full items-end justify-between gap-2 overflow-hidden">
      ${ordered.map((r) => {
        const score = Number(r.digest?.confidence ?? (r.status === 'completed' ? 0.7 : 0.15));
        const safeScore = Math.max(0, Math.min(1, Number.isFinite(score) ? score : 0.15));
        const percent = Math.round(safeScore * 100);
        const height = Math.max(16, Math.round((safeScore / maxScore) * 100));
        const label = new Date(normalizeTs(r.createdAt)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        const status = r.digest?.status || r.status || 'rest';
        const color = marketStatusColor(status);
        return `
          <div class="group relative flex h-full flex-1 min-w-0 flex-col items-center justify-end overflow-hidden">
            <span class="mb-1 text-[10px] font-medium text-ink-soft">${percent}%</span>
            <div class="relative flex h-full w-full items-end justify-center">
              <div class="w-full max-w-[44px] rounded-t-[8px] shadow-sm transition-all duration-200 border border-black/5 overflow-hidden" style="height:${height}%; background: linear-gradient(180deg, ${color} 0%, ${color}dd 100%);" title="${new Date(normalizeTs(r.createdAt)).toLocaleString()} · ${status} · ${percent}%"></div>
            </div>
            <span class="mt-1 text-[10px] text-ink-faint">${label}</span>
          </div>
        `;
    }).join('')}
    </div>
  `;
}

function feedbackButtons(run) {
    const helpfulActive = run.feedback === 'helpful';
    const notHelpfulActive = run.feedback === 'not_helpful';
    return `
    <div class="flex items-center gap-1.5">
      <button class="feedback-btn ${helpfulActive ? 'btn-primary' : 'btn-secondary'} btn-sm" data-run-id="${run.id}" data-value="helpful" title="Helpful">👍</button>
      <button class="feedback-btn ${notHelpfulActive ? 'btn-primary' : 'btn-secondary'} btn-sm" data-run-id="${run.id}" data-value="not_helpful" title="Not helpful">👎</button>
    </div>
  `;
}

function renderRichText(value) {
    const safe = Makit.escapeHtml(String(value ?? ''));
    const withStrong = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    const withEm = withStrong.replace(/(^|[^*])\*(.+?)\*(?!\*)/g, '$1<em>$2</em>');
    const withLinks = withEm.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return withLinks.replace(/\n\s*[-*]\s+/g, '<br/>• ').replace(/\n/g, '<br/>');
}

function transcriptEntryHtml(m) {
    const agent = m?.agent || 'Agent';
    const rawContent = Array.isArray(m?.content) ? m.content : [m?.content || ''];
    const blocks = rawContent.flatMap((entry) => String(entry || '').split(/\n+/)).filter((line) => line && line.trim()).map((line) => `<p class="text-[12.5px] leading-relaxed text-ink-soft">${renderRichText(line.trim())}</p>`).join('');
    const toolLike = rawContent.some((line) => String(line || '').startsWith('[called') || String(line || '').startsWith('[tool result'));

    return `
    <div class="rounded-[12px] border border-line bg-surface-sunken/70 p-3 ${toolLike ? 'opacity-80' : ''}">
      <div class="mb-2 flex items-center justify-between gap-3">
        <span class="text-[11px] font-semibold uppercase tracking-[0.08em] ${toolLike ? 'text-ink-faint' : 'text-accent'}">${Makit.escapeHtml(agent)}</span>
        <span class="text-[10px] text-ink-faint">${toolLike ? 'tool trace' : 'analysis'}</span>
      </div>
      <div class="space-y-1.5">${blocks || '<p class="text-[12.5px] text-ink-faint">No reasoning details recorded.</p>'}</div>
    </div>
  `;
}

function renderRuns(runs) {
    const list = document.getElementById('runs-list');
    if (!runs.length) {
        list.innerHTML = '<p class="text-[14px] text-ink-soft panel p-8 text-center">No runs yet — click "Run now" to see the agent work.</p>';
        return;
    }
    list.innerHTML = runs.map((r) => {
        const when = new Date(r.createdAt).toLocaleString();
        if (r.status === 'failed') {
            return `<div class="panel p-5"><div class="flex items-center gap-2 mb-2"><span class="badge-slow"><span class="dot bg-current"></span>Failed</span><span class="text-[12px] text-ink-faint">${when}</span></div><p class="text-[13px] text-ink-soft">${Makit.escapeHtml(r.error || 'Unknown error')}</p></div>`;
        }
        const transcriptId = `t-${r.id}`;
        const transcript = Array.isArray(r.transcript) ? r.transcript : [];
        const entryCount = transcript.length;
        return `<div class="panel p-5"><div class="flex items-center justify-between gap-3 mb-3"><div class="flex items-center gap-2 flex-wrap">${statusPill(r.digest?.status)}<span class="text-[12px] text-ink-faint">${when}</span></div><div class="flex items-center gap-3">${feedbackButtons(r)}<button class="text-[13px] text-accent font-medium shrink-0" onclick="document.getElementById('${transcriptId}').classList.toggle('hidden')">View reasoning (${entryCount})</button></div></div><p class="text-[14px] text-ink leading-relaxed">${Makit.escapeHtml(r.digest?.headline || '')}</p><div id="${transcriptId}" class="hidden mt-4 pt-4 border-t border-line space-y-3">${entryCount ? transcript.map(transcriptEntryHtml).join('') : '<p class="text-[13px] text-ink-faint">No reasoning captured for this run.</p>'}</div></div>`;
    }).join('');

    document.querySelectorAll('.feedback-btn').forEach((btn) =>
        btn.addEventListener('click', async () => {
            const runId = btn.dataset.runId;
            const currentValue = btn.classList.contains('btn-primary') ? btn.dataset.value : null;
            const nextValue = currentValue === btn.dataset.value ? null : btn.dataset.value;
            try {
                await Makit.api(`/api/tasks/${taskId}/runs/${runId}/feedback`, { method: 'POST', body: { feedback: nextValue } });
                const { runs: refreshed } = await Makit.api(`/api/tasks/${taskId}/runs`);
                renderRuns(refreshed);
            } catch (err) {
                console.error(err);
            }
        })
    );
}

function faviconFor(url) {
    try {
        const host = new URL(url).hostname;
        return `https://www.google.com/s2/favicons?domain=${host}&sz=64`;
    } catch {
        return '';
    }
}

let currentOpportunities = [];

function sentimentColor(sentiment) {
    return marketStatusColor(sentiment);
}

function openConversationModal(o) {
    Makit.openModal(`
    <button onclick="Makit.closeModal()" class="absolute top-4 right-4 text-ink-soft hover:text-ink">
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none"><path d="M5 5L15 15M15 5L5 15" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>
    </button>
    <div class="flex items-center gap-2 mb-3">
      <span class="dot" style="background:${sentimentColor(o.sentiment)}; width:10px; height:10px;"></span>
      <span class="text-[12px] text-ink-soft capitalize">${Makit.escapeHtml(o.sentiment)} &middot; ${o.mentionCount} mention${o.mentionCount === 1 ? '' : 's'}</span>
    </div>
    <h3 class="text-[18px] font-semibold text-ink mb-3 leading-snug">${Makit.escapeHtml(o.theme)}</h3>
    <p class="text-[14px] text-ink-soft leading-relaxed mb-4">${Makit.escapeHtml(o.whatPeopleAreSaying)}</p>
    <div class="bg-surface-sunken rounded-[10px] p-4">
      <p class="text-[12px] font-semibold text-ink-soft uppercase tracking-wide mb-1">What to do</p>
      <p class="text-[14px] text-ink">${Makit.escapeHtml(o.suggestion)}</p>
    </div>
  `);
}

function renderConversationsChart(opportunities) {
    const section = document.getElementById('conversations-section');
    const container = document.getElementById('conversations-chart');
    currentOpportunities = opportunities;

    if (!opportunities.length) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');

    const counts = opportunities.map((o) => Number(o.mentionCount || 1));
    const maxCount = Math.max(...counts, 1);

    const bars = opportunities.map((o, i) => {
        const count = Number(o.mentionCount || 1);
        const relativeHeight = Math.max(16, (count / maxCount) * 100);
        const color = sentimentColor(o.sentiment);
        const label = o.theme || `Pattern ${i + 1}`;

        return `
      <div class="group flex flex-1 min-w-0 flex-col items-center justify-end gap-2 px-1 conversation-bar" data-idx="${i}">
        <div class="flex h-[150px] w-full items-end justify-center overflow-hidden">
          <button type="button" class="w-full max-w-[46px] rounded-t-[10px] border border-black/5 shadow-sm transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-md focus:outline-none" title="${Makit.escapeHtml(label)} — ${count} mentions" style="height:${relativeHeight}%; background: linear-gradient(180deg, ${color} 0%, ${color}cc 100%);">
            <span class="sr-only">${Makit.escapeHtml(label)}: ${count} mentions</span>
          </button>
        </div>
        <div class="text-center min-w-0">
          <div class="text-[10px] font-medium text-ink-soft">${count}</div>
          <div class="mt-1 text-[10px] text-ink-faint truncate max-w-[70px]">${Makit.escapeHtml(label)}</div>
        </div>
      </div>
    `;
    }).join('');

    container.innerHTML = `
      <div class="relative h-full w-full overflow-hidden">
        <div class="absolute inset-x-0 bottom-8 top-0 flex items-end justify-between gap-2">
          ${bars}
        </div>
        <div class="absolute inset-x-0 bottom-0 flex justify-between px-2 pt-2 text-[10px] text-ink-faint border-t border-line">
          <span class="flex items-center gap-1"><span class="inline-block rounded-full" style="width:8px;height:8px;background:${marketStatusColor('negative')}"></span>Negative</span>
          <span class="flex items-center gap-1"><span class="inline-block rounded-full" style="width:8px;height:8px;background:${marketStatusColor('neutral')}"></span>Neutral</span>
          <span class="flex items-center gap-1"><span class="inline-block rounded-full" style="width:8px;height:8px;background:${marketStatusColor('positive')}"></span>Positive</span>
        </div>
      </div>
    `;

    container.querySelectorAll('.conversation-bar').forEach((el) => {
        el.addEventListener('click', () => openConversationModal(currentOpportunities[Number(el.dataset.idx)]));
    });
}

function renderOpportunities(opportunities) {
    const section = document.getElementById('opportunities-section');
    const list = document.getElementById('opportunities-list');
    if (!opportunities.length) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    list.innerHTML = opportunities.map((o) => `
    <div class="panel p-5">
      <p class="text-[14px] font-semibold text-ink mb-2">${Makit.escapeHtml(o.theme)}</p>
      <p class="text-[13px] text-ink-soft leading-relaxed mb-3">${Makit.escapeHtml(o.whatPeopleAreSaying)}</p>
      <div class="bg-surface-sunken rounded-[10px] p-3">
        <p class="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-1">What to do</p>
        <p class="text-[13px] text-ink">${Makit.escapeHtml(o.suggestion)}</p>
      </div>
    </div>
  `).join('');
}

function renderCompetitors(competitors) {
    const section = document.getElementById('competitors-section');
    const list = document.getElementById('competitors-list');
    if (!competitors.length) {
        section.classList.add('hidden');
        return;
    }
    section.classList.remove('hidden');
    list.innerHTML = competitors.map((c) => `
    <div class="panel p-5">
      <p class="text-[14px] font-semibold text-ink mb-1.5">${Makit.escapeHtml(c.name)}</p>
      <p class="text-[13px] text-ink-soft mb-3">${Makit.escapeHtml(c.whatTheyDo)}</p>
      <p class="text-[12px] text-ink-faint mb-2"><span class="font-medium text-ink-soft">Doing well:</span> ${Makit.escapeHtml(c.advantage)}</p>
      <div class="bg-surface-sunken rounded-[10px] p-3">
        <p class="text-[11px] font-semibold text-ink-soft uppercase tracking-wide mb-1">How to compete</p>
        <p class="text-[13px] text-ink">${Makit.escapeHtml(c.howToCompete)}</p>
      </div>
    </div>
  `).join('');
}

function renderTaskFeeds(feeds) {
    const section = document.getElementById('task-feeds-section');
    const table = document.getElementById('task-feeds-table');
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
        btn.addEventListener('click', () => openConversationModal(feeds[Number(btn.dataset.idx)]))
    );
}

async function loadIntel() {
    const { feeds, competitors, opportunities } = await Makit.api(`/api/tasks/${taskId}/feeds`);
    renderConversationsChart(opportunities);
    renderOpportunities(opportunities);
    renderCompetitors(competitors);
    renderTaskFeeds(feeds);
}

async function loadCustomData() {
    const { entries, webhookUrl, uploadUrl } = await Makit.api(`/api/tasks/${taskId}/data`);
    currentWebhookUrl = window.location.origin + webhookUrl;
    document.getElementById('webhook-url').textContent = currentWebhookUrl;
    const list = document.getElementById('custom-data-list');
    list.innerHTML = entries.length ? entries.slice(0, 5).map((e) => {
        const source = e.source === 'upload' ? 'upload' : 'webhook';
        const label = e.filename ? `${e.filename}` : source;
        return `<div class="text-[12px] font-mono text-ink-soft bg-surface-sunken rounded-[8px] px-3 py-2"><div class="mb-1 flex items-center justify-between gap-2"><span class="font-medium text-ink">${Makit.escapeHtml(label)}</span><span class="text-ink-faint">${source}</span></div>${new Date(e.receivedAt).toLocaleString()} — ${Makit.escapeHtml(JSON.stringify(e.data))}</div>`;
    }).join('') : '<p class="text-[13px] text-ink-faint">Nothing streamed in yet.</p>';

    const statusEl = document.getElementById('upload-status');
    if (statusEl) {
        statusEl.textContent = uploadUrl ? 'Ready to upload' : 'Upload unavailable';
    }
}

function devDocsSample(lang, url) {
    const payload = '{"sales_today": 145000, "note": "slower than usual, fuel price went up"}';
    if (lang === 'curl') {
        return `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${payload.replace(/\n\s*/g, ' ')}'`;
    }
    if (lang === 'javascript') {
        return `await fetch("${url}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${payload}),\n});`;
    }
    return `import requests\n\nrequests.post(\n    "${url}",\n    json=${payload},\n)`;
}

function renderDevDocsCode() {
    document.getElementById('dev-docs-code').textContent = devDocsSample(activeDevDocsLang, currentWebhookUrl || '(load the page fully to see your URL)');
    document.querySelectorAll('.dev-docs-tab').forEach((btn) => {
        btn.className = btn.dataset.lang === activeDevDocsLang ? 'dev-docs-tab btn-primary btn-sm' : 'dev-docs-tab btn-secondary btn-sm';
    });
}

const toggleDevDocsBtn = document.getElementById('toggle-dev-docs');
if (toggleDevDocsBtn) {
    toggleDevDocsBtn.addEventListener('click', () => {
        const panel = document.getElementById('dev-docs-panel');
        if (!panel) return;
        const isHidden = panel.classList.contains('hidden');
        panel.classList.toggle('hidden');
        const arrow = document.getElementById('dev-docs-arrow');
        if (arrow) arrow.textContent = isHidden ? '↓' : '→';
        if (isHidden) renderDevDocsCode();
    });
}

document.querySelectorAll('.dev-docs-tab').forEach((btn) =>
    btn.addEventListener('click', () => {
        activeDevDocsLang = btn.dataset.lang;
        renderDevDocsCode();
    })
);

async function loadTaskPage() {
    const { task: t } = await Makit.api(`/api/tasks/${taskId}`);
    task = t;
    document.getElementById('task-name').textContent = t.name;
    document.getElementById('edit-link').href = `/tasks/new?edit=${taskId}`;
    document.getElementById('task-sub').textContent = `${t.businessName} · ${t.businessCategory || ''} · ${t.businessAddress}`;
    document.getElementById('pause-btn').textContent = t.status === 'paused' ? Makit.t('resume') : Makit.t('pause');

    const { runs } = await Makit.api(`/api/tasks/${taskId}/runs`);
    const orderedRuns = [...runs].sort((a, b) => normalizeTs(b.createdAt) - normalizeTs(a.createdAt));
    const latestCompleted = orderedRuns.find((r) => r.status === 'completed') || orderedRuns[0];

    renderTrend(orderedRuns);
    renderRuns(orderedRuns);

    if (latestCompleted && latestCompleted.digest) {
        document.getElementById('latest-digest-section').classList.remove('hidden');
        document.getElementById('latest-digest').innerHTML = renderDigest(latestCompleted.digest);
        renderMarketStrengthCard(latestCompleted.digest.status);
    } else {
        document.getElementById('latest-digest-section').classList.add('hidden');
    }

    await loadCustomData();
    await loadIntel();
}

document.getElementById('run-btn').addEventListener('click', async () => {
    const btn = document.getElementById('run-btn');
    btn.disabled = true;
    btn.textContent = 'Running…';
    try {
        const result = await Makit.api(`/api/tasks/${taskId}/run`, { method: 'POST' });
        if (result.queued) {
            btn.textContent = 'Queued…';
            return;
        }
    } catch (err) {
        // no-op
    }
    btn.disabled = false;
    btn.textContent = Makit.t('run_now');
    loadTaskPage();
});

document.getElementById('pause-btn').addEventListener('click', async () => {
    const nextStatus = task.status === 'paused' ? 'active' : 'paused';
    await Makit.api(`/api/tasks/${taskId}`, { method: 'PATCH', body: { status: nextStatus } });
    loadTaskPage();
});

document.getElementById('delete-btn').addEventListener('click', async () => {
    if (!confirm(`Delete "${task?.name || 'this Intelligence'}"? This cannot be undone.`)) return;
    try {
        await Makit.api(`/api/tasks/${taskId}`, { method: 'DELETE' });
        const dashboardHref = window.location.pathname.startsWith('/tasks/') ? '../dashboard' : './dashboard';
        window.location.href = dashboardHref;
    } catch (err) {
        alert(err.message);
    }
});

document.querySelectorAll('.data-mode-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
        const mode = btn.dataset.dataMode;
        document.querySelectorAll('.data-panel').forEach((panel) => panel.classList.add('hidden'));
        document.querySelectorAll('.data-mode-toggle').forEach((toggle) => {
            toggle.classList.toggle('btn-primary', toggle === btn);
            toggle.classList.toggle('btn-secondary', toggle !== btn);
        });
        const target = document.getElementById(mode === 'upload' ? 'upload-data-panel' : 'stream-data-panel');
        if (target) target.classList.remove('hidden');
    });
});

const uploadDataForm = document.getElementById('upload-data-form');
if (uploadDataForm) {
    uploadDataForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = document.getElementById('business-data-file');
        const file = input && input.files && input.files[0];
        if (!file) {
            const uploadStatus = document.getElementById('upload-status');
            if (uploadStatus) uploadStatus.textContent = 'Choose a file first';
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        const uploadStatus = document.getElementById('upload-status');
        const progressBar = document.getElementById('upload-progress-bar');
        const submitBtn = event.currentTarget.querySelector('button[type="submit"]');

        if (submitBtn) submitBtn.disabled = true;
        if (uploadStatus) uploadStatus.textContent = 'Uploading…';
        if (progressBar) progressBar.style.width = '0%';

        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/tasks/${taskId}/data/upload`);
        xhr.upload.addEventListener('progress', (e) => {
            if (!e.lengthComputable) return;
            const pct = Math.round((e.loaded / e.total) * 100);
            if (progressBar) progressBar.style.width = `${pct}%`;
            if (uploadStatus) uploadStatus.textContent = `Uploading… ${pct}%`;
        });
        xhr.addEventListener('load', async () => {
            const response = (() => {
                try { return JSON.parse(xhr.responseText || '{}'); } catch { return {}; }
            })();
            if (submitBtn) submitBtn.disabled = false;
            if (xhr.status >= 200 && xhr.status < 300) {
                if (uploadStatus) uploadStatus.textContent = 'Upload complete';
                if (progressBar) progressBar.style.width = '100%';
                if (input) input.value = '';
                await loadCustomData();
                setTimeout(() => {
                    if (uploadStatus) uploadStatus.textContent = 'Ready to upload';
                    if (progressBar) progressBar.style.width = '0%';
                }, 1200);
            } else {
                if (uploadStatus) uploadStatus.textContent = response.error || 'Upload failed';
                if (progressBar) progressBar.style.width = '0%';
            }
        });
        xhr.addEventListener('error', () => {
            if (submitBtn) submitBtn.disabled = false;
            if (uploadStatus) uploadStatus.textContent = 'Upload failed';
            if (progressBar) progressBar.style.width = '0%';
        });
        xhr.send(formData);
    });
}

const copyWebhookBtn = document.getElementById('copy-webhook');
if (copyWebhookBtn) {
    copyWebhookBtn.addEventListener('click', () => {
        const urlEl = document.getElementById('webhook-url');
        if (urlEl && navigator.clipboard) {
            navigator.clipboard.writeText(urlEl.textContent);
        }
    });
}

const rotateWebhookBtn = document.getElementById('rotate-webhook');
if (rotateWebhookBtn) {
    rotateWebhookBtn.addEventListener('click', async () => {
        if (!confirm('This will invalidate the current webhook URL. Continue?')) return;
        await Makit.api(`/api/tasks/${taskId}/rotate-webhook`, { method: 'POST' });
        loadCustomData();
    });
}

Makit.renderLayout('dashboard');
loadTaskPage().catch((err) => console.error(err));

Makit.connectRealtime((event, payload) => {
    if (payload?.taskId !== taskId) return;
    if (event === 'run:completed' || event === 'run:failed') {
        const btn = document.getElementById('run-btn');
        btn.disabled = false;
        btn.textContent = Makit.t('run_now');
    }
    loadTaskPage().catch((err) => console.error(err));
});
