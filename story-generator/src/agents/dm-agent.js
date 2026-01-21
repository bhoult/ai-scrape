import { queryLLMJSON } from '../fireworks.js';
import { DM_SYSTEM_PROMPT, dmInitPrompt, dmResolutionPrompt, dmWorldResolutionPrompt, dmCharacterResolutionPrompt } from '../prompts.js';

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
    this.useSplitResolution = true; // Enable split resolution by default
  }

  setModel(model) {
    this.model = model;
  }

  async initializeWorld(seed, authorStyle = null, dmAuthorStyle = null, worldSize = 1) {
    const prompt = dmInitPrompt(seed, authorStyle, dmAuthorStyle, worldSize);

    const result = await queryLLMJSON(prompt, {
      systemPrompt: DM_SYSTEM_PROMPT,
      model: this.model,
      role: 'dm-init',
      turn: 0,
      requiredFields: ['location', 'characters', 'narrative']
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

  async resolveActions(worldState, characterActions, characterSpeech = [], dmInstructions = null, turn = null, characterPaths = {}) {
    // Use split resolution (two calls) for better item validation
    if (this.useSplitResolution) {
      return this.resolveActionsSplit(worldState, characterActions, characterSpeech, dmInstructions, turn, characterPaths);
    }

    // Legacy single-call resolution
    return this.resolveActionsLegacy(worldState, characterActions, characterSpeech, dmInstructions, turn, characterPaths);
  }

  // Legacy single-call resolution (kept for backward compatibility)
  async resolveActionsLegacy(worldState, characterActions, characterSpeech = [], dmInstructions = null, turn = null, characterPaths = {}) {
    const prompt = dmResolutionPrompt(worldState, characterActions, characterSpeech, dmInstructions, characterPaths);

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
      durationMinutes: parsed.durationminutes || 15,
      arcUpdates: parsed.arcupdates || {},
      llmLog: log
    };
  }

  // Split resolution - two calls for better item validation
  // Call 1: World changes (narrative, objects, characters, environment, arc)
  // Call 2: Character updates (given world state from Call 1)
  async resolveActionsSplit(worldState, characterActions, characterSpeech = [], dmInstructions = null, turn = null, characterPaths = {}) {
    console.log(`[DM Split Resolution] Call 1: World Resolution (turn ${turn})`);

    // === CALL 1: World Resolution ===
    const worldPrompt = dmWorldResolutionPrompt(worldState, characterActions, characterSpeech, dmInstructions, characterPaths);

    const worldResult = await queryLLMJSON(worldPrompt, {
      systemPrompt: DM_SYSTEM_PROMPT,
      model: this.model,
      role: 'dm-world-resolve',
      turn
    });

    const worldParsed = normalizeKeys(worldResult.parsed || {});

    const worldLog = {
      type: 'dm_world_resolution',
      request: worldResult.request,
      response: worldResult.response,
      parsed: worldParsed,
      elapsed: worldResult.elapsed
    };
    this.llmLogs.push(worldLog);

    // Extract world changes from Call 1
    const worldResolutionResult = {
      narrative: worldParsed.narrative || 'The scene continues...',
      sceneFocus: worldParsed.scenefocus || 'characters',
      sceneVisuals: worldParsed.scenevisuals || {},
      durationMinutes: worldParsed.durationminutes || 15,
      arcUpdates: worldParsed.arcupdates || {},
      worldChanges: worldParsed.worldchanges || {},
      worldSummary: worldParsed.worldsummary || ''
    };

    console.log(`[DM Split Resolution] Call 2: Character Resolution (turn ${turn})`);

    // === CALL 2: Character Resolution ===
    const charPrompt = dmCharacterResolutionPrompt(worldState, characterActions, worldResolutionResult);

    const charResult = await queryLLMJSON(charPrompt, {
      systemPrompt: DM_SYSTEM_PROMPT,
      model: this.model,
      role: 'dm-char-resolve',
      turn
    });

    const charParsed = normalizeKeys(charResult.parsed || {});

    const charLog = {
      type: 'dm_character_resolution',
      request: charResult.request,
      response: charResult.response,
      parsed: charParsed,
      elapsed: charResult.elapsed
    };
    this.llmLogs.push(charLog);

    // Merge character updates into world changes
    const mergedWorldChanges = {
      ...worldResolutionResult.worldChanges,
      characterupdates: charParsed.characterupdates || []
    };

    // Handle objectsToRemove from character updates - add to removedObjects
    const additionalRemovedObjects = [];
    for (const update of (charParsed.characterupdates || [])) {
      if (update.objectstoremove && Array.isArray(update.objectstoremove)) {
        additionalRemovedObjects.push(...update.objectstoremove);
      }
    }
    if (additionalRemovedObjects.length > 0) {
      const existingRemoved = mergedWorldChanges.removedobjects || [];
      mergedWorldChanges.removedobjects = [...existingRemoved, ...additionalRemovedObjects];
    }

    // Create combined log for display
    const combinedLog = {
      type: 'dm_resolution_split',
      worldResolution: worldLog,
      characterResolution: charLog,
      totalElapsed: (worldResult.elapsed || 0) + (charResult.elapsed || 0)
    };

    console.log(`[DM Split Resolution] Complete (total time: ${combinedLog.totalElapsed}ms)`);

    return {
      narrative: worldResolutionResult.narrative,
      sceneFocus: worldResolutionResult.sceneFocus,
      sceneVisuals: worldResolutionResult.sceneVisuals,
      worldChanges: mergedWorldChanges,
      worldSummary: worldResolutionResult.worldSummary,
      durationMinutes: worldResolutionResult.durationMinutes,
      arcUpdates: worldResolutionResult.arcUpdates,
      llmLog: combinedLog
    };
  }
}
