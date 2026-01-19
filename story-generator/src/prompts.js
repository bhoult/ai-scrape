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
  "sceneDescription": "A vivid visual description for illustration (1 sentence describing the scene, characters, setting, lighting, mood - suitable for image generation, e.g., 'Two weary travelers stand beside plane wreckage in a vast desert landscape under harsh midday sun')",
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

export function playerActionPrompt(character, worldState, recentHistory) {
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
  const others = safeJoin(worldState.characters?.filter(c => c.id !== character.id).map(c => c.name)) || 'No one else';

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

  return `You are ${character.name}.

CURRENT TIME: ${formatTime(worldState.time)}

YOUR CHARACTER:
- Appearance: ${appearanceStr}
- Clothing: ${character.clothing || 'Unknown'}
- Personality: ${character.personality}
- Goals: ${character.goals}
- Inventory: ${inventory}
- Status: ${character.status}
- Stats: ${statsStr}

Consider your physical and mental condition when deciding actions. High hunger/thirst impairs performance. Low stamina limits strenuous activity. Encumbrance affects mobility. Low sanity may cause irrational behavior. High anger may cause aggressive or reckless actions. High fear may cause hesitation or avoidance.

CURRENT SITUATION:
Location: ${loc.name || 'Unknown'}
${loc.description || 'No description available'}

Available exits: ${exits}
Items here: ${items}
Others present: ${others}

RECENT EVENTS:
${historyText}

WORLD SUMMARY: ${worldState.summary}

What do you do? Choose ONE action that fits your character. Be specific and actionable.

Respond with JSON:
{
  "thinking": "Brief internal thought about the situation (1 sentence)",
  "action": "The specific action you take (1-2 sentences)",
  "dialogue": "What you say, if anything (or null if silent)"
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
    return `- ${c.name} (${c.id}): ${appearanceStr || 'no description'}, wearing ${c.clothing || 'unknown'}, ${c.status}, inventory: [${safeJoin(c.inventory) || 'nothing'}]
    Stats: ${statsStr}`;
  }).join('\n');

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

MANDATORY - characterUpdates MUST reflect ALL state changes:
- clothingChange: REQUIRED if ANY clothing changes occur. Set to COMPLETE current outfit (e.g., "naked", "torn shirt and jeans", "shirtless in cargo pants"). DO NOT OMIT THIS.
- statusChange: REQUIRED if status changes (injured, tired, wet, etc.)
- inventoryAdd/inventoryRemove: REQUIRED if items are picked up or dropped
- You MUST include a characterUpdates entry for EVERY character whose state changed this turn
- If clothing is removed or destroyed, clothingChange MUST be set (e.g., "naked" or partial description)

Respond with JSON:
{
  "narrative": "Paragraph describing what happens (3-5 sentences, vivid and engaging)",
  "sceneDescription": "A vivid visual description for illustration (1 sentence capturing the key moment of this turn - characters, action, setting, lighting, mood - suitable for image generation)",
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
        "clothingChange": "naked"
      },
      {
        "id": "char_mike",
        "inventoryAdd": [],
        "inventoryRemove": ["shirt"],
        "statusChange": null,
        "clothingChange": "shirtless, wearing only cargo pants and boots"
      }
    ],
    "environmentUpdate": {
      "type": "only if environment type changes (e.g., entering a cave)",
      "terrain": "only if terrain changes",
      "lighting": "update for time of day or location changes",
      "weather": "update if weather changes",
      "temperature": "update if temperature changes"
    },
    "newLocation": null
  },
  "worldSummary": "Updated brief summary of situation after this turn"
}`;
}
