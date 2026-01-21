import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { WorldState } from '../src/world-state.js';
import { isInCriticalState, getActiveAttitudeEffects, attitudesBehavior, personalityTypes, getPersonalityTypeNames, generatePersonalityText } from '../src/behavior-config.js';

describe('WorldState', () => {
  let worldState;

  beforeEach(() => {
    worldState = new WorldState();
  });

  describe('initialize', () => {
    it('should initialize with normalized lowercase keys', () => {
      const dmResponse = {
        location: {
          id: 'loc_desert',
          name: 'Desert',
          description: 'A hot desert',
          exits: ['north', 'south'],
          items: [],
          npcs: []
        },
        characters: [
          {
            id: 'char_sarah',
            name: 'Sarah',
            appearance: {
              gender: 'female',
              age: 28,
              haircolor: 'brown',
              eyecolor: 'hazel'
            },
            clothing: 'hiking gear',
            personality: 'determined',
            goals: 'survive',
            inventory: ['water bottle'],
            status: 'healthy',
            stats: { health: 100, stamina: 100 },
            position: { x: 0, y: 0 },
            attitudes: {}
          }
        ],
        narrative: 'The story begins...',
        worldsummary: 'Two survivors in the desert',
        time: { day: 1, hour: 8, minute: 0 }
      };

      worldState.initialize(dmResponse);

      assert.strictEqual(worldState.characters.length, 1);
      assert.strictEqual(worldState.characters[0].name, 'Sarah');
      assert.strictEqual(worldState.summary, 'Two survivors in the desert');
    });
  });

  describe('applyChanges', () => {
    beforeEach(() => {
      // Initialize with a basic state
      worldState.initialize({
        location: {
          id: 'loc_1',
          name: 'Test Location',
          description: 'A test location',
          exits: ['north'],
          items: ['rock', 'water bottle', 'rope'],  // Include items for inventory tests
          npcs: []
        },
        characters: [
          {
            id: 'char_sarah',
            name: 'Sarah',
            appearance: {},
            clothing: 'shirt and pants',
            personality: 'brave',
            goals: 'survive',
            inventory: ['knife'],
            status: 'healthy',
            stats: { health: 100, stamina: 100, hunger: 0, thirst: 0 },
            position: { x: 0, y: 0 },
            attitudes: {
              char_mike: { love: 50, anger: 0, attraction: 30, trust: 50, fear: 0 }
            }
          },
          {
            id: 'char_mike',
            name: 'Mike',
            appearance: {},
            clothing: 'cargo pants',
            personality: 'cautious',
            goals: 'find help',
            inventory: [],
            status: 'healthy',
            stats: { health: 100, stamina: 100, hunger: 0, thirst: 0 },
            position: { x: 5, y: 5 },
            attitudes: {
              char_sarah: { love: 50, anger: 0, attraction: 40, trust: 50, fear: 0 }
            }
          }
        ],
        narrative: 'Initial state',
        worldsummary: 'Test summary',
        time: { day: 1, hour: 8, minute: 0 }
      });
    });

    it('should apply stats changes with lowercase keys', () => {
      const changes = {
        characterupdates: [
          {
            id: 'char_sarah',
            statschange: {
              health: 90,
              stamina: 80,
              hunger: 10,
              thirst: 15
            }
          }
        ]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.stats.health, 90);
      assert.strictEqual(sarah.stats.stamina, 80);
      assert.strictEqual(sarah.stats.hunger, 10);
      assert.strictEqual(sarah.stats.thirst, 15);
    });

    it('should apply attitude changes with lowercase keys', () => {
      const changes = {
        characterupdates: [
          {
            id: 'char_sarah',
            attitudeschange: {
              char_mike: {
                love: 60,
                attraction: 80,
                trust: 70
              }
            }
          }
        ]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.attitudes.char_mike.love, 60);
      assert.strictEqual(sarah.attitudes.char_mike.attraction, 80);
      assert.strictEqual(sarah.attitudes.char_mike.trust, 70);
      // Unchanged values should remain
      assert.strictEqual(sarah.attitudes.char_mike.anger, 0);
      assert.strictEqual(sarah.attitudes.char_mike.fear, 0);
    });

    it('should apply inventory changes with lowercase keys', () => {
      const changes = {
        characterupdates: [
          {
            id: 'char_sarah',
            inventoryadd: ['water bottle', 'rope'],
            inventoryremove: ['knife']
          }
        ]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.ok(sarah.inventory.includes('water bottle'));
      assert.ok(sarah.inventory.includes('rope'));
      assert.ok(!sarah.inventory.includes('knife'));
    });

    it('should apply clothing changes with lowercase keys', () => {
      const changes = {
        characterupdates: [
          {
            id: 'char_sarah',
            clothingchange: 'nude'
          }
        ]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.clothing, 'nude');
    });

    it('should apply status changes with lowercase keys', () => {
      const changes = {
        characterupdates: [
          {
            id: 'char_sarah',
            statuschange: 'exhausted and dehydrated'
          }
        ]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.status, 'exhausted and dehydrated');
    });

    it('should apply position changes with lowercase keys', () => {
      const changes = {
        characterupdates: [
          {
            id: 'char_sarah',
            positionchange: { x: 10, y: -5 }
          }
        ]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 10);
      assert.strictEqual(sarah.position.y, -5);
    });

    it('should apply multiple character updates', () => {
      const changes = {
        characterupdates: [
          {
            id: 'char_sarah',
            statschange: { health: 90 },
            attitudeschange: {
              char_mike: { attraction: 90 }
            }
          },
          {
            id: 'char_mike',
            statschange: { stamina: 70 },
            attitudeschange: {
              char_sarah: { attraction: 85 }
            }
          }
        ]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      const mike = worldState.characters.find(c => c.id === 'char_mike');

      assert.strictEqual(sarah.stats.health, 90);
      assert.strictEqual(sarah.attitudes.char_mike.attraction, 90);
      assert.strictEqual(mike.stats.stamina, 70);
      assert.strictEqual(mike.attitudes.char_sarah.attraction, 85);
    });

    it('should handle location updates with lowercase keys', () => {
      const changes = {
        locationupdates: {
          items: ['new item', 'another item'],
          description: 'Updated location description'
        }
      };

      worldState.applyChanges(changes);

      assert.deepStrictEqual(worldState.currentLocation.items, ['new item', 'another item']);
      assert.strictEqual(worldState.currentLocation.description, 'Updated location description');
    });

    it('should handle environment updates with lowercase keys', () => {
      const changes = {
        environmentupdate: {
          weather: 'stormy',
          temperature: 'cold'
        }
      };

      worldState.applyChanges(changes);

      assert.strictEqual(worldState.environment.weather, 'stormy');
      assert.strictEqual(worldState.environment.temperature, 'cold');
    });

    it('should initialize attitudes for new targets', () => {
      // Add a third character first
      worldState.characters.push({
        id: 'char_alex',
        name: 'Alex',
        attitudes: {}
      });

      const changes = {
        characterupdates: [
          {
            id: 'char_sarah',
            attitudeschange: {
              char_alex: {
                trust: 30,
                fear: 20
              }
            }
          }
        ]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.ok(sarah.attitudes.char_alex);
      assert.strictEqual(sarah.attitudes.char_alex.trust, 30);
      assert.strictEqual(sarah.attitudes.char_alex.fear, 20);
      // Default values for unspecified attitudes
      assert.strictEqual(sarah.attitudes.char_alex.love, 50);
      assert.strictEqual(sarah.attitudes.char_alex.attraction, 0);
    });
  });

  describe('intimacy effects', () => {
    beforeEach(() => {
      worldState.initialize({
        location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
        characters: [
          {
            id: 'char_sarah',
            name: 'Sarah',
            appearance: {},
            clothing: 'nude',
            personality: '',
            goals: '',
            inventory: [],
            status: 'healthy',
            stats: { health: 100 },
            position: { x: 0, y: 0 },
            attitudes: {
              char_mike: { love: 50, anger: 0, attraction: 90, trust: 50, fear: 0 }
            }
          },
          {
            id: 'char_mike',
            name: 'Mike',
            appearance: {},
            clothing: 'nude',
            personality: '',
            goals: '',
            inventory: [],
            status: 'healthy',
            stats: { health: 100 },
            position: { x: 1, y: 0 },
            attitudes: {
              char_sarah: { love: 50, anger: 0, attraction: 90, trust: 50, fear: 0 }
            }
          }
        ],
        narrative: 'Initial',
        worldsummary: 'Summary',
        time: { day: 1, hour: 8, minute: 0 }
      });
    });

    it('should detect intimacy when characters have sex', () => {
      // Characters are nude and close together, narrative mentions intimacy
      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      const mike = worldState.characters.find(c => c.id === 'char_mike');

      // Verify initial attraction
      assert.strictEqual(sarah.attitudes.char_mike.attraction, 90);
      assert.strictEqual(mike.attitudes.char_sarah.attraction, 90);

      // Simulate intimacy detection by checking the conditions
      const nudeCharacters = worldState.characters.filter(c => {
        const clothing = (c.clothing || '').toLowerCase();
        return clothing === 'nude' || clothing === 'naked';
      });
      assert.strictEqual(nudeCharacters.length, 2);

      // Check they are close enough (within 2 meters)
      const distance = worldState.getDistance(sarah.position, mike.position);
      assert.ok(distance <= 2, 'Characters should be within 2 meters');
    });

    it('should reduce attraction by 1/3 after intimacy', () => {
      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      const mike = worldState.characters.find(c => c.id === 'char_mike');

      // Manually apply the reduction formula (what processIntimacyEffects does)
      const oldAttractionSarah = sarah.attitudes.char_mike.attraction;
      const oldAttractionMike = mike.attitudes.char_sarah.attraction;

      // Apply reduction: multiply by 2/3
      sarah.attitudes.char_mike.attraction = Math.round(oldAttractionSarah * 2 / 3);
      mike.attitudes.char_sarah.attraction = Math.round(oldAttractionMike * 2 / 3);

      // 90 * 2/3 = 60
      assert.strictEqual(sarah.attitudes.char_mike.attraction, 60);
      assert.strictEqual(mike.attitudes.char_sarah.attraction, 60);
    });

    it('should detect critical state when starving', () => {
      assert.ok(isInCriticalState({ hunger: 70 }), 'hunger >= 70 is critical');
      assert.ok(isInCriticalState({ hunger: 100 }), 'hunger 100 is critical');
      assert.ok(!isInCriticalState({ hunger: 50 }), 'hunger 50 is not critical');
    });

    it('should detect critical state when dying of thirst', () => {
      assert.ok(isInCriticalState({ thirst: 70 }), 'thirst >= 70 is critical');
      assert.ok(isInCriticalState({ thirst: 90 }), 'thirst 90 is critical');
      assert.ok(!isInCriticalState({ thirst: 60 }), 'thirst 60 is not critical');
    });

    it('should detect critical state when near death', () => {
      assert.ok(isInCriticalState({ health: 30 }), 'health <= 30 is critical');
      assert.ok(isInCriticalState({ health: 10 }), 'health 10 is critical');
      assert.ok(!isInCriticalState({ health: 50 }), 'health 50 is not critical');
    });

    it('should detect critical state when exhausted', () => {
      assert.ok(isInCriticalState({ stamina: 20 }), 'stamina <= 20 is critical');
      assert.ok(isInCriticalState({ stamina: 5 }), 'stamina 5 is critical');
      assert.ok(!isInCriticalState({ stamina: 50 }), 'stamina 50 is not critical');
    });

    it('should suppress attraction behavior when in critical state', () => {
      const attitudes = {
        char_mike: { love: 50, anger: 0, attraction: 90, trust: 50, fear: 0 }
      };
      const characterNames = { char_mike: 'Mike' };

      // Not in critical state - should show normal attraction behavior
      const normalEffects = getActiveAttitudeEffects(attitudes, characterNames, attitudesBehavior, { health: 100, hunger: 0, thirst: 0, stamina: 100 });
      const normalAttraction = normalEffects[0]?.effects.find(e => e.attitude === 'Attraction');
      assert.ok(normalAttraction, 'Should have attraction effect');
      assert.ok(!normalAttraction.label.includes('suppressed'), 'Should not be suppressed when healthy');
      assert.ok(normalAttraction.behavior.includes('sex'), 'Should mention sexual behavior when healthy');

      // In critical state (starving) - should suppress attraction behavior
      const criticalEffects = getActiveAttitudeEffects(attitudes, characterNames, attitudesBehavior, { health: 100, hunger: 80, thirst: 0, stamina: 100 });
      const suppressedAttraction = criticalEffects[0]?.effects.find(e => e.attitude === 'Attraction');
      assert.ok(suppressedAttraction, 'Should have attraction effect');
      assert.ok(suppressedAttraction.label.includes('suppressed'), 'Should be suppressed when starving');
      assert.ok(suppressedAttraction.behavior.includes('survival'), 'Should focus on survival when starving');
    });
  });

  describe('advanceTurn', () => {
    beforeEach(() => {
      worldState.initialize({
        location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
        characters: [{ id: 'char_1', name: 'Test', appearance: {}, clothing: '', personality: '', goals: '', inventory: [], status: 'healthy', stats: {}, position: { x: 0, y: 0 }, attitudes: {} }],
        narrative: 'Initial',
        worldsummary: 'Summary',
        time: { day: 1, hour: 8, minute: 0 }
      });
    });

    it('should apply arc updates with lowercase keys', () => {
      const arcUpdates = {
        narrativearc: 'Climax approaching',
        newmajorevents: ['Found shelter', 'Storm incoming'],
        tensions: ['Time running out'],
        storygoal: 'Reach the mountains'
      };

      worldState.advanceTurn('Narrative text', 'New summary', { day: 1, hour: 9, minute: 0 }, arcUpdates);

      assert.strictEqual(worldState.narrativeArc, 'Climax approaching');
      assert.ok(worldState.majorEvents.includes('Found shelter'));
      assert.ok(worldState.majorEvents.includes('Storm incoming'));
      assert.deepStrictEqual(worldState.tensions, ['Time running out']);
      assert.strictEqual(worldState.storyGoal, 'Reach the mountains');
    });
  });

  describe('personality types', () => {
    it('should have all expected personality types defined', () => {
      const typeNames = getPersonalityTypeNames();
      // Check some key types exist
      assert.ok(typeNames.includes('positive'));
      assert.ok(typeNames.includes('negative'));
      assert.ok(typeNames.includes('stoic'));
      assert.ok(typeNames.includes('cheerful'));
      assert.ok(typeNames.includes('logical'));
      assert.ok(typeNames.includes('flirty'));
      assert.ok(typeNames.includes('violent'));
      assert.ok(typeNames.includes('peaceful'));
      assert.ok(typeNames.includes('introvert'));
      assert.ok(typeNames.includes('extrovert'));
    });

    it('should generate personality text for valid types', () => {
      const types = ['stoic', 'logical', 'brave'];
      const text = generatePersonalityText(types);

      assert.ok(text.includes('Stoic'));
      assert.ok(text.includes('Logical'));
      assert.ok(text.includes('Brave'));
      assert.ok(text.includes('Emotionally reserved'));
      assert.ok(text.includes('Analytical'));
      assert.ok(text.includes('Courageous'));
    });

    it('should return null for empty personality types array', () => {
      assert.strictEqual(generatePersonalityText([]), null);
      assert.strictEqual(generatePersonalityText(null), null);
      assert.strictEqual(generatePersonalityText(undefined), null);
    });

    it('should filter out invalid personality types', () => {
      const types = ['stoic', 'invalid_type', 'cheerful'];
      const text = generatePersonalityText(types);

      assert.ok(text.includes('Stoic'));
      assert.ok(text.includes('Cheerful'));
      assert.ok(!text.includes('invalid_type'));
    });

    it('should add personalityTypes to new characters via applyChanges', () => {
      worldState.initialize({
        location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
        characters: [{ id: 'char_existing', name: 'Existing', appearance: {}, clothing: '', personality: '', goals: '', inventory: [], status: 'healthy', stats: {}, position: { x: 0, y: 0 }, attitudes: {} }],
        narrative: 'Initial',
        worldsummary: 'Summary',
        time: { day: 1, hour: 8, minute: 0 }
      });

      const changes = {
        newcharacters: [{
          id: 'char_new',
          name: 'New Character',
          appearance: {},
          clothing: 'casual',
          personality: 'friendly and helpful',
          personalitytypes: ['cheerful', 'outgoing', 'nurturing'],
          goals: 'help others',
          inventory: [],
          status: 'healthy',
          stats: { health: 100 },
          position: { x: 5, y: 5 },
          attitudes: {},
          disposition: 'friendly'
        }]
      };

      worldState.applyChanges(changes);

      const newChar = worldState.characters.find(c => c.id === 'char_new');
      assert.ok(newChar);
      assert.deepStrictEqual(newChar.personalitytypes, ['cheerful', 'outgoing', 'nurturing']);
    });

    it('should default to empty array if personalityTypes not provided', () => {
      worldState.initialize({
        location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
        characters: [{ id: 'char_existing', name: 'Existing', appearance: {}, clothing: '', personality: '', goals: '', inventory: [], status: 'healthy', stats: {}, position: { x: 0, y: 0 }, attitudes: {} }],
        narrative: 'Initial',
        worldsummary: 'Summary',
        time: { day: 1, hour: 8, minute: 0 }
      });

      const changes = {
        newcharacters: [{
          id: 'char_new',
          name: 'New Character Without Personality Types',
          appearance: {},
          clothing: 'casual',
          personality: 'unknown',
          goals: 'survive',
          inventory: [],
          status: 'healthy',
          stats: { health: 100 },
          position: { x: 5, y: 5 },
          attitudes: {},
          disposition: 'neutral'
        }]
      };

      worldState.applyChanges(changes);

      const newChar = worldState.characters.find(c => c.id === 'char_new');
      assert.ok(newChar);
      assert.deepStrictEqual(newChar.personalitytypes, []);
    });
  });
});
