document.querySelectorAll('input[name="scheduleType"]').forEach((r) =>
    r.addEventListener('change', () => {
        const isDaily = document.querySelector('input[name="scheduleType"]:checked').value === 'daily';
        document.getElementById('daily-fields').classList.toggle('hidden', !isDaily);
        document.getElementById('interval-fields').classList.toggle('hidden', isDaily);
    })
);

async function loadModels() {
    const { models } = await Makit.api('/api/keys/models');

    const modelSelect = document.getElementById('modelSelect');
    if (!models.length) {
        document.getElementById('no-keys-warning').classList.remove('hidden');
        document.getElementById('submit-btn').disabled = true;
        return;
    }

    const byKey = new Map();
    models.forEach((m) => {
        if (!byKey.has(m.apiKeyId)) byKey.set(m.apiKeyId, []);
        byKey.get(m.apiKeyId).push(m);
    });

    modelSelect.innerHTML = [...byKey.values()]
        .map(
            (group) =>
                `<optgroup label="${Makit.escapeHtml(group[0].providerLabel)} — ${Makit.escapeHtml(group[0].apiKeyLabel)}">` +
                group.map((m) => `<option value="${m.modelId}" data-api-key-id="${m.apiKeyId}">${Makit.escapeHtml(m.label)}</option>`).join('') +
                `</optgroup>`
        )
        .join('');

    const { keys: allKeys } = await Makit.api('/api/keys');
    const parallelKeys = allKeys.filter((k) => k.provider === 'parallel');
    const parallelSelect = document.getElementById('parallelKeySelect');
    parallelKeys.forEach((k) => {
        const opt = document.createElement('option');
        opt.value = k.id;
        opt.textContent = k.label;
        parallelSelect.appendChild(opt);
    });
}

async function loadMcpCheckboxes() {
    const { servers } = await Makit.api('/api/mcp');
    const container = document.getElementById('mcp-checkboxes');
    if (!servers.length) {
        document.getElementById('no-mcp-hint').classList.remove('hidden');
        return;
    }
    container.innerHTML = servers
        .map(
            (s) => `
        <label class="flex items-center gap-2.5 text-[14px] text-ink">
          <input type="checkbox" class="mcp-checkbox" value="${s.id}" />
          ${Makit.escapeHtml(s.label)}
          <span class="text-[12px] text-ink-faint truncate">${Makit.escapeHtml(s.url)}</span>
        </label>
      `
        )
        .join('');
}

document.getElementById('task-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    const errorEl = document.getElementById('error');
    errorEl.classList.add('hidden');

    const modelSelect = document.getElementById('modelSelect');
    const apiKeyId = modelSelect.selectedOptions[0]?.dataset.apiKeyId;

    const scheduleType = document.querySelector('input[name="scheduleType"]:checked').value;
    const schedule =
        scheduleType === 'daily'
            ? { type: 'daily', time: document.getElementById('dailyTime').value, timezone: document.getElementById('timezone').value }
            : { type: 'interval', minutes: parseInt(document.getElementById('intervalMinutes').value, 10) };

    const parallelApiKeyId = document.getElementById('parallelKeySelect').value || undefined;
    const mcpServerIds = Array.from(document.querySelectorAll('.mcp-checkbox:checked')).map((cb) => cb.value);

    const notify = {
        email: { enabled: document.getElementById('emailEnabled').checked, address: document.getElementById('emailAddress').value },
        telegram: {
            enabled: document.getElementById('telegramEnabled').checked,
            botToken: document.getElementById('telegramBotToken').value,
            chatId: document.getElementById('telegramChatId').value,
        },
    };

    btn.disabled = true;
    btn.textContent = editTaskId ? 'Saving…' : 'Creating…';
    try {
        const body = {
            name: document.getElementById('name').value,
            businessName: document.getElementById('businessName').value,
            businessAddress: document.getElementById('businessAddress').value,
            businessCategory: document.getElementById('businessCategory').value,
            customInstructions: document.getElementById('customInstructions').value,
            apiKeyId,
            modelId: modelSelect.value,
            parallelApiKeyId,
            mcpServerIds,
            schedule,
            notify,
        };
        const { task } = editTaskId
            ? await Makit.api(`/api/tasks/${editTaskId}`, { method: 'PATCH', body })
            : await Makit.api('/api/tasks', { method: 'POST', body });
        location.href = `/tasks/${task.id}`;
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = editTaskId ? 'Save changes' : 'Create Intelligence';
    }
});

const editTaskId = new URLSearchParams(location.search).get('edit');

async function prefillForEdit() {
    if (!editTaskId) return;
    const { task } = await Makit.api(`/api/tasks/${editTaskId}`);

    document.getElementById('name').value = task.name;
    document.getElementById('businessName').value = task.businessName;
    document.getElementById('businessAddress').value = task.businessAddress;
    document.getElementById('businessCategory').value = task.businessCategory || '';
    document.getElementById('customInstructions').value = task.customInstructions || '';

    if (task.schedule.type === 'daily') {
        document.querySelector('input[name="scheduleType"][value="daily"]').checked = true;
        document.getElementById('dailyTime').value = task.schedule.time;
        document.getElementById('timezone').value = task.schedule.timezone;
    } else {
        document.querySelector('input[name="scheduleType"][value="interval"]').checked = true;
        document.getElementById('intervalMinutes').value = task.schedule.minutes;
    }
    document.getElementById('daily-fields').classList.toggle('hidden', task.schedule.type !== 'daily');
    document.getElementById('interval-fields').classList.toggle('hidden', task.schedule.type !== 'interval');

    const modelSelect = document.getElementById('modelSelect');
    if ([...modelSelect.options].some((o) => o.value === task.modelId)) modelSelect.value = task.modelId;
    const parallelSelect = document.getElementById('parallelKeySelect');
    if (task.parallelApiKeyId && [...parallelSelect.options].some((o) => o.value === task.parallelApiKeyId)) {
        parallelSelect.value = task.parallelApiKeyId;
    }
    (task.mcpServerIds || []).forEach((id) => {
        const cb = document.querySelector(`.mcp-checkbox[value="${id}"]`);
        if (cb) cb.checked = true;
    });

    if (task.notify?.email) {
        document.getElementById('emailEnabled').checked = !!task.notify.email.enabled;
        document.getElementById('emailAddress').value = task.notify.email.address || '';
    }
    if (task.notify?.telegram) {
        document.getElementById('telegramEnabled').checked = !!task.notify.telegram.enabled;
        document.getElementById('telegramBotToken').value = task.notify.telegram.botToken || '';
        document.getElementById('telegramChatId').value = task.notify.telegram.chatId || '';
    }

    document.getElementById('submit-btn').textContent = 'Save changes';
}

Makit.renderLayout('dashboard', { title: editTaskId ? 'Edit Intelligence' : 'New Intelligence' });
Promise.all([loadModels(), loadMcpCheckboxes()]).then(prefillForEdit).catch((err) => console.error(err));
