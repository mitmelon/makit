'use strict';

const { MongoClient, ObjectId } = require('mongodb');
const config = require('../config');

/**
 * Production data layer backed by MongoDB via the native driver.
 * Every method here has an identical counterpart in memory.js, so the
 * rest of the app never branches on which store is active — see
 * lib/db/index.js.
 */
async function createMongoStore() {
  const client = new MongoClient(config.db.mongoUrl);
  await client.connect();
  const db = client.db(config.db.dbName);

  const users = db.collection('users');
  const apiKeys = db.collection('api_keys');
  const mcpServers = db.collection('mcp_servers');
  const tasks = db.collection('tasks');
  const runs = db.collection('runs');
  const taskData = db.collection('task_data');
  const feedItems = db.collection('feed_items');
  const competitorsCol = db.collection('competitors');
  const opportunitiesCol = db.collection('opportunities');

  await Promise.all([
    users.createIndex({ email: 1 }, { unique: true }),
    apiKeys.createIndex({ userId: 1 }),
    mcpServers.createIndex({ userId: 1 }),
    tasks.createIndex({ userId: 1 }),
    tasks.createIndex({ webhookToken: 1 }, { unique: true, sparse: true }),
    runs.createIndex({ taskId: 1, createdAt: -1 }),
    taskData.createIndex({ taskId: 1, receivedAt: -1 }),
    feedItems.createIndex({ taskId: 1, discoveredAt: -1 }),
    feedItems.createIndex({ taskId: 1, url: 1 }, { unique: true }),
    competitorsCol.createIndex({ taskId: 1 }),
    opportunitiesCol.createIndex({ taskId: 1 }),
  ]);

  const oid = (id) => (id instanceof ObjectId ? id : new ObjectId(id));
  const strip = (doc) => (doc ? { ...doc, id: String(doc._id), _id: undefined } : doc);

  return {
    // Users
    async createUser(user) {
      const res = await users.insertOne(user);
      return strip({ ...user, _id: res.insertedId });
    },
    async findUserByEmail(email) {
      return strip(await users.findOne({ email: email.toLowerCase() }));
    },
    async findUserById(id) {
      return strip(await users.findOne({ _id: oid(id) }));
    },
    async setUserLanguage(id, language) {
      await users.updateOne({ _id: oid(id) }, { $set: { language } });
      return strip(await users.findOne({ _id: oid(id) }));
    },

    // API keys (encrypted before they reach this layer)
    async createApiKey(entry) {
      const res = await apiKeys.insertOne(entry);
      return strip({ ...entry, _id: res.insertedId });
    },
    async listApiKeys(userId) {
      const docs = await apiKeys.find({ userId }).sort({ createdAt: -1 }).toArray();
      return docs.map(strip);
    },
    async findApiKeyById(id, userId) {
      return strip(await apiKeys.findOne({ _id: oid(id), userId }));
    },
    async deleteApiKey(id, userId) {
      const res = await apiKeys.deleteOne({ _id: oid(id), userId });
      return res.deletedCount > 0;
    },

    // MCP servers
    async createMcpServer(entry) {
      const res = await mcpServers.insertOne(entry);
      return strip({ ...entry, _id: res.insertedId });
    },
    async listMcpServers(userId) {
      const docs = await mcpServers.find({ userId }).sort({ createdAt: -1 }).toArray();
      return docs.map(strip);
    },
    async findMcpServerById(id, userId) {
      return strip(await mcpServers.findOne({ _id: oid(id), userId }));
    },
    async findMcpServersByIds(ids, userId) {
      const docs = await mcpServers.find({ _id: { $in: ids.map(oid) }, userId }).toArray();
      return docs.map(strip);
    },
    async deleteMcpServer(id, userId) {
      const res = await mcpServers.deleteOne({ _id: oid(id), userId });
      return res.deletedCount > 0;
    },

    // Tasks
    async createTask(task) {
      const res = await tasks.insertOne(task);
      return strip({ ...task, _id: res.insertedId });
    },
    async listTasks(userId) {
      const docs = await tasks.find({ userId }).sort({ createdAt: -1 }).toArray();
      return docs.map(strip);
    },
    async findTaskById(id, userId) {
      const query = userId ? { _id: oid(id), userId } : { _id: oid(id) };
      return strip(await tasks.findOne(query));
    },
    async findTaskByWebhookToken(token) {
      return strip(await tasks.findOne({ webhookToken: token }));
    },
    async findDueTasks(now) {
      const docs = await tasks
        .find({ status: 'active', nextRunAt: { $lte: now } })
        .toArray();
      return docs.map(strip);
    },
    async updateTask(id, userId, patch) {
      await tasks.updateOne({ _id: oid(id), userId }, { $set: patch });
      return strip(await tasks.findOne({ _id: oid(id) }));
    },
    async setTaskSchedule(id, patch) {
      await tasks.updateOne({ _id: oid(id) }, { $set: patch });
    },
    async deleteTask(id, userId) {
      const res = await tasks.deleteOne({ _id: oid(id), userId });
      return res.deletedCount > 0;
    },

    // Runs (agent reports)
    async createRun(run) {
      const res = await runs.insertOne(run);
      return strip({ ...run, _id: res.insertedId });
    },
    async updateRun(id, patch) {
      await runs.updateOne({ _id: oid(id) }, { $set: patch });
      return strip(await runs.findOne({ _id: oid(id) }));
    },
    async listRunsForTask(taskId, { limit = 30 } = {}) {
      const docs = await runs.find({ taskId }).sort({ createdAt: -1 }).limit(limit).toArray();
      return docs.map(strip);
    },
    async findRunById(id) {
      return strip(await runs.findOne({ _id: oid(id) }));
    },

    // Streamed custom data (webhook ingestion)
    async insertTaskData(entry) {
      const res = await taskData.insertOne(entry);
      return strip({ ...entry, _id: res.insertedId });
    },
    async listTaskData(taskId, { limit = 50 } = {}) {
      const docs = await taskData.find({ taskId }).sort({ receivedAt: -1 }).limit(limit).toArray();
      return docs.map(strip);
    },

    // Discovered feed items — deduplicated by (taskId, url) via the
    // unique index above, so re-inserting an already-seen URL is a
    // safe no-op rather than a duplicate row.
    async insertFeedItems(taskId, items) {
      if (!items.length) return [];
      const now = Date.now();
      const docs = items.map((item) => ({ ...item, taskId, discoveredAt: now }));
      const inserted = [];
      for (const doc of docs) {
        try {
          const res = await feedItems.insertOne(doc);
          inserted.push(strip({ ...doc, _id: res.insertedId }));
        } catch (err) {
          if (err.code !== 11000) throw err; // 11000 = duplicate url for this task, skip silently
        }
      }
      return inserted;
    },
    async listFeedItemsForTask(taskId, { limit = 20 } = {}) {
      const docs = await feedItems.find({ taskId }).sort({ discoveredAt: -1 }).limit(limit).toArray();
      return docs.map(strip);
    },
    async listFeedItemsForUser(userId, taskIds, { limit = 20 } = {}) {
      const docs = await feedItems
        .find({ taskId: { $in: taskIds } })
        .sort({ discoveredAt: -1 })
        .limit(limit)
        .toArray();
      return docs.map(strip);
    },

    // Competitors — overwritten wholesale per task on each Scout pass.
    async setCompetitors(taskId, list) {
      await competitorsCol.deleteMany({ taskId });
      if (list.length) await competitorsCol.insertMany(list.map((c) => ({ ...c, taskId })));
    },
    async listCompetitors(taskId) {
      const docs = await competitorsCol.find({ taskId }).toArray();
      return docs.map(strip);
    },

    // Opportunities (customer needs/pain points) — same overwrite
    // pattern as competitors.
    async setOpportunities(taskId, list) {
      await opportunitiesCol.deleteMany({ taskId });
      if (list.length) await opportunitiesCol.insertMany(list.map((o) => ({ ...o, taskId })));
    },
    async listOpportunities(taskId) {
      const docs = await opportunitiesCol.find({ taskId }).toArray();
      return docs.map(strip);
    },

    async ping() {
      await db.command({ ping: 1 });
      return true;
    },

    async close() {
      await client.close();
    },
  };
}

module.exports = { createMongoStore };
