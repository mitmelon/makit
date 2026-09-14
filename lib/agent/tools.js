'use strict';

const { z } = require('zod');
const crypto = require('crypto');
const { ZodTool } = require('@strands-agents/sdk');
const { cacheGet, cacheSet } = require('../cache/redis');

function makeCustomDataTool({ store, taskId }) {
  return new ZodTool({
    name: 'get_business_custom_data',
    description:
      "Get the most recent custom data this business has streamed in for this task via their webhook — things like sales numbers, foot traffic, or notes the owner wants factored into the analysis. Always check this before finalizing, if the business has configured a webhook.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(50).default(10),
    }),
    callback: async ({ limit }) => {
      const entries = await store.listTaskData(taskId, { limit });
      if (!entries.length) {
        return { available: false, note: 'No custom data has been streamed in for this task yet.' };
      }
      return {
        available: true,
        entries: entries.map((e) => ({ receivedAt: e.receivedAt, data: e.data })),
      };
    },
  });
}

function makeWebSearchTool({ parallelApiKey }) {
  return new ZodTool({
    name: 'web_search',
    description:
      'Search the live web for current, hyper-local information the model needs to ground its analysis — economic conditions, local events, prices. Provide a clear objective and 2-3 diverse keyword queries; always include the city/area name and current month/year in at least one query. Broad or national-only queries are not useful for a local market read.',
    inputSchema: z.object({
      objective: z
        .string()
        .describe('A concise, self-contained research goal, e.g. "Current fuel price and transport cost trends in Akure, Nigeria"'),
      search_queries: z
        .array(z.string())
        .min(2)
        .max(3)
        .describe('2-3 diverse 3-6 word keyword queries, e.g. ["Akure fuel price August 2026", "Ondo State transport cost"]'),
      reason: z.string().describe('Why this specific search is needed'),
    }),
    callback: async ({ objective, search_queries }) => {
      if (!parallelApiKey) {
        return {
          error:
            'No search API key configured for this business. Answer using only what you already know, and mark uncertain signals as unknown rather than guessing.',
        };
      }

      // Ensure at least one query contains a time reference. Include full
      // current datetime (ISO) so the model and search client see exact time.
      // Also include the ISO datetime in the cache key so cached results are
      // keyed to the precise moment the search was issued (prevents stale
      // month-only hits when the intelligence must use current conditions).
      const now = new Date();
      const monthName = new Intl.DateTimeFormat('en', { month: 'long' }).format(now);
      const year = now.getFullYear();
      const monthYear = `${monthName} ${year}`;
      const isoNow = now.toISOString();

      const hasMonthOrYear = (q) => /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\b/i.test(q) || /\b\d{4}\b/.test(q) || /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(q);

      const queries = [...search_queries];
      if (!queries.some(hasMonthOrYear)) {
        // Append month/year and exact ISO datetime to the first query
        queries[0] = `${queries[0]} ${monthYear} ${isoNow}`;
      } else if (!queries.some((q) => /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(q))) {
        // If a month/year exists but no ISO datetime, append ISO datetime to
        // the first query so the search is explicitly time-stamped.
        queries[0] = `${queries[0]} ${isoNow}`;
      }

      const cacheKey = `search:${isoNow}:${crypto
        .createHash('md5')
        .update(JSON.stringify({ objective, search_queries: queries }))
        .digest('hex')}`;
      const cached = await cacheGet(cacheKey);
      if (cached) return cached;

      try {
        const Parallel = require('parallel-web').default;
        const client = new Parallel({ apiKey: parallelApiKey });
        const search = await client.search({
          objective: `${objective} (search datetime: ${isoNow})`,
          search_queries: queries,
          mode: 'basic', // quick retrieval with reasonable context depth — this is a background agent, not a live chat
        });

        const results = (search.results || []).slice(0, 6).flatMap((r) =>
          (r.excerpts || []).slice(0, 2).map((excerpt) => `[${r.title}](${r.url}): ${excerpt.slice(0, 400)}`)
        );

        const payload = { results: results.length ? results : ['No results found.'] };
        await cacheSet(cacheKey, payload, 86400); // 24h — matches the reference agent's cache window
        return payload;
      } catch (err) {
        return { error: `Search failed: ${err.message}` };
      }
    },
  });
}

module.exports = { makeCustomDataTool, makeWebSearchTool };
