import { queryLLMJSON } from '../fireworks.js';
import { DM_SYSTEM_PROMPT, dmInitPrompt, dmResolutionPrompt } from '../prompts.js';

export class DMAgent {
  constructor(model = null) {
    this.llmLogs = [];
    this.model = model;
  }

  setModel(model) {
    this.model = model;
  }

  async initializeWorld(seed, authorStyle = null) {
    const prompt = dmInitPrompt(seed, authorStyle);

    const result = await queryLLMJSON(prompt, {
      systemPrompt: DM_SYSTEM_PROMPT,
      model: this.model,
      role: 'dm-init'
    });

    const log = {
      type: 'dm_init',
      request: result.request,
      response: result.response,
      parsed: result.parsed,
      elapsed: result.elapsed
    };
    this.llmLogs.push(log);

    return {
      data: result.parsed,
      llmLog: log
    };
  }

  async resolveActions(worldState, characterActions, characterSpeech = [], dmInstructions = null) {
    const prompt = dmResolutionPrompt(worldState, characterActions, characterSpeech, dmInstructions);

    const result = await queryLLMJSON(prompt, {
      systemPrompt: DM_SYSTEM_PROMPT,
      model: this.model,
      role: 'dm-resolve'
    });

    const parsed = result.parsed || {};

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
      sceneFocus: parsed.sceneFocus || 'characters',
      sceneVisuals: parsed.sceneVisuals || {},
      worldChanges: parsed.worldChanges || {},
      worldSummary: parsed.worldSummary || '',
      time: parsed.time || worldState.time || { day: 1, hour: 8, minute: 0 },
      arcUpdates: parsed.arcUpdates || {},
      llmLog: log
    };
  }
}
