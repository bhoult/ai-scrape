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

export function dmInitPrompt(seed, authorStyle = null) {
  const authorInstructions = authorStyle
    ? `\nAUTHOR STYLE: "${authorStyle}" - The novel version of this story will be written in this author's style.`
    : `\nAUTHOR STYLE: Not specified. Choose an author whose style would be appropriate for this type of story (e.g., Stephen King for horror, Hemingway for survival, Agatha Christie for mystery, etc.). Return your choice in the authorStyle field.`;

  return `Parse the following story seed and create the initial world state. Extract characters, setting, situation, and the overall story goal. Determine an appropriate starting day and time for the story.

SEED:
${seed}
${authorInstructions}

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
Generate a map of the surrounding area covering approximately 2 days of travel distance (~20km radius from the starting point at position 0,0).

Include 10-20 map features appropriate to the environment type. Distribute them:
- 3-5 features within 5km (half day travel)
- 4-6 features within 10km (one day travel)
- 3-5 features within 20km (1.5 days travel)
- 2-4 features beyond 20km (2+ days travel)

Feature types to consider:
- water_source: springs, ponds, rivers, wells - CRITICAL for survival (visibleFrom: 200-500m)
- shelter: caves, buildings, rock formations (visibleFrom: 300-1000m)
- landmark: hills, distinctive rocks, dead trees - for navigation (visibleFrom: 500-2000m)
- terrain: forests, canyons, clearings (visibleFrom: 500-1500m)
- resource: wreckage, abandoned sites, supplies (visibleFrom: 200-500m)
- hazard: cliffs, quicksand, dangerous wildlife areas (visibleFrom: 100-300m)

Each feature should have realistic visibility range based on its size and type.
Position coordinates are in meters from origin (starting point at 0,0).

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
  "victoryConditions": {
    "primary": "The specific achievement that ends the story in victory (e.g., 'Reach the radio tower and call for rescue')",
    "requirements": ["List of things that must happen or be obtained", "e.g., 'Find working radio equipment'", "'Reach high ground for signal'"],
    "difficulty": "Description of why this is challenging but achievable"
  },
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
  "mapFeatures": [
    {
      "id": "map_feature_id",
      "type": "water_source|shelter|hazard|landmark|resource|terrain",
      "name": "Feature Name",
      "description": "What it looks like from afar and up close",
      "position": { "x": 5000, "y": 3000 },
      "size": 100,
      "visibleFrom": 500,
      "resources": ["water", "shade"],
      "hazards": ["wildlife"],
      "shelter": true
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
      "_comment": "Characters can be humans, animals, aliens, robots, creatures, etc. Adapt fields appropriately.",
      "id": "character_id",
      "name": "Character Name",
      "appearance": {
        "gender": "male/female/none/unknown",
        "age": "approximate age, maturity, or model version",
        "height": "size description (short/average/tall or specific)",
        "build": "body type (slim/muscular/bulky/sleek/quadruped/etc.)",
        "hairColor": "hair/fur/feathers/scales color (or n/a)",
        "hairLength": "length (or n/a for non-applicable)",
        "hairStyle": "style (or n/a)",
        "facialHair": "facial hair or features (or n/a)",
        "eyeColor": "eye color or sensor type",
        "skinTone": "skin/fur/scales/plating color and texture",
        "face": "face/head shape or notable features",
        "distinguishing": "scars, markings, damage, unique traits, species indicators"
      },
      "clothing": "Current clothing/accessories (or 'none' for animals/creatures)",
      "personality": "Key personality/behavioral traits",
      "goals": "What this character wants (survival, hunting, protecting territory, etc.)",
      "inventory": [],
      "status": "healthy",
      "stats": {
        "health": 100,
        "stamina": 100,
        "hunger": 0,
        "thirst": 0,
        "strength": 50,
        "dexterity": 50,
        "intelligence": 50,
        "encumbrance": 0,
        "sanity": 100,
        "anger": 0,
        "fear": 0
      },
      "position": {
        "x": 0,
        "y": 0,
        "_comment": "Position in meters relative to scene center. Characters near each other (within 20m) can communicate."
      },
      "attitudes": {
        "other_character_id": {
          "love": 50,
          "anger": 0,
          "attraction": 0,
          "trust": 50,
          "fear": 0,
          "_comment": "Feelings towards other characters (0-100). Initialize based on relationships in the seed."
        }
      }
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
      return `  - ${feature.name} (${feature.type}) ~${distance}m to the ${direction}${feature.discovered ? ' [DISCOVERED]' : ''}`;
    });

    if (visibleFeatures.length > 0) {
      lines.push(`${char.name} can see:`);
      lines.push(...visibleFeatures);
    }
  }

  return lines.length > 0 ? lines.join('\n') : 'No features currently visible to any character.';
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
${ctx.attitudesStr ? `- Attitudes:\n${ctx.attitudesStr}` : ''}

CRITICAL - Your stats MUST affect your behavior:
- Stamina 0-10%: You are EXHAUSTED. You can barely move, may collapse. Only rest or urgent survival actions. REST TO RECOVER.
- Stamina 11-30%: Very tired. Avoid physical exertion. Move slowly, take breaks to recover stamina.
- Health 0-20%: CRITICALLY INJURED. Every action is agony. Focus only on survival/medical help.
- Health 21-50%: Wounded. Physical actions are impaired and painful.
- Hunger 70-100%: STARVING. Obsess about food. Difficulty concentrating on anything else.
- Thirst 70-100%: DESPERATE for water. This overrides most other concerns.
- Sanity 0-20%: BREAKING DOWN. Hallucinate, talk to yourself, make irrational/paranoid decisions.
- Sanity 21-40%: Unstable. Erratic behavior, poor judgment, may misinterpret situations.
- Anger 70-100%: FURIOUS. Aggressive, confrontational, may lash out or make rash decisions.
- Fear 70-100%: TERRIFIED. May freeze, flee, refuse dangerous actions, or panic.
- Encumbrance 80-100%: OVERBURDENED. Cannot run, very slow movement, may need to drop items.

ATTITUDES affect how you interact with specific characters:
- ATTRACTION 80-100%: INTENSE DESIRE - actively try to initiate sex, remove clothing, make suggestive comments, physical touching
- ATTRACTION 60-79%: Seek physical proximity, flirtatious behavior, protective of them, may act foolishly to impress
- ATTRACTION 40-59%: Friendly interest, enjoy their company, notice their appearance
- LOVE 70-100%: Self-sacrificing, prioritize their wellbeing over your own, deep emotional bond
- LOVE 40-69%: Care about them, willing to help, emotionally invested in their fate
- ANGER 70-100%: Hostile, confrontational, refuse cooperation, may attack or sabotage them
- ANGER 40-69%: Irritated, short-tempered with them, reluctant to help
- TRUST 0-30%: Suspicious, won't share resources or information, keep distance, watch them carefully
- TRUST 31-60%: Cautious, verify before believing, limited cooperation
- TRUST 70-100%: Confide in them, share resources freely, follow their lead
- FEAR 70-100%: Avoid them, submissive behavior, may flee, do what they say out of terror
- FEAR 40-69%: Nervous around them, hesitant to disagree, easily intimidated

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
${ctx.attitudesStr ? `- Attitudes:\n${ctx.attitudesStr}` : ''}

CRITICAL - Your stats MUST affect your actions:
- Stamina 0-10%: EXHAUSTED - collapse, can barely move, REST to recover, only desperate survival
- Stamina 11-30%: Very tired - no running, no strenuous activity, take breaks to recover
- Health 0-20%: CRITICAL - every movement is agony, focus on medical help
- Health 21-50%: Wounded - physical actions impaired and painful
- Hunger 70%+: STARVING - obsess about food, poor concentration
- Thirst 70%+: DESPERATE for water - overrides other concerns
- Sanity 0-20%: BREAKING - hallucinate, irrational, paranoid
- Sanity 21-40%: Unstable - erratic, poor judgment
- Anger 70%+: FURIOUS - aggressive, may lash out
- Fear 70%+: TERRIFIED - may freeze, flee, or panic
- Encumbrance 80%+: OVERBURDENED - very slow, drop items

ATTITUDES affect how you interact with specific characters:
- ATTRACTION 80-100%: INTENSE DESIRE - initiate sex, remove clothing, suggestive comments, physical touching
- ATTRACTION 60-79%: Seek proximity, flirtatious, protective, may act foolishly to impress
- LOVE 70-100%: Self-sacrificing, prioritize their wellbeing, deep emotional bond
- ANGER 70-100%: Hostile, refuse cooperation, may attack or sabotage
- TRUST 0-30%: Suspicious, won't share resources, keep distance, watch carefully
- TRUST 70-100%: Confide in them, share freely, follow their lead
- FEAR 70-100%: Avoid, submissive, may flee, comply out of terror

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

export function dmResolutionPrompt(worldState, characterActions, characterSpeech = [], dmInstructions = null) {
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

  return `Resolve the following character actions and describe what happens.

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

VISIBLE MAP FEATURES:
${visibleFeaturesText}

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

STAMINA:
- 0%: Character COLLAPSES unconscious. They cannot act until stamina recovers above 10%.
- 1-10%: EXHAUSTED. Character can only crawl, speak weakly, or rest. All physical actions FAIL.
- 11-30%: Very tired. Running FAILS. Strenuous actions have 50% chance of failure.
- 31-50%: Fatigued. Physical actions are slower and less effective.

HEALTH:
- 0%: Character DIES (handled separately).
- 1-20%: CRITICAL. Character can barely move due to pain. Most actions FAIL. May pass out.
- 21-50%: Seriously wounded. Physical actions are impaired. May fail or worsen injury.

HUNGER:
- 80-100%: STARVING. Character is weak, shaky, may faint. -30% to all physical actions.
- 60-79%: Very hungry. Distracted by hunger. -15% effectiveness. May eat anything available.

THIRST:
- 80-100%: SEVERE DEHYDRATION. Confusion, weakness, may collapse. Actions often FAIL.
- 60-79%: Very thirsty. Impaired focus. Will prioritize finding water over other goals.

SANITY:
- 0-20%: PSYCHOTIC BREAK. Character hallucinates, talks to things that aren't there, may attack allies or flee from nothing. Their actions may be completely different from what they intended.
- 21-40%: Unstable. Paranoid, sees threats everywhere, makes poor decisions. May misinterpret others' actions.
- 41-60%: Stressed. Occasional irrational thoughts, easily startled, poor judgment under pressure.

ANGER:
- 80-100%: ENRAGED. May attack others without provocation. Cannot cooperate. Reckless.
- 60-79%: Very angry. Confrontational, aggressive responses, may start fights.

FEAR:
- 80-100%: PARALYZED BY TERROR. Character freezes, cowers, or flees uncontrollably. Cannot perform dangerous actions.
- 60-79%: Very frightened. May refuse risky actions, flee at first sign of danger.

ENCUMBRANCE:
- 90-100%: IMMOBILIZED. Cannot move until items are dropped.
- 70-89%: Heavily burdened. Cannot run, very slow, may need to drop items to act.

ABILITY STATS:
- High strength (70+) = advantage on physical tasks (lifting, breaking, fighting)
- Low strength (<30) = struggle with physical tasks, may fail
- High dexterity (70+) = advantage on agility/precision tasks
- Low dexterity (<30) = clumsy, may fumble or fail precise actions
- High intelligence (70+) = better problem-solving, notice details, recall knowledge
- Low intelligence (<30) = miss obvious solutions, poor planning

STAMINA DRAIN/RECOVERY (IMPORTANT - don't make characters tired too quickly):
- Normal activities (walking, talking, observing) should NOT drain stamina significantly
- Only STRENUOUS activities drain stamina quickly: running, fighting, climbing, heavy lifting, swimming
- If characters rest (sit, lie down, take a break), their stamina RECOVERS
- A character resting for an hour should recover 10-15% stamina
- A character sleeping should recover 15-25% stamina per hour
- Don't let characters become exhausted from ordinary survival activities like walking or searching

THIRST/HYDRATION (IMPORTANT - drinking water should help significantly):
- Drinking water or fluids should reduce thirst by 30-50% immediately
- A character who drinks adequately should have thirst near 0%
- Normal conditions: thirst increases ~2-4% per hour
- Hot/desert/heavy exertion: thirst increases ~5-10% per hour
- Characters should NOT become severely dehydrated in just a few hours unless in extreme conditions
- When characters find water and drink, their thirst should drop significantly

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

POSITION TRACKING:
- Characters have positions in meters (x, y) relative to scene center
- Update positionChange when characters move significantly
- Characters within 20 meters can communicate with each other
- Movement speed: walking ~5m/min, running ~15m/min

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
- New characters need full details: id, name, appearance, clothing, personality, goals, inventory, status, stats, position, attitudes
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

Example - Sarah picks up a canteen (obj_canteen):
- removedObjects: ["obj_canteen"]
- characterUpdates: [{ id: "char_sarah", inventoryAdd: ["canteen"], ... }]

IMPORTANT: inventoryAdd/inventoryRemove use friendly item NAMES (e.g., "canteen", "knife", "rope"), NOT object IDs (e.g., "obj_canteen"). Object IDs are only used in removedObjects and discoveredObjects.

- Track significant objects/locations found (water sources, shelter, caches, landmarks, vehicles, etc.)
- Each discovered object has: id, name, description, position (x, y in meters), status
- These help characters navigate and plan by showing known resources and landmarks

MAP FEATURE DISCOVERY:
- When characters travel or look around, reference visible map features in the narrative
- If a character moves within 100m of a map feature, they discover it - describe it in detail
- Include discovered feature IDs in the discoveredMapFeatures array in worldChanges
- Discovered features should be described vividly when first encountered

MANDATORY - characterUpdates MUST reflect ALL state changes:
- clothingChange: REQUIRED if ANY clothing changes occur. Set to COMPLETE current outfit (e.g., "naked", "torn shirt and jeans", "shirtless in cargo pants"). DO NOT OMIT THIS.
- statusChange: REQUIRED if status changes (injured, tired, wet, etc.)
- inventoryAdd/inventoryRemove: REQUIRED if items are picked up or dropped
- positionChange: REQUIRED if character moves significantly (x, y in meters)
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
    "discoveredMapFeatures": ["map_feature_id1", "map_feature_id2"],
    "newCharacters": [
      {
        "id": "char_newcomer",
        "name": "Name (human, animal, creature, robot, etc.)",
        "appearance": {
          "gender": "male/female/none/unknown",
          "age": "age or maturity description",
          "height": "size description",
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
        "goals": "what this character wants (survival, hunting, protecting, etc.)",
        "inventory": ["items", "they", "carry"],
        "status": "healthy/injured/hostile/hunting/etc",
        "stats": { "health": 100, "stamina": 100, "hunger": 0, "thirst": 0, "strength": 50, "dexterity": 50, "intelligence": 50, "encumbrance": 0, "sanity": 100, "anger": 0, "fear": 0 },
        "position": { "x": 15, "y": -10 },
        "attitudes": { "char_existing": { "love": 0, "anger": 50, "attraction": 0, "trust": 10, "fear": 0 } },
        "disposition": "friendly/neutral/hostile"
      }
    ],
    "newLocation": null
  },
  "worldSummary": "Updated brief summary of situation after this turn"
}`;
}

// Novel writing prompt - called at the end of each day
export function novelWritingPrompt(dayNumber, dayEvents, worldState, authorStyle, isContinuation = false, isEnding = false) {
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

  return `You are writing a novel chapter in the style of ${authorStyle}.

TASK: Transform the following game events into a compelling novel chapter. Write prose, not a game log.
${chapterContext}

AUTHOR STYLE: ${authorStyle}
- Emulate this author's voice, sentence structure, pacing, and thematic concerns
- Use their characteristic techniques (e.g., sparse prose for Hemingway, rich description for Tolkien, tension for King)
- Match their typical chapter length and paragraph structure

CHARACTERS:
${charactersText}

EVENTS:
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
