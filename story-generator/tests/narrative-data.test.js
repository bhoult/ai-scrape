import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { playerThinkTalkPrompt, playerActionPrompt } from '../src/prompts.js';

describe('Narrative Data Usage', () => {
  describe('History in Player Prompts', () => {
    const mockCharacter = {
      id: 'char_sarah',
      name: 'Sarah',
      appearance: { gender: 'female', age: 28 },
      clothing: 'hiking gear',
      personality: 'determined',
      goals: 'survive',
      inventory: ['water bottle'],
      status: 'healthy',
      stats: { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, intelligence: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 },
      position: { x: 0, y: 0 },
      attitudes: {}
    };

    const mockWorldState = {
      turnNumber: 5,
      summary: 'Two survivors in the desert',
      currentLocation: {
        id: 'loc_desert',
        name: 'Desert',
        description: 'A hot desert with sand dunes',
        exits: ['north', 'south'],
        items: ['rock'],
        npcs: []
      },
      characters: [
        mockCharacter,
        { id: 'char_mike', name: 'Mike', position: { x: 5, y: 0 } }
      ],
      deadBodies: [],
      discoveredObjects: [],
      time: { day: 1, hour: 10, minute: 30 },
      environment: { type: 'desert', weather: 'clear', temperature: 'hot' },
      storyGoal: 'Find rescue',
      majorEvents: ['Plane crashed'],
      tensions: ['Need water']
    };

    it('should include recent history in playerThinkTalkPrompt', () => {
      const recentHistory = [
        'Sarah and Mike stumbled through the dunes.',
        'They found a small rock for shade.',
        'Mike spotted a dried riverbed to the north.'
      ];

      const prompt = playerThinkTalkPrompt(mockCharacter, mockWorldState, recentHistory, []);

      // Verify history appears in the prompt
      assert.ok(prompt.includes('RECENT EVENTS:'), 'Prompt should have RECENT EVENTS section');
      assert.ok(prompt.includes('Sarah and Mike stumbled through the dunes'), 'Should include first history item');
      assert.ok(prompt.includes('They found a small rock for shade'), 'Should include second history item');
      assert.ok(prompt.includes('Mike spotted a dried riverbed'), 'Should include third history item');
    });

    it('should include recent history in playerActionPrompt', () => {
      const recentHistory = [
        'The sun beat down mercilessly.',
        'Water supplies were running low.',
        'A distant mountain range became visible.'
      ];

      const prompt = playerActionPrompt(mockCharacter, mockWorldState, recentHistory, []);

      // Verify history appears in the prompt
      assert.ok(prompt.includes('RECENT EVENTS:'), 'Prompt should have RECENT EVENTS section');
      assert.ok(prompt.includes('The sun beat down mercilessly'), 'Should include first history item');
      assert.ok(prompt.includes('Water supplies were running low'), 'Should include second history item');
      assert.ok(prompt.includes('A distant mountain range became visible'), 'Should include third history item');
    });

    it('should handle empty history gracefully', () => {
      const prompt = playerThinkTalkPrompt(mockCharacter, mockWorldState, [], []);

      assert.ok(prompt.includes('RECENT EVENTS:'), 'Prompt should have RECENT EVENTS section');
      assert.ok(prompt.includes('No recent events'), 'Should indicate no recent events');
    });

    it('should format history as bullet points', () => {
      const recentHistory = ['Event one.', 'Event two.'];
      const prompt = playerThinkTalkPrompt(mockCharacter, mockWorldState, recentHistory, []);

      // History should be formatted with bullet points
      assert.ok(prompt.includes('- Event one.'), 'Should format history with bullet points');
      assert.ok(prompt.includes('- Event two.'), 'Should format history with bullet points');
    });
  });

  describe('storyContent Structure', () => {
    it('should have correct structure for markdown generation', () => {
      // Simulate storyContent structure
      const storyContent = [
        '# Two survivors crash in the desert',
        '## Opening - Day 1, 08:00',
        'The plane went down in the middle of the desert.',
        '## Turn 1 - Day 1, 08:30',
        'Sarah and Mike assessed their situation.',
        '## Turn 2 - Day 1, 09:00',
        'They began walking north.'
      ];

      // Verify structure: title, then pairs of header + narrative
      assert.ok(storyContent[0].startsWith('#'), 'First item should be title');
      assert.ok(storyContent[1].startsWith('## Opening'), 'Second item should be opening header');
      assert.ok(!storyContent[2].startsWith('#'), 'Third item should be narrative (not header)');
      assert.ok(storyContent[3].startsWith('## Turn 1'), 'Fourth item should be turn 1 header');
      assert.ok(!storyContent[4].startsWith('#'), 'Fifth item should be narrative');
    });

    it('should extract turn numbers from headers', () => {
      const headers = [
        '## Opening - Day 1, 08:00',
        '## Turn 1 - Day 1, 08:30',
        '## Turn 15 - Day 2, 14:00'
      ];

      const turnNumbers = headers.map(h => {
        const match = h.match(/^## (Opening|Turn (\d+))/);
        if (match) {
          return match[1] === 'Opening' ? 0 : parseInt(match[2]);
        }
        return null;
      });

      assert.deepStrictEqual(turnNumbers, [0, 1, 15], 'Should extract correct turn numbers');
    });
  });

  describe('sceneDescriptions Structure', () => {
    it('should have correct structure for image embedding', () => {
      const sceneDescriptions = [
        {
          turn: 0,
          sceneFocus: 'characters',
          sceneVisuals: { characterAction: 'Characters assessing the crash site' },
          narrative: 'The plane went down in the middle of the desert.',
          imagePath: 'turn-000.jpg',
          success: true
        },
        {
          turn: 1,
          sceneFocus: 'landscape',
          sceneVisuals: { description: 'Vast desert dunes under scorching sun' },
          narrative: 'They looked out at the endless desert.',
          imagePath: 'turn-001.jpg',
          success: true
        }
      ];

      // Verify required fields
      for (const scene of sceneDescriptions) {
        assert.ok(typeof scene.turn === 'number', 'turn should be a number');
        assert.ok(['characters', 'landscape', 'object', 'phenomenon'].includes(scene.sceneFocus),
          'sceneFocus should be valid type');
        assert.ok(typeof scene.sceneVisuals === 'object', 'sceneVisuals should be an object');
        assert.ok(typeof scene.imagePath === 'string', 'imagePath should be a string');
        assert.ok(typeof scene.success === 'boolean', 'success should be a boolean');
      }
    });

    it('should find scene by turn number', () => {
      const sceneDescriptions = [
        { turn: 0, imagePath: 'turn-000.jpg', success: true },
        { turn: 1, imagePath: 'turn-001.jpg', success: true },
        { turn: 5, imagePath: 'turn-005.jpg', success: false }
      ];

      const scene1 = sceneDescriptions.find(s => s.turn === 1);
      assert.ok(scene1, 'Should find scene for turn 1');
      assert.strictEqual(scene1.imagePath, 'turn-001.jpg', 'Should have correct image path');

      const scene5 = sceneDescriptions.find(s => s.turn === 5);
      assert.ok(scene5, 'Should find scene for turn 5');
      assert.strictEqual(scene5.success, false, 'Should track failed generations');

      const scene99 = sceneDescriptions.find(s => s.turn === 99);
      assert.ok(!scene99, 'Should return undefined for non-existent turn');
    });

    it('should support scene regeneration filtering', () => {
      let sceneDescriptions = [
        { turn: 0, sceneFocus: 'characters', imagePath: 'turn-000.jpg', success: true },
        { turn: 1, sceneFocus: 'landscape', imagePath: 'turn-001.jpg', success: true },
        { turn: 2, sceneFocus: 'characters', imagePath: 'turn-002.jpg', success: true }
      ];

      // Simulate regenerating turn 1
      sceneDescriptions = sceneDescriptions.filter(s => s.turn !== 1);
      assert.strictEqual(sceneDescriptions.length, 2, 'Should have 2 scenes after filtering');
      assert.ok(!sceneDescriptions.find(s => s.turn === 1), 'Turn 1 should be removed');

      // Add new scene for turn 1
      sceneDescriptions.push({
        turn: 1,
        sceneFocus: 'phenomenon',
        imagePath: 'turn-001.jpg',
        success: true
      });

      const newScene1 = sceneDescriptions.find(s => s.turn === 1);
      assert.strictEqual(newScene1.sceneFocus, 'phenomenon', 'Should have updated sceneFocus');
    });
  });
});

describe('Narrative JSON Save/Load Structure', () => {
  it('should have correct narrative.json structure', () => {
    // Simulate what gets saved to narrative.json
    const narrativeData = {
      storyContent: [
        '# Story Title',
        '## Opening',
        'Opening narrative.'
      ],
      history: [
        'Opening narrative.',
        'Turn 1 narrative.',
        'Turn 2 narrative.'
      ],
      sceneDescriptions: [
        { turn: 0, sceneFocus: 'characters', imagePath: 'turn-000.jpg', success: true }
      ]
    };

    // Verify structure
    assert.ok(Array.isArray(narrativeData.storyContent), 'storyContent should be array');
    assert.ok(Array.isArray(narrativeData.history), 'history should be array');
    assert.ok(Array.isArray(narrativeData.sceneDescriptions), 'sceneDescriptions should be array');

    // Verify history contains narrative text
    assert.ok(narrativeData.history.every(h => typeof h === 'string'), 'history entries should be strings');
  });

  it('should keep history separate from state.json worldState', () => {
    // Simulate what gets saved to state.json (after removing history)
    const worldStateSnapshot = {
      turnNumber: 5,
      summary: 'Story summary',
      currentLocation: { id: 'loc_1', name: 'Location' },
      characters: [],
      time: { day: 1, hour: 10, minute: 0 },
      history: ['narrative 1', 'narrative 2'] // This exists in snapshot
    };

    // When saving to state.json, history is deleted
    const stateForSaving = { ...worldStateSnapshot };
    delete stateForSaving.history;

    assert.ok(!('history' in stateForSaving), 'history should not be in state.json data');
    assert.ok('turnNumber' in stateForSaving, 'other fields should remain');
    assert.ok('summary' in stateForSaving, 'other fields should remain');
  });
});
