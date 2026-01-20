import { queryLLMJSON } from '../fireworks.js';
import { DM_SYSTEM_PROMPT, dmInitPrompt, dmResolutionPrompt } from '../prompts.js';

// Normalize object keys to lowercase (handles LLMs returning UPPERCASE keys)
function normalizeKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeKeys);

  const normalized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    normalized[lowerKey] = normalizeKeys(value);
  }
  return normalized;
}

export class DMAgent {
  constructor(model = null) {
    this.llmLogs = [];
    this.model = model;
  }

  setModel(model) {
    this.model = model;
  }

  async initializeWorld(seed, authorStyle = null, dmAuthorStyle = null) {
    const prompt = dmInitPrompt(seed, authorStyle, dmAuthorStyle);

    const result = await queryLLMJSON(prompt, {
      systemPrompt: DM_SYSTEM_PROMPT,
      model: this.model,
      role: 'dm-init',
      turn: 0
    });

    const parsed = normalizeKeys(result.parsed || {});

    const log = {
      type: 'dm_init',
      request: result.request,
      response: result.response,
      parsed: parsed,
      elapsed: result.elapsed
    };
    this.llmLogs.push(log);

    return {
      data: parsed,
      llmLog: log
    };
  }

  async resolveActions(worldState, characterActions, characterSpeech = [], dmInstructions = null, turn = null) {
    const prompt = dmResolutionPrompt(worldState, characterActions, characterSpeech, dmInstructions);

    const result = await queryLLMJSON(prompt, {
      systemPrompt: DM_SYSTEM_PROMPT,
      model: this.model,
      role: 'dm-resolve',
      turn
    });

    const parsed = normalizeKeys(result.parsed || {});

    const log = {
      type: 'dm_resolution',
      request: result.request,
      response: result.response,
      parsed: parsed,
      elapsed: result.elapsed
    };
    this.llmLogs.push(log);

    return {
      narrative: parsed.narrative || 'The scene continues...',
      sceneFocus: parsed.scenefocus || 'characters',
      sceneVisuals: parsed.scenevisuals || {},
      worldChanges: parsed.worldchanges || {},
      worldSummary: parsed.worldsummary || '',
      time: parsed.time || worldState.time || { day: 1, hour: 8, minute: 0 },
      arcUpdates: parsed.arcupdates || {},
      llmLog: log
    };
  }
}
