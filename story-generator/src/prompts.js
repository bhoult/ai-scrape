import {
  statsBehavior,
  attitudesBehavior,
  dmStatThresholds,
  abilityStats,
  staminaRates,
  hydrationRates,
  personalityTypes,
  getPersonalityTypeNames,
  generatePersonalityText,
  generateStatsBehaviorText,
  generateAttitudesBehaviorText,
  generateActiveStatsBehaviorText,
  generateActiveAttitudesBehaviorText,
  generateDMStatThresholdsText,
  generateAbilityStatsText,
  generateStaminaGuidanceText,
  generateHydrationGuidanceText
} from './behavior-config.js';

export const DM_SYSTEM_PROMPT = `You are a Dungeon Master narrating an interactive story from a third-person perspective. You observe and describe world events as an omniscient narrator.

Your role:
- Narrate in third person (e.g., "Sarah looked around...", "Mike picked up the rock...")
- Describe the world vividly but concisely
- Resolve character actions realistically based on the situation
- Track and update world state (locations, items, NPCs, etc.)
- Maintain long-term narrative coherence by tracking the story goal, major events, and current tensions
- Create engaging story moments that advance the narrative arc
- Describe characters' visible actions and speech, not their internal thoughts
- Ensure the story progresses toward meaningful resolution while allowing for surprises

Your creative authority - you can introduce:
- New characters (NPCs, creatures, rescuers, threats, etc.)
- New map locations and features (shelter, water sources, hazards, etc.)
- New objects and items (supplies, tools, obstacles, etc.)
- Environmental changes (weather, time of day, natural events)
- Encounters and events that challenge or aid the characters

Character limitations - characters can only:
- Use, combine, or modify existing items in their inventory
- Travel to known locations or explore in directions
- Interact with what exists in the world
- Attempt to craft/build from materials they have (you decide success/failure)
- Characters CANNOT create things from nothing or discover things you haven't placed

Always respond in the specified JSON format.`;

export const PLAYER_SYSTEM_PROMPT = `You are playing a character in an interactive story. Stay in character and make decisions that fit your personality and goals.

Your role:
- Act according to your character's personality and motivations
- Make realistic decisions based on your situation
- Interact with other characters and the environment
- Pursue your goals while responding to circumstances

Always respond in the specified JSON format with a single action.`;

export function dmInitPrompt(seed, authorStyle = null, dmAuthorStyle = null) {
  const authorInstructions = authorStyle
    ? `\nAUTHOR STYLE: "${authorStyle}" - The novel version of this story will be written in this author's style.`
    : `\nAUTHOR STYLE: Not specified. Choose an author whose style would be appropriate for this type of story (e.g., Stephen King for horror, Hemingway for survival, Agatha Christie for mystery, etc.). Return your choice in the authorStyle field.`;

  const dmStyleInstructions = dmAuthorStyle
    ? `\nNARRATIVE STYLE: Write the opening narrative in the style of ${dmAuthorStyle}. Emulate their voice, sentence structure, pacing, and descriptive approach.`
    : '';

  return `Parse the following story seed and create the initial world state. Extract characters, setting, situation, and the overall story goal. Determine an appropriate starting day and time for the story.

SEED:
${seed}
${authorInstructions}${dmStyleInstructions}

VICTORY CONDITIONS (CRITICAL):
Define how the characters can achieve victory. This should be:
- SPECIFIC: A clear, achievable objective (not just "survive")
- CHALLENGING: Difficult to achieve, requiring multiple steps and good decisions
- POSSIBLE: The map should contain what's needed to achieve victory (place relevant features/resources)
- DRAMATIC: Should create interesting narrative tension

Examples:
- "Reach the abandoned radio tower (15km north) and repair the transmitter to call for rescue"
- "Find and defeat the creature that's been hunting them, recovering the stolen artifact"
- "Navigate to the hidden temple and retrieve the treasure before the rival expedition"

The victory conditions inform what map features to generate - ensure the path to victory exists but is treacherous.

MAP GENERATION:
Generate 5-8 map features within ~10km of start (position 0,0). Include at least one water source.
Feature types: water_source, shelter, landmark, terrain, resource, hazard.
Position in meters from origin. visibleFrom = how far away it can be seen (100-2000m based on size).

Respond with a JSON object containing:
{
  "narrative": "Opening paragraph describing the scene (2-3 sentences)",
  "sceneFocus": "characters|landscape|object|phenomenon - what should dominate the image",
  "sceneVisuals": { "description": "Brief visual description for the scene image" },
  "time": {
    "day": 1,
    "hour": 8,
    "minute": 0
  },
  "environment": {
    "type": "desert/jungle/forest/cave/building/city/etc.",
    "terrain": "brief terrain description (sandy dunes, dense undergrowth, etc.)",
    "lighting": "bright sunlight/dim/dark/torchlit/etc.",
    "weather": "clear/cloudy/raining/storming/etc.",
    "temperature": "hot/warm/mild/cold/freezing"
  },
  "storyGoal": "The ultimate objective the characters are trying to achieve (e.g., 'Survive and find rescue from the desert')",
  "victoryConditions": {
    "primary": "The specific achievement that ends the story in victory (e.g., 'Reach the radio tower and call for rescue')",
    "requirements": ["List of things that must happen or be obtained", "e.g., 'Find working radio equipment'", "'Reach high ground for signal'"],
    "difficulty": "Description of why this is challenging but achievable"
  },
  "narrativeArc": "Current phase of the story (e.g., 'Introduction - characters assess their situation')",
  "majorEvents": ["The plane crashed in the desert"],
  "tensions": ["Immediate need for water", "Unknown location", "Limited supplies"],
  "discoveredObjects": [],
  "mapFeatures": [
    { "id": "feat_1", "type": "water_source", "name": "Name", "description": "Brief description", "position": { "x": 3000, "y": 2000 }, "visibleFrom": 500 }
  ],
  "location": {
    "id": "location_id",
    "name": "Location Name",
    "description": "Description of this location",
    "exits": ["direction1", "direction2"],
    "items": ["item1", "item2"],
    "npcs": []
  },
  "characters": [
    {
      "id": "<lowercase_firstname e.g. sarah, mike, alex>",
      "name": "Full Name",
      "appearance": {
        "gender": "male/female/other",
        "age": "number (years)",
        "ethnicity": "ethnic background (e.g., Caucasian, Asian, African, Hispanic, Middle Eastern, etc.)",
        "height": "height in feet and inches (e.g., 5'8\")",
        "weight": "weight in pounds (e.g., 165 lbs)",
        "build": "body type (slim, athletic, muscular, stocky, etc.)",
        "hairColor": "hair color",
        "hairLength": "short/medium/long",
        "hairStyle": "style description",
        "eyeColor": "eye color",
        "skinTone": "skin tone",
        "face": "facial features",
        "distinguishing": "scars, markings, unique features"
      },
      "clothing": "Current clothing",
      "personality": "Key traits (1 sentence)",
      "personalityTypes": ["2-4 types from: ${getPersonalityTypeNames().join(', ')}"],
      "goals": "What they want",
      "inventory": [],
      "status": "healthy",
      "stats": { "health": 100, "stamina": 100, "hunger": 0, "thirst": 0, "strength": 50, "dexterity": 50, "intelligence": 50, "encumbrance": 0, "sanity": 100, "anger": 0, "fear": 0 },
      "position": { "x": 0, "y": 0 },
      "attitudes": { "<other_character_id>": { "love": 50, "anger": 0, "attraction": 0, "trust": 50, "fear": 0 } }
    }
  ],
  "worldSummary": "Brief summary of the current situation",
  "authorStyle": "${authorStyle || 'Author name appropriate for this story type (e.g., Stephen King, Hemingway, etc.)'}"
}`;
}

function formatTime(time) {
  const hour = time.hour.toString().padStart(2, '0');
  const minute = time.minute.toString().padStart(2, '0');
  return `Day ${time.day}, ${hour}:${minute}`;
}

function safeJoin(arr, sep = ', ') {
  return Array.isArray(arr) && arr.length > 0 ? arr.join(sep) : null;
}

// Helper function to build common player context
function buildPlayerContext(character, worldState, recentHistory) {
  const historyText = recentHistory.length > 0
    ? recentHistory.map(h => `- ${h}`).join('\n')
    : 'No recent events.';

  const loc = worldState.currentLocation || {};
  const appearance = character.appearance || {};
  // All keys are lowercase after normalizeKeys
  const hairDesc = [appearance.hairlength, appearance.haircolor, appearance.hairstyle].filter(Boolean).join(' ');
  const appearanceStr = [
    appearance.gender,
    appearance.age,
    appearance.ethnicity,
    appearance.height,
    appearance.weight,
    appearance.build,
    appearance.skintone ? `${appearance.skintone} skin` : null,
    hairDesc ? `${hairDesc} hair` : null,
    appearance.facialhair && appearance.facialhair !== 'none' ? appearance.facialhair : null,
    appearance.eyecolor ? `${appearance.eyecolor} eyes` : null,
    appearance.face,
    appearance.distinguishing
  ].filter(Boolean).join(', ') || 'Unknown';
  const inventory = safeJoin(character.inventory) || 'Nothing';
  const exits = safeJoin(loc.exits) || 'None apparent';
  const items = safeJoin(loc.items) || 'Nothing notable';

  // Build others present with distance info
  const otherChars = worldState.characters?.filter(c => c.id !== character.id) || [];
  const charPos = character.position || { x: 0, y: 0 };
  const othersWithDistance = otherChars.map(c => {
    const otherPos = c.position || { x: 0, y: 0 };
    const dx = charPos.x - otherPos.x;
    const dy = charPos.y - otherPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const distStr = distance <= 5 ? 'right next to you' :
                    distance <= 20 ? 'nearby (can communicate)' :
                    distance <= 50 ? 'some distance away' : 'far away';
    return `${c.name} (${distStr})`;
  });
  const others = othersWithDistance.length > 0 ? othersWithDistance.join(', ') : 'No one else';

  // Build dead bodies info
  const deadBodies = worldState.deadBodies || [];
  const bodiesHere = deadBodies.map(b => b.name).join(', ') || null;

  // Build discovered objects with distance info (only show objects within visual range)
  const VISUAL_RANGE = 100; // meters - characters can only see objects within this range
  const discoveredObjects = worldState.discoveredObjects || [];
  const visibleObjects = discoveredObjects.filter(obj => {
    if (!obj.position) return true; // Show objects without position (legacy)
    const dx = charPos.x - obj.position.x;
    const dy = charPos.y - obj.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= VISUAL_RANGE;
  }).map(obj => {
    if (!obj.position) return `${obj.name}`;
    const dx = charPos.x - obj.position.x;
    const dy = charPos.y - obj.position.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const distStr = distance <= 5 ? 'within reach' :
                    distance <= 20 ? 'nearby' :
                    distance <= 50 ? 'some distance away' : 'visible in the distance';
    return `${obj.name} (${distStr})`;
  });
  const discoveredObjectsStr = visibleObjects.length > 0 ? visibleObjects.join(', ') : null;

  const stats = character.stats || {};
  const statsStr = [
    `Health: ${stats.health ?? 100}%`,
    `Stamina: ${stats.stamina ?? 100}%`,
    `Hunger: ${stats.hunger ?? 0}%`,
    `Thirst: ${stats.thirst ?? 0}%`,
    `Strength: ${stats.strength ?? 50}%`,
    `Dexterity: ${stats.dexterity ?? 50}%`,
    `Intelligence: ${stats.intelligence ?? 50}%`,
    `Encumbrance: ${stats.encumbrance ?? 0}%`,
    `Sanity: ${stats.sanity ?? 100}%`,
    `Anger: ${stats.anger ?? 0}%`,
    `Fear: ${stats.fear ?? 0}%`
  ].join(', ');

  const positionStr = character.position ?
    `Position: (${character.position.x}, ${character.position.y}) meters from center` : '';

  // Format attitudes towards other characters
  const attitudes = character.attitudes || {};
  const attitudesStr = Object.entries(attitudes).map(([targetId, feelings]) => {
    const targetChar = worldState.characters.find(c => c.id === targetId);
    const targetName = targetChar ? targetChar.name : targetId;
    const feelingsStr = Object.entries(feelings)
      .filter(([key, val]) => !key.startsWith('_') && typeof val === 'number')
      .map(([key, val]) => `${key}:${val}%`)
      .join(', ');
    return `  Towards ${targetName}: ${feelingsStr}`;
  }).join('\n');

  return {
    historyText,
    loc,
    appearanceStr,
    inventory,
    exits,
    items,
    others,
    bodiesHere,
    discoveredObjectsStr,
    statsStr,
    positionStr,
    attitudesStr
  };
}

// Build visible map features text for DM resolution
function buildVisibleFeaturesText(worldState) {
  if (!worldState.mapFeatures || worldState.mapFeatures.length === 0) {
    return 'No map features available.';
  }

  const lines = [];
  for (const char of worldState.characters || []) {
    const charPos = char.position || { x: 0, y: 0 };
    const visibleFeatures = worldState.mapFeatures.filter(feature => {
      const dx = charPos.x - feature.position.x;
      const dy = charPos.y - feature.position.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      return distance <= feature.visibleFrom;
    }).map(feature => {
      const dx = charPos.x - feature.position.x;
      const dy = charPos.y - feature.position.y;
      const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
      const direction = getDirection(dx, dy);
      return `  - ${feature.name} (${feature.type}) ~${distance}m to the ${direction}${feature.discovered ? ' [DISCOVERED]' : ''} - REACHABLE this turn`;
    });

    if (visibleFeatures.length > 0) {
      lines.push(`${char.name} can see:`);
      lines.push(...visibleFeatures);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No features currently visible to any character (all features are too far away).';
}

// Build text showing all map features with distances for context
function buildAllFeaturesText(worldState) {
  if (!worldState.mapFeatures || worldState.mapFeatures.length === 0) {
    return '';
  }

  // Calculate average character position
  const chars = worldState.characters || [];
  if (chars.length === 0) return '';

  let avgX = 0, avgY = 0;
  for (const char of chars) {
    avgX += (char.position?.x || 0);
    avgY += (char.position?.y || 0);
  }
  avgX /= chars.length;
  avgY /= chars.length;

  const features = worldState.mapFeatures.map(feature => {
    const dx = avgX - feature.position.x;
    const dy = avgY - feature.position.y;
    const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
    const direction = getDirection(dx, dy);
    const timeToReach = Math.round(distance / 80); // minutes at walking pace
    const discovered = feature.discovered ? ' [DISCOVERED]' : '';
    return { name: feature.name, type: feature.type, distance, direction, timeToReach, discovered };
  }).sort((a, b) => a.distance - b.distance);

  const lines = ['ALL MAP FEATURES (for planning, NOT immediately reachable unless in VISIBLE section):'];
  for (const f of features) {
    lines.push(`  - ${f.name} (${f.type}): ${f.distance}m ${f.direction} (~${f.timeToReach} min walk)${f.discovered}`);
  }

  return lines.join('\n');
}

// Get cardinal direction from delta coordinates
function getDirection(dx, dy) {
  // Note: dx is west-east (negative = east), dy is north-south (negative = north)
  const angle = Math.atan2(-dy, -dx) * 180 / Math.PI;
  if (angle >= -22.5 && angle < 22.5) return 'east';
  if (angle >= 22.5 && angle < 67.5) return 'northeast';
  if (angle >= 67.5 && angle < 112.5) return 'north';
  if (angle >= 112.5 && angle < 157.5) return 'northwest';
  if (angle >= 157.5 || angle < -157.5) return 'west';
  if (angle >= -157.5 && angle < -112.5) return 'southwest';
  if (angle >= -112.5 && angle < -67.5) return 'south';
  if (angle >= -67.5 && angle < -22.5) return 'southeast';
  return 'unknown';
}

// Calculate total distance traveled from character paths
function calculateTotalDistance(positions) {
  if (!positions || positions.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < positions.length; i++) {
    const dx = positions[i].x - positions[i - 1].x;
    const dy = positions[i].y - positions[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return Math.round(total);
}

// Build travel summary text showing distance traveled by each character
function buildTravelSummaryText(worldState, characterPaths) {
  if (!characterPaths || Object.keys(characterPaths).length === 0) {
    return '';
  }

  const lines = ['TRAVEL SUMMARY:'];
  for (const char of worldState.characters || []) {
    const paths = characterPaths[char.id];
    if (paths && paths.length > 0) {
      const totalDist = calculateTotalDistance(paths);
      const startPos = paths[0];
      const currentPos = paths[paths.length - 1];
      const directDist = Math.round(Math.sqrt(
        Math.pow(currentPos.x - startPos.x, 2) + Math.pow(currentPos.y - startPos.y, 2)
      ));
      lines.push(`  ${char.name}: traveled ${totalDist}m total, currently ${directDist}m from starting point`);
    }
  }
  return lines.join('\n');
}

// Build text showing discovered locations with distances and directions from each character
function buildDiscoveredLocationsText(worldState, characterPaths) {
  const discovered = [];

  // Add discovered map features
  for (const feature of worldState.mapFeatures || []) {
    if (feature.discovered && feature.position) {
      discovered.push({
        name: feature.name,
        type: feature.type || 'location',
        position: feature.position,
        description: feature.description
      });
    }
  }

  // Add discovered objects from state
  for (const obj of worldState.discoveredObjects || []) {
    if (obj.position) {
      discovered.push({
        name: obj.name,
        type: 'object',
        position: obj.position,
        description: obj.description
      });
    }
  }

  // Add dead bodies
  for (const body of worldState.deadBodies || []) {
    if (body.position) {
      discovered.push({
        name: body.name,
        type: 'dead body',
        position: body.position,
        description: body.description
      });
    }
  }

  if (discovered.length === 0) {
    return 'KNOWN LOCATIONS: None discovered yet.';
  }

  const lines = ['KNOWN LOCATIONS (discovered features, objects, bodies):'];

  for (const char of worldState.characters || []) {
    const charPos = char.position || { x: 0, y: 0 };
    const charLines = [`  From ${char.name}'s position (${charPos.x}, ${charPos.y}):`];

    for (const loc of discovered) {
      const dx = charPos.x - loc.position.x;
      const dy = charPos.y - loc.position.y;
      const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
      const direction = getDirection(dx, dy);
      const walkTime = Math.round(distance / 80);
      charLines.push(`    - ${loc.name} (${loc.type}): ${distance}m ${direction} (~${walkTime} min walk) at (${loc.position.x}, ${loc.position.y})`);
    }

    lines.push(...charLines);
  }

  return lines.join('\n');
}

// Build discovered locations text for a specific character
function buildCharacterDiscoveredLocationsText(character, worldState) {
  const discovered = [];

  // Add discovered map features
  for (const feature of worldState.mapFeatures || []) {
    if (feature.discovered && feature.position) {
      discovered.push({
        name: feature.name,
        type: feature.type || 'location',
        position: feature.position
      });
    }
  }

  // Add discovered objects from state
  for (const obj of worldState.discoveredObjects || []) {
    if (obj.position) {
      discovered.push({
        name: obj.name,
        type: 'object',
        position: obj.position
      });
    }
  }

  // Add dead bodies
  for (const body of worldState.deadBodies || []) {
    if (body.position) {
      discovered.push({
        name: body.name,
        type: 'dead body',
        position: body.position
      });
    }
  }

  if (discovered.length === 0) {
    return 'You have not discovered any notable locations yet.';
  }

  const charPos = character.position || { x: 0, y: 0 };
  const lines = ['KNOWN LOCATIONS you can navigate to:'];

  // Sort by distance
  const sorted = discovered.map(loc => {
    const dx = charPos.x - loc.position.x;
    const dy = charPos.y - loc.position.y;
    const distance = Math.round(Math.sqrt(dx * dx + dy * dy));
    const direction = getDirection(dx, dy);
    return { ...loc, distance, direction };
  }).sort((a, b) => a.distance - b.distance);

  for (const loc of sorted) {
    const walkTime = Math.round(loc.distance / 80);
    lines.push(`  - ${loc.name} (${loc.type}): ${loc.distance}m ${loc.direction} (~${walkTime} min walk)`);
  }

  return lines.join('\n');
}

// Phase 1: Think and Talk - Player considers the situation and communicates with nearby characters
export function playerThinkTalkPrompt(character, worldState, recentHistory, previousTurnInfo = []) {
  const ctx = buildPlayerContext(character, worldState, recentHistory);

  // Build what you observed section (actions and dialogue from last turn)
  let observedSection = '';
  if (previousTurnInfo && previousTurnInfo.length > 0) {
    const observedLines = previousTurnInfo.map(info => {
      let line = `- ${info.name}`;
      if (info.action) {
        line += `: ${info.action}`;
      }
      if (info.dialogue) {
        line += ` Said: "${info.dialogue}"`;
      }
      return line;
    }).join('\n');
    observedSection = `\nLAST TURN, YOU OBSERVED NEARBY:\n${observedLines}\n`;
  }

  // Build character names map for attitude lookups
  const characterNames = {};
  for (const c of worldState.characters || []) {
    characterNames[c.id] = c.name;
  }

  // Get contextual behavior guidance based on actual stat/attitude values
  // Pass stats to suppress attraction behaviors when in critical physical state
  const activeStatEffects = generateActiveStatsBehaviorText(character.stats || {});
  const activeAttitudeEffects = generateActiveAttitudesBehaviorText(character.attitudes || {}, characterNames, undefined, character.stats);

  // Build stat effects section - only show if there are active effects
  const statEffectsSection = activeStatEffects
    ? `\nCRITICAL - Your current stat conditions that MUST affect your behavior:\n${activeStatEffects}`
    : '';

  // Build attitude effects section - only show if there are active effects
  const attitudeEffectsSection = activeAttitudeEffects
    ? `\nYour feelings towards others that should affect your interactions:\n${activeAttitudeEffects}`
    : '';

  // Add character author style instruction if set
  const characterStyleText = worldState.characterAuthorStyle
    ? `\nRESPONSE STYLE: Express your character's thoughts, speech, and actions in the style of ${worldState.characterAuthorStyle}. Emulate their voice, internal monologue style, and dialogue patterns.\n`
    : '';

  // Generate personality types behavior guidance
  const personalityText = generatePersonalityText(character.personalitytypes || character.personalityTypes);
  const personalitySection = personalityText
    ? `\nYOUR BASELINE PERSONALITY (always act according to these traits):\n${personalityText}\n`
    : '';

  return `You are ${character.name}.
${characterStyleText}
CURRENT TIME: ${formatTime(worldState.time)}

YOUR CHARACTER:
- Appearance: ${ctx.appearanceStr}
- Clothing: ${character.clothing || 'Unknown'}
- Personality: ${character.personality}
- Goals: ${character.goals}
- Inventory: ${ctx.inventory}
- Status: ${character.status}
- Stats: ${ctx.statsStr}
${ctx.positionStr ? `- ${ctx.positionStr}` : ''}
${ctx.attitudesStr ? `- Attitudes:\n${ctx.attitudesStr}` : ''}
${personalitySection}${statEffectsSection}
${attitudeEffectsSection}

CURRENT SITUATION:
Location: ${ctx.loc.name || 'Unknown'}
${ctx.loc.description || 'No description available'}

Available exits: ${ctx.exits}
Items here: ${ctx.items}${ctx.bodiesHere ? `\nDead bodies: ${ctx.bodiesHere}` : ''}${ctx.discoveredObjectsStr ? `\nDiscovered objects: ${ctx.discoveredObjectsStr}` : ''}
Others present: ${ctx.others}

${buildCharacterDiscoveredLocationsText(character, worldState)}
${observedSection}
RECENT EVENTS:
${ctx.historyText}

STORY CONTEXT:
- Goal: ${worldState.storyGoal || 'Survive and find a way forward'}
- Major events: ${(worldState.majorEvents && worldState.majorEvents.length > 0) ? worldState.majorEvents.join('; ') : 'None yet'}
- Current tensions: ${(worldState.tensions && worldState.tensions.length > 0) ? worldState.tensions.join('; ') : 'None'}

WORLD SUMMARY: ${worldState.summary}

This is the THINK AND TALK phase. Consider what you want to do this turn and communicate with nearby characters (within 20 meters) to coordinate or share information. They will hear what you say before deciding their actions.

Remember: You can only work with what exists (your inventory, known locations, things you can see). You cannot create or discover things - only the DM can introduce new elements to the world.

Respond with JSON:
{
  "thinking": "Your internal thoughts about the situation and what you're planning (1-2 sentences)",
  "intendedAction": "What you're planning to do this turn (1 sentence, can change based on responses)",
  "speech": "What you say out loud to nearby characters (or null if staying silent). Be specific - ask questions, share plans, warn of dangers, etc."
}`;
}

// Phase 2: Action - Player hears what others said and decides final action
export function playerActionPrompt(character, worldState, recentHistory, nearbyDialogue = []) {
  const ctx = buildPlayerContext(character, worldState, recentHistory);

  // Build nearby dialogue section from think/talk phase
  let dialogueSection = '';
  if (nearbyDialogue && nearbyDialogue.length > 0) {
    const dialogueLines = nearbyDialogue.map(d => `- ${d.name} says: "${d.said}"`).join('\n');
    dialogueSection = `\nYOU HEAR FROM NEARBY:\n${dialogueLines}\n\nRespond to what was said if appropriate, or act independently.\n`;
  }

  // Build character names map for attitude lookups
  const characterNames = {};
  for (const c of worldState.characters || []) {
    characterNames[c.id] = c.name;
  }

  // Get contextual behavior guidance based on actual stat/attitude values
  // Pass stats to suppress attraction behaviors when in critical physical state
  const activeStatEffects = generateActiveStatsBehaviorText(character.stats || {});
  const activeAttitudeEffects = generateActiveAttitudesBehaviorText(character.attitudes || {}, characterNames, undefined, character.stats);

  // Build stat effects section - only show if there are active effects
  const statEffectsSection = activeStatEffects
    ? `\nYour current conditions that MUST affect your actions:\n${activeStatEffects}`
    : '';

  // Build attitude effects section - only show if there are active effects
  const attitudeEffectsSection = activeAttitudeEffects
    ? `\nYour feelings that should affect interactions:\n${activeAttitudeEffects}`
    : '';

  // Add character author style instruction if set
  const characterStyleText = worldState.characterAuthorStyle
    ? `\nRESPONSE STYLE: Express your character's thoughts, speech, and actions in the style of ${worldState.characterAuthorStyle}. Emulate their voice, internal monologue style, and dialogue patterns.\n`
    : '';

  // Generate personality types behavior guidance
  const personalityText = generatePersonalityText(character.personalitytypes || character.personalityTypes);
  const personalitySection = personalityText
    ? `\nYOUR BASELINE PERSONALITY (always act according to these traits):\n${personalityText}\n`
    : '';

  return `You are ${character.name}.
${characterStyleText}
CURRENT TIME: ${formatTime(worldState.time)}

YOUR CHARACTER:
- Appearance: ${ctx.appearanceStr}
- Clothing: ${character.clothing || 'Unknown'}
- Personality: ${character.personality}
- Goals: ${character.goals}
- Inventory: ${ctx.inventory}
- Status: ${character.status}
- Stats: ${ctx.statsStr}
${ctx.positionStr ? `- ${ctx.positionStr}` : ''}
${ctx.attitudesStr ? `- Attitudes:\n${ctx.attitudesStr}` : ''}
${personalitySection}${statEffectsSection}
${attitudeEffectsSection}

CURRENT SITUATION:
Location: ${ctx.loc.name || 'Unknown'}
${ctx.loc.description || 'No description available'}

Available exits: ${ctx.exits}
Items here: ${ctx.items}${ctx.bodiesHere ? `\nDead bodies: ${ctx.bodiesHere}` : ''}${ctx.discoveredObjectsStr ? `\nDiscovered objects: ${ctx.discoveredObjectsStr}` : ''}
Others present: ${ctx.others}

${buildCharacterDiscoveredLocationsText(character, worldState)}
${dialogueSection}
RECENT EVENTS:
${ctx.historyText}

WORLD SUMMARY: ${worldState.summary}

This is the ACTION phase. You've heard what nearby characters said. Now decide your final action for this turn.

IMPORTANT - You can only work with what exists:
- You can use, combine, or modify items in your inventory or at your location
- You can travel to known locations or explore in a direction
- You can interact with other characters, objects, or the environment
- You CANNOT create new items, discover locations, or introduce things that don't exist
- If you want to craft/build something, describe your attempt - the DM will decide if it succeeds

Respond with JSON:
{
  "thinking": "Brief thought about what you heard and your decision (1 sentence)",
  "action": "The specific action you take (1-2 sentences). Be specific and actionable.",
  "dialogue": "What you say while acting, if anything (or null if silent)"
}`;
}

export function dmResolutionPrompt(worldState, characterActions, characterSpeech = [], dmInstructions = null, characterPaths = {}) {
  const actionsText = characterActions.map(ca => {
    let text = `${ca.character.name}: ${ca.action}`;
    if (ca.dialogue) {
      text += ` Says: "${ca.dialogue}"`;
    }
    return text;
  }).join('\n');

  const speechText = characterSpeech.length > 0
    ? characterSpeech.map(cs => `${cs.name} says: "${cs.speech}"`).join('\n')
    : 'No dialogue this turn';

  const charactersText = worldState.characters.map(c => {
    const appearance = c.appearance || {};
    // All keys are lowercase after normalizeKeys
    const hairDesc = [appearance.hairlength, appearance.haircolor, appearance.hairstyle].filter(Boolean).join(' ');
    const appearanceStr = [
      appearance.gender,
      appearance.age,
      appearance.ethnicity,
      appearance.height,
      appearance.weight,
      appearance.build,
      appearance.skintone ? `${appearance.skintone} skin` : null,
      hairDesc ? `${hairDesc} hair` : null,
      appearance.facialhair && appearance.facialhair !== 'none' ? appearance.facialhair : null,
      appearance.eyecolor ? `${appearance.eyecolor} eyes` : null,
      appearance.face,
      appearance.distinguishing
    ].filter(Boolean).join(', ');
    const stats = c.stats || {};
    const statsStr = `HP:${stats.health ?? 100}% STM:${stats.stamina ?? 100}% HNG:${stats.hunger ?? 0}% THR:${stats.thirst ?? 0}% STR:${stats.strength ?? 50}% DEX:${stats.dexterity ?? 50}% INT:${stats.intelligence ?? 50}% ENC:${stats.encumbrance ?? 0}% SAN:${stats.sanity ?? 100}% ANG:${stats.anger ?? 0}% FER:${stats.fear ?? 0}%`;
    const posStr = c.position ? ` at position (${c.position.x}, ${c.position.y})` : '';
    const attitudesStr = c.attitudes ? Object.entries(c.attitudes).map(([targetId, feelings]) => {
      const targetChar = worldState.characters.find(ch => ch.id === targetId);
      const targetName = targetChar ? targetChar.name : targetId;
      const feelingsArr = Object.entries(feelings)
        .filter(([key, val]) => !key.startsWith('_') && typeof val === 'number')
        .map(([key, val]) => `${key}:${val}%`);
      return `${targetName}[${feelingsArr.join(',')}]`;
    }).join(', ') : '';
    return `- ${c.name} (${c.id}): ${appearanceStr || 'no description'}, wearing ${c.clothing || 'unknown'}, ${c.status}${posStr}, inventory: [${safeJoin(c.inventory) || 'nothing'}]
    Stats: ${statsStr}${attitudesStr ? `\n    Attitudes: ${attitudesStr}` : ''}`;
  }).join('\n');

  // Dead bodies info
  const deadBodiesText = (worldState.deadBodies && worldState.deadBodies.length > 0)
    ? '\nDEAD BODIES:\n' + worldState.deadBodies.map(b => {
        const posStr = b.position ? ` at (${b.position.x}, ${b.position.y})` : '';
        return `- ${b.name}${posStr}, carrying: [${safeJoin(b.inventory) || 'nothing'}]`;
      }).join('\n')
    : '';

  // Discovered objects info
  const discoveredObjectsText = (worldState.discoveredObjects && worldState.discoveredObjects.length > 0)
    ? '\nDISCOVERED OBJECTS:\n' + worldState.discoveredObjects.map(obj => {
        const posStr = obj.position ? ` at (${obj.position.x}, ${obj.position.y})` : '';
        return `- ${obj.name} (${obj.id})${posStr}: ${obj.description || 'no description'}`;
      }).join('\n')
    : '';

  // Visible map features
  const visibleFeaturesText = buildVisibleFeaturesText(worldState);

  const dmInstructionsText = dmInstructions
    ? `\nDM INSTRUCTIONS (incorporate these into the narrative):\n${dmInstructions}\n`
    : '';

  const loc = worldState.currentLocation || {};
  const env = worldState.environment || {};
  const majorEventsText = safeJoin(worldState.majorEvents, '; ') || 'None yet';
  const tensionsText = safeJoin(worldState.tensions, '; ') || 'None';
  const envText = [
    env.type,
    env.terrain,
    env.lighting,
    env.weather,
    env.temperature
  ].filter(Boolean).join(', ') || 'Unknown';

  // Add author style instruction if set
  const dmAuthorStyleText = worldState.dmAuthorStyle
    ? `\nNARRATIVE STYLE: Write the narrative in the style of ${worldState.dmAuthorStyle}. Emulate their voice, sentence structure, pacing, and descriptive approach.\n`
    : '';

  return `Resolve the following character actions and describe what happens.
${dmAuthorStyleText}
CURRENT TIME: ${formatTime(worldState.time)}
ENVIRONMENT: ${envText}

STORY GOAL: ${worldState.storyGoal || 'Not established'}
VICTORY CONDITIONS: ${worldState.victoryConditions ? `${worldState.victoryConditions.primary} (Requirements: ${(worldState.victoryConditions.requirements || []).join(', ')})` : 'Not established'}
NARRATIVE ARC: ${worldState.narrativeArc || 'Beginning'}
MAJOR EVENTS SO FAR: ${majorEventsText}
CURRENT TENSIONS: ${tensionsText}

CURRENT LOCATION: ${loc.name || 'Unknown'}
${loc.description || 'No description'}
Items: ${safeJoin(loc.items) || 'None'}
Exits: ${safeJoin(loc.exits) || 'None apparent'}

CHARACTERS:
${charactersText}
${deadBodiesText}${discoveredObjectsText}

${buildTravelSummaryText(worldState, characterPaths)}

${buildDiscoveredLocationsText(worldState, characterPaths)}

VISIBLE MAP FEATURES (characters can reach/discover these this turn):
${visibleFeaturesText}

${buildAllFeaturesText(worldState)}

CHARACTER DIALOGUE THIS TURN:
${speechText}

CHARACTER ACTIONS THIS TURN:
${actionsText}
${dmInstructionsText}
IMPORTANT - DIALOGUE IN NARRATIVE:
- The narrative MUST include character conversations as dialogue (in quotes)
- Include what characters say to each other verbatim or paraphrased
- Show characters responding to each other's speech
- Dialogue brings scenes to life - don't just describe actions, show the conversation

Resolve these actions realistically. Consider:
- Characters can ONLY use items in their INVENTORY (listed above for each character)
- If a character tries to use an item they don't have, the action FAILS

STAT EFFECTS ON ACTIONS (ENFORCE THESE STRICTLY):

${generateDMStatThresholdsText(dmStatThresholds)}

ABILITY STATS:
${generateAbilityStatsText(abilityStats)}

${generateStaminaGuidanceText(staminaRates)}

${generateHydrationGuidanceText(hydrationRates)}

Also consider:
- How characters interact with each other based on their attitudes
- Environmental effects and discoveries
- Natural consequences of actions
- How this advances (or complicates) the story goal

TIME TRACKING (CRITICAL):
- Time must ALWAYS advance forward from the current time shown above
- Estimate realistic duration for the actions taken (typically 10-60 minutes per turn)
- Quick conversations/simple actions: 10-15 minutes
- Moderate activities (searching, crafting, short travel): 20-40 minutes
- Extended activities (long travel, complex tasks, rest): 1-4 hours
- When hour reaches 24, increment day and reset hour to 0

MOVEMENT TRACKING:
- Characters have positions in meters (x, y) relative to scene center
- When characters move, specify movement with direction and distance
- Directions: "north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest", or heading in degrees (0=north, 90=east, 180=south, 270=west)
- Distance in meters based on activity and duration
- Movement speed: walking ~80m/min (5km/h), running ~150m/min (9km/h)
- In a 15-minute turn, characters can walk ~1200m or run ~2250m maximum
- Characters within 20 meters can communicate with each other
- The system calculates new positions from movement - you only provide direction and distance

DEATH:
- If a character's health reaches 0%, they DIE
- Dead characters become objects ("dead body of [name]") and are removed from play
- Their inventory remains on their body and can be looted

STORY ENDING:
The story ends when ONE of these conditions is met:
1. ALL player characters die - set storyEnding with type "defeat"
2. The storyGoal is achieved - set storyEnding with type "victory"
3. The story reaches a natural conclusion (other major resolution) - set storyEnding with type "other"

When the story ends:
- Write a final, conclusive narrative describing the ending scene
- Set arcUpdates.storyEnding with type and a brief summary
- This will be the FINAL turn of the story

NEW CHARACTERS (max 7 total characters in story):
- You can introduce new characters to advance the narrative
- Characters can be ANY type: humans, animals, aliens, creatures, robots, monsters, spirits, etc.
- Add them via newCharacters array in worldChanges
- New characters need full details: id, name, appearance, clothing, personality, personalityTypes, goals, inventory, status, stats, position, attitudes
- Dispositions: friendly (allies, pets, helpers), neutral (wildlife, strangers), hostile (predators, enemies, monsters)
- Introduce new characters when narratively appropriate (encounters, discoveries, ambushes, summons, etc.)
- For non-humans, adapt appearance fields appropriately (e.g., fur color instead of hair, scales, metal plating, etc.)
- Current character count: ${(worldState.characters || []).length}/7

DISCOVERED OBJECTS & INVENTORY (CRITICAL):
- discoveredObjects = objects in the world that characters have found
- character inventory = objects the character is carrying
- AN OBJECT CAN ONLY BE IN ONE PLACE: either in discoveredObjects OR in a character's inventory, NEVER BOTH

When a character PICKS UP or TAKES an object from discoveredObjects:
1. Add the object's ID to removedObjects array (removes it from the world)
2. Add the object name to the character's inventoryAdd array (adds it to their inventory)

When a character DROPS or PLACES an object:
1. Add the object name to the character's inventoryRemove array
2. Add a new entry to discoveredObjects with the object at its new position

Example - A character picks up a canteen (obj_canteen):
- removedObjects: ["obj_canteen"]
- characterUpdates: [{ id: "<exact id from CHARACTERS section>", inventoryAdd: ["canteen"], ... }]

IMPORTANT: inventoryAdd/inventoryRemove use friendly item NAMES (e.g., "canteen", "knife", "rope"), NOT object IDs (e.g., "obj_canteen"). Object IDs are only used in removedObjects and discoveredObjects.

- Track significant objects/locations found (water sources, shelter, caches, landmarks, vehicles, etc.)
- Each discovered object has: id, name, description, position (x, y in meters), status
- These help characters navigate and plan by showing known resources and landmarks

MOVEMENT - CRITICAL RULES:
- Walking speed is ~80m per minute, running ~150m per minute.
- A typical turn (15-30 minutes) allows movement of 1-2km at most if traveling continuously.
- movement values MUST reflect realistic travel distances based on what the character is doing.
- The narrative MUST match movement - if characters "reach" a location, their movement direction/distance must get them there.
- Characters can ONLY discover/reach features listed in VISIBLE MAP FEATURES below. If a feature is not listed, it is too far away to see or reach this turn.
- DO NOT write narrative about finding/reaching locations that are not in VISIBLE MAP FEATURES.

MAP FEATURE DISCOVERY:
- Characters can ONLY discover features that appear in VISIBLE MAP FEATURES (within visibility range)
- If a character moves within 100m of a visible map feature, they discover it - describe it in detail
- Include discovered feature IDs in the discoveredMapFeatures array in worldChanges
- When discovering a feature, specify movement that gets the character to that feature
- Discovered features should be described vividly when first encountered

MANDATORY - characterUpdates MUST reflect ALL state changes:
- clothingChange: REQUIRED if ANY clothing changes occur. Set to COMPLETE current outfit (e.g., "naked", "torn shirt and jeans", "shirtless in cargo pants"). DO NOT OMIT THIS.
- statusChange: REQUIRED if status changes (injured, tired, wet, etc.)
- inventoryAdd/inventoryRemove: REQUIRED if items are picked up or dropped
- movement: REQUIRED if character moves (direction and distance in meters). Direction can be cardinal ("north", "southeast") or degrees (0-360).
- You MUST include a characterUpdates entry for EVERY character whose state changed this turn
- If clothing is removed or destroyed, clothingChange MUST be set (e.g., "naked" or partial description)

Respond with JSON:
{
  "narrative": "Paragraph describing what happens INCLUDING character dialogue in quotes (3-5 sentences, vivid and engaging, weave in what characters say to each other)",
  "sceneFocus": "characters|landscape|object|phenomenon - what should dominate the image. Vary this across turns for visual variety!",
  "sceneVisuals": {
    "characterAction": "What characters are doing (used when sceneFocus='characters')",
    "objectDescription": "A discovered object/landmark (used when sceneFocus='object'), NO character names",
    "phenomenonDescription": "Weather/wildlife/event (used when sceneFocus='phenomenon'), NO character names"
  },
  "durationMinutes": 30,
  "_durationComment": "Estimate how many minutes the actions in this turn took (e.g., 5 for quick action, 30 for searching, 60+ for travel)",
  "arcUpdates": {
    "narrativeArc": "Updated phase of the story (e.g., 'Rising action - characters face first major obstacle')",
    "newMajorEvents": ["Any significant events from this turn, or empty array if none"],
    "tensions": ["Updated list of current unresolved tensions/conflicts"],
    "storyGoal": "Only update if the goal fundamentally changes, otherwise omit",
    "storyEnding": null or { "type": "victory|defeat|other", "summary": "Brief description of how the story ended" }
  },
  "worldChanges": {
    "locationUpdates": {
      "items": ["updated", "list", "of", "items"],
      "description": "Updated description if changed, or null"
    },
    "characterUpdates": [
      {
        "id": "<use exact character id from CHARACTERS section above>",
        "inventoryAdd": [],
        "inventoryRemove": [],
        "statusChange": "wet and cold",
        "clothingChange": "naked",
        "movement": { "direction": "northeast", "distance": 150 }
      },
      {
        "id": "<use exact character id from CHARACTERS section above>",
        "inventoryAdd": [],
        "inventoryRemove": ["shirt"],
        "statusChange": null,
        "clothingChange": "shirtless, wearing only cargo pants and boots",
        "movement": { "direction": 45, "distance": 150 }
      }
    ],
    "environmentUpdate": {
      "type": "only if environment type changes (e.g., entering a cave)",
      "terrain": "only if terrain changes",
      "lighting": "update for time of day or location changes",
      "weather": "update if weather changes",
      "temperature": "update if temperature changes"
    },
    "discoveredObjects": [
      {
        "id": "obj_water_source",
        "name": "small spring",
        "description": "A small natural spring with clear water bubbling up from rocks",
        "position": { "x": 50, "y": 30 },
        "status": "discovered"
      }
    ],
    "removedObjects": ["obj_old_item_id"],
    "discoveredMapFeatures": ["map_feature_id1", "map_feature_id2"],
    "newCharacters": [
      {
        "id": "<lowercase_name e.g. wolf, bandit, rescue_team>",
        "name": "Name (human, animal, creature, robot, etc.)",
        "appearance": {
          "gender": "male/female/none/unknown",
          "age": "age or maturity description",
          "ethnicity": "ethnic background or species type",
          "height": "height (e.g., 5'10\" for humans, size description for others)",
          "weight": "weight (e.g., 175 lbs for humans, size description for others)",
          "build": "body type (slim/muscular/bulky/sleek/etc.)",
          "hairColor": "hair/fur/feathers/scales color or n/a",
          "hairLength": "length or n/a",
          "hairStyle": "style or n/a",
          "facialHair": "facial features or n/a",
          "eyeColor": "eye color/type",
          "skinTone": "skin/fur/scales/metal/etc. color",
          "face": "face/head description",
          "distinguishing": "notable features (scars, markings, damage, unique traits)"
        },
        "clothing": "what they wear (or 'none' for animals/creatures)",
        "personality": "key behavioral traits",
        "personalityTypes": ["2-4 from: positive, negative, stoic, cheerful, depressed, outgoing, introvert, extrovert, flirty, peaceful, violent, fearful, brave, logical, emotional, reasonable, impulsive, spiritual, pragmatic, idealistic, cynical, upbeat, calm, nervous, confident, nurturing, selfish, loyal, manipulative, leader, follower, independent"],
        "goals": "what this character wants (survival, hunting, protecting, etc.)",
        "inventory": ["items", "they", "carry"],
        "status": "healthy/injured/hostile/hunting/etc",
        "stats": { "health": 100, "stamina": 100, "hunger": 0, "thirst": 0, "strength": 50, "dexterity": 50, "intelligence": 50, "encumbrance": 0, "sanity": 100, "anger": 0, "fear": 0 },
        "position": { "x": 15, "y": -10 },
        "attitudes": { "<existing_character_id>": { "love": 0, "anger": 50, "attraction": 0, "trust": 10, "fear": 0 } },
        "disposition": "friendly/neutral/hostile"
      }
    ],
    "newLocation": null
  },
  "worldSummary": "Updated brief summary of situation after this turn"
}`;
}

// Novel writing prompt - called at the end of each day
export function novelWritingPrompt(dayNumber, dayEvents, worldState, authorStyle, isContinuation = false, isEnding = false, existingNovel = null) {
  const eventsText = dayEvents.map((event, i) => `${i + 1}. ${event}`).join('\n');

  const charactersText = worldState.characters.map(c => {
    return `- ${c.name}: ${c.personality || 'Unknown personality'}`;
  }).join('\n');

  let chapterContext;
  if (isEnding) {
    const endingType = worldState.storyEnding?.type || 'conclusion';
    const endingSummary = worldState.storyEnding?.summary || 'The story has reached its end.';
    chapterContext = `This is the FINAL CHAPTER of the story. The story has ended: ${endingType} - ${endingSummary}. Write a satisfying conclusion that wraps up the narrative.`;
  } else if (isContinuation) {
    chapterContext = `This is a CONTINUATION of Day ${dayNumber} - the day is still ongoing but enough has happened to warrant a new chapter.`;
  } else {
    chapterContext = `This covers the events of Day ${dayNumber}.`;
  }

  // Include existing novel content for continuity
  const novelSection = existingNovel
    ? `\nTHE STORY SO FAR (your previous chapters - maintain consistency with this content):\n\n${existingNovel}\n\n---\n`
    : '\nThis is the FIRST CHAPTER of the novel.\n';

  return `You are writing a novel chapter in the style of ${authorStyle}.

TASK: Transform the following game events into a compelling novel chapter. Write prose, not a game log.
${chapterContext}
${novelSection}
AUTHOR STYLE: ${authorStyle}
- Emulate this author's voice, sentence structure, pacing, and thematic concerns
- Use their characteristic techniques (e.g., sparse prose for Hemingway, rich description for Tolkien, tension for King)
- Match their typical chapter length and paragraph structure
- IMPORTANT: Maintain consistency with the existing chapters above (character voice, established details, narrative threads)

CHARACTERS:
${charactersText}

NEW EVENTS TO NARRATE (these happened since the last chapter):
${eventsText}

CURRENT STORY STATE:
- Location: ${worldState.currentLocation?.name || 'Unknown'}
- Story Goal: ${worldState.storyGoal || 'Survival'}
- Tensions: ${(worldState.tensions || []).join(', ') || 'None'}

REQUIREMENTS:
1. Write a flowing narrative chapter - NO time stamps, NO turn markers, NO game mechanics
2. Include character dialogue naturally woven into the prose
3. Describe settings, emotions, and sensory details in the author's style
4. Maintain narrative tension and pacing appropriate to the author
5. The chapter should read like an actual published novel excerpt
6. Length: 800-1500 words (adjust based on author's typical style)
7. Continue naturally from where the previous chapter left off (if applicable)
8. Do not repeat or retell events already covered in previous chapters
${isEnding ? `
ENDING REQUIREMENTS (THIS IS THE FINAL CHAPTER):
- Provide narrative closure - resolve or acknowledge the main story threads
- Show the final fate of the characters
- End with a memorable final image, line, or moment
- The ending should feel earned and satisfying (even if tragic)
- Write an epilogue-style conclusion if appropriate for the author's style
` : ''}
Also provide condensed summaries for record-keeping.

Respond with JSON:
{
  "chapterTitle": "An evocative chapter title in the author's style",
  "chapterText": "The full novel chapter text...",
  "historySummary": "2-3 sentence summary of what happened for the history log",
  "majorEventsSummary": ["Brief bullet points of significant events"],
  "storyContentSummary": "A one-paragraph summary of the narrative"
}`;
}
