'use strict';

const { runMakitPipeline, buildFullTranscript } = require('./orchestrator');
const { runScoutPass } = require('./scout');
const { buildModel } = require('./modelFactory');
const { decrypt } = require('../crypto');
const { publish } = require('../realtime/bus');
const { getLanguageName } = require('../i18n/locales');

async function buildFeedbackSummary(store, taskId) {
  const recentRuns = await store.listRunsForTask(taskId, { limit: 10 });
  const rated = recentRuns.filter((r) => r.feedback === 'helpful' || r.feedback === 'not_helpful');
  if (!rated.length) return '';
  const helpful = rated.filter((r) => r.feedback === 'helpful').length;
  const notHelpful = rated.length - helpful;
  return `${helpful} of the last ${rated.length} rated digests were marked helpful, ${notHelpful} were marked not helpful.`;
}

async function runScoutIfPossible({ store, task, apiKeyRecord, parallelApiKey, languageName }) {
  if (!parallelApiKey) return null; // no search key configured — nothing to scout with

  const model = buildModel(apiKeyRecord, task.modelId);
  const { result, messages } = await runScoutPass({
    model,
    parallelApiKey,
    businessProfile: { name: task.businessName, address: task.businessAddress, category: task.businessCategory },
    languageName,
    taskId: task.id,
  });

  const inserted = await store.insertFeedItems(task.id, result.feeds);
  await store.setCompetitors(task.id, result.competitors);
  await store.setOpportunities(task.id, result.opportunities);

  if (inserted.length) {
    publish(task.userId, 'feed:discovered', { taskId: task.id, count: inserted.length }).catch(() => {});
  }

  return buildFullTranscript([{ agent: 'Scout', messages }]);
}

/**
 * Executes one full Makit cycle for a task and persists the outcome
 * as a run record, whether it succeeds or fails. A failed run is not
 * a thrown exception the caller has to catch — it's a completed run
 * with status: 'failed' and a plain-language error, which is what the
 * task detail page displays. This matters in practice: a business
 * owner whose model key expired should see "your OpenAI key looks
 * invalid" on the dashboard, not a silent gap in their digest history.
 */
async function executeTaskRun({ store, task, notify }) {
  const run = await store.createRun({
    taskId: task.id,
    userId: task.userId,
    status: 'running',
    createdAt: Date.now(),
  });

  publish(task.userId, 'run:started', { taskId: task.id, runId: run.id }).catch(() => {});

  try {
    const apiKey = await store.findApiKeyById(task.apiKeyId, task.userId);
    if (!apiKey) throw new Error('The API key configured for this task no longer exists. Update it in Settings.');

    const owner = await store.findUserById(task.userId);
    const languageName = getLanguageName(owner?.language || 'en');

    const apiKeyRecord = { provider: apiKey.provider, decryptedKey: decrypt(apiKey.encryptedKey), region: apiKey.region };

    const parallelKey = task.parallelApiKeyId ? await store.findApiKeyById(task.parallelApiKeyId, task.userId) : null;
    const parallelApiKey = parallelKey ? decrypt(parallelKey.encryptedKey) : null;

    const mcpServerDocs = task.mcpServerIds?.length
      ? await store.findMcpServersByIds(task.mcpServerIds, task.userId)
      : [];
    const mcpServers = mcpServerDocs.map((s) => ({
      label: s.label,
      url: s.url,
      authToken: s.encryptedAuthToken ? decrypt(s.encryptedAuthToken) : '',
    }));

    const feedbackSummary = await buildFeedbackSummary(store, task.id);

    const { digest, transcript } = await runMakitPipeline({
      apiKeyRecord,
      modelId: task.modelId,
      store,
      taskId: task.id,
      businessProfile: { name: task.businessName, address: task.businessAddress, category: task.businessCategory },
      customInstructions: task.customInstructions,
      parallelApiKey,
      languageName,
      mcpServers,
      feedbackSummary,
    });

    const completed = await store.updateRun(run.id, {
      status: 'completed',
      digest,
      transcript,
      completedAt: Date.now(),
    });

    await store.updateTask(task.id, task.userId, { lastRunAt: Date.now(), lastRunStatus: 'completed' });

    publish(task.userId, 'run:completed', { taskId: task.id, run: completed }).catch(() => {});

    if (notify) await notify(task, completed).catch(() => {});

    runScoutIfPossible({ store, task, apiKeyRecord, parallelApiKey, languageName })
      .then(async (scoutTranscript) => {
        if (!scoutTranscript) return;
        const latest = await store.findRunById(run.id);
        if (!latest) return;
        await store.updateRun(run.id, { transcript: [...(latest.transcript || []), ...scoutTranscript] });
      })
      .catch((err) => {
        console.error(`Scout pass failed for task ${task.id}:`, err.message);
      });

    return completed;
  } catch (err) {
    const failed = await store.updateRun(run.id, {
      status: 'failed',
      error: err.message,
      completedAt: Date.now(),
    });
    await store.updateTask(task.id, task.userId, { lastRunAt: Date.now(), lastRunStatus: 'failed' });
    publish(task.userId, 'run:failed', { taskId: task.id, run: failed }).catch(() => {});
    return failed;
  }
}

module.exports = { executeTaskRun };
