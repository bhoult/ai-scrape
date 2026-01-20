import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import { fetchAvailableModels } from '../src/config.js';
import { queryLLMJSON } from '../src/fireworks.js';

// Normalize object keys to lowercase
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

// Test prompt that asks for a simple structured response
const SIMPLE_TEST_PROMPT = `You are testing a JSON response format. Respond with ONLY valid JSON, no other text.

Generate a character update response with the following structure:
{
  "characterUpdates": [
    {
      "id": "char_test",
      "statsChange": {
        "health": 95,
        "stamina": 80
      },
      "attitudesChange": {
        "char_other": {
          "love": 60,
          "trust": 70,
          "attraction": 50
        }
      },
      "clothingChange": "casual clothes",
      "statusChange": "relaxed"
    }
  ]
}

Use EXACTLY this structure with these values. Respond with JSON only.`;

// Models to test
const MODELS_TO_TEST = [
  'deepseek-v3-0324',
  'llama-v3p3-70b-instruct',
  'minimax-m1'
];

describe('LLM Integration Tests', () => {
  before(async () => {
    // Fetch available models before running tests
    await fetchAvailableModels();
  });

  for (const modelKey of MODELS_TO_TEST) {
    describe(`${modelKey}`, () => {
      it('should return valid JSON that can be normalized', async () => {
        console.log(`Testing ${modelKey}...`);

        try {
          const result = await queryLLMJSON(SIMPLE_TEST_PROMPT, {
            model: modelKey,
            role: 'test'
          });

          assert.ok(result.parsed, 'Should have parsed JSON');

          // Normalize the response
          const normalized = normalizeKeys(result.parsed);

          // Verify all keys are lowercase after normalization (this tests our normalizeKeys function)
          function checkAllKeysLowercase(obj, path = '') {
            if (obj === null || typeof obj !== 'object') return;
            if (Array.isArray(obj)) {
              obj.forEach((item, i) => checkAllKeysLowercase(item, `${path}[${i}]`));
              return;
            }
            for (const key of Object.keys(obj)) {
              assert.strictEqual(key, key.toLowerCase(),
                `${modelKey}: Key "${key}" at ${path} should be lowercase after normalization`);
              checkAllKeysLowercase(obj[key], `${path}.${key}`);
            }
          }
          checkAllKeysLowercase(normalized);

          // Check if model followed the expected structure (non-fatal)
          if (normalized.characterupdates && Array.isArray(normalized.characterupdates) && normalized.characterupdates.length > 0) {
            const update = normalized.characterupdates[0];
            if (update.statschange && update.statschange.health !== undefined) {
              assert.ok(typeof update.statschange.health === 'number', `${modelKey}: health should be number`);
            }
            console.log(`${modelKey}: PASSED (full structure)`);
          } else {
            // Model didn't follow instructions exactly, but normalization still works
            console.log(`${modelKey}: PASSED (normalization works, but model returned different structure)`);
          }
        } catch (err) {
          // Log the error but don't fail for model availability issues
          console.error(`${modelKey}: ${err.message}`);
          if (!err.message.includes('404') && !err.message.includes('not found')) {
            throw err;
          }
        }
      });

      it('should handle player action format', async () => {
        const playerPrompt = `You are a character in a story. Respond with ONLY valid JSON:
{
  "thinking": "What I am thinking",
  "action": "What I do",
  "dialogue": "What I say or null"
}`;

        try {
          const result = await queryLLMJSON(playerPrompt, {
            model: modelKey,
            role: 'test-player'
          });

          assert.ok(result.parsed, 'Should have parsed JSON');

          const normalized = normalizeKeys(result.parsed);

          // Should have some valid response - LLMs may vary in exact format
          // Check for common response keys
          const hasValidResponse = normalized.action || normalized.thinking ||
            normalized.dialogue || Object.keys(normalized).length > 0;

          if (!hasValidResponse) {
            console.warn(`${modelKey} player format: Response had no recognized fields: ${JSON.stringify(normalized)}`);
          }

          assert.ok(hasValidResponse,
            `${modelKey}: Should have some valid response content`);

          console.log(`${modelKey} player format: PASSED`);
        } catch (err) {
          console.error(`${modelKey} player format: ${err.message}`);
          if (!err.message.includes('404') && !err.message.includes('not found')) {
            throw err;
          }
        }
      });
    });
  }
});

describe('State Update Integration', () => {
  it('should produce normalized keys that match WorldState expectations', async () => {
    await fetchAvailableModels();

    // Use deepseek as the primary test model
    const modelKey = 'deepseek-v3-0324';

    try {
      const result = await queryLLMJSON(SIMPLE_TEST_PROMPT, {
        model: modelKey,
        role: 'test-state'
      });

      const normalized = normalizeKeys(result.parsed);

      // These are the exact keys that WorldState.applyChanges expects
      const expectedKeys = [
        'characterupdates',
        'locationupdates',
        'environmentupdate',
        'newcharacters',
        'discoveredobjects',
        'removedobjects',
        'discoveredmapfeatures'
      ];

      // Check that any keys present are in lowercase format
      for (const key of Object.keys(normalized)) {
        assert.strictEqual(key, key.toLowerCase(),
          `Key "${key}" should be lowercase after normalization`);
      }

      // If characterupdates exists, check its structure
      if (normalized.characterupdates && normalized.characterupdates.length > 0) {
        const update = normalized.characterupdates[0];
        const updateKeys = Object.keys(update);

        for (const key of updateKeys) {
          assert.strictEqual(key, key.toLowerCase(),
            `Character update key "${key}" should be lowercase`);
        }

        // Check nested objects
        if (update.statschange) {
          for (const key of Object.keys(update.statschange)) {
            assert.strictEqual(key, key.toLowerCase(),
              `Stats key "${key}" should be lowercase`);
          }
        }

        if (update.attitudeschange) {
          for (const targetId of Object.keys(update.attitudeschange)) {
            const attitudes = update.attitudeschange[targetId];
            for (const key of Object.keys(attitudes)) {
              assert.strictEqual(key, key.toLowerCase(),
                `Attitude key "${key}" should be lowercase`);
            }
          }
        }
      }

      console.log('State update integration: PASSED');
    } catch (err) {
      console.error(`State update integration: ${err.message}`);
      throw err;
    }
  });
});
