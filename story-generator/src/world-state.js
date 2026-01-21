// Proximity threshold in meters for communication
const COMMUNICATION_RANGE = 20;

// Direction to heading mapping (degrees, 0=north, clockwise)
const DIRECTION_TO_HEADING = {
  'north': 0,
  'n': 0,
  'northeast': 45,
  'ne': 45,
  'east': 90,
  'e': 90,
  'southeast': 135,
  'se': 135,
  'south': 180,
  's': 180,
  'southwest': 225,
  'sw': 225,
  'west': 270,
  'w': 270,
  'northwest': 315,
  'nw': 315
};

// Convert direction and distance to delta x, y
// Coordinate system: x+ = east, y+ = north
function movementToDelta(movement) {
  if (!movement || typeof movement.distance !== 'number') {
    return { dx: 0, dy: 0 };
  }

  const distance = Math.max(0, movement.distance);
  let heading;

  if (typeof movement.direction === 'number') {
    // Direction given as degrees
    heading = movement.direction;
  } else if (typeof movement.direction === 'string') {
    // Direction given as cardinal/intercardinal
    const normalized = movement.direction.toLowerCase().trim();
    heading = DIRECTION_TO_HEADING[normalized];
    if (heading === undefined) {
      console.warn(`Unknown direction: ${movement.direction}, defaulting to north`);
      heading = 0;
    }
  } else {
    return { dx: 0, dy: 0 };
  }

  // Convert heading to radians (heading 0 = north = +y)
  const radians = (heading * Math.PI) / 180;

  // Calculate delta: sin for x (east), cos for y (north)
  const dx = Math.round(distance * Math.sin(radians));
  const dy = Math.round(distance * Math.cos(radians));

  return { dx, dy };
}

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
    // Author styles
    this.authorStyle = null;       // Author whose style to emulate for novel generation (e.g., "Stephen King", "Hemingway")
    this.dmAuthorStyle = null;     // Author style for DM narrative responses (blank = neutral style)
    this.characterAuthorStyle = null; // Author style for character AI responses (blank = neutral style)
  }

  initialize(dmResponse) {
    // Note: All keys are lowercase after normalizeKeys() in dm-agent.js
    // Validate required fields
    if (!dmResponse.location) {
      console.error('DM response missing location field:', Object.keys(dmResponse || {}));
      dmResponse.location = {
        id: 'unknown',
        name: 'Unknown Location',
        description: 'The surroundings are unclear.',
        exits: ['north', 'south', 'east', 'west'],
        items: [],
        npcs: []
      };
    }
    this.currentLocation = dmResponse.location;
    this.locations.set(dmResponse.location.id, dmResponse.location);

    // Validate characters
    if (!Array.isArray(dmResponse.characters) || dmResponse.characters.length === 0) {
      console.error('DM response missing or empty characters array:', dmResponse.characters);
      throw new Error('No characters returned from initialization. The LLM may have refused the request.');
    }
    this.characters = dmResponse.characters;
    this.summary = dmResponse.worldsummary || 'The story begins.';
    this.history.push(dmResponse.narrative);
    if (dmResponse.time) {
      this.time = dmResponse.time;
    }
    if (dmResponse.environment) {
      this.environment = { ...this.environment, ...dmResponse.environment };
    }
    if (dmResponse.storygoal) {
      this.storyGoal = dmResponse.storygoal;
    }
    if (dmResponse.victoryconditions) {
      this.victoryConditions = dmResponse.victoryconditions;
    }
    if (dmResponse.narrativearc) {
      this.narrativeArc = dmResponse.narrativearc;
    }
    if (Array.isArray(dmResponse.majorevents)) {
      this.majorEvents = dmResponse.majorevents;
    }
    if (Array.isArray(dmResponse.tensions)) {
      this.tensions = dmResponse.tensions;
    }
    if (Array.isArray(dmResponse.discoveredobjects)) {
      this.discoveredObjects = dmResponse.discoveredobjects;
    }
    if (Array.isArray(dmResponse.mapfeatures)) {
      this.mapFeatures = dmResponse.mapfeatures.map(f => ({
        ...f,
        discovered: false,
        discoveredTurn: null
      }));
    }
    if (dmResponse.authorstyle) {
      this.authorStyle = dmResponse.authorstyle;
    }

    // Auto-discover any features visible from starting positions
    this.autoDiscoverFeatures();
  }

  applyChanges(changes) {
    // Note: All keys are lowercase after normalizeKeys() in dm-agent.js
    if (!changes) return;

    if (changes.locationupdates && this.currentLocation) {
      if (Array.isArray(changes.locationupdates.items)) {
        this.currentLocation.items = changes.locationupdates.items;
      }
      if (typeof changes.locationupdates.description === 'string' && changes.locationupdates.description) {
        this.currentLocation.description = changes.locationupdates.description;
      }
    }

    if (Array.isArray(changes.characterupdates)) {
      for (const update of changes.characterupdates) {
        if (!update || !update.id) continue;
        const character = this.characters.find(c => c.id === update.id);
        if (character) {
          if (Array.isArray(update.inventoryadd)) {
            character.inventory.push(...update.inventoryadd);
          }
          if (Array.isArray(update.inventoryremove)) {
            character.inventory = character.inventory.filter(
              item => !update.inventoryremove.includes(item)
            );
          }
          if (typeof update.statuschange === 'string' && update.statuschange) {
            character.status = update.statuschange;
          }
          if (typeof update.clothingchange === 'string' && update.clothingchange) {
            character.clothing = update.clothingchange;
          }
          if (update.statschange && typeof update.statschange === 'object') {
            if (!character.stats) {
              character.stats = { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, intelligence: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 };
            }
            for (const [stat, value] of Object.entries(update.statschange)) {
              if (typeof value === 'number' && value >= 0 && value <= 100) {
                character.stats[stat] = value;
              }
            }
          }
          // Handle movement updates (direction + distance -> new position)
          // Supports: { direction, distance } OR { targetLocation: "feature_id_or_name" }
          if (update.movement && typeof update.movement === 'object') {
            const currentPos = character.position || { x: 0, y: 0 };
            let dx = 0, dy = 0;
            let movementLog = '';

            // Check for targetLocation - system calculates direction/distance automatically
            if (update.movement.targetlocation || update.movement.targetLocation) {
              const targetId = update.movement.targetlocation || update.movement.targetLocation;
              const targetFeature = this.findFeatureByIdOrName(targetId);

              if (targetFeature && targetFeature.position) {
                // Calculate direction and distance to target
                const targetX = targetFeature.position.x;
                const targetY = targetFeature.position.y;
                const totalDx = targetX - currentPos.x;
                const totalDy = targetY - currentPos.y;
                const totalDistance = Math.sqrt(totalDx * totalDx + totalDy * totalDy);

                // Cap movement at realistic turn distance (default ~1200m for 15min walk)
                const maxDistance = update.movement.maxDistance || 1200;
                const moveDistance = Math.min(totalDistance, maxDistance);

                if (totalDistance > 0) {
                  // Normalize direction and apply move distance
                  dx = Math.round((totalDx / totalDistance) * moveDistance);
                  dy = Math.round((totalDy / totalDistance) * moveDistance);

                  // If we're close enough, snap to target
                  if (totalDistance <= maxDistance) {
                    dx = Math.round(totalDx);
                    dy = Math.round(totalDy);
                    movementLog = `[Movement] ${character.name}: arrived at ${targetFeature.name} (${targetX}, ${targetY})`;
                  } else {
                    const remaining = Math.round(totalDistance - moveDistance);
                    movementLog = `[Movement] ${character.name}: moved ${moveDistance}m toward ${targetFeature.name}, ${remaining}m remaining`;
                  }
                }
              } else {
                console.warn(`[Movement] Target location not found: ${targetId}`);
              }
            } else {
              // Traditional direction + distance movement
              const delta = movementToDelta(update.movement);
              dx = delta.dx;
              dy = delta.dy;
              if (dx !== 0 || dy !== 0) {
                movementLog = `[Movement] ${character.name}: moved ${update.movement.direction} ${update.movement.distance}m`;
              }
            }

            // Apply movement
            if (dx !== 0 || dy !== 0) {
              character.position = {
                x: currentPos.x + dx,
                y: currentPos.y + dy
              };
              console.log(`${movementLog} -> (${character.position.x}, ${character.position.y})`);
            }
          }
          // Legacy support: handle absolute position updates (positionchange)
          else if (update.positionchange && typeof update.positionchange === 'object') {
            character.position = {
              x: typeof update.positionchange.x === 'number' ? update.positionchange.x : (character.position?.x || 0),
              y: typeof update.positionchange.y === 'number' ? update.positionchange.y : (character.position?.y || 0)
            };
          }
          // Handle attitude updates
          if (update.attitudeschange && typeof update.attitudeschange === 'object') {
            if (!character.attitudes) {
              character.attitudes = {};
            }
            for (const [targetId, feelings] of Object.entries(update.attitudeschange)) {
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
          // Handle sight distance updates
          if (typeof update.sightdistance === 'number' && update.sightdistance > 0) {
            character.sightDistance = update.sightdistance;
            console.log(`[Sight] ${character.name}: sight distance = ${update.sightdistance}m`);
          }
        }
      }
    }

    // Only set newLocation if it's a valid location object with required fields
    if (changes.newlocation &&
        typeof changes.newlocation === 'object' &&
        changes.newlocation.id &&
        changes.newlocation.name) {
      this.currentLocation = {
        ...changes.newlocation,
        items: Array.isArray(changes.newlocation.items) ? changes.newlocation.items : [],
        exits: Array.isArray(changes.newlocation.exits) ? changes.newlocation.exits : [],
        npcs: Array.isArray(changes.newlocation.npcs) ? changes.newlocation.npcs : []
      };
      if (!this.locations.has(changes.newlocation.id)) {
        this.locations.set(changes.newlocation.id, this.currentLocation);
      }
    }

    if (changes.time && typeof changes.time === 'object') {
      // Ensure this.time exists with defaults
      if (!this.time) {
        this.time = { day: 1, hour: 8, minute: 0 };
      }

      // Validate time doesn't go backwards
      const newTime = changes.time;
      const currentMinutes = ((this.time.day ?? 1) * 24 * 60) + ((this.time.hour ?? 8) * 60) + (this.time.minute ?? 0);
      const newMinutes = ((newTime.day ?? 1) * 24 * 60) + ((newTime.hour ?? 8) * 60) + (newTime.minute ?? 0);

      if (newMinutes > currentMinutes) {
        this.time = newTime;
      } else {
        // Time went backwards, advance by 15 minutes instead
        console.warn('Time went backwards, auto-advancing by 15 minutes');
        let minute = (this.time.minute ?? 0) + 15;
        let hour = this.time.hour ?? 8;
        let day = this.time.day ?? 1;
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

    if (changes.environmentupdate && typeof changes.environmentupdate === 'object') {
      for (const [key, value] of Object.entries(changes.environmentupdate)) {
        if (typeof value === 'string' && value && value !== 'null') {
          this.environment[key] = value;
        }
      }
    }

    // Handle new characters (max 7 total)
    if (changes.newcharacters && Array.isArray(changes.newcharacters)) {
      const MAX_CHARACTERS = 7;
      for (const newChar of changes.newcharacters) {
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
          personalitytypes: Array.isArray(newChar.personalitytypes) ? newChar.personalitytypes : [],
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
    if (Array.isArray(changes.discoveredobjects)) {
      for (const obj of changes.discoveredobjects) {
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
    if (Array.isArray(changes.removedobjects)) {
      const removeIds = new Set(changes.removedobjects);
      this.discoveredObjects = this.discoveredObjects.filter(o => !removeIds.has(o.id));
    }

    // Handle discovered map features (explicit from DM)
    if (Array.isArray(changes.discoveredmapfeatures)) {
      for (const featureId of changes.discoveredmapfeatures) {
        this.discoverFeature(featureId, this.turnNumber);
      }
    }

    // Auto-discover map features based on character positions and sight distance
    this.autoDiscoverFeatures();
  }

  // Automatically discover map features when characters are close enough to see them
  autoDiscoverFeatures() {
    if (!this.mapFeatures || this.mapFeatures.length === 0) return;
    if (!this.characters || this.characters.length === 0) return;

    for (const feature of this.mapFeatures) {
      if (feature.discovered) continue; // Already discovered
      if (!feature.position) continue;

      for (const character of this.characters) {
        if (character.status === 'dead') continue;
        const charPos = character.position || { x: 0, y: 0 };
        const sightDistance = character.sightDistance || 2000;

        const distance = this.getDistance(charPos, feature.position);

        // Feature is discovered if character can see it (within sight distance AND feature's visible range)
        const effectiveRange = Math.min(sightDistance, feature.visibleFrom || 1000);
        if (distance <= effectiveRange) {
          this.discoverFeature(feature.id, this.turnNumber);
          break; // No need to check other characters for this feature
        }
      }
    }
  }

  advanceTurn(narrative, summary, time, arcUpdates = null) {
    // Note: arcUpdates keys are lowercase after normalizeKeys() in dm-agent.js
    this.turnNumber++;
    this.history.push(narrative);
    this.summary = summary;
    if (time) {
      this.time = time;
    }
    if (arcUpdates) {
      if (typeof arcUpdates.narrativearc === 'string') {
        this.narrativeArc = arcUpdates.narrativearc;
      }
      if (Array.isArray(arcUpdates.newmajorevents)) {
        this.majorEvents.push(...arcUpdates.newmajorevents);
      }
      if (Array.isArray(arcUpdates.tensions)) {
        this.tensions = arcUpdates.tensions;
      }
      if (typeof arcUpdates.storygoal === 'string') {
        this.storyGoal = arcUpdates.storygoal;
      }
    }
  }

  getRecentHistory(count = 5) {
    return this.history.slice(-count);
  }

  getStateSnapshot() {
    // Deep copy to prevent reference mutations affecting snapshots
    // Note: mapFeatures is also stored in map.json for persistence
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
      authorStyle: this.authorStyle,
      dmAuthorStyle: this.dmAuthorStyle,
      characterAuthorStyle: this.characterAuthorStyle,
      mapFeatures: this.mapFeatures
    }));
  }

  // Calculate distance between two positions in meters
  getDistance(pos1, pos2) {
    if (!pos1 || !pos2) return Infinity;
    const dx = (pos1.x || 0) - (pos2.x || 0);
    const dy = (pos1.y || 0) - (pos2.y || 0);
    return Math.sqrt(dx * dx + dy * dy);
  }

  // Find a map feature by ID or name (case-insensitive)
  findFeatureByIdOrName(identifier) {
    if (!identifier || !this.mapFeatures) return null;
    const searchTerm = identifier.toLowerCase();

    // First try exact ID match
    let feature = this.mapFeatures.find(f => f.id === identifier);
    if (feature) return feature;

    // Then try case-insensitive ID match
    feature = this.mapFeatures.find(f => f.id?.toLowerCase() === searchTerm);
    if (feature) return feature;

    // Then try case-insensitive name match
    feature = this.mapFeatures.find(f => f.name?.toLowerCase() === searchTerm);
    if (feature) return feature;

    // Finally try partial name match
    feature = this.mapFeatures.find(f => f.name?.toLowerCase().includes(searchTerm));
    if (feature) return feature;

    // Also check discovered objects
    if (this.discoveredObjects) {
      const obj = this.discoveredObjects.find(o =>
        o.id === identifier ||
        o.id?.toLowerCase() === searchTerm ||
        o.name?.toLowerCase() === searchTerm ||
        o.name?.toLowerCase().includes(searchTerm)
      );
      if (obj) return obj;
    }

    return null;
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
    if (!this.time) {
      return 'Unknown time';
    }
    const hour = (this.time.hour ?? 8).toString().padStart(2, '0');
    const minute = (this.time.minute ?? 0).toString().padStart(2, '0');
    return `Day ${this.time.day ?? 1}, ${hour}:${minute}`;
  }
}
