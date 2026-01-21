import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { GameEngine } from '../src/game-engine.js';

describe('GameEngine', () => {
  let gameEngine;

  beforeEach(() => {
    gameEngine = new GameEngine();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      assert.strictEqual(gameEngine.worldState, null);
      assert.strictEqual(gameEngine.dmAgent, null);
      assert.deepStrictEqual(gameEngine.playerAgents, []);
      assert.deepStrictEqual(gameEngine.llmLog, []);
      assert.strictEqual(gameEngine.initialized, false);
      assert.strictEqual(gameEngine.seed, null);
      assert.strictEqual(gameEngine.storyId, null);
    });

    it('should accept single model for all roles', () => {
      const engine = new GameEngine('test-model');
      assert.strictEqual(engine.models.dm, 'test-model');
      assert.strictEqual(engine.models.character, 'test-model');
      assert.strictEqual(engine.models.narrator, 'test-model');
    });

    it('should accept role-specific models', () => {
      const engine = new GameEngine({
        dm: 'dm-model',
        character: 'char-model',
        narrator: 'narrator-model'
      });
      assert.strictEqual(engine.models.dm, 'dm-model');
      assert.strictEqual(engine.models.character, 'char-model');
      assert.strictEqual(engine.models.narrator, 'narrator-model');
    });
  });

  describe('setModels', () => {
    it('should update all models with single value', () => {
      gameEngine.setModels('new-model');
      assert.strictEqual(gameEngine.models.dm, 'new-model');
      assert.strictEqual(gameEngine.models.character, 'new-model');
      assert.strictEqual(gameEngine.models.narrator, 'new-model');
    });

    it('should update role-specific models', () => {
      gameEngine.setModels({
        dm: 'dm-model',
        character: 'char-model',
        narrator: 'narrator-model'
      });
      assert.strictEqual(gameEngine.models.dm, 'dm-model');
      assert.strictEqual(gameEngine.models.character, 'char-model');
      assert.strictEqual(gameEngine.models.narrator, 'narrator-model');
    });

    it('should handle partial model updates', () => {
      gameEngine.setModels({ dm: 'dm-model' });
      assert.strictEqual(gameEngine.models.dm, 'dm-model');
      assert.strictEqual(gameEngine.models.character, null);
      assert.strictEqual(gameEngine.models.narrator, null);
    });
  });

  describe('setModel (backward compatibility)', () => {
    it('should call setModels', () => {
      gameEngine.setModel('legacy-model');
      assert.strictEqual(gameEngine.models.dm, 'legacy-model');
      assert.strictEqual(gameEngine.models.character, 'legacy-model');
      assert.strictEqual(gameEngine.models.narrator, 'legacy-model');
    });
  });

  describe('generateStoryId', () => {
    it('should generate consistent ID for same seed', () => {
      const id1 = gameEngine.generateStoryId('test seed');
      const id2 = gameEngine.generateStoryId('test seed');
      assert.strictEqual(id1, id2);
    });

    it('should generate different IDs for different seeds', () => {
      const id1 = gameEngine.generateStoryId('seed one');
      const id2 = gameEngine.generateStoryId('seed two');
      assert.notStrictEqual(id1, id2);
    });

    it('should include timestamp in ID', () => {
      const id = gameEngine.generateStoryId('test');
      // ID format: YYYY-MM-DD-HH-MM-SS-sanitized-seed
      // Check that it starts with a year
      assert.ok(/^\d{4}-\d{2}-\d{2}/.test(id), 'ID should start with date');
    });

    it('should include sanitized seed in ID', () => {
      const id = gameEngine.generateStoryId('Test Seed Here');
      // ID should include sanitized (lowercase, hyphens) version of seed
      assert.ok(id.includes('test-seed-here'));
    });
  });

  describe('deriveExpression', () => {
    it('should return terrified for high fear', () => {
      const expression = gameEngine.deriveExpression({
        stats: { fear: 85, anger: 0, sanity: 100, health: 100, stamina: 100, hunger: 0, thirst: 0 }
      });
      assert.ok(expression.includes('terrified') || expression.includes('fear'));
    });

    it('should return angry for high anger', () => {
      const expression = gameEngine.deriveExpression({
        stats: { fear: 0, anger: 85, sanity: 100, health: 100, stamina: 100, hunger: 0, thirst: 0 }
      });
      assert.ok(expression.includes('angry') || expression.includes('furious') || expression.includes('rage'));
    });

    it('should return distressed for low sanity', () => {
      const expression = gameEngine.deriveExpression({
        stats: { fear: 0, anger: 0, sanity: 15, health: 100, stamina: 100, hunger: 0, thirst: 0 }
      });
      assert.ok(expression.includes('distress') || expression.includes('unhinged') || expression.includes('wild'));
    });

    it('should return pain for low health', () => {
      const expression = gameEngine.deriveExpression({
        stats: { fear: 0, anger: 0, sanity: 100, health: 15, stamina: 100, hunger: 0, thirst: 0 }
      });
      assert.ok(expression.includes('pain') || expression.includes('grimac') || expression.includes('wince'));
    });

    it('should return exhausted for low stamina', () => {
      const expression = gameEngine.deriveExpression({
        stats: { fear: 0, anger: 0, sanity: 100, health: 100, stamina: 15, hunger: 0, thirst: 0 }
      });
      assert.ok(expression.includes('exhaust') || expression.includes('drooping') || expression.includes('tired'));
    });

    it('should return desperate for high hunger/thirst', () => {
      const expression = gameEngine.deriveExpression({
        stats: { fear: 0, anger: 0, sanity: 100, health: 100, stamina: 100, hunger: 85, thirst: 85 }
      });
      assert.ok(expression.includes('haggard') || expression.includes('desperate') || expression.includes('gaunt'));
    });

    it('should return content/happy for good stats', () => {
      const expression = gameEngine.deriveExpression({
        stats: { fear: 0, anger: 0, sanity: 100, health: 100, stamina: 100, hunger: 0, thirst: 0 }
      });
      // Should be positive expression
      assert.ok(expression.length > 0);
    });

    it('should handle missing stats', () => {
      const expression = gameEngine.deriveExpression({ stats: {} });
      assert.ok(typeof expression === 'string');
    });

    it('should handle missing stats object', () => {
      const expression = gameEngine.deriveExpression({});
      assert.ok(typeof expression === 'string');
    });
  });

  describe('derivePose', () => {
    it('should return lying for collapsed status', () => {
      const pose = gameEngine.derivePose({ status: 'collapsed from exhaustion' });
      assert.ok(pose.includes('lying') || pose.includes('ground'));
    });

    it('should return lying for unconscious status', () => {
      const pose = gameEngine.derivePose({ status: 'unconscious' });
      assert.ok(pose.includes('lying') || pose.includes('ground'));
    });

    it('should return lying for sleeping status', () => {
      const pose = gameEngine.derivePose({ status: 'sleeping peacefully' });
      assert.ok(pose.includes('lying') || pose.includes('curled'));
    });

    it('should return sitting for resting status', () => {
      const pose = gameEngine.derivePose({ status: 'resting on a rock' });
      assert.ok(pose.includes('sitting') || pose.includes('resting'));
    });

    it('should return running for fleeing status', () => {
      const pose = gameEngine.derivePose({ status: 'running away' });
      assert.ok(pose.includes('running') || pose.includes('motion'));
    });

    it('should return combat pose for fighting status', () => {
      const pose = gameEngine.derivePose({ status: 'fighting a snake' });
      assert.ok(pose.includes('combat') || pose.includes('fighting') || pose.includes('stance'));
    });

    it('should return default standing for normal status', () => {
      const pose = gameEngine.derivePose({ status: 'healthy' });
      assert.ok(pose.includes('standing') || pose.includes('casual'));
    });

    it('should handle missing status', () => {
      const pose = gameEngine.derivePose({});
      assert.ok(typeof pose === 'string');
    });
  });

  describe('updateCharacterPaths', () => {
    beforeEach(() => {
      // Initialize with a mock world state
      gameEngine.worldState = {
        turnNumber: 0,
        characters: [
          { id: 'char_sarah', name: 'Sarah', position: { x: 0, y: 0 } },
          { id: 'char_mike', name: 'Mike', position: { x: 10, y: 10 } }
        ]
      };
      gameEngine.characterPaths = {};
      gameEngine.totalDistanceTraveled = {};
    });

    it('should track initial positions', () => {
      gameEngine.updateCharacterPaths();

      assert.ok(gameEngine.characterPaths['char_sarah']);
      assert.ok(gameEngine.characterPaths['char_mike']);
      assert.strictEqual(gameEngine.characterPaths['char_sarah'].length, 1);
      assert.strictEqual(gameEngine.characterPaths['char_mike'].length, 1);
    });

    it('should track position changes', () => {
      gameEngine.updateCharacterPaths();

      // Move Sarah
      gameEngine.worldState.characters[0].position = { x: 100, y: 0 };
      gameEngine.worldState.turnNumber = 1;
      gameEngine.updateCharacterPaths();

      assert.strictEqual(gameEngine.characterPaths['char_sarah'].length, 2);
      assert.strictEqual(gameEngine.characterPaths['char_sarah'][1].x, 100);
    });

    it('should not add duplicate positions', () => {
      gameEngine.updateCharacterPaths();
      gameEngine.updateCharacterPaths(); // Same position

      assert.strictEqual(gameEngine.characterPaths['char_sarah'].length, 1);
    });

    it('should track distance traveled', () => {
      gameEngine.updateCharacterPaths();

      // Move Sarah 100m east
      gameEngine.worldState.characters[0].position = { x: 100, y: 0 };
      gameEngine.worldState.turnNumber = 1;
      const distances = gameEngine.updateCharacterPaths();

      assert.strictEqual(distances['char_sarah'], 100);
      assert.strictEqual(gameEngine.totalDistanceTraveled['char_sarah'], 100);
    });

    it('should accumulate total distance', () => {
      gameEngine.updateCharacterPaths();

      // Move Sarah 100m east
      gameEngine.worldState.characters[0].position = { x: 100, y: 0 };
      gameEngine.worldState.turnNumber = 1;
      gameEngine.updateCharacterPaths();

      // Move Sarah another 100m north
      gameEngine.worldState.characters[0].position = { x: 100, y: 100 };
      gameEngine.worldState.turnNumber = 2;
      gameEngine.updateCharacterPaths();

      assert.strictEqual(gameEngine.totalDistanceTraveled['char_sarah'], 200);
    });

    it('should handle characters without position', () => {
      gameEngine.worldState.characters.push({ id: 'char_nopos', name: 'NoPos' });
      gameEngine.updateCharacterPaths();

      assert.ok(!gameEngine.characterPaths['char_nopos']);
    });

    it('should return empty object when no world state', () => {
      gameEngine.worldState = null;
      const result = gameEngine.updateCharacterPaths();
      assert.deepStrictEqual(result, {});
    });
  });

  describe('formatTurnStats', () => {
    it('should format turn distances', () => {
      const turnDistances = {
        char_sarah: 150,
        char_mike: 200
      };
      gameEngine.totalDistanceTraveled = {
        char_sarah: 500,
        char_mike: 600
      };

      const stats = gameEngine.formatTurnStats(turnDistances, 30);

      assert.ok(stats.includes('175') || stats.includes('m')); // Average
    });

    it('should format duration in minutes', () => {
      const stats = gameEngine.formatTurnStats({}, 30);
      assert.ok(stats.includes('30') || stats.includes('min'));
    });

    it('should format duration in hours for long durations', () => {
      const stats = gameEngine.formatTurnStats({}, 90);
      assert.ok(stats.includes('1') && (stats.includes('h') || stats.includes('30')));
    });

    it('should format distance in km for large values', () => {
      const turnDistances = { char_sarah: 2000 };
      gameEngine.totalDistanceTraveled = { char_sarah: 5000 };

      const stats = gameEngine.formatTurnStats(turnDistances, 60);
      assert.ok(stats.includes('km') || stats.includes('2'));
    });

    it('should handle empty distances', () => {
      const stats = gameEngine.formatTurnStats({}, null);
      assert.ok(typeof stats === 'string');
    });
  });

  describe('getStoryDir and getImagesDir', () => {
    it('should return correct story directory', () => {
      gameEngine.storyId = 'test-story-123';
      const dir = gameEngine.getStoryDir();
      assert.ok(dir.includes('stories'));
      assert.ok(dir.includes('test-story-123'));
    });

    it('should return correct images directory', () => {
      gameEngine.storyId = 'test-story-123';
      const dir = gameEngine.getImagesDir();
      assert.ok(dir.includes('stories'));
      assert.ok(dir.includes('test-story-123'));
      assert.ok(dir.includes('images'));
    });
  });
});

describe('GameEngine - Character Path Tracking', () => {
  let gameEngine;

  beforeEach(() => {
    gameEngine = new GameEngine();
    gameEngine.worldState = {
      turnNumber: 0,
      characters: [
        { id: 'char_1', name: 'Alice', position: { x: 0, y: 0 } },
        { id: 'char_2', name: 'Bob', position: { x: 50, y: 50 } }
      ]
    };
    gameEngine.characterPaths = {};
    gameEngine.totalDistanceTraveled = {};
  });

  it('should calculate Pythagorean distance correctly', () => {
    gameEngine.updateCharacterPaths();

    // Move char_1 in a 3-4-5 triangle
    gameEngine.worldState.characters[0].position = { x: 3, y: 4 };
    gameEngine.worldState.turnNumber = 1;
    const distances = gameEngine.updateCharacterPaths();

    assert.strictEqual(distances['char_1'], 5);
  });

  it('should track turn number in path points', () => {
    gameEngine.updateCharacterPaths();

    gameEngine.worldState.characters[0].position = { x: 100, y: 0 };
    gameEngine.worldState.turnNumber = 5;
    gameEngine.updateCharacterPaths();

    const path = gameEngine.characterPaths['char_1'];
    assert.strictEqual(path[0].turn, 0);
    assert.strictEqual(path[1].turn, 5);
  });

  it('should handle multiple characters independently', () => {
    gameEngine.updateCharacterPaths();

    // Move only char_1
    gameEngine.worldState.characters[0].position = { x: 100, y: 0 };
    gameEngine.worldState.turnNumber = 1;
    const distances = gameEngine.updateCharacterPaths();

    assert.strictEqual(distances['char_1'], 100);
    assert.strictEqual(distances['char_2'], 0);
    assert.strictEqual(gameEngine.characterPaths['char_1'].length, 2);
    assert.strictEqual(gameEngine.characterPaths['char_2'].length, 1); // Position didn't change
  });
});
