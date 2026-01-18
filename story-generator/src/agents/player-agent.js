import { queryLLMJSON } from '../fireworks.js';
import { PLAYER_SYSTEM_PROMPT, playerActionPrompt } from '../prompts.js';

export class PlayerAgent {
  constructor(character) {
    this.character = character;
  }

  async decideAction(worldState, recentHistory) {
    const prompt = playerActionPrompt(this.character, worldState, recentHistory);

    const result = await queryLLMJSON(prompt, {
      systemPrompt: PLAYER_SYSTEM_PROMPT
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
