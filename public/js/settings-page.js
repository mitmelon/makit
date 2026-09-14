async function load() {
    const { keys } = await Makit.api('/api/keys');
    const list = document.getElementById('key-list');
    list.innerHTML = keys.length
        ? keys
            .map(
                (k) => `
        <div class="flex items-center justify-between bg-surface-sunken rounded-[10px] px-4 py-3">
          <div>
            <p class="text-[14px] text-ink font-medium">${Makit.escapeHtml(k.label)}</p>
            <p class="text-[12px] text-ink-soft capitalize">${k.provider}</p>
          </div>
          <button data-id="${k.id}" class="delete-key text-[13px] text-[#c62b21] font-medium">Remove</button>
        </div>`
            )
            .join('')
        : '<p class="text-[13px] text-ink-faint">No keys added yet.</p>';

    document.querySelectorAll('.delete-key').forEach((btn) =>
        btn.addEventListener('click', async () => {
            await Makit.api(`/api/keys/${btn.dataset.id}`, { method: 'DELETE' });
            load();
        })
    );
}

async function loadRegions() {
    const { regions } = await Makit.api('/api/keys/regions');
    document.getElementById('bedrock-region').innerHTML = regions
        .map((r) => `<option value="${r.code}">${r.label}</option>`)
        .join('');
}

function syncProviderFields() {
    const provider = document.getElementById('provider').value;
    const isBedrock = provider === 'bedrock';
    document.getElementById('bedrock-fields').classList.toggle('hidden', !isBedrock);
    document.getElementById('single-key-fields').classList.toggle('hidden', isBedrock);
    document.getElementById('single-key').required = !isBedrock;
    const keyLabels = { gemini: 'Your Gemini API key', parallel: 'Your Parallel API key' };
    document.getElementById('single-key').placeholder = keyLabels[provider] || 'Your API key';
}

document.getElementById('provider').addEventListener('change', syncProviderFields);
syncProviderFields();
loadRegions().catch((err) => console.error(err));

document.getElementById('key-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('error');
    errorEl.classList.add('hidden');
    const provider = document.getElementById('provider').value;
    const label = document.getElementById('label').value;
    const body =
        provider === 'bedrock'
            ? {
                provider,
                label,
                region: document.getElementById('bedrock-region').value,
                accessKeyId: document.getElementById('bedrock-access-key').value,
                secretAccessKey: document.getElementById('bedrock-secret-key').value,
            }
            : { provider, label, key: document.getElementById('single-key').value };
    try {
        await Makit.api('/api/keys', { method: 'POST', body });
        document.getElementById('key-form').reset();
        syncProviderFields();
        load();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    }
});

async function loadMcpServers() {
    const { servers } = await Makit.api('/api/mcp');
    const list = document.getElementById('mcp-list');
    list.innerHTML = servers.length
        ? servers
            .map(
                (s) => `
        <div class="flex items-center justify-between bg-surface-sunken rounded-[10px] px-4 py-3">
          <div class="min-w-0">
            <p class="text-[14px] text-ink font-medium">${Makit.escapeHtml(s.label)}</p>
            <p class="text-[12px] text-ink-soft truncate">${Makit.escapeHtml(s.url)}</p>
          </div>
          <button data-id="${s.id}" class="delete-mcp text-[13px] text-[#c62b21] font-medium shrink-0 ml-3">Remove</button>
        </div>`
            )
            .join('')
        : '<p class="text-[13px] text-ink-faint">No MCP servers connected yet.</p>';

    document.querySelectorAll('.delete-mcp').forEach((btn) =>
        btn.addEventListener('click', async () => {
            await Makit.api(`/api/mcp/${btn.dataset.id}`, { method: 'DELETE' });
            loadMcpServers();
        })
    );
}

document.getElementById('mcp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('mcp-error');
    errorEl.classList.add('hidden');
    try {
        await Makit.api('/api/mcp', {
            method: 'POST',
            body: {
                label: document.getElementById('mcp-label').value,
                url: document.getElementById('mcp-url').value,
                authToken: document.getElementById('mcp-token').value,
            },
        });
        document.getElementById('mcp-form').reset();
        loadMcpServers();
    } catch (err) {
        errorEl.textContent = err.message;
        errorEl.classList.remove('hidden');
    }
});

Makit.renderLayout('settings', { titleKey: 'settings_title' }).then(() => {
    document.getElementById('language-label').textContent = Makit.t('language_label');
});
load().catch((err) => console.error(err));
loadMcpServers().catch((err) => console.error(err));
