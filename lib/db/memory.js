'use strict';

const { randomUUID } = require('crypto');

/**
 * Local-development data layer. Same interface as lib/db/mongo.js so
 * the rest of the app is agnostic to which one is active. Selected by
 * DB_DRIVER=memory (the default) — see lib/db/index.js.
 */
function createMemoryStore() {
  const users = new Map();
  const apiKeys = new Map();
  const mcpServers = new Map();
  const tasks = new Map();
  const runs = new Map();
  const taskData = new Map(); // taskId -> array
  const feedItems = new Map(); // taskId -> array
  const competitors = new Map(); // taskId -> array
  const opportunities = new Map(); // taskId -> array

  function clone(x) {
    return x ? JSON.parse(JSON.stringify(x)) : x;
  }

  return {
    // Users
    async createUser(user) {
      const id = randomUUID();
      const doc = { ...user, id };
      if ([...users.values()].some((u) => u.email === user.email)) {
        const err = new Error('E11000 duplicate key: email already registered');
        err.code = 11000;
        throw err;
      }
      users.set(id, doc);
      return clone(doc);
    },
    async findUserByEmail(email) {
      const found = [...users.values()].find((u) => u.email === email.toLowerCase());
      return clone(found);
    },
    async findUserById(id) {
      return clone(users.get(id));
    },
    async setUserLanguage(id, language) {
      const doc = users.get(id);
      if (!doc) return null;
      doc.language = language;
      return clone(doc);
    },

    // API keys
    async createApiKey(entry) {
      const id = randomUUID();
      const doc = { ...entry, id };
      apiKeys.set(id, doc);
      return clone(doc);
    },
    async listApiKeys(userId) {
      return [...apiKeys.values()]
        .filter((k) => k.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(clone);
    },
    async findApiKeyById(id, userId) {
      const doc = apiKeys.get(id);
      return doc && doc.userId === userId ? clone(doc) : null;
    },
    async deleteApiKey(id, userId) {
      const doc = apiKeys.get(id);
      if (!doc || doc.userId !== userId) return false;
      return apiKeys.delete(id);
    },

    // MCP servers — extra tool capabilities a business plugs into
    // their own Intelligence (e.g. a WhatsApp MCP for notifications).
    async createMcpServer(entry) {
      const id = randomUUID();
      const doc = { ...entry, id };
      mcpServers.set(id, doc);
      return clone(doc);
    },
    async listMcpServers(userId) {
      return [...mcpServers.values()]
        .filter((m) => m.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(clone);
    },
    async findMcpServerById(id, userId) {
      const doc = mcpServers.get(id);
      return doc && doc.userId === userId ? clone(doc) : null;
    },
    async findMcpServersByIds(ids, userId) {
      return ids
        .map((id) => mcpServers.get(id))
        .filter((doc) => doc && doc.userId === userId)
        .map(clone);
    },
    async deleteMcpServer(id, userId) {
      const doc = mcpServers.get(id);
      if (!doc || doc.userId !== userId) return false;
      return mcpServers.delete(id);
    },

    // Tasks
    async createTask(task) {
      const id = randomUUID();
      const doc = { ...task, id };
      tasks.set(id, doc);
      return clone(doc);
    },
    async listTasks(userId) {
      return [...tasks.values()]
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(clone);
    },
    async findTaskById(id, userId) {
      const doc = tasks.get(id);
      if (!doc) return null;
      if (userId && doc.userId !== userId) return null;
      return clone(doc);
    },
    async findTaskByWebhookToken(token) {
      const found = [...tasks.values()].find((t) => t.webhookToken === token);
      return clone(found);
    },
    async findDueTasks(now) {
      return [...tasks.values()]
        .filter((t) => t.status === 'active' && t.nextRunAt <= now)
        .map(clone);
    },
    async updateTask(id, userId, patch) {
      const doc = tasks.get(id);
      if (!doc || doc.userId !== userId) return null;
      Object.assign(doc, patch);
      return clone(doc);
    },
    async setTaskSchedule(id, patch) {
      const doc = tasks.get(id);
      if (!doc) return;
      Object.assign(doc, patch);
    },
    async deleteTask(id, userId) {
      const doc = tasks.get(id);
      if (!doc || doc.userId !== userId) return false;
      return tasks.delete(id);
    },

    // Runs
    async createRun(run) {
      const id = randomUUID();
      const doc = { ...run, id };
      runs.set(id, doc);
      return clone(doc);
    },
    async updateRun(id, patch) {
      const doc = runs.get(id);
      if (!doc) return null;
      Object.assign(doc, patch);
      return clone(doc);
    },
    async listRunsForTask(taskId, { limit = 30 } = {}) {
      return [...runs.values()]
        .filter((r) => r.taskId === taskId)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(clone);
    },
    async findRunById(id) {
      return clone(runs.get(id));
    },

    // Streamed custom data
    async insertTaskData(entry) {
      const id = randomUUID();
      const doc = { ...entry, id };
      if (!taskData.has(entry.taskId)) taskData.set(entry.taskId, []);
      taskData.get(entry.taskId).unshift(doc);
      // Bound growth per task.
      const arr = taskData.get(entry.taskId);
      if (arr.length > 200) arr.length = 200;
      return clone(doc);
    },
    async listTaskData(taskId, { limit = 50 } = {}) {
      return (taskData.get(taskId) || []).slice(0, limit).map(clone);
    },

    // Discovered feed items (news/social mentions) — deduplicated by
    // URL within a task, newest first, bounded so a business's list
    // doesn't grow forever.
    async insertFeedItems(taskId, items) {
      if (!items.length) return [];
      if (!feedItems.has(taskId)) feedItems.set(taskId, []);
      const existing = feedItems.get(taskId);
      const existingUrls = new Set(existing.map((f) => f.url));
      const now = Date.now();
      const fresh = items
        .filter((item) => !existingUrls.has(item.url))
        .map((item) => ({ ...item, id: randomUUID(), taskId, discoveredAt: now }));
      existing.unshift(...fresh);
      if (existing.length > 100) existing.length = 100;
      return fresh.map(clone);
    },
    async listFeedItemsForTask(taskId, { limit = 20 } = {}) {
      return (feedItems.get(taskId) || []).slice(0, limit).map(clone);
    },
    async listFeedItemsForUser(userId, taskIds, { limit = 20 } = {}) {
      const idSet = new Set(taskIds);
      const all = [...feedItems.values()].flat().filter((f) => idSet.has(f.taskId));
      return all
        .sort((a, b) => b.discoveredAt - a.discoveredAt)
        .slice(0, limit)
        .map(clone);
    },

    // Competitors — overwritten wholesale on each Scout pass, since
    // this is meant to reflect the current best read, not a history.
    async setCompetitors(taskId, list) {
      competitors.set(taskId, list.map((c) => ({ ...c, id: randomUUID() })));
    },
    async listCompetitors(taskId) {
      return (competitors.get(taskId) || []).map(clone);
    },

    // Opportunities (customer needs/pain points) — same overwrite
    // pattern as competitors: reflects the current best read.
    async setOpportunities(taskId, list) {
      opportunities.set(taskId, list.map((o) => ({ ...o, id: randomUUID() })));
    },
    async listOpportunities(taskId) {
      return (opportunities.get(taskId) || []).map(clone);
    },

    async ping() {
      return true;
    },
    async close() {
      // nothing to close
    },
  };
}

module.exports = { createMemoryStore };
