import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  DM_SYSTEM_PROMPT,
  PLAYER_SYSTEM_PROMPT,
  dmInitPrompt,
  playerThinkTalkPrompt,
  playerActionPrompt,
  dmResolutionPrompt,
  novelWritingPrompt
} from '../src/prompts.js';

describe('System Prompts', () => {
  describe('DM_SYSTEM_PROMPT', () => {
    it('should contain role description', () => {
      assert.ok(DM_SYSTEM_PROMPT.includes('Dungeon Master'));
      assert.ok(DM_SYSTEM_PROMPT.includes('third-person'));
    });

    it('should contain English language requirement', () => {
      assert.ok(DM_SYSTEM_PROMPT.includes('English'));
      assert.ok(DM_SYSTEM_PROMPT.includes('item names'));
    });

    it('should contain creative authority guidelines', () => {
      assert.ok(DM_SYSTEM_PROMPT.includes('creative authority'));
      assert.ok(DM_SYSTEM_PROMPT.includes('characters'));
      assert.ok(DM_SYSTEM_PROMPT.includes('locations'));
    });

    it('should contain character limitations', () => {
      assert.ok(DM_SYSTEM_PROMPT.includes('Character limitations'));
      assert.ok(DM_SYSTEM_PROMPT.includes('inventory'));
    });

    it('should require JSON format', () => {
      assert.ok(DM_SYSTEM_PROMPT.includes('JSON'));
    });
  });

  describe('PLAYER_SYSTEM_PROMPT', () => {
    it('should contain role description', () => {
      assert.ok(PLAYER_SYSTEM_PROMPT.includes('character'));
      assert.ok(PLAYER_SYSTEM_PROMPT.includes('personality'));
    });

    it('should contain English language requirement', () => {
      assert.ok(PLAYER_SYSTEM_PROMPT.includes('English'));
    });

    it('should require JSON format', () => {
      assert.ok(PLAYER_SYSTEM_PROMPT.includes('JSON'));
    });
  });
});

describe('dmInitPrompt', () => {
  it('should include the seed text', () => {
    const prompt = dmInitPrompt('Two survivors in a desert');
    assert.ok(prompt.includes('Two survivors in a desert'));
  });

  it('should include author style when provided', () => {
    const prompt = dmInitPrompt('Test seed', 'Stephen King');
    assert.ok(prompt.includes('Stephen King'));
  });

  it('should ask for author style suggestion when not provided', () => {
    const prompt = dmInitPrompt('Test seed', null);
    assert.ok(prompt.includes('Choose an author') || prompt.includes('authorStyle'));
  });

  it('should include DM narrative style when provided', () => {
    const prompt = dmInitPrompt('Test seed', null, 'Hemingway');
    assert.ok(prompt.includes('Hemingway'));
    assert.ok(prompt.includes('NARRATIVE STYLE') || prompt.includes('style'));
  });

  it('should scale distances based on world size', () => {
    const prompt1x = dmInitPrompt('Test seed', null, null, 1);
    const prompt2x = dmInitPrompt('Test seed', null, null, 2);

    // 2x should have larger distances mentioned
    assert.ok(prompt1x.includes('10km') || prompt1x.includes('10 km'));
    assert.ok(prompt2x.includes('20km') || prompt2x.includes('20 km'));
  });

  it('should include victory conditions section', () => {
    const prompt = dmInitPrompt('Test seed');
    assert.ok(prompt.includes('VICTORY CONDITIONS'));
    assert.ok(prompt.includes('victoryConditions'));
  });

  it('should include map generation section', () => {
    const prompt = dmInitPrompt('Test seed');
    assert.ok(prompt.includes('MAP GENERATION'));
    assert.ok(prompt.includes('mapFeatures'));
  });

  it('should include JSON template with required fields', () => {
    const prompt = dmInitPrompt('Test seed');

    // Check for required JSON fields
    assert.ok(prompt.includes('"narrative"'));
    assert.ok(prompt.includes('"characters"'));
    assert.ok(prompt.includes('"location"'));
    assert.ok(prompt.includes('"time"'));
    assert.ok(prompt.includes('"environment"'));
    assert.ok(prompt.includes('"storyGoal"'));
  });

  it('should include character template with all fields', () => {
    const prompt = dmInitPrompt('Test seed');

    assert.ok(prompt.includes('"id"'));
    assert.ok(prompt.includes('"name"'));
    assert.ok(prompt.includes('"appearance"'));
    assert.ok(prompt.includes('"clothing"'));
    assert.ok(prompt.includes('"personality"'));
    assert.ok(prompt.includes('"inventory"'));
    assert.ok(prompt.includes('"stats"'));
    assert.ok(prompt.includes('"position"'));
  });
});

describe('playerThinkTalkPrompt', () => {
  const mockCharacter = {
    id: 'char_sarah',
    name: 'Sarah',
    appearance: { gender: 'female', age: 28 },
    clothing: 'hiking gear',
    personality: 'brave and determined',
    personalitytypes: ['brave', 'logical'],
    goals: 'find water',
    inventory: ['knife', 'water bottle'],
    status: 'healthy',
    stats: { health: 100, stamina: 80, hunger: 20, thirst: 30 },
    position: { x: 0, y: 0 },
    attitudes: {
      char_mike: { love: 50, anger: 0, attraction: 60, trust: 70, fear: 0 }
    },
    sightDistance: 2000
  };

  const mockWorldState = {
    currentLocation: { name: 'Desert', description: 'A hot desert' },
    characters: [
      mockCharacter,
      {
        id: 'char_mike',
        name: 'Mike',
        appearance: { gender: 'male', age: 30 },
        clothing: 'cargo pants',
        personality: 'cautious',
        status: 'healthy',
        position: { x: 5, y: 0 },
        inventory: []
      }
    ],
    environment: { type: 'desert', weather: 'clear', temperature: 'hot' },
    time: { day: 1, hour: 10, minute: 0 },
    storyGoal: 'Find rescue',
    discoveredObjects: [],
    deadBodies: [],
    mapFeatures: []
  };

  it('should include character name', () => {
    const prompt = playerThinkTalkPrompt(mockCharacter, mockWorldState, []);
    assert.ok(prompt.includes('Sarah'));
  });

  it('should include character stats', () => {
    const prompt = playerThinkTalkPrompt(mockCharacter, mockWorldState, []);
    assert.ok(prompt.includes('health') || prompt.includes('Health'));
    assert.ok(prompt.includes('stamina') || prompt.includes('Stamina'));
  });

  it('should include inventory', () => {
    const prompt = playerThinkTalkPrompt(mockCharacter, mockWorldState, []);
    assert.ok(prompt.includes('knife'));
    assert.ok(prompt.includes('water bottle'));
  });

  it('should include nearby characters', () => {
    const prompt = playerThinkTalkPrompt(mockCharacter, mockWorldState, []);
    assert.ok(prompt.includes('Mike'));
  });

  it('should include story goal', () => {
    const prompt = playerThinkTalkPrompt(mockCharacter, mockWorldState, []);
    assert.ok(prompt.includes('Find rescue') || prompt.includes('rescue'));
  });

  it('should include JSON response format', () => {
    const prompt = playerThinkTalkPrompt(mockCharacter, mockWorldState, []);
    assert.ok(prompt.includes('"thinking"') || prompt.includes('thinking'));
    assert.ok(prompt.includes('"speech"') || prompt.includes('speech'));
  });
});

describe('playerActionPrompt', () => {
  const mockCharacter = {
    id: 'char_sarah',
    name: 'Sarah',
    appearance: { gender: 'female', age: 28 },
    clothing: 'hiking gear',
    personality: 'brave and determined',
    goals: 'find water',
    inventory: ['knife', 'water bottle'],
    status: 'healthy',
    stats: { health: 100, stamina: 80, hunger: 20, thirst: 30 },
    position: { x: 0, y: 0 },
    attitudes: {},
    sightDistance: 2000
  };

  const mockWorldState = {
    currentLocation: { name: 'Desert', description: 'A hot desert' },
    characters: [mockCharacter],
    environment: { type: 'desert', weather: 'clear', temperature: 'hot' },
    time: { day: 1, hour: 10, minute: 0 },
    storyGoal: 'Find rescue',
    discoveredObjects: [],
    deadBodies: [],
    mapFeatures: []
  };

  it('should include character name and situation', () => {
    const prompt = playerActionPrompt(mockCharacter, mockWorldState, []);
    assert.ok(prompt.includes('Sarah'));
  });

  it('should include inventory', () => {
    const prompt = playerActionPrompt(mockCharacter, mockWorldState, []);
    assert.ok(prompt.includes('knife'));
  });

  it('should request action response', () => {
    const prompt = playerActionPrompt(mockCharacter, mockWorldState, []);
    assert.ok(prompt.includes('"action"') || prompt.includes('action'));
  });

  it('should include dialogue from nearby characters', () => {
    const dialogue = [{ name: 'Mike', speech: 'We need to find water!' }];
    const prompt = playerActionPrompt(mockCharacter, mockWorldState, [], dialogue);
    assert.ok(prompt.includes('Mike') || prompt.includes('water'));
  });
});

describe('dmResolutionPrompt', () => {
  const mockWorldState = {
    currentLocation: { name: 'Desert', description: 'A hot desert', items: [] },
    characters: [
      {
        id: 'char_sarah',
        name: 'Sarah',
        appearance: { gender: 'female', age: 28 },
        clothing: 'hiking gear',
        personality: 'brave',
        status: 'healthy',
        stats: { health: 100, stamina: 80, hunger: 20, thirst: 30 },
        position: { x: 0, y: 0 },
        inventory: ['knife'],
        attitudes: {},
        sightDistance: 2000
      }
    ],
    environment: { type: 'desert', weather: 'clear', temperature: 'hot' },
    time: { day: 1, hour: 10, minute: 0 },
    storyGoal: 'Find rescue',
    narrativeArc: 'Introduction',
    majorEvents: ['Crashed in desert'],
    tensions: ['Need water'],
    discoveredObjects: [],
    deadBodies: [],
    mapFeatures: [
      { id: 'feat_1', name: 'Oasis', type: 'water_source', position: { x: 5000, y: 0 }, visibleFrom: 1000, discovered: false }
    ],
    getStateSnapshot: () => ({})
  };

  const mockActions = [
    { character: { name: 'Sarah' }, action: 'Look around for water sources' }
  ];

  it('should include character actions', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions);
    assert.ok(prompt.includes('Sarah'));
    assert.ok(prompt.includes('Look around') || prompt.includes('water'));
  });

  it('should include world state information', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions);
    assert.ok(prompt.includes('Desert'));
    assert.ok(prompt.includes('hot') || prompt.includes('temperature'));
  });

  it('should include narrative arc', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions);
    assert.ok(prompt.includes('Introduction') || prompt.includes('narrativeArc'));
  });

  it('should include map features', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions);
    assert.ok(prompt.includes('Oasis') || prompt.includes('water_source'));
  });

  it('should include DM instructions when provided', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions, [], 'A snake appears');
    assert.ok(prompt.includes('snake'));
  });

  it('should include character speech when provided', () => {
    const speech = [{ name: 'Sarah', speech: 'I see something in the distance!' }];
    const prompt = dmResolutionPrompt(mockWorldState, mockActions, speech);
    assert.ok(prompt.includes('distance') || prompt.includes('something'));
  });

  it('should include JSON response format with all required fields', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions);

    assert.ok(prompt.includes('"narrative"'));
    assert.ok(prompt.includes('"characterUpdates"') || prompt.includes('characterupdates'));
    assert.ok(prompt.includes('"worldChanges"') || prompt.includes('worldchanges'));
  });

  it('should include movement instructions', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions);
    assert.ok(prompt.includes('movement') || prompt.includes('direction'));
    assert.ok(prompt.includes('distance'));
  });

  it('should include sight distance guide', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions);
    assert.ok(prompt.includes('sightDistance') || prompt.includes('SIGHT DISTANCE'));
  });

  it('should include English language requirement', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions);
    assert.ok(prompt.includes('English'));
  });

  it('should include inventory management instructions', () => {
    const prompt = dmResolutionPrompt(mockWorldState, mockActions);
    assert.ok(prompt.includes('inventoryAdd') || prompt.includes('inventory'));
    assert.ok(prompt.includes('inventoryRemove') || prompt.includes('inventory'));
  });
});

describe('novelWritingPrompt', () => {
  const mockWorldState = {
    currentLocation: { name: 'Desert' },
    characters: [
      { name: 'Sarah', personality: 'brave' },
      { name: 'Mike', personality: 'cautious' }
    ],
    storyGoal: 'Find rescue',
    tensions: ['Need water'],
    storyEnding: null
  };

  const mockEvents = [
    'Sarah and Mike found a small oasis',
    'They collected water in their bottles',
    'A snake attacked but Mike fought it off'
  ];

  it('should include day number', () => {
    const prompt = novelWritingPrompt(1, mockEvents, mockWorldState, 'Stephen King');
    assert.ok(prompt.includes('1') || prompt.includes('FIRST'));
  });

  it('should include author style', () => {
    const prompt = novelWritingPrompt(1, mockEvents, mockWorldState, 'Stephen King');
    assert.ok(prompt.includes('Stephen King'));
  });

  it('should include events', () => {
    const prompt = novelWritingPrompt(1, mockEvents, mockWorldState, 'Stephen King');
    assert.ok(prompt.includes('oasis'));
    assert.ok(prompt.includes('snake'));
  });

  it('should include characters', () => {
    const prompt = novelWritingPrompt(1, mockEvents, mockWorldState, 'Stephen King');
    assert.ok(prompt.includes('Sarah'));
    assert.ok(prompt.includes('Mike'));
  });

  it('should include story goal', () => {
    const prompt = novelWritingPrompt(1, mockEvents, mockWorldState, 'Stephen King');
    assert.ok(prompt.includes('rescue') || prompt.includes('Find'));
  });

  it('should handle continuation mode', () => {
    const existingNovel = 'Chapter 1: The crash...';
    const prompt = novelWritingPrompt(2, mockEvents, mockWorldState, 'Stephen King', true, false, existingNovel);
    assert.ok(prompt.includes('Chapter 1') || prompt.includes('THE STORY SO FAR'));
  });

  it('should handle ending mode', () => {
    const endingWorldState = {
      ...mockWorldState,
      storyEnding: { type: 'victory', summary: 'They were rescued' }
    };
    const prompt = novelWritingPrompt(5, mockEvents, endingWorldState, 'Stephen King', false, true);
    assert.ok(prompt.includes('ending') || prompt.includes('ENDING') || prompt.includes('conclusion'));
  });

  it('should include English language requirement', () => {
    const prompt = novelWritingPrompt(1, mockEvents, mockWorldState, 'Stephen King');
    assert.ok(prompt.includes('English'));
  });

  it('should include writing requirements', () => {
    const prompt = novelWritingPrompt(1, mockEvents, mockWorldState, 'Stephen King');
    assert.ok(prompt.includes('REQUIREMENTS') || prompt.includes('Requirements'));
  });
});
