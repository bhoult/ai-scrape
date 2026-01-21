import fs from 'fs';
import { dirname } from 'path';
import {
  calculateStatChanges,
  clampStats,
  calculateEncumbrance,
  validateInventoryChanges
} from './behavior-config.js';

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
    // Deterministic action logging
    this.deterministicLogPath = null;
  }

  // Set the path for the deterministic action log file
  setDeterministicLogPath(logPath, append = false) {
    this.deterministicLogPath = logPath;
    if (logPath) {
      // Ensure directory exists
      const dir = dirname(logPath);
      fs.mkdirSync(dir, { recursive: true });

      if (append && fs.existsSync(logPath)) {
        // Append a session marker
        fs.appendFileSync(logPath, `\n=== Session Resumed: ${new Date().toISOString()} ===\n\n`);
      } else {
        // Clear and start fresh
        fs.writeFileSync(logPath, `=== Deterministic Actions Log ===\nStarted: ${new Date().toISOString()}\n\n`);
      }
    }
  }

  // Log a deterministic action with before/after values (only logs changes)
  logDeterministic(turn, charName, action, before, after) {
    if (!this.deterministicLogPath) return;

    // Find what changed
    const changes = [];
    for (const key of Object.keys(after)) {
      const beforeVal = before[key];
      const afterVal = after[key];
      if (beforeVal !== afterVal) {
        changes.push(`${key}: ${beforeVal} → ${afterVal}`);
      }
    }

    // Only log if something changed
    if (changes.length === 0) return;

    const logEntry = `  ${charName} | ${action}: ${changes.join(', ')}\n`;

    try {
      fs.appendFileSync(this.deterministicLogPath, logEntry);
    } catch (err) {
      console.error('Failed to write to deterministic log:', err.message);
    }
  }

  // Log turn separator
  logTurnStart(turn) {
    if (!this.deterministicLogPath) return;

    const timestamp = this.getTimeString();
    const logEntry = `\n${'='.repeat(60)}\nTURN ${turn} - ${timestamp}\n${'='.repeat(60)}\n`;

    try {
      fs.appendFileSync(this.deterministicLogPath, logEntry);
    } catch (err) {
      console.error('Failed to write to deterministic log:', err.message);
    }
  }

  // Log DM/player instructions
  logDMInstructions(turn, instructions) {
    if (!this.deterministicLogPath) return;
    if (!instructions) return;

    const logEntry = `\nDM INSTRUCTIONS: "${instructions}"\n`;

    try {
      fs.appendFileSync(this.deterministicLogPath, logEntry);
    } catch (err) {
      console.error('Failed to write to deterministic log:', err.message);
    }
  }

  // Log character actions (what each character decided to do)
  logCharacterActions(turn, characterActions) {
    if (!this.deterministicLogPath) return;
    if (!characterActions || characterActions.length === 0) return;

    let logEntry = `\nCHARACTER ACTIONS:\n`;

    for (const ca of characterActions) {
      const name = ca.character?.name || 'Unknown';
      logEntry += `  ${name}: ${ca.action || '(no action)'}\n`;
      if (ca.dialogue) {
        logEntry += `    Says: "${ca.dialogue}"\n`;
      }
    }

    try {
      fs.appendFileSync(this.deterministicLogPath, logEntry);
    } catch (err) {
      console.error('Failed to write to deterministic log:', err.message);
    }
  }

  // Log DM narrative
  logNarrative(turn, narrative) {
    if (!this.deterministicLogPath) return;
    if (!narrative) return;

    const logEntry = `\nNARRATIVE:\n${narrative}\n`;

    try {
      fs.appendFileSync(this.deterministicLogPath, logEntry);
    } catch (err) {
      console.error('Failed to write to deterministic log:', err.message);
    }
  }

  // Log inventory changes
  logInventoryChange(turn, charName, action, items, warnings = []) {
    if (!this.deterministicLogPath) return;
    if (items.length === 0 && warnings.length === 0) return;

    let logEntry = `  ${charName} | ${action}: ${items.join(', ')}\n`;
    if (warnings.length > 0) {
      logEntry += `    Rejected: ${warnings.join('; ')}\n`;
    }

    try {
      fs.appendFileSync(this.deterministicLogPath, logEntry);
    } catch (err) {
      console.error('Failed to write to deterministic log:', err.message);
    }
  }

  // Log a section header
  logSection(header) {
    if (!this.deterministicLogPath) return;

    try {
      fs.appendFileSync(this.deterministicLogPath, `\n${header}:\n`);
    } catch (err) {
      console.error('Failed to write to deterministic log:', err.message);
    }
  }

  // Log movement
  logMovement(charName, fromPos, toPos, description) {
    if (!this.deterministicLogPath) return;

    const logEntry = `  ${charName} | MOVEMENT: (${fromPos.x}, ${fromPos.y}) → (${toPos.x}, ${toPos.y}) ${description}\n`;

    try {
      fs.appendFileSync(this.deterministicLogPath, logEntry);
    } catch (err) {
      console.error('Failed to write to deterministic log:', err.message);
    }
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
    // Filter out invalid characters (must have id and name)
    const validCharacters = dmResponse.characters.filter(c => {
      if (!c || !c.id || !c.name) {
        console.warn('Skipping invalid character (missing id or name):', c);
        return false;
      }
      return true;
    });
    if (validCharacters.length === 0) {
      console.error('No valid characters after filtering:', dmResponse.characters);
      throw new Error('No valid characters returned from initialization (all missing id or name).');
    }
    this.characters = validCharacters;
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
      // Normalize discoveredObjects to ensure they have proper structure
      this.discoveredObjects = dmResponse.discoveredobjects.map((obj, i) => {
        // If it's just a string, convert to object
        if (typeof obj === 'string') {
          console.warn(`[Init] discoveredObject "${obj}" is a string, converting to object without position`);
          return {
            id: `obj_init_${i}`,
            name: obj,
            description: '',
            position: null,
            status: 'discovered',
            discoveredTurn: 0
          };
        }
        // Ensure required fields exist
        return {
          id: obj.id || `obj_init_${i}`,
          name: obj.name || 'unknown object',
          description: obj.description || '',
          position: obj.position || null,
          status: obj.status || 'discovered',
          discoveredTurn: 0
        };
      });
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

    // Get duration from DM response (default to 15 minutes if not specified)
    const durationMinutes = changes.durationminutes || 15;

    // Log section header for world changes
    this.logSection('WORLD CHANGES');

    // IMPORTANT: Add discovered objects FIRST so inventory validation can see them
    // This supports the split resolution flow where Call 1 adds objects and Call 2 picks them up
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
          console.log(`[Discovery] Added object: ${obj.name || obj.id}`);
        }
      }
    }

    if (Array.isArray(changes.characterupdates)) {
      for (const update of changes.characterupdates) {
        if (!update || !update.id) continue;
        const character = this.characters.find(c => c.id === update.id);
        if (character) {
          // Validate inventory changes before applying
          const inventoryChanges = {
            inventoryAdd: update.inventoryadd || [],
            inventoryRemove: update.inventoryremove || []
          };
          const validated = validateInventoryChanges(inventoryChanges, this, character);

          // Log any validation warnings
          for (const warning of validated.warnings) {
            console.warn(`[Inventory] ${warning}`);
          }

          // Log inventory additions
          if (validated.inventoryAdd.length > 0 || validated.warnings.length > 0) {
            this.logInventoryChange(this.turnNumber, character.name, 'INVENTORY_ADD', validated.inventoryAdd, validated.warnings);
          }

          // Apply validated inventory changes
          if (validated.inventoryAdd.length > 0) {
            character.inventory.push(...validated.inventoryAdd);
          }
          if (validated.inventoryRemove.length > 0) {
            this.logInventoryChange(this.turnNumber, character.name, 'INVENTORY_REMOVE', validated.inventoryRemove, []);
            character.inventory = character.inventory.filter(
              item => !validated.inventoryRemove.map(i => i.toLowerCase()).includes(item.toLowerCase())
            );
          }

          if (typeof update.statuschange === 'string' && update.statuschange) {
            const oldStatus = character.status || 'normal';
            if (oldStatus !== update.statuschange) {
              this.logDeterministic(this.turnNumber, character.name, 'STATUS', { status: oldStatus }, { status: update.statuschange });
            }
            character.status = update.statuschange;
          }
          if (typeof update.clothingchange === 'string' && update.clothingchange) {
            const oldClothing = character.clothing || 'unknown';
            if (oldClothing !== update.clothingchange) {
              this.logDeterministic(this.turnNumber, character.name, 'CLOTHING', { clothing: oldClothing }, { clothing: update.clothingchange });
            }
            character.clothing = update.clothingchange;
          }
          // Store the result of this character's last action for feedback on next turn
          if (typeof update.lastactionresult === 'string' && update.lastactionresult) {
            character.lastActionResult = update.lastactionresult;
          } else {
            // Clear if not provided (action had no notable result)
            character.lastActionResult = null;
          }

          // HYBRID STAT SYSTEM: Use activity categories from LLM to calculate stats
          // Check if update has activity-based fields (new system) or statschange (legacy)
          const hasActivityFields = update.activitylevel || update.hydrationevent ||
                                     update.nutritionevent || update.healthevent || update.mentalevent;

          if (hasActivityFields) {
            // New hybrid system: LLM categorizes, system calculates
            if (!character.stats) {
              character.stats = { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, intelligence: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 };
            }

            // Capture before stats for logging
            const beforeStats = {
              stamina: character.stats.stamina,
              hunger: character.stats.hunger,
              thirst: character.stats.thirst,
              health: character.stats.health,
              sanity: character.stats.sanity,
              fear: character.stats.fear,
              anger: character.stats.anger
            };

            // Normalize update keys for calculation function
            const normalizedUpdate = {
              activityLevel: update.activitylevel || 'moderate',
              hydrationEvent: update.hydrationevent || null,
              nutritionEvent: update.nutritionevent || null,
              healthEvent: update.healthevent || null,
              injurySeverity: update.injuryseverity || null,
              mentalEvent: update.mentalevent || null
            };

            // Get environment temperature for thirst calculation
            const environment = {
              temperature: this.environment?.temperature === 'hot' ? 35 :
                           this.environment?.temperature === 'warm' ? 28 :
                           this.environment?.temperature === 'cold' ? 10 :
                           this.environment?.temperature === 'freezing' ? 0 : 25
            };

            // Calculate new stats based on activity categories
            const newStats = calculateStatChanges(character, normalizedUpdate, durationMinutes, environment);

            // Apply calculated stats (preserving ability stats which don't change)
            character.stats.stamina = newStats.stamina;
            character.stats.hunger = newStats.hunger;
            character.stats.thirst = newStats.thirst;
            character.stats.health = newStats.health;
            character.stats.sanity = newStats.sanity;
            character.stats.fear = newStats.fear;
            character.stats.anger = newStats.anger;

            // Build action description for logging
            const actionParts = [`activity=${normalizedUpdate.activityLevel}`, `duration=${durationMinutes}min`];
            if (normalizedUpdate.hydrationEvent) actionParts.push(`hydration=${normalizedUpdate.hydrationEvent}`);
            if (normalizedUpdate.nutritionEvent) actionParts.push(`nutrition=${normalizedUpdate.nutritionEvent}`);
            if (normalizedUpdate.healthEvent) actionParts.push(`health=${normalizedUpdate.healthEvent}${normalizedUpdate.injurySeverity ? '(' + normalizedUpdate.injurySeverity + ')' : ''}`);
            if (normalizedUpdate.mentalEvent) actionParts.push(`mental=${normalizedUpdate.mentalEvent}`);

            // Log stat changes (only logs if something changed)
            this.logDeterministic(this.turnNumber, character.name, `STATS_CALC [${actionParts.join(', ')}]`, beforeStats, {
              stamina: newStats.stamina,
              hunger: newStats.hunger,
              thirst: newStats.thirst,
              health: newStats.health,
              sanity: newStats.sanity,
              fear: newStats.fear,
              anger: newStats.anger
            });

            console.log(`[Stats] ${character.name}: activity=${normalizedUpdate.activityLevel}, duration=${durationMinutes}min -> stamina=${character.stats.stamina}, hunger=${character.stats.hunger}, thirst=${character.stats.thirst}`);
          } else if (update.statschange && typeof update.statschange === 'object') {
            // Legacy system: direct stat updates (for backwards compatibility)
            if (!character.stats) {
              character.stats = { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, intelligence: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 };
            }

            // Capture before stats for logging
            const beforeLegacy = { ...character.stats };

            for (const [stat, value] of Object.entries(update.statschange)) {
              if (typeof value === 'number' && value >= 0 && value <= 100) {
                character.stats[stat] = value;
              }
            }
            // Clamp legacy stats too
            character.stats = clampStats(character.stats);

            // Log legacy stat changes
            this.logDeterministic(this.turnNumber, character.name, 'STATS_LEGACY', beforeLegacy, character.stats);
          }

          // Calculate encumbrance from inventory (ensure stats exists first)
          if (!character.stats) {
            character.stats = { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, intelligence: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 };
          }
          const beforeEncumbrance = character.stats.encumbrance;
          character.stats.encumbrance = calculateEncumbrance(character.inventory);

          // Log encumbrance change if different
          if (beforeEncumbrance !== character.stats.encumbrance) {
            this.logDeterministic(this.turnNumber, character.name, 'ENCUMBRANCE', { encumbrance: beforeEncumbrance }, { encumbrance: character.stats.encumbrance });
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
              const newPos = {
                x: currentPos.x + dx,
                y: currentPos.y + dy
              };
              // Log movement before applying
              const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
              this.logMovement(character.name, currentPos, newPos, `(${distance}m)`);
              character.position = newPos;
              console.log(`${movementLog} -> (${character.position.x}, ${character.position.y})`);
            }
          }
          // Legacy support: handle absolute position updates (positionchange)
          else if (update.positionchange && typeof update.positionchange === 'object') {
            const currentPos = character.position || { x: 0, y: 0 };
            const newPos = {
              x: typeof update.positionchange.x === 'number' ? update.positionchange.x : currentPos.x,
              y: typeof update.positionchange.y === 'number' ? update.positionchange.y : currentPos.y
            };
            if (newPos.x !== currentPos.x || newPos.y !== currentPos.y) {
              this.logMovement(character.name, currentPos, newPos, '(position set)');
            }
            character.position = newPos;
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

      const oldTime = { ...this.time };

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

      // Log time change
      const formatTime = (t) => `Day ${t.day}, ${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`;
      if (this.deterministicLogPath) {
        const elapsed = newMinutes - currentMinutes;
        const logEntry = `  TIME: ${formatTime(oldTime)} → ${formatTime(this.time)} (+${elapsed > 0 ? elapsed : 15}min)\n`;
        try {
          fs.appendFileSync(this.deterministicLogPath, logEntry);
        } catch (err) {
          console.error('Failed to write to deterministic log:', err.message);
        }
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

    // Note: discoveredObjects are now handled at the TOP of applyChanges
    // to ensure they're available for inventory validation

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
    // Note: mapFeatures is stored in map.json only (not duplicated here)
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
      characterAuthorStyle: this.characterAuthorStyle
    }));
  }

  // Get full state including mapFeatures (for API responses)
  getFullStateSnapshot() {
    const snapshot = this.getStateSnapshot();
    snapshot.mapFeatures = JSON.parse(JSON.stringify(this.mapFeatures || []));
    return snapshot;
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

      // Log discovery
      if (this.deterministicLogPath) {
        const pos = feature.position ? `(${feature.position.x}, ${feature.position.y})` : '';
        const logEntry = `  DISCOVERY: ${feature.name} (${feature.type}) ${pos}\n`;
        try {
          fs.appendFileSync(this.deterministicLogPath, logEntry);
        } catch (err) {
          console.error('Failed to write to deterministic log:', err.message);
        }
      }
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
