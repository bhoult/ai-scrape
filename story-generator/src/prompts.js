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

Always respond in the specified JSON format.`;

export const PLAYER_SYSTEM_PROMPT = `You are playing a character in an interactive story. Stay in character and make decisions that fit your personality and goals.

Your role:
- Act according to your character's personality and motivations
- Make realistic decisions based on your situation
- Interact with other characters and the environment
- Pursue your goals while responding to circumstances

Always respond in the specified JSON format with a single action.`;

export function dmInitPrompt(seed) {
  return `Parse the following story seed and create the initial world state. Extract characters, setting, situation, and the overall story goal. Determine an appropriate starting day and time for the story.

SEED:
${seed}

Respond with a JSON object containing:
{
  "narrative": "Opening paragraph describing the scene (2-3 sentences)",
  "sceneFocus": "characters|landscape|object|phenomenon - what should dominate the image",
  "sceneVisuals": {
    "characterAction": "What the characters are doing (only used if sceneFocus is 'characters'), e.g., 'Sarah kneels examining footprints while Mike scans the horizon'",
    "objectDescription": "Description of a discovered object (only used if sceneFocus is 'object'), e.g., 'A rusted canteen half-buried in sand near weathered rocks'",
    "phenomenonDescription": "Description of weather/wildlife/event (only used if sceneFocus is 'phenomenon'), e.g., 'A massive dust storm wall rolls across the desert horizon'"
  },
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
  "narrativeArc": "Current phase of the story (e.g., 'Introduction - characters assess their situation')",
  "majorEvents": ["The plane crashed in the desert"],
  "tensions": ["Immediate need for water", "Unknown location", "Limited supplies"],
  "discoveredObjects": [
    {
      "id": "obj_unique_id",
      "name": "Object Name",
      "description": "What it is and its state",
      "position": { "x": 0, "y": 0 },
      "status": "discovered"
    }
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
      "id": "character_id",
      "name": "Character Name",
      "appearance": {
        "gender": "male/female",
        "age": "approximate age or range",
        "height": "short/average/tall or specific",
        "build": "slim/average/heavy/muscular",
        "hairColor": "hair color",
        "hairLength": "bald/short/medium/long",
        "hairStyle": "straight/curly/wavy/tied back/etc.",
        "facialHair": "none/stubble/short beard/long beard/mustache/etc.",
        "eyeColor": "eye color",
        "skinTone": "pale/fair/tan/olive/brown/dark",
        "face": "face shape or notable facial features",
        "distinguishing": "scars, tattoos, glasses, other notable features"
      },
      "clothing": "Current clothing and accessories",
      "personality": "Key personality traits",
      "goals": "What this character wants",
      "inventory": [],
      "status": "healthy",
      "stats": {
        "health": 100,
        "stamina": 100,
        "hunger": 0,
        "thirst": 0,
        "strength": 50,
        "dexterity": 50,
        "encumbrance": 0,
        "sanity": 100,
        "anger": 0,
        "fear": 0
      },
      "position": {
        "x": 0,
        "y": 0,
        "_comment": "Position in meters relative to scene center. Characters near each other (within 20m) can communicate."
      }
    }
  ],
  "worldSummary": "Brief summary of the current situation"
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
  const hairDesc = [appearance.hairLength, appearance.hairColor, appearance.hairStyle].filter(Boolean).join(' ');
  const appearanceStr = [
    appearance.gender,
    appearance.age,
    appearance.skinTone ? `${appearance.skinTone} skin` : null,
    appearance.height,
    appearance.build,
    hairDesc ? `${hairDesc} hair` : null,
    appearance.facialHair && appearance.facialHair !== 'none' ? appearance.facialHair : null,
    appearance.eyeColor ? `${appearance.eyeColor} eyes` : null,
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
    `Encumbrance: ${stats.encumbrance ?? 0}%`,
    `Sanity: ${stats.sanity ?? 100}%`,
    `Anger: ${stats.anger ?? 0}%`,
    `Fear: ${stats.fear ?? 0}%`
  ].join(', ');

  const positionStr = character.position ?
    `Position: (${character.position.x}, ${character.position.y}) meters from center` : '';

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
    positionStr
  };
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

  return `You are ${character.name}.

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

Consider your physical and mental condition. High hunger/thirst impairs performance. Low stamina limits strenuous activity. Low sanity may cause irrational behavior. High anger may cause aggressive actions. High fear may cause hesitation.

CURRENT SITUATION:
Location: ${ctx.loc.name || 'Unknown'}
${ctx.loc.description || 'No description available'}

Available exits: ${ctx.exits}
Items here: ${ctx.items}${ctx.bodiesHere ? `\nDead bodies: ${ctx.bodiesHere}` : ''}${ctx.discoveredObjectsStr ? `\nDiscovered objects: ${ctx.discoveredObjectsStr}` : ''}
Others present: ${ctx.others}
${observedSection}
RECENT EVENTS:
${ctx.historyText}

STORY CONTEXT:
- Goal: ${worldState.storyGoal || 'Survive and find a way forward'}
- Major events: ${(worldState.majorEvents && worldState.majorEvents.length > 0) ? worldState.majorEvents.join('; ') : 'None yet'}
- Current tensions: ${(worldState.tensions && worldState.tensions.length > 0) ? worldState.tensions.join('; ') : 'None'}

WORLD SUMMARY: ${worldState.summary}

This is the THINK AND TALK phase. Consider what you want to do this turn and communicate with nearby characters (within 20 meters) to coordinate or share information. They will hear what you say before deciding their actions.

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

  return `You are ${character.name}.

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

Consider your physical and mental condition when deciding actions.

CURRENT SITUATION:
Location: ${ctx.loc.name || 'Unknown'}
${ctx.loc.description || 'No description available'}

Available exits: ${ctx.exits}
Items here: ${ctx.items}${ctx.bodiesHere ? `\nDead bodies: ${ctx.bodiesHere}` : ''}${ctx.discoveredObjectsStr ? `\nDiscovered objects: ${ctx.discoveredObjectsStr}` : ''}
Others present: ${ctx.others}
${dialogueSection}
RECENT EVENTS:
${ctx.historyText}

WORLD SUMMARY: ${worldState.summary}

This is the ACTION phase. You've heard what nearby characters said. Now decide your final action for this turn.

Respond with JSON:
{
  "thinking": "Brief thought about what you heard and your decision (1 sentence)",
  "action": "The specific action you take (1-2 sentences). Be specific and actionable.",
  "dialogue": "What you say while acting, if anything (or null if silent)"
}`;
}

export function dmResolutionPrompt(worldState, characterActions, dmInstructions = null) {
  const actionsText = characterActions.map(ca => {
    let text = `${ca.character.name}: ${ca.action}`;
    if (ca.dialogue) {
      text += ` Says: "${ca.dialogue}"`;
    }
    return text;
  }).join('\n');

  const charactersText = worldState.characters.map(c => {
    const appearance = c.appearance || {};
    const hairDesc = [appearance.hairLength, appearance.hairColor, appearance.hairStyle].filter(Boolean).join(' ');
    const appearanceStr = [
      appearance.gender,
      appearance.age,
      appearance.skinTone ? `${appearance.skinTone} skin` : null,
      appearance.height,
      appearance.build,
      hairDesc ? `${hairDesc} hair` : null,
      appearance.facialHair && appearance.facialHair !== 'none' ? appearance.facialHair : null,
      appearance.eyeColor ? `${appearance.eyeColor} eyes` : null,
      appearance.face,
      appearance.distinguishing
    ].filter(Boolean).join(', ');
    const stats = c.stats || {};
    const statsStr = `HP:${stats.health ?? 100}% STM:${stats.stamina ?? 100}% HNG:${stats.hunger ?? 0}% THR:${stats.thirst ?? 0}% STR:${stats.strength ?? 50}% DEX:${stats.dexterity ?? 50}% ENC:${stats.encumbrance ?? 0}% SAN:${stats.sanity ?? 100}% ANG:${stats.anger ?? 0}% FER:${stats.fear ?? 0}%`;
    const posStr = c.position ? ` at position (${c.position.x}, ${c.position.y})` : '';
    return `- ${c.name} (${c.id}): ${appearanceStr || 'no description'}, wearing ${c.clothing || 'unknown'}, ${c.status}${posStr}, inventory: [${safeJoin(c.inventory) || 'nothing'}]
    Stats: ${statsStr}`;
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

  return `Resolve the following character actions and describe what happens.

CURRENT TIME: ${formatTime(worldState.time)}
ENVIRONMENT: ${envText}

STORY GOAL: ${worldState.storyGoal || 'Not established'}
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

CHARACTER ACTIONS THIS TURN:
${actionsText}
${dmInstructionsText}
Resolve these actions realistically. Consider:
- What succeeds, fails, or has unexpected outcomes based on CHARACTER STATS
- High strength = better physical tasks, high dexterity = better fine motor/agility tasks
- Low health/stamina = actions may fail or have reduced effectiveness
- High hunger (>50%) or thirst (>50%) = impaired judgment and physical performance
- High encumbrance (>70%) = movement penalties, may drop items
- Low sanity (<50%) = character may hallucinate, make irrational decisions, or misinterpret events
- High anger (>50%) = character may act aggressively, make rash decisions, or lash out
- High fear (>70%) = character may freeze, flee, or refuse dangerous actions
- How characters interact with each other
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

POSITION TRACKING:
- Characters have positions in meters (x, y) relative to scene center
- Update positionChange when characters move significantly
- Characters within 20 meters can communicate with each other
- Movement speed: walking ~5m/min, running ~15m/min

DEATH:
- If a character's health reaches 0%, they DIE
- Dead characters become objects ("dead body of [name]") and are removed from play
- Their inventory remains on their body and can be looted

DISCOVERED OBJECTS:
- Track significant objects/locations found (water sources, shelter, caches, landmarks, vehicles, etc.)
- Each discovered object has: id, name, description, position (x, y in meters), status
- Add new discoveries to discoveredObjects array when characters find something significant
- Remove objects via removedObjects array when they are depleted, destroyed, or no longer relevant
- These help characters navigate and plan by showing known resources and landmarks

MANDATORY - characterUpdates MUST reflect ALL state changes:
- clothingChange: REQUIRED if ANY clothing changes occur. Set to COMPLETE current outfit (e.g., "naked", "torn shirt and jeans", "shirtless in cargo pants"). DO NOT OMIT THIS.
- statusChange: REQUIRED if status changes (injured, tired, wet, etc.)
- inventoryAdd/inventoryRemove: REQUIRED if items are picked up or dropped
- positionChange: REQUIRED if character moves significantly (x, y in meters)
- You MUST include a characterUpdates entry for EVERY character whose state changed this turn
- If clothing is removed or destroyed, clothingChange MUST be set (e.g., "naked" or partial description)

Respond with JSON:
{
  "narrative": "Paragraph describing what happens (3-5 sentences, vivid and engaging)",
  "sceneFocus": "characters|landscape|object|phenomenon - what should dominate the image. Vary this across turns for visual variety!",
  "sceneVisuals": {
    "characterAction": "What characters are doing (used when sceneFocus='characters')",
    "objectDescription": "A discovered object/landmark (used when sceneFocus='object'), NO character names",
    "phenomenonDescription": "Weather/wildlife/event (used when sceneFocus='phenomenon'), NO character names"
  },
  "time": {
    "day": 1,
    "hour": 9,
    "minute": 30,
    "_comment": "NEW time after this turn's actions (must be later than current time above)"
  },
  "arcUpdates": {
    "narrativeArc": "Updated phase of the story (e.g., 'Rising action - characters face first major obstacle')",
    "newMajorEvents": ["Any significant events from this turn, or empty array if none"],
    "tensions": ["Updated list of current unresolved tensions/conflicts"],
    "storyGoal": "Only update if the goal fundamentally changes, otherwise omit"
  },
  "worldChanges": {
    "locationUpdates": {
      "items": ["updated", "list", "of", "items"],
      "description": "Updated description if changed, or null"
    },
    "characterUpdates": [
      {
        "id": "char_sarah",
        "inventoryAdd": [],
        "inventoryRemove": [],
        "statusChange": "wet and cold",
        "clothingChange": "naked",
        "positionChange": { "x": 10, "y": -5 }
      },
      {
        "id": "char_mike",
        "inventoryAdd": [],
        "inventoryRemove": ["shirt"],
        "statusChange": null,
        "clothingChange": "shirtless, wearing only cargo pants and boots",
        "positionChange": null
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
    "newLocation": null
  },
  "worldSummary": "Updated brief summary of situation after this turn"
}`;
}
