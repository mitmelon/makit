'use strict';

const path = require('path');
const config = require('../config');

function createTaskMemory(taskId) {
  const { MemoryManager } = require('@strands-agents/sdk');
  const { FileMemoryStore } = require('@strands-agents/sdk/vended-memory-stores/file-memory-store');
  const { LocalFileStorage } = require('@strands-agents/sdk/storage');

  const baseDir = path.join(config.memory.baseDir, `task-${taskId}`);
  const storage = new LocalFileStorage(baseDir);

  const store = new FileMemoryStore({
    name: `task-${taskId}`,
    storage,
    extraction: {
      systemPrompt:
        'Extract durable facts worth remembering across future runs for this specific business: named competitors and what you learned about them, recurring customer needs or complaints, and patterns in local market conditions. Do not extract one-off daily numbers (today\'s exact fuel price, today\'s exact sentiment) — those go stale. Extract things that stay true for weeks or months.',
    },
  });

  const memoryManager = new MemoryManager({
    stores: [store],
    injection: true, // fold relevant prior memory into context automatically
  });

  return {
    memoryManager,
    flush: () => memoryManager.flush(),
  };
}

module.exports = { createTaskMemory };
