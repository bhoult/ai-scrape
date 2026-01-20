// Proximity threshold in meters for communication
const COMMUNICATION_RANGE = 20;

export class WorldState {
  constructor() {
    this.turnNumber = 0;
    this.summary = '';
    this.currentLocation = null;
    this.locations = new Map();
    this.npcs = new Map();
    this.characters = [];
    this.deadBodies = [];          // Dead characters converted to objects
    this.discoveredObjects = [];   // Significant objects found with positions
    this.mapFeatures = [];         // Map features for the surrounding area
    this.flags = new Map();
    this.history = [];
    this.lastTurnActions = {};     // Store actions and dialogue from last turn for proximity communication
    this.time = { day: 1, hour: 8, minute: 0 };
    this.environment = {           // Current environment conditions
      type: '',                    // desert, jungle, forest, cave, building, city, etc.
      terrain: '',                 // sandy dunes, dense undergrowth, etc.
      lighting: '',                // bright sunlight, dim, dark, torchlit, etc.
      weather: '',                 // clear, cloudy, raining, storming, etc.
      temperature: ''              // hot, warm, mild, cold, freezing
    };
    // Narrative arc tracking for long-term coherence
    this.storyGoal = '';           // The ultimate objective characters are working toward
    this.victoryConditions = null; // { primary, requirements, difficulty } - how to achieve victory
    this.narrativeArc = '';        // Current phase/direction of the story
    this.majorEvents = [];         // Significant events that shape the story
    this.tensions = [];            // Unresolved conflicts or challenges
    // Story completion tracking
    this.storyComplete = false;    // Whether the story has ended
    this.storyEnding = null;       // { type: 'victory'|'defeat'|'other', summary: 'description' }
    // Author style for novel generation
    this.authorStyle = null;       // Author whose style to emulate (e.g., "Stephen King", "Hemingway")
  }

  initialize(dmResponse) {
    this.currentLocation = dmResponse.location;
    this.locations.set(dmResponse.location.id, dmResponse.location);
    this.characters = dmResponse.characters;
    this.summary = dmResponse.worldSummary;
    this.history.push(dmResponse.narrative);
    if (dmResponse.time) {
      this.time = dmResponse.time;
    }
    if (dmResponse.environment) {
      this.environment = { ...this.environment, ...dmResponse.environment };
    }
    if (dmResponse.storyGoal) {
      this.storyGoal = dmResponse.storyGoal;
    }
    if (dmResponse.victoryConditions) {
      this.victoryConditions = dmResponse.victoryConditions;
    }
    if (dmResponse.narrativeArc) {
      this.narrativeArc = dmResponse.narrativeArc;
    }
    if (Array.isArray(dmResponse.majorEvents)) {
      this.majorEvents = dmResponse.majorEvents;
    }
    if (Array.isArray(dmResponse.tensions)) {
      this.tensions = dmResponse.tensions;
    }
    if (Array.isArray(dmResponse.discoveredObjects)) {
      this.discoveredObjects = dmResponse.discoveredObjects;
    }
    if (Array.isArray(dmResponse.mapFeatures)) {
      this.mapFeatures = dmResponse.mapFeatures.map(f => ({
        ...f,
        discovered: false,
        discoveredTurn: null
      }));
    }
    if (dmResponse.authorStyle) {
      this.authorStyle = dmResponse.authorStyle;
    }
  }

  applyChanges(changes) {
    if (!changes) return;

    if (changes.locationUpdates && this.currentLocation) {
      if (Array.isArray(changes.locationUpdates.items)) {
        this.currentLocation.items = changes.locationUpdates.items;
      }
      if (typeof changes.locationUpdates.description === 'string' && changes.locationUpdates.description) {
        this.currentLocation.description = changes.locationUpdates.description;
      }
    }

    if (Array.isArray(changes.characterUpdates)) {
      for (const update of changes.characterUpdates) {
        if (!update || !update.id) continue;
        const character = this.characters.find(c => c.id === update.id);
        if (character) {
          if (Array.isArray(update.inventoryAdd)) {
            character.inventory.push(...update.inventoryAdd);
          }
          if (Array.isArray(update.inventoryRemove)) {
            character.inventory = character.inventory.filter(
              item => !update.inventoryRemove.includes(item)
            );
          }
          if (typeof update.statusChange === 'string' && update.statusChange) {
            character.status = update.statusChange;
          }
          if (typeof update.clothingChange === 'string' && update.clothingChange) {
            character.clothing = update.clothingChange;
          }
          if (update.statsChange && typeof update.statsChange === 'object') {
            if (!character.stats) {
              character.stats = { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, intelligence: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 };
            }
            for (const [stat, value] of Object.entries(update.statsChange)) {
              if (typeof value === 'number' && value >= 0 && value <= 100) {
                character.stats[stat] = value;
              }
            }
          }
          // Handle position updates
          if (update.positionChange && typeof update.positionChange === 'object') {
            character.position = {
              x: typeof update.positionChange.x === 'number' ? update.positionChange.x : (character.position?.x || 0),
              y: typeof update.positionChange.y === 'number' ? update.positionChange.y : (character.position?.y || 0)
            };
          }
          // Handle attitude updates
          if (update.attitudesChange && typeof update.attitudesChange === 'object') {
            if (!character.attitudes) {
              character.attitudes = {};
            }
            for (const [targetId, feelings] of Object.entries(update.attitudesChange)) {
              if (typeof feelings === 'object' && feelings !== null) {
                if (!character.attitudes[targetId]) {
                  character.attitudes[targetId] = { love: 50, anger: 0, attraction: 0, trust: 50, fear: 0 };
                }
                for (const [feeling, value] of Object.entries(feelings)) {
                  if (typeof value === 'number' && value >= 0 && value <= 100) {
                    character.attitudes[targetId][feeling] = value;
                  }
                }
              }
            }
          }
        }
      }
    }

    // Only set newLocation if it's a valid location object with required fields
    if (changes.newLocation &&
        typeof changes.newLocation === 'object' &&
        changes.newLocation.id &&
        changes.newLocation.name) {
      this.currentLocation = {
        ...changes.newLocation,
        items: Array.isArray(changes.newLocation.items) ? changes.newLocation.items : [],
        exits: Array.isArray(changes.newLocation.exits) ? changes.newLocation.exits : [],
        npcs: Array.isArray(changes.newLocation.npcs) ? changes.newLocation.npcs : []
      };
      if (!this.locations.has(changes.newLocation.id)) {
        this.locations.set(changes.newLocation.id, this.currentLocation);
      }
    }

    if (changes.time && typeof changes.time === 'object') {
      // Validate time doesn't go backwards
      const newTime = changes.time;
      const currentMinutes = (this.time.day * 24 * 60) + (this.time.hour * 60) + this.time.minute;
      const newMinutes = (newTime.day * 24 * 60) + (newTime.hour * 60) + newTime.minute;

      if (newMinutes > currentMinutes) {
        this.time = newTime;
      } else {
        // Time went backwards, advance by 15 minutes instead
        console.warn('Time went backwards, auto-advancing by 15 minutes');
        let minute = this.time.minute + 15;
        let hour = this.time.hour;
        let day = this.time.day;
        if (minute >= 60) {
          minute -= 60;
          hour++;
        }
        if (hour >= 24) {
          hour -= 24;
          day++;
        }
        this.time = { day, hour, minute };
      }
    }

    if (changes.environmentUpdate && typeof changes.environmentUpdate === 'object') {
      for (const [key, value] of Object.entries(changes.environmentUpdate)) {
        if (typeof value === 'string' && value && value !== 'null') {
          this.environment[key] = value;
        }
      }
    }

    // Handle new characters (max 7 total)
    if (changes.newCharacters && Array.isArray(changes.newCharacters)) {
      const MAX_CHARACTERS = 7;
      for (const newChar of changes.newCharacters) {
        // Check if we're at the limit
        if (this.characters.length >= MAX_CHARACTERS) {
          console.warn(`Cannot add character ${newChar.name}: max ${MAX_CHARACTERS} characters reached`);
          continue;
        }
        // Check for duplicate IDs
        if (this.characters.some(c => c.id === newChar.id)) {
          console.warn(`Cannot add character with duplicate ID: ${newChar.id}`);
          continue;
        }
        // Validate required fields
        if (!newChar.id || !newChar.name) {
          console.warn('Cannot add character without id and name');
          continue;
        }
        // Add the new character with defaults for missing fields
        const character = {
          id: newChar.id,
          name: newChar.name,
          appearance: newChar.appearance || {},
          clothing: newChar.clothing || 'unknown',
          personality: newChar.personality || 'unknown',
          goals: newChar.goals || 'unknown',
          inventory: Array.isArray(newChar.inventory) ? newChar.inventory : [],
          status: newChar.status || 'healthy',
          stats: newChar.stats || { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, intelligence: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 },
          position: newChar.position || { x: 0, y: 0 },
          attitudes: newChar.attitudes || {},
          disposition: newChar.disposition || 'neutral'
        };
        this.characters.push(character);
        console.log(`Added new character: ${character.name} (${character.disposition})`);
      }
    }

    // Handle discovered object updates
    if (Array.isArray(changes.discoveredObjects)) {
      for (const obj of changes.discoveredObjects) {
        if (!obj || !obj.id) continue;
        const existing = this.discoveredObjects.find(o => o.id === obj.id);
        if (existing) {
          // Update existing object
          if (obj.position) existing.position = obj.position;
          if (obj.description) existing.description = obj.description;
          if (obj.status) existing.status = obj.status;
        } else {
          // Add new discovered object
          this.discoveredObjects.push({
            id: obj.id,
            name: obj.name || obj.id,
            description: obj.description || '',
            position: obj.position || null,
            status: obj.status || 'discovered',
            discoveredTurn: this.turnNumber
          });
        }
      }
    }

    // Handle removed objects (picked up, destroyed, etc.)
    if (Array.isArray(changes.removedObjects)) {
      const removeIds = new Set(changes.removedObjects);
      this.discoveredObjects = this.discoveredObjects.filter(o => !removeIds.has(o.id));
    }

    // Handle discovered map features
    if (Array.isArray(changes.discoveredMapFeatures)) {
      for (const featureId of changes.discoveredMapFeatures) {
        this.discoverFeature(featureId, this.turnNumber);
      }
    }
  }

  advanceTurn(narrative, summary, time, arcUpdates = null) {
    this.turnNumber++;
    this.history.push(narrative);
    this.summary = summary;
    if (time) {
      this.time = time;
    }
    if (arcUpdates) {
      if (typeof arcUpdates.narrativeArc === 'string') {
        this.narrativeArc = arcUpdates.narrativeArc;
      }
      if (Array.isArray(arcUpdates.newMajorEvents)) {
        this.majorEvents.push(...arcUpdates.newMajorEvents);
      }
      if (Array.isArray(arcUpdates.tensions)) {
        this.tensions = arcUpdates.tensions;
      }
      if (typeof arcUpdates.storyGoal === 'string') {
        this.storyGoal = arcUpdates.storyGoal;
      }
    }
  }

  getRecentHistory(count = 5) {
    return this.history.slice(-count);
  }

  getStateSnapshot() {
    // Deep copy to prevent reference mutations affecting snapshots
    // Note: mapFeatures is stored separately in map.json, not in state snapshots
    return JSON.parse(JSON.stringify({
      turnNumber: this.turnNumber,
      summary: this.summary,
      currentLocation: this.currentLocation,
      characters: this.characters,
      deadBodies: this.deadBodies,
      discoveredObjects: this.discoveredObjects,
      history: this.history,
      lastTurnActions: this.lastTurnActions,
      time: this.time,
      environment: this.environment,
      storyGoal: this.storyGoal,
      victoryConditions: this.victoryConditions,
      narrativeArc: this.narrativeArc,
      majorEvents: this.majorEvents,
      tensions: this.tensions,
      storyComplete: this.storyComplete,
      storyEnding: this.storyEnding,
      authorStyle: this.authorStyle
    }));
  }

  // Calculate distance between two positions in meters
  getDistance(pos1, pos2) {
    if (!pos1 || !pos2) return Infinity;
    const dx = (pos1.x || 0) - (pos2.x || 0);
    const dy = (pos1.y || 0) - (pos2.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Get map features visible from a given position
  getVisibleMapFeatures(position) {
    if (!position) return [];
    return this.mapFeatures.filter(feature => {
      const distance = this.getDistance(position, feature.position);
      return distance <= feature.visibleFrom;
    });
  }

  // Mark a map feature as discovered
  discoverFeature(featureId, turn) {
    const feature = this.mapFeatures.find(f => f.id === featureId);
    if (feature && !feature.discovered) {
      feature.discovered = true;
      feature.discoveredTurn = turn;
      console.log(`[Discovery] Map feature "${feature.name}" discovered on turn ${turn}`);
    }
  }

  // Get characters within communication range of a given character
  getNearbyCharacters(characterId) {
    const character = this.characters.find(c => c.id === characterId);
    if (!character || !character.position) return [];

    return this.characters.filter(c => {
      if (c.id === characterId) return false;
      if (!c.position) return true; // Assume nearby if no position
      return this.getDistance(character.position, c.position) <= COMMUNICATION_RANGE;
    });
  }

  // Get actions and dialogue from nearby characters from the last turn
  getNearbyTurnInfo(characterId) {
    const nearbyChars = this.getNearbyCharacters(characterId);
    const turnInfo = [];

    for (const char of nearbyChars) {
      const lastInfo = this.lastTurnActions[char.id];
      if (lastInfo && (lastInfo.action || lastInfo.dialogue)) {
        turnInfo.push({
          name: char.name,
          action: lastInfo.action || null,
          dialogue: lastInfo.dialogue || null
        });
      }
    }

    return turnInfo;
  }

  // Store action and dialogue from current turn for next turn's proximity observation
  recordTurnAction(characterId, action, dialogue) {
    if (action || dialogue) {
      this.lastTurnActions[characterId] = { action, dialogue };
    } else {
      delete this.lastTurnActions[characterId];
    }
  }

  // Check for deaths and convert dead characters to objects
  processDeaths() {
    const deadCharacters = [];

    this.characters = this.characters.filter(char => {
      const health = char.stats?.health ?? 100;
      if (health <= 0) {
        deadCharacters.push(char);
        return false;
      }
      return true;
    });

    // Convert dead characters to dead body objects
    for (const char of deadCharacters) {
      const deadBody = {
        id: `dead_body_${char.id}`,
        name: `dead body of ${char.name}`,
        description: `The lifeless body of ${char.name}. ${char.clothing ? `Wearing ${char.clothing}.` : ''}`,
        position: char.position,
        inventory: char.inventory || [],
        originalCharacter: {
          id: char.id,
          name: char.name,
          appearance: char.appearance
        }
      };

      this.deadBodies.push(deadBody);

      // Add to location items
      if (this.currentLocation && Array.isArray(this.currentLocation.items)) {
        this.currentLocation.items.push(deadBody.name);
      }

      // Remove from action tracking
      delete this.lastTurnActions[char.id];

      console.log(`[Death] ${char.name} has died and become "${deadBody.name}"`);
    }

    return deadCharacters;
  }

  // Get all objects (discovered objects + dead bodies) with positions
  getPositionedObjects() {
    const objects = [];

    // Add discovered objects
    for (const obj of this.discoveredObjects) {
      if (obj.position) {
        objects.push({
          id: obj.id,
          name: obj.name,
          description: obj.description,
          position: obj.position,
          status: obj.status,
          type: 'object'
        });
      }
    }

    // Add dead bodies
    for (const body of this.deadBodies) {
      if (body.position) {
        objects.push({
          id: body.id,
          name: body.name,
          position: body.position,
          type: 'dead_body'
        });
      }
    }

    return objects;
  }

  // Get objects within range of a position
  getNearbyObjects(position, range = COMMUNICATION_RANGE) {
    if (!position) return [];
    return this.getPositionedObjects().filter(obj => {
      return this.getDistance(position, obj.position) <= range;
    });
  }

  getTimeString() {
    const hour = this.time.hour.toString().padStart(2, '0');
    const minute = this.time.minute.toString().padStart(2, '0');
    return `Day ${this.time.day}, ${hour}:${minute}`;
  }
}
