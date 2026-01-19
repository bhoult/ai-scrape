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

  async initializeWorld(seed) {
    const prompt = dmInitPrompt(seed);

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

  async resolveActions(worldState, characterActions, dmInstructions = null) {
    const prompt = dmResolutionPrompt(worldState, characterActions, dmInstructions);

    const result = await queryLLMJSON(prompt, {
      systemPrompt: DM_SYSTEM_PROMPT,
      model: this.model,
      role: 'dm-resolve'
    });

    const log = {
      type: 'dm_resolution',
      request: result.request,
      response: result.response,
      parsed: result.parsed,
      elapsed: result.elapsed
    };
    this.llmLogs.push(log);

    return {
      narrative: result.parsed.narrative,
      sceneFocus: result.parsed.sceneFocus || 'characters',
      sceneVisuals: result.parsed.sceneVisuals || {},
      worldChanges: result.parsed.worldChanges,
      worldSummary: result.parsed.worldSummary,
      time: result.parsed.time,
      arcUpdates: result.parsed.arcUpdates,
      llmLog: log
    };
  }
}
