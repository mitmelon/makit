'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DB_PATH = path.join(process.cwd(), 'data', 'makit-db.json');

function ensureDbFile() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    if (!fs.existsSync(DB_PATH)) {
        const seed = {
            users: [],
            apiKeys: [],
            mcpServers: [],
            tasks: [],
            runs: [],
            taskData: [],
            feedItems: [],
            competitors: [],
            opportunities: [],
        };
        fs.writeFileSync(DB_PATH, JSON.stringify(seed, null, 2));
    }
}

function readDb() {
    ensureDbFile();
    try {
        const raw = fs.readFileSync(DB_PATH, 'utf8');
        const parsed = JSON.parse(raw);
        return {
            users: Array.isArray(parsed.users) ? parsed.users : [],
            apiKeys: Array.isArray(parsed.apiKeys) ? parsed.apiKeys : [],
            mcpServers: Array.isArray(parsed.mcpServers) ? parsed.mcpServers : [],
            tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
            runs: Array.isArray(parsed.runs) ? parsed.runs : [],
            taskData: Array.isArray(parsed.taskData) ? parsed.taskData : [],
            feedItems: Array.isArray(parsed.feedItems) ? parsed.feedItems : [],
            competitors: Array.isArray(parsed.competitors) ? parsed.competitors : [],
            opportunities: Array.isArray(parsed.opportunities) ? parsed.opportunities : [],
        };
    } catch (err) {
        fs.writeFileSync(DB_PATH, JSON.stringify({
            users: [],
            apiKeys: [],
            mcpServers: [],
            tasks: [],
            runs: [],
            taskData: [],
            feedItems: [],
            competitors: [],
            opportunities: [],
        }, null, 2));
        return readDb();
    }
}

function writeDb(db) {
    ensureDbFile();
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function clone(value) {
    return value === undefined ? value : JSON.parse(JSON.stringify(value));
}

function createFileStore() {
    const db = readDb();
    const persist = () => writeDb(db);

    const findByEmail = (email) => db.users.find((u) => u.email === String(email).toLowerCase());
    const findTaskIndex = (taskId) => db.tasks.findIndex((t) => t.id === taskId);
    const findRunIndex = (runId) => db.runs.findIndex((r) => r.id === runId);

    return {
        async createUser(user) {
            const email = String(user.email || '').toLowerCase();
            if (db.users.some((entry) => entry.email === email)) {
                const err = new Error('E11000 duplicate key: email already registered');
                err.code = 11000;
                throw err;
            }
            const doc = { ...user, id: randomUUID(), email };
            db.users.push(doc);
            persist();
            return clone(doc);
        },
        async findUserByEmail(email) {
            return clone(findByEmail(email));
        },
        async findUserById(id) {
            return clone(db.users.find((u) => u.id === id));
        },
        async setUserLanguage(id, language) {
            const user = db.users.find((entry) => entry.id === id);
            if (!user) return null;
            user.language = language;
            persist();
            return clone(user);
        },

        async createApiKey(entry) {
            const doc = { ...entry, id: randomUUID() };
            db.apiKeys.push(doc);
            persist();
            return clone(doc);
        },
        async listApiKeys(userId) {
            return clone(db.apiKeys.filter((k) => k.userId === userId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
        },
        async findApiKeyById(id, userId) {
            const doc = db.apiKeys.find((entry) => entry.id === id && entry.userId === userId);
            return clone(doc || null);
        },
        async deleteApiKey(id, userId) {
            const idx = db.apiKeys.findIndex((entry) => entry.id === id && entry.userId === userId);
            if (idx === -1) return false;
            db.apiKeys.splice(idx, 1);
            persist();
            return true;
        },

        async createMcpServer(entry) {
            const doc = { ...entry, id: randomUUID() };
            db.mcpServers.push(doc);
            persist();
            return clone(doc);
        },
        async listMcpServers(userId) {
            return clone(db.mcpServers.filter((m) => m.userId === userId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
        },
        async findMcpServerById(id, userId) {
            const doc = db.mcpServers.find((entry) => entry.id === id && entry.userId === userId);
            return clone(doc || null);
        },
        async findMcpServersByIds(ids, userId) {
            return clone(db.mcpServers.filter((entry) => ids.includes(entry.id) && entry.userId === userId));
        },
        async deleteMcpServer(id, userId) {
            const idx = db.mcpServers.findIndex((entry) => entry.id === id && entry.userId === userId);
            if (idx === -1) return false;
            db.mcpServers.splice(idx, 1);
            persist();
            return true;
        },

        async createTask(task) {
            const doc = { ...task, id: randomUUID() };
            db.tasks.push(doc);
            persist();
            return clone(doc);
        },
        async listTasks(userId) {
            return clone(db.tasks.filter((t) => t.userId === userId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
        },
        async findTaskById(id, userId) {
            const task = db.tasks.find((entry) => entry.id === id && (!userId || entry.userId === userId));
            return clone(task || null);
        },
        async findTaskByWebhookToken(token) {
            const task = db.tasks.find((entry) => entry.webhookToken === token);
            return clone(task || null);
        },
        async findDueTasks(now) {
            return clone(db.tasks.filter((t) => t.status === 'active' && t.nextRunAt <= now));
        },
        async updateTask(id, userId, patch) {
            const idx = db.tasks.findIndex((entry) => entry.id === id && entry.userId === userId);
            if (idx === -1) return null;
            db.tasks[idx] = { ...db.tasks[idx], ...patch };
            persist();
            return clone(db.tasks[idx]);
        },
        async setTaskSchedule(id, patch) {
            const task = db.tasks.find((entry) => entry.id === id);
            if (!task) return;
            Object.assign(task, patch);
            persist();
        },
        async deleteTask(id, userId) {
            const idx = db.tasks.findIndex((entry) => entry.id === id && entry.userId === userId);
            if (idx === -1) return false;
            db.tasks.splice(idx, 1);
            persist();
            return true;
        },

        async createRun(run) {
            const doc = { ...run, id: randomUUID() };
            db.runs.push(doc);
            persist();
            return clone(doc);
        },
        async updateRun(id, patch) {
            const idx = db.runs.findIndex((entry) => entry.id === id);
            if (idx === -1) return null;
            db.runs[idx] = { ...db.runs[idx], ...patch };
            persist();
            return clone(db.runs[idx]);
        },
        async listRunsForTask(taskId, { limit = 30 } = {}) {
            return clone(db.runs.filter((r) => r.taskId === taskId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, limit));
        },
        async findRunById(id) {
            return clone(db.runs.find((entry) => entry.id === id) || null);
        },

        async insertTaskData(entry) {
            const doc = { ...entry, id: randomUUID() };
            db.taskData.push(doc);
            while (db.taskData.filter((item) => item.taskId === entry.taskId).length > 200) {
                const first = db.taskData.findIndex((item) => item.taskId === entry.taskId && item.id !== doc.id);
                if (first === -1) break;
                db.taskData.splice(first, 1);
            }
            persist();
            return clone(doc);
        },
        async listTaskData(taskId, { limit = 50 } = {}) {
            return clone(db.taskData.filter((entry) => entry.taskId === taskId).sort((a, b) => (b.receivedAt || 0) - (a.receivedAt || 0)).slice(0, limit));
        },

        async insertFeedItems(taskId, items) {
            if (!items.length) return [];
            const existingUrls = new Set(db.feedItems.filter((f) => f.taskId === taskId).map((f) => f.url));
            const discoveredAt = Date.now();
            const fresh = items
                .filter((item) => !existingUrls.has(item.url))
                .map((item) => ({ ...item, id: randomUUID(), taskId, discoveredAt }));
            db.feedItems.push(...fresh);
            if (db.feedItems.length > 1000) {
                db.feedItems = db.feedItems.filter((f) => f.taskId === taskId ? true : db.feedItems.filter((x) => x.taskId === f.taskId).length <= 1000);
            }
            persist();
            return clone(fresh);
        },
        async listFeedItemsForTask(taskId, { limit = 20 } = {}) {
            return clone(db.feedItems.filter((f) => f.taskId === taskId).sort((a, b) => (b.discoveredAt || 0) - (a.discoveredAt || 0)).slice(0, limit));
        },
        async listFeedItemsForUser(userId, taskIds, { limit = 20 } = {}) {
            const idSet = new Set(taskIds);
            const all = db.feedItems.filter((item) => idSet.has(item.taskId));
            return clone(all.sort((a, b) => (b.discoveredAt || 0) - (a.discoveredAt || 0)).slice(0, limit));
        },

        async setCompetitors(taskId, list) {
            db.competitors = db.competitors.filter((entry) => entry.taskId !== taskId);
            const docs = list.map((c) => ({ ...c, id: randomUUID(), taskId }));
            db.competitors.push(...docs);
            persist();
        },
        
        async listCompetitors(taskId) {
            return clone(db.competitors.filter((entry) => entry.taskId === taskId));
        },

        async setOpportunities(taskId, list) {
            db.opportunities = db.opportunities.filter((entry) => entry.taskId !== taskId);
            const docs = list.map((o) => ({ ...o, id: randomUUID(), taskId }));
            db.opportunities.push(...docs);
            persist();
        },
        async listOpportunities(taskId) {
            return clone(db.opportunities.filter((entry) => entry.taskId === taskId));
        },

        async ping() {
            return true;
        },

        async close() {
            // no-op for file-backed storage
        },
    };
}

module.exports = { createFileStore };
