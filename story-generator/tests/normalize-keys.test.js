import { describe, it } from 'node:test';
import assert from 'node:assert';

// Normalize object keys to lowercase (copy from game-engine.js for testing)
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

describe('normalizeKeys', () => {
  it('should convert simple object keys to lowercase', () => {
    const input = { Name: 'John', Age: 30 };
    const result = normalizeKeys(input);
    assert.deepStrictEqual(result, { name: 'John', age: 30 });
  });

  it('should handle camelCase keys', () => {
    const input = { firstName: 'John', lastName: 'Doe' };
    const result = normalizeKeys(input);
    assert.deepStrictEqual(result, { firstname: 'John', lastname: 'Doe' });
  });

  it('should handle UPPERCASE keys', () => {
    const input = { NARRATIVE: 'Story text', SCENEFOCUS: 'characters' };
    const result = normalizeKeys(input);
    assert.deepStrictEqual(result, { narrative: 'Story text', scenefocus: 'characters' });
  });

  it('should recursively normalize nested objects', () => {
    const input = {
      WorldChanges: {
        CharacterUpdates: [
          { Id: 'char_1', StatsChange: { Health: 100 } }
        ]
      }
    };
    const result = normalizeKeys(input);
    assert.deepStrictEqual(result, {
      worldchanges: {
        characterupdates: [
          { id: 'char_1', statschange: { health: 100 } }
        ]
      }
    });
  });

  it('should handle arrays of objects', () => {
    const input = [
      { FirstName: 'John' },
      { FirstName: 'Jane' }
    ];
    const result = normalizeKeys(input);
    assert.deepStrictEqual(result, [
      { firstname: 'John' },
      { firstname: 'Jane' }
    ]);
  });

  it('should handle null and primitives', () => {
    assert.strictEqual(normalizeKeys(null), null);
    assert.strictEqual(normalizeKeys('string'), 'string');
    assert.strictEqual(normalizeKeys(42), 42);
    assert.strictEqual(normalizeKeys(true), true);
  });

  it('should normalize appearance keys correctly', () => {
    const input = {
      appearance: {
        hairColor: 'brown',
        hairLength: 'long',
        hairStyle: 'wavy',
        skinTone: 'olive',
        eyeColor: 'green',
        facialHair: 'none'
      }
    };
    const result = normalizeKeys(input);
    assert.deepStrictEqual(result, {
      appearance: {
        haircolor: 'brown',
        hairlength: 'long',
        hairstyle: 'wavy',
        skintone: 'olive',
        eyecolor: 'green',
        facialhair: 'none'
      }
    });
  });

  it('should normalize attitude change keys', () => {
    const input = {
      attitudesChange: {
        char_mike: {
          Love: 50,
          Anger: 10,
          Attraction: 80,
          Trust: 60,
          Fear: 5
        }
      }
    };
    const result = normalizeKeys(input);
    assert.deepStrictEqual(result, {
      attitudeschange: {
        char_mike: {
          love: 50,
          anger: 10,
          attraction: 80,
          trust: 60,
          fear: 5
        }
      }
    });
  });
});

describe('DM Response Normalization', () => {
  it('should normalize a typical DM resolution response', () => {
    const dmResponse = {
      Narrative: 'The story continues...',
      SceneFocus: 'characters',
      SceneVisuals: {
        CharacterAction: 'Characters walking'
      },
      WorldChanges: {
        CharacterUpdates: [
          {
            Id: 'char_sarah',
            InventoryAdd: ['water bottle'],
            InventoryRemove: [],
            StatusChange: 'tired',
            ClothingChange: null,
            StatsChange: { Health: 95, Stamina: 80 },
            AttitudesChange: {
              char_mike: { Love: 60, Trust: 70 }
            }
          }
        ],
        LocationUpdates: { Items: ['rock', 'stick'] }
      },
      WorldSummary: 'Summary here',
      ArcUpdates: {
        NarrativeArc: 'Rising action',
        NewMajorEvents: ['Found water']
      }
    };

    const result = normalizeKeys(dmResponse);

    assert.strictEqual(result.narrative, 'The story continues...');
    assert.strictEqual(result.scenefocus, 'characters');
    assert.strictEqual(result.scenevisuals.characteraction, 'Characters walking');
    assert.strictEqual(result.worldchanges.characterupdates[0].id, 'char_sarah');
    assert.deepStrictEqual(result.worldchanges.characterupdates[0].inventoryadd, ['water bottle']);
    assert.strictEqual(result.worldchanges.characterupdates[0].statschange.health, 95);
    assert.strictEqual(result.worldchanges.characterupdates[0].attitudeschange.char_mike.love, 60);
    assert.strictEqual(result.arcupdates.narrativearc, 'Rising action');
  });
});
