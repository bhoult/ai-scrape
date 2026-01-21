import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { WorldState } from '../src/world-state.js';

describe('Movement and Distance Calculations', () => {
  let worldState;

  beforeEach(() => {
    worldState = new WorldState();
    worldState.initialize({
      location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
      characters: [
        {
          id: 'char_sarah',
          name: 'Sarah',
          appearance: {},
          clothing: 'hiking gear',
          personality: 'brave',
          goals: 'survive',
          inventory: [],
          status: 'healthy',
          stats: { health: 100, stamina: 100 },
          position: { x: 0, y: 0 },
          attitudes: {},
          sightDistance: 2000
        }
      ],
      narrative: 'Initial',
      worldsummary: 'Test',
      time: { day: 1, hour: 8, minute: 0 }
    });
  });

  describe('getDistance', () => {
    it('should calculate distance between two points', () => {
      const pos1 = { x: 0, y: 0 };
      const pos2 = { x: 3, y: 4 };
      const distance = worldState.getDistance(pos1, pos2);
      assert.strictEqual(distance, 5); // 3-4-5 triangle
    });

    it('should return 0 for same position', () => {
      const pos = { x: 10, y: 20 };
      const distance = worldState.getDistance(pos, pos);
      assert.strictEqual(distance, 0);
    });

    it('should handle negative coordinates', () => {
      const pos1 = { x: -3, y: -4 };
      const pos2 = { x: 0, y: 0 };
      const distance = worldState.getDistance(pos1, pos2);
      assert.strictEqual(distance, 5);
    });

    it('should handle large distances', () => {
      const pos1 = { x: 0, y: 0 };
      const pos2 = { x: 6000, y: 8000 };
      const distance = worldState.getDistance(pos1, pos2);
      assert.strictEqual(distance, 10000); // 10km
    });
  });

  describe('movement updates', () => {
    it('should move character north', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'north', distance: 100 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 0);
      assert.strictEqual(sarah.position.y, 100);
    });

    it('should move character south', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'south', distance: 100 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 0);
      assert.strictEqual(sarah.position.y, -100);
    });

    it('should move character east', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'east', distance: 100 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 100);
      assert.strictEqual(sarah.position.y, 0);
    });

    it('should move character west', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'west', distance: 100 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, -100);
      assert.strictEqual(sarah.position.y, 0);
    });

    it('should move character northeast', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'northeast', distance: 141 } // ~100 * sqrt(2)
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      // Northeast should have positive x and positive y
      assert.ok(sarah.position.x > 0, 'x should be positive');
      assert.ok(sarah.position.y > 0, 'y should be positive');
    });

    it('should move character southwest', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'southwest', distance: 141 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      // Southwest should have negative x and negative y
      assert.ok(sarah.position.x < 0, 'x should be negative');
      assert.ok(sarah.position.y < 0, 'y should be negative');
    });

    it('should move character using degrees (0 = north)', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 0, distance: 100 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 0);
      assert.strictEqual(sarah.position.y, 100);
    });

    it('should move character using degrees (90 = east)', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 90, distance: 100 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 100);
      assert.strictEqual(sarah.position.y, 0);
    });

    it('should move character using degrees (180 = south)', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 180, distance: 100 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 0);
      assert.strictEqual(sarah.position.y, -100);
    });

    it('should move character using degrees (270 = west)', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 270, distance: 100 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, -100);
      assert.strictEqual(sarah.position.y, 0);
    });

    it('should accumulate movements', () => {
      // First movement
      worldState.applyChanges({
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'north', distance: 100 }
        }]
      });

      // Second movement
      worldState.applyChanges({
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'east', distance: 50 }
        }]
      });

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 50);
      assert.strictEqual(sarah.position.y, 100);
    });

    it('should handle zero distance movement', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'north', distance: 0 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 0);
      assert.strictEqual(sarah.position.y, 0);
    });

    it('should handle negative distance as zero', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          movement: { direction: 'north', distance: -100 }
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.position.x, 0);
      assert.strictEqual(sarah.position.y, 0);
    });
  });

  describe('sight distance updates', () => {
    it('should update character sight distance', () => {
      const changes = {
        characterupdates: [{
          id: 'char_sarah',
          sightdistance: 5000
        }]
      };

      worldState.applyChanges(changes);

      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      assert.strictEqual(sarah.sightDistance, 5000);
    });

    it('should not update sight distance with invalid values', () => {
      const sarah = worldState.characters.find(c => c.id === 'char_sarah');
      const originalSightDistance = sarah.sightDistance;

      worldState.applyChanges({
        characterupdates: [{
          id: 'char_sarah',
          sightdistance: -100
        }]
      });

      assert.strictEqual(sarah.sightDistance, originalSightDistance);

      worldState.applyChanges({
        characterupdates: [{
          id: 'char_sarah',
          sightdistance: 0
        }]
      });

      assert.strictEqual(sarah.sightDistance, originalSightDistance);
    });
  });
});

describe('Auto-Discovery of Map Features', () => {
  let worldState;

  beforeEach(() => {
    worldState = new WorldState();
  });

  it('should auto-discover features within sight range at initialization', () => {
    worldState.initialize({
      location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
      characters: [
        {
          id: 'char_sarah',
          name: 'Sarah',
          appearance: {},
          clothing: 'gear',
          personality: 'brave',
          goals: 'survive',
          inventory: [],
          status: 'healthy',
          stats: { health: 100 },
          position: { x: 0, y: 0 },
          attitudes: {},
          sightDistance: 2000
        }
      ],
      mapfeatures: [
        { id: 'feat_near', name: 'Near Oasis', type: 'water_source', position: { x: 500, y: 0 }, visibleFrom: 1000 },
        { id: 'feat_far', name: 'Distant Mountain', type: 'landmark', position: { x: 5000, y: 0 }, visibleFrom: 3000 }
      ],
      narrative: 'Initial',
      worldsummary: 'Test',
      time: { day: 1, hour: 8, minute: 0 }
    });

    const nearFeature = worldState.mapFeatures.find(f => f.id === 'feat_near');
    const farFeature = worldState.mapFeatures.find(f => f.id === 'feat_far');

    assert.strictEqual(nearFeature.discovered, true, 'Near feature should be discovered');
    assert.strictEqual(farFeature.discovered, false, 'Far feature should not be discovered');
  });

  it('should discover features when character moves close enough', () => {
    worldState.initialize({
      location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
      characters: [
        {
          id: 'char_sarah',
          name: 'Sarah',
          appearance: {},
          clothing: 'gear',
          personality: 'brave',
          goals: 'survive',
          inventory: [],
          status: 'healthy',
          stats: { health: 100 },
          position: { x: 0, y: 0 },
          attitudes: {},
          sightDistance: 1000
        }
      ],
      mapfeatures: [
        { id: 'feat_1', name: 'Hidden Cave', type: 'shelter', position: { x: 2000, y: 0 }, visibleFrom: 500 }
      ],
      narrative: 'Initial',
      worldsummary: 'Test',
      time: { day: 1, hour: 8, minute: 0 }
    });

    // Feature should not be discovered initially (distance 2000 > min(1000, 500))
    let feature = worldState.mapFeatures.find(f => f.id === 'feat_1');
    assert.strictEqual(feature.discovered, false);

    // Move character closer
    worldState.applyChanges({
      characterupdates: [{
        id: 'char_sarah',
        movement: { direction: 'east', distance: 1600 }
      }]
    });

    // Now distance is 400, which is <= min(1000, 500) = 500
    feature = worldState.mapFeatures.find(f => f.id === 'feat_1');
    assert.strictEqual(feature.discovered, true);
  });

  it('should use minimum of sight distance and visibleFrom', () => {
    worldState.initialize({
      location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
      characters: [
        {
          id: 'char_sarah',
          name: 'Sarah',
          appearance: {},
          clothing: 'gear',
          personality: 'brave',
          goals: 'survive',
          inventory: [],
          status: 'healthy',
          stats: { health: 100 },
          position: { x: 0, y: 0 },
          attitudes: {},
          sightDistance: 500 // Low sight distance
        }
      ],
      mapfeatures: [
        { id: 'feat_1', name: 'Large Mountain', type: 'landmark', position: { x: 700, y: 0 }, visibleFrom: 5000 } // Visible from far
      ],
      narrative: 'Initial',
      worldsummary: 'Test',
      time: { day: 1, hour: 8, minute: 0 }
    });

    // Feature should not be discovered (distance 700 > sight 500, even though visibleFrom is 5000)
    const feature = worldState.mapFeatures.find(f => f.id === 'feat_1');
    assert.strictEqual(feature.discovered, false, 'Feature should not be discovered due to low sight distance');
  });

  it('should not discover features for dead characters', () => {
    worldState.initialize({
      location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
      characters: [
        {
          id: 'char_sarah',
          name: 'Sarah',
          appearance: {},
          clothing: 'gear',
          personality: 'brave',
          goals: 'survive',
          inventory: [],
          status: 'dead',
          stats: { health: 0 },
          position: { x: 0, y: 0 },
          attitudes: {},
          sightDistance: 5000
        }
      ],
      mapfeatures: [
        { id: 'feat_1', name: 'Oasis', type: 'water_source', position: { x: 100, y: 0 }, visibleFrom: 500 }
      ],
      narrative: 'Initial',
      worldsummary: 'Test',
      time: { day: 1, hour: 8, minute: 0 }
    });

    const feature = worldState.mapFeatures.find(f => f.id === 'feat_1');
    assert.strictEqual(feature.discovered, false, 'Dead characters should not discover features');
  });

  it('should record discovery turn number', () => {
    worldState.initialize({
      location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
      characters: [
        {
          id: 'char_sarah',
          name: 'Sarah',
          appearance: {},
          clothing: 'gear',
          personality: 'brave',
          goals: 'survive',
          inventory: [],
          status: 'healthy',
          stats: { health: 100 },
          position: { x: 0, y: 0 },
          attitudes: {},
          sightDistance: 2000
        }
      ],
      mapfeatures: [
        { id: 'feat_1', name: 'Cave', type: 'shelter', position: { x: 3000, y: 0 }, visibleFrom: 500 }
      ],
      narrative: 'Initial',
      worldsummary: 'Test',
      time: { day: 1, hour: 8, minute: 0 }
    });

    // Advance a few turns
    worldState.advanceTurn('Turn 1', 'Summary', { day: 1, hour: 9, minute: 0 });
    worldState.advanceTurn('Turn 2', 'Summary', { day: 1, hour: 10, minute: 0 });

    // Move close enough to discover
    worldState.applyChanges({
      characterupdates: [{
        id: 'char_sarah',
        movement: { direction: 'east', distance: 2700 }
      }]
    });

    const feature = worldState.mapFeatures.find(f => f.id === 'feat_1');
    assert.strictEqual(feature.discovered, true);
    assert.strictEqual(feature.discoveredTurn, 2); // Should be current turn number
  });

  it('should discover feature if any character can see it', () => {
    worldState.initialize({
      location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
      characters: [
        {
          id: 'char_sarah',
          name: 'Sarah',
          appearance: {},
          clothing: 'gear',
          personality: 'brave',
          goals: 'survive',
          inventory: [],
          status: 'healthy',
          stats: { health: 100 },
          position: { x: 0, y: 0 },
          attitudes: {},
          sightDistance: 500
        },
        {
          id: 'char_mike',
          name: 'Mike',
          appearance: {},
          clothing: 'gear',
          personality: 'cautious',
          goals: 'survive',
          inventory: [],
          status: 'healthy',
          stats: { health: 100 },
          position: { x: 900, y: 0 },
          attitudes: {},
          sightDistance: 500
        }
      ],
      mapfeatures: [
        { id: 'feat_1', name: 'Oasis', type: 'water_source', position: { x: 1000, y: 0 }, visibleFrom: 500 }
      ],
      narrative: 'Initial',
      worldsummary: 'Test',
      time: { day: 1, hour: 8, minute: 0 }
    });

    // Sarah is 1000m away (too far), Mike is 100m away (close enough)
    const feature = worldState.mapFeatures.find(f => f.id === 'feat_1');
    assert.strictEqual(feature.discovered, true, 'Feature should be discovered by Mike');
  });

  it('should not re-discover already discovered features', () => {
    worldState.initialize({
      location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
      characters: [
        {
          id: 'char_sarah',
          name: 'Sarah',
          appearance: {},
          clothing: 'gear',
          personality: 'brave',
          goals: 'survive',
          inventory: [],
          status: 'healthy',
          stats: { health: 100 },
          position: { x: 0, y: 0 },
          attitudes: {},
          sightDistance: 1000
        }
      ],
      mapfeatures: [
        { id: 'feat_1', name: 'Oasis', type: 'water_source', position: { x: 500, y: 0 }, visibleFrom: 1000 }
      ],
      narrative: 'Initial',
      worldsummary: 'Test',
      time: { day: 1, hour: 8, minute: 0 }
    });

    const feature = worldState.mapFeatures.find(f => f.id === 'feat_1');
    assert.strictEqual(feature.discovered, true);
    assert.strictEqual(feature.discoveredTurn, 0);

    // Advance turn and apply changes
    worldState.advanceTurn('Turn 1', 'Summary', { day: 1, hour: 9, minute: 0 });
    worldState.applyChanges({
      characterupdates: [{
        id: 'char_sarah',
        movement: { direction: 'east', distance: 100 }
      }]
    });

    // Discovery turn should not change
    assert.strictEqual(feature.discoveredTurn, 0);
  });
});

describe('Time Progression', () => {
  let worldState;

  beforeEach(() => {
    worldState = new WorldState();
    worldState.initialize({
      location: { id: 'loc_1', name: 'Test', description: 'Test', exits: [], items: [], npcs: [] },
      characters: [{ id: 'char_1', name: 'Test', appearance: {}, clothing: '', personality: '', goals: '', inventory: [], status: 'healthy', stats: {}, position: { x: 0, y: 0 }, attitudes: {} }],
      narrative: 'Initial',
      worldsummary: 'Test',
      time: { day: 1, hour: 8, minute: 0 }
    });
  });

  it('should advance time forward', () => {
    worldState.advanceTurn('Narrative', 'Summary', { day: 1, hour: 9, minute: 30 });

    assert.strictEqual(worldState.time.day, 1);
    assert.strictEqual(worldState.time.hour, 9);
    assert.strictEqual(worldState.time.minute, 30);
  });

  it('should handle day change', () => {
    worldState.advanceTurn('Narrative', 'Summary', { day: 2, hour: 6, minute: 0 });

    assert.strictEqual(worldState.time.day, 2);
    assert.strictEqual(worldState.time.hour, 6);
  });

  it('should accept any valid time value', () => {
    worldState.advanceTurn('Turn 1', 'Summary', { day: 1, hour: 10, minute: 0 });
    worldState.advanceTurn('Turn 2', 'Summary', { day: 1, hour: 8, minute: 0 });

    // Time is set to whatever value is provided (no backwards prevention)
    assert.strictEqual(worldState.time.hour, 8);
    assert.strictEqual(worldState.time.day, 1);
  });

  it('should handle time in applyChanges', () => {
    worldState.applyChanges({
      time: { day: 1, hour: 12, minute: 45 }
    });

    assert.strictEqual(worldState.time.hour, 12);
    assert.strictEqual(worldState.time.minute, 45);
  });
});
