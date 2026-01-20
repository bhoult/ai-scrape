import { queryLLMJSON } from '../fireworks.js';
import { PLAYER_SYSTEM_PROMPT, playerThinkTalkPrompt, playerActionPrompt } from '../prompts.js';

export class PlayerAgent {
  constructor(character, model = null) {
    this.character = character;
    this.model = model;
  }

  setModel(model) {
    this.model = model;
  }

  // Phase 1: Think and Talk - player considers situation and speaks to nearby characters
  async thinkAndTalk(worldState, recentHistory, previousTurnDialogue = [], turn = null) {
    const prompt = playerThinkTalkPrompt(this.character, worldState, recentHistory, previousTurnDialogue);

    const characterName = this.character.name.toLowerCase().replace(/\s+/g, '-');
    const result = await queryLLMJSON(prompt, {
      systemPrompt: PLAYER_SYSTEM_PROMPT,
      model: this.model,
      role: `player-${characterName}-think`,
      turn
    });

    return {
      character: this.character,
      thinking: result.parsed.thinking,
      intendedAction: result.parsed.intendedAction,
      speech: result.parsed.speech,
      llmLog: {
        type: 'player_think_talk',
        character: this.character.name,
        request: result.request,
        response: result.response,
        parsed: result.parsed,
        elapsed: result.elapsed
      }
    };
  }

  // Phase 2: Action - player hears what others said and decides final action
  async decideAction(worldState, recentHistory, nearbyDialogue = [], turn = null) {
    const prompt = playerActionPrompt(this.character, worldState, recentHistory, nearbyDialogue);

    const characterName = this.character.name.toLowerCase().replace(/\s+/g, '-');
    const result = await queryLLMJSON(prompt, {
      systemPrompt: PLAYER_SYSTEM_PROMPT,
      model: this.model,
      role: `player-${characterName}-action`,
      turn
    });

    return {
      character: this.character,
      thinking: result.parsed.thinking,
      action: result.parsed.action,
      dialogue: result.parsed.dialogue,
      llmLog: {
        type: 'player_action',
        character: this.character.name,
        request: result.request,
        response: result.response,
        parsed: result.parsed,
        elapsed: result.elapsed
      }
    };
  }
}
