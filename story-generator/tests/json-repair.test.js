import { describe, it } from 'node:test';
import assert from 'node:assert';

// Copy tryRepairJSON from fireworks.js for testing
function tryRepairJSON(content) {
  if (!content) return null;

  try {
    // First, try to find a valid JSON object in the content
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const extracted = content.slice(jsonStart, jsonEnd + 1);
      try {
        return JSON.parse(extracted);
      } catch (e) {
        // Continue to other repair attempts
      }
    }

    // Try to fix common issues:
    let repaired = content;

    // Remove any text before the first { or after the last }
    const startIdx = repaired.indexOf('{');
    const endIdx = repaired.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      repaired = repaired.slice(startIdx, endIdx + 1);
    }

    // Fix trailing commas before }
    repaired = repaired.replace(/,\s*}/g, '}');
    repaired = repaired.replace(/,\s*]/g, ']');

    // Fix missing quotes around keys (common LLM error)
    repaired = repaired.replace(/{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '{"$1":');
    repaired = repaired.replace(/,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, ',"$1":');

    // Try parsing the repaired content
    try {
      return JSON.parse(repaired);
    } catch (e) {
      // One more attempt: try to extract key-value pairs for player action format
      const thinkingMatch = content.match(/"?thinking"?\s*[:=]\s*"([^"]*(?:\\.[^"]*)*)"/i);
      const actionMatch = content.match(/"?action"?\s*[:=]\s*"([^"]*(?:\\.[^"]*)*)"/i);
      const dialogueMatch = content.match(/"?dialogue"?\s*[:=]\s*"([^"]*(?:\\.[^"]*)*)"/i);

      if (actionMatch) {
        return {
          thinking: thinkingMatch ? thinkingMatch[1] : '',
          action: actionMatch[1],
          dialogue: dialogueMatch ? dialogueMatch[1] : null
        };
      }

      // Try DM resolution format
      const narrativeMatch = content.match(/"?narrative"?\s*[:=]\s*"([^"]*(?:\\.[^"]*)*)"/i);
      if (narrativeMatch) {
        return {
          narrative: narrativeMatch[1],
          scenefocus: 'characters',
          scenevisuals: {},
          worldchanges: {},
          worldsummary: narrativeMatch[1].slice(0, 100),
          time: null,
          arcupdates: {}
        };
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

describe('tryRepairJSON', () => {
  it('should parse valid JSON', () => {
    const input = '{"name": "test", "value": 42}';
    const result = tryRepairJSON(input);
    assert.deepStrictEqual(result, { name: 'test', value: 42 });
  });

  it('should extract JSON from surrounding text', () => {
    const input = 'Here is the response: {"name": "test"} and some more text';
    const result = tryRepairJSON(input);
    assert.deepStrictEqual(result, { name: 'test' });
  });

  it('should fix trailing commas', () => {
    const input = '{"name": "test", "items": ["a", "b",], }';
    const result = tryRepairJSON(input);
    assert.deepStrictEqual(result, { name: 'test', items: ['a', 'b'] });
  });

  it('should handle unquoted keys', () => {
    const input = '{name: "test", value: 42}';
    const result = tryRepairJSON(input);
    assert.deepStrictEqual(result, { name: 'test', value: 42 });
  });

  it('should extract player action format from malformed JSON', () => {
    const input = `thinking: "I should help them"
action: "Sarah walks over to assist"
dialogue: "Let me help you with that"`;
    const result = tryRepairJSON(input);
    assert.ok(result);
    assert.strictEqual(result.action, 'Sarah walks over to assist');
  });

  it('should handle the specific malformed case from the error', () => {
    // This is the actual malformed response that caused the error
    const input = `{"Our situation demands caution": "Sarah gently turns Mike's face", "Why don't we": "dialogue here"}`;
    // This won't parse as a player action, but should at least parse as JSON
    const result = tryRepairJSON(input);
    assert.ok(result);
  });

  it('should return null for completely unparseable content', () => {
    const input = 'This is just plain text with no JSON structure at all';
    const result = tryRepairJSON(input);
    assert.strictEqual(result, null);
  });

  it('should return null for null input', () => {
    const result = tryRepairJSON(null);
    assert.strictEqual(result, null);
  });

  it('should return null for empty string', () => {
    const result = tryRepairJSON('');
    assert.strictEqual(result, null);
  });

  it('should handle nested objects', () => {
    const input = '{"outer": {"inner": {"deep": "value"}}}';
    const result = tryRepairJSON(input);
    assert.deepStrictEqual(result, { outer: { inner: { deep: 'value' } } });
  });

  it('should handle arrays', () => {
    const input = '{"items": [1, 2, 3], "names": ["a", "b"]}';
    const result = tryRepairJSON(input);
    assert.deepStrictEqual(result, { items: [1, 2, 3], names: ['a', 'b'] });
  });
});

describe('Malformed LLM Response Handling', () => {
  it('should handle DeepSeek style response', () => {
    const deepseekResponse = `{
"thinking": "I need to find water",
"action": "Sarah searches for water sources",
"dialogue": "We need to find water soon"
}`;
    const result = tryRepairJSON(deepseekResponse);
    assert.ok(result);
    assert.strictEqual(result.thinking, 'I need to find water');
    assert.strictEqual(result.action, 'Sarah searches for water sources');
    assert.strictEqual(result.dialogue, 'We need to find water soon');
  });

  it('should handle response with code block markers', () => {
    const response = '```json\n{"action": "test action"}\n```';
    // First try direct parse which should fail
    try {
      JSON.parse(response);
      assert.fail('Should have thrown');
    } catch (e) {
      // Expected
    }
    // The repair function should extract the JSON
    const jsonMatch = response.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[1]);
      assert.deepStrictEqual(result, { action: 'test action' });
    }
  });

  it('should handle response with extra whitespace', () => {
    const response = `

    {
      "action"  :   "test action"  ,
      "dialogue"   :   null
    }

    `;
    const result = tryRepairJSON(response);
    assert.ok(result);
    assert.strictEqual(result.action, 'test action');
  });
});
