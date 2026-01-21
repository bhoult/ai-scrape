import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { WorldState } from './world-state.js';
import { DMAgent } from './agents/dm-agent.js';
import { PlayerAgent } from './agents/player-agent.js';
import { queryLLMJSON, setLogsDir, logImagePrompt } from './fireworks.js';
import { novelWritingPrompt } from './prompts.js';
import {
  statGuidelines,
  attitudeGuidelines,
  generateStatGuidelinesText,
  generateAttitudeGuidelinesText
} from './behavior-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORIES_DIR = join(__dirname, '../stories');
const DRAW_SCRIPT = join(__dirname, '../../draw.py');

// Normalize object keys to lowercase (handles LLMs returning different cases)
function normalizeKeys(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(normalizeKeys);

  const normalized = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    normalized[lowerKey] = normalizeKeys(value);
  }
  return normalized;
}

export function listStories() {
  mkdirSync(STORIES_DIR, { recursive: true });
  const entries = readdirSync(STORIES_DIR, { withFileTypes: true });
  const folders = entries.filter(e => e.isDirectory());

  return folders.map(folder => {
    const stateFile = join(STORIES_DIR, folder.name, 'state.json');
    if (!existsSync(stateFile)) return null;

    const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
    return {
      id: folder.name,
      seed: data.seed,
      turn: data.worldState?.turnNumber || 0,
      time: data.worldState?.time,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt
    };
  }).filter(Boolean).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

export class GameEngine {
  constructor(models = null) {
    this.worldState = null;
    this.dmAgent = null;
    this.playerAgents = [];
    this.llmLog = [];
    this.initialized = false;
    this.seed = null;
    this.storyId = null;
    this.storyContent = [];
    this.createdAt = null;
    this.sceneDescriptions = []; // Array of { turn, sceneFocus, sceneVisuals, narrative, imagePath, success }
    // Role-specific models: { dm, character, narrator }
    this.models = typeof models === 'object' && models !== null
      ? { dm: models.dm || null, character: models.character || null, narrator: models.narrator || null }
      : { dm: models, character: models, narrator: models }; // Backward compatibility: single model for all
    this.turnSnapshots = []; // Array of world state snapshots at each turn for rollback
    this.currentDay = 1; // Track current day for novel generation
    this.dayEvents = []; // Events that happened during current day
    this.lastNovelTurn = 0; // Track when the last novel chapter was generated
    this.characterPaths = {}; // Track character position history for map display
  }

  setModels(models) {
    if (typeof models === 'object' && models !== null) {
      this.models = { dm: models.dm || null, character: models.character || null, narrator: models.narrator || null };
    } else {
      // Single model for all roles (backward compatibility)
      this.models = { dm: models, character: models, narrator: models };
    }
    if (this.dmAgent) {
      this.dmAgent.setModel(this.models.dm);
    }
    for (const agent of this.playerAgents) {
      agent.setModel(this.models.character);
    }
  }

  // Backward compatibility
  setModel(model) {
    this.setModels(model);
  }

  setAuthorStyles({ authorStyle, dmAuthorStyle, characterAuthorStyle }) {
    if (authorStyle !== undefined) {
      this.worldState.authorStyle = authorStyle;
    }
    if (dmAuthorStyle !== undefined) {
      this.worldState.dmAuthorStyle = dmAuthorStyle;
    }
    if (characterAuthorStyle !== undefined) {
      this.worldState.characterAuthorStyle = characterAuthorStyle;
    }
    // Save the updated state
    this.saveStory();
  }

  // Update character position history for map paths
  updateCharacterPaths() {
    if (!this.worldState || !this.worldState.characters) return;

    for (const char of this.worldState.characters) {
      if (!char.position) continue;

      if (!this.characterPaths[char.id]) {
        this.characterPaths[char.id] = [];
      }

      const positions = this.characterPaths[char.id];
      const lastPos = positions[positions.length - 1];

      // Only add if position changed
      if (!lastPos || lastPos.x !== char.position.x || lastPos.y !== char.position.y) {
        positions.push({
          x: char.position.x,
          y: char.position.y,
          turn: this.worldState.turnNumber || 0
        });
      }
    }
  }

  generateStoryId(seed) {
    // Create ID from first 50 chars of seed, sanitized
    const sanitized = seed
      .substring(0, 50)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
    return `${timestamp}-${sanitized}`;
  }

  getStoryDir() {
    return join(STORIES_DIR, this.storyId);
  }

  getImagesDir() {
    return join(this.getStoryDir(), 'images');
  }

  deriveExpression(character) {
    const stats = character.stats || {};
    const expressions = [];

    // Derive expression from emotional/physical state (prioritize most extreme conditions)
    const fear = stats.fear ?? 0;
    const anger = stats.anger ?? 0;
    const sanity = stats.sanity ?? 100;
    const health = stats.health ?? 100;
    const stamina = stats.stamina ?? 100;
    const hunger = stats.hunger ?? 0;
    const thirst = stats.thirst ?? 0;

    // High fear - terrified expressions
    if (fear >= 80) {
      expressions.push('terrified wide-eyed expression');
    } else if (fear >= 60) {
      expressions.push('fearful anxious look');
    } else if (fear >= 40) {
      expressions.push('nervous wary expression');
    }

    // High anger - aggressive expressions
    if (anger >= 80) {
      expressions.push('furious snarling expression');
    } else if (anger >= 60) {
      expressions.push('angry scowling face');
    } else if (anger >= 40) {
      expressions.push('irritated frown');
    }

    // Low sanity - disturbed expressions
    if (sanity <= 20) {
      expressions.push('wild-eyed unhinged look');
    } else if (sanity <= 40) {
      expressions.push('disturbed haunted expression');
    } else if (sanity <= 60) {
      expressions.push('stressed unsettled look');
    }

    // Low health - pained expressions
    if (health <= 20) {
      expressions.push('grimacing in pain');
    } else if (health <= 40) {
      expressions.push('pained wounded expression');
    } else if (health <= 60) {
      expressions.push('wincing slightly');
    }

    // Low stamina - exhaustion
    if (stamina <= 20) {
      expressions.push('exhausted drooping eyes');
    } else if (stamina <= 40) {
      expressions.push('weary tired expression');
    }

    // High hunger/thirst - desperation
    if (hunger >= 80 || thirst >= 80) {
      expressions.push('haggard desperate look');
    } else if (hunger >= 60 || thirst >= 60) {
      expressions.push('gaunt strained expression');
    }

    // If no extreme conditions, derive from general state
    if (expressions.length === 0) {
      // Default expressions based on overall wellbeing
      const avgWellbeing = (health + stamina + sanity) / 3;
      const avgDistress = (fear + anger + hunger + thirst) / 4;

      if (avgWellbeing >= 80 && avgDistress <= 20) {
        expressions.push('calm composed expression');
      } else if (avgWellbeing >= 60) {
        expressions.push('alert focused expression');
      } else {
        expressions.push('tense guarded expression');
      }
    }

    return expressions.slice(0, 2).join(', '); // Limit to 2 expressions max
  }

  derivePose(character) {
    const stats = character.stats || {};
    const status = (character.status || '').toLowerCase();

    // Check status for explicit poses
    if (status.includes('collapsed') || status.includes('unconscious') || status.includes('dead')) {
      return 'lying on the ground';
    }
    if (status.includes('sleeping') || status.includes('asleep')) {
      return 'lying down sleeping';
    }
    if (status.includes('resting') || status.includes('sitting')) {
      return 'sitting down';
    }
    if (status.includes('kneeling') || status.includes('crouching')) {
      return 'kneeling';
    }
    if (status.includes('running') || status.includes('fleeing')) {
      return 'running';
    }
    if (status.includes('fighting') || status.includes('attacking')) {
      return 'in fighting stance';
    }
    if (status.includes('climbing')) {
      return 'climbing';
    }
    if (status.includes('swimming')) {
      return 'swimming';
    }

    // Derive pose from stats
    const stamina = stats.stamina ?? 100;
    const health = stats.health ?? 100;

    if (stamina <= 10 || health <= 10) {
      return 'collapsed on the ground';
    }
    if (stamina <= 30 || health <= 30) {
      return 'sitting down exhausted';
    }
    if (stamina <= 50) {
      return 'leaning or resting';
    }

    // Default standing poses
    const fear = stats.fear ?? 0;
    const anger = stats.anger ?? 0;

    if (fear >= 70) {
      return 'cowering or backing away';
    }
    if (anger >= 70) {
      return 'aggressive stance';
    }

    return 'standing';
  }

  buildCharacterDescriptions() {
    const characters = this.worldState?.characters || [];
    return characters.map(c => {
      const appearance = c.appearance || {};
      // All keys are lowercase after normalizeKeys
      const hairDesc = [appearance.hairlength, appearance.haircolor, appearance.hairstyle].filter(Boolean).join(' ');
      const expression = this.deriveExpression(c);
      const pose = this.derivePose(c);
      const parts = [
        c.name,
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
        appearance.distinguishing,
        expression,
        pose,
        c.clothing ? `wearing ${c.clothing}` : null
      ].filter(Boolean).join(', ');
      return parts;
    });
  }

  buildEnvironmentDescription() {
    const environment = this.worldState?.environment || {};
    return [
      environment.type,
      environment.terrain,
      environment.lighting,
      environment.weather,
      environment.temperature
    ].filter(Boolean).join(', ');
  }

  buildImagePrompt(sceneFocus, sceneVisuals, narrative = null) {
    // Build prompt DETERMINISTICALLY based on scene focus
    // Only include information relevant to the focus - no character info for non-character focuses
    const parts = [];
    const envDesc = this.buildEnvironmentDescription();
    const visuals = sceneVisuals || {};

    // Helper to get visuals field (handles both camelCase and lowercase from normalizeKeys)
    const getVisual = (field) => visuals[field] || visuals[field.toLowerCase()] || visuals[field.charAt(0).toUpperCase() + field.slice(1)];

    switch (sceneFocus) {
      case 'characters':
        // Characters are the focus - include full character descriptions + action + environment
        const characterDescs = this.buildCharacterDescriptions();
        if (characterDescs.length > 0) {
          parts.push(characterDescs.join('. '));
        }
        const charAction = getVisual('characterAction') || getVisual('description');
        if (charAction) {
          parts.push(charAction);
        }
        if (envDesc) parts.push(envDesc);
        break;

      case 'landscape':
        // Landscape focus - ONLY environment, no characters, no scene description
        if (envDesc) parts.push(envDesc);
        break;

      case 'object':
        // Object focus - object description + discovered objects details + environment
        const objDesc = getVisual('objectDescription') || getVisual('description');
        if (objDesc) {
          parts.push(objDesc);
        }
        // Add discovered objects from world state for richer context
        if (this.worldState?.discoveredObjects?.length > 0) {
          const objectDescs = this.worldState.discoveredObjects
            .filter(obj => obj.description)
            .map(obj => `${obj.name}: ${obj.description}`)
            .slice(0, 3); // Limit to 3 most relevant
          if (objectDescs.length > 0) {
            parts.push(objectDescs.join('. '));
          }
        }
        if (envDesc) parts.push(envDesc);
        break;

      case 'phenomenon':
        // Phenomenon focus - phenomenon description + narrative context + environment
        const phenDesc = getVisual('phenomenonDescription') || getVisual('description');
        if (phenDesc) {
          parts.push(phenDesc);
        }
        // Add narrative context for richer description (first sentence only, no character names)
        if (narrative) {
          // Extract first sentence and remove character names
          const firstSentence = narrative.split(/[.!?]/)[0];
          if (firstSentence && firstSentence.length > 10) {
            // Remove common character name patterns (capitalized words at start or after spaces)
            const cleaned = firstSentence
              .replace(/\b[A-Z][a-z]+\b/g, '') // Remove capitalized names
              .replace(/\s+/g, ' ')
              .trim();
            if (cleaned.length > 20) {
              parts.push(cleaned);
            }
          }
        }
        if (envDesc) parts.push(envDesc);
        break;

      default:
        // Fallback to environment only
        if (envDesc) parts.push(envDesc);
    }

    return parts.join('. ');
  }

  buildImageMetadata(turn, sceneFocus, sceneVisuals, narrative, prompt) {
    return {
      turn,
      sceneFocus,
      sceneVisuals,
      narrative,
      characters: sceneFocus === 'characters' ? this.buildCharacterDescriptions() : [],
      environment: this.buildEnvironmentDescription(),
      prompt
    };
  }

  async generateImage(turn, sceneFocus = 'characters', sceneVisuals = {}, narrative = null, maxRetries = 3) {
    if (!this.storyId) return null;

    const imagesDir = this.getImagesDir();
    mkdirSync(imagesDir, { recursive: true });

    const imageName = `turn-${turn.toString().padStart(3, '0')}.jpg`;
    const imagePath = join(imagesDir, imageName);

    // Build full prompt DETERMINISTICALLY based on scene focus
    const imagePrompt = this.buildImagePrompt(sceneFocus, sceneVisuals, narrative);

    // Build metadata to embed in image
    const metadata = this.buildImageMetadata(turn, sceneFocus, sceneVisuals, narrative, imagePrompt);
    const metadataJson = JSON.stringify(metadata);

    // Log the image prompt
    logImagePrompt(imagePrompt, { turn, sceneFocus, sceneVisuals }, 'z-image-turbo', turn);

    // Always save the scene description record so we can regenerate later if needed
    const record = { turn, sceneFocus, sceneVisuals, narrative, imagePath: imageName, success: false };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.runImageGeneration(imagePrompt, imagePath, metadataJson);
        if (result) {
          record.success = true;
          this.sceneDescriptions.push(record);
          return record;
        }
        console.log(`Image generation attempt ${attempt}/${maxRetries} failed for turn ${turn}`);
      } catch (err) {
        console.error(`Image generation attempt ${attempt}/${maxRetries} error:`, err.message);
      }

      if (attempt < maxRetries) {
        // Wait before retry (exponential backoff: 2s, 4s, 8s)
        const waitTime = Math.pow(2, attempt) * 1000;
        console.log(`Waiting ${waitTime/1000}s before retry...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Save the record even if generation failed, so we can regenerate later
    console.error(`Image generation failed for turn ${turn} after ${maxRetries} attempts`);
    this.sceneDescriptions.push(record);
    return record;
  }

  runImageGeneration(imagePrompt, imagePath, metadataJson) {
    return new Promise((resolve, reject) => {
      const args = [
        imagePrompt,
        '--output', imagePath,
        '--width', '512',
        '--height', '512',
        '--steps', '8',
        '--metadata', metadataJson
      ];

      const proc = spawn(DRAW_SCRIPT, args);

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          console.error(`Image generation failed:`, stderr);
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  formatTime(time) {
    if (!time) return '';
    const hour = time.hour.toString().padStart(2, '0');
    const minute = time.minute.toString().padStart(2, '0');
    return `Day ${time.day}, ${hour}:${minute}`;
  }

  // Process intimacy effects - reduce attraction by 1/3 after sex
  processIntimacyEffects(narrative) {
    if (!narrative) return;

    // Keywords indicating sexual activity
    const intimacyKeywords = [
      'make love', 'made love', 'making love',
      'have sex', 'had sex', 'having sex',
      'sleep together', 'slept together', 'sleeping together',
      'intimate', 'intimacy', 'intercourse',
      'consummated', 'coupled', 'coupling',
      'passionate night', 'spent the night together',
      'bodies intertwined', 'flesh against flesh'
    ];

    const narrativeLower = narrative.toLowerCase();
    const hasIntimacyKeyword = intimacyKeywords.some(keyword => narrativeLower.includes(keyword));

    if (!hasIntimacyKeyword) return;

    // Find characters who are nude and close to each other (within 2 meters)
    const nudeCharacters = this.worldState.characters.filter(c => {
      const clothing = (c.clothing || '').toLowerCase();
      return clothing === 'nude' || clothing === 'naked' || clothing.includes('undressed') || clothing.includes('nothing');
    });

    if (nudeCharacters.length < 2) return;

    // Check which nude characters are close to each other
    const involvedPairs = [];
    for (let i = 0; i < nudeCharacters.length; i++) {
      for (let j = i + 1; j < nudeCharacters.length; j++) {
        const char1 = nudeCharacters[i];
        const char2 = nudeCharacters[j];
        const distance = this.worldState.getDistance(char1.position, char2.position);
        // Characters within 2 meters and both nude = likely intimate
        if (distance <= 2) {
          involvedPairs.push([char1, char2]);
        }
      }
    }

    // Also check if narrative mentions specific character names together with intimacy
    for (let i = 0; i < this.worldState.characters.length; i++) {
      for (let j = i + 1; j < this.worldState.characters.length; j++) {
        const char1 = this.worldState.characters[i];
        const char2 = this.worldState.characters[j];
        const name1 = char1.name.toLowerCase();
        const name2 = char2.name.toLowerCase();

        // Check if both names appear near intimacy keywords
        if (narrativeLower.includes(name1) && narrativeLower.includes(name2)) {
          // Already in pairs?
          const alreadyPaired = involvedPairs.some(
            ([a, b]) => (a.id === char1.id && b.id === char2.id) || (a.id === char2.id && b.id === char1.id)
          );
          if (!alreadyPaired) {
            involvedPairs.push([char1, char2]);
          }
        }
      }
    }

    // Reduce attraction by 1/3 for involved pairs
    for (const [char1, char2] of involvedPairs) {
      // Reduce char1's attraction to char2
      if (char1.attitudes && char1.attitudes[char2.id]) {
        const oldAttraction = char1.attitudes[char2.id].attraction || 0;
        const newAttraction = Math.round(oldAttraction * 2 / 3);
        char1.attitudes[char2.id].attraction = newAttraction;
        console.log(`[Intimacy] ${char1.name}'s attraction to ${char2.name} reduced: ${oldAttraction} -> ${newAttraction}`);
      }

      // Reduce char2's attraction to char1
      if (char2.attitudes && char2.attitudes[char1.id]) {
        const oldAttraction = char2.attitudes[char1.id].attraction || 0;
        const newAttraction = Math.round(oldAttraction * 2 / 3);
        char2.attitudes[char1.id].attraction = newAttraction;
        console.log(`[Intimacy] ${char2.name}'s attraction to ${char1.name} reduced: ${oldAttraction} -> ${newAttraction}`);
      }
    }
  }

  // Process automatic status effects based on extreme stat values
  processStatEffects() {
    for (const char of this.worldState.characters) {
      const stats = char.stats || {};
      const oldStatus = char.status;
      const statusParts = [];

      // Stamina effects
      if (stats.stamina <= 0) {
        statusParts.push('collapsed from exhaustion');
        console.log(`[Stat Effect] ${char.name} collapsed from exhaustion (stamina: ${stats.stamina}%)`);
      } else if (stats.stamina <= 10) {
        statusParts.push('barely conscious from exhaustion');
      } else if (stats.stamina <= 30) {
        statusParts.push('extremely tired');
      }

      // Health effects (not death, just status)
      if (stats.health > 0 && stats.health <= 20) {
        statusParts.push('critically injured');
      } else if (stats.health <= 50) {
        statusParts.push('wounded');
      }

      // Hunger effects
      if (stats.hunger >= 90) {
        statusParts.push('starving');
      } else if (stats.hunger >= 70) {
        statusParts.push('very hungry');
      }

      // Thirst effects
      if (stats.thirst >= 90) {
        statusParts.push('severely dehydrated');
        // Severe dehydration can cause collapse
        if (stats.thirst >= 95) {
          statusParts.push('collapsing from dehydration');
          console.log(`[Stat Effect] ${char.name} collapsing from dehydration (thirst: ${stats.thirst}%)`);
        }
      } else if (stats.thirst >= 70) {
        statusParts.push('very thirsty');
      }

      // Sanity effects
      if (stats.sanity <= 20) {
        statusParts.push('having a mental breakdown');
        console.log(`[Stat Effect] ${char.name} having mental breakdown (sanity: ${stats.sanity}%)`);
      } else if (stats.sanity <= 40) {
        statusParts.push('mentally unstable');
      }

      // Anger effects
      if (stats.anger >= 90) {
        statusParts.push('in a violent rage');
      } else if (stats.anger >= 70) {
        statusParts.push('furious');
      }

      // Fear effects
      if (stats.fear >= 90) {
        statusParts.push('paralyzed with terror');
      } else if (stats.fear >= 70) {
        statusParts.push('terrified');
      }

      // Update status if there are effects, otherwise set to healthy if no issues
      if (statusParts.length > 0) {
        char.status = statusParts.join(', ');
      } else if (!oldStatus || oldStatus === 'healthy' || oldStatus.includes('exhaustion') || oldStatus.includes('dehydrat') || oldStatus.includes('starving') || oldStatus.includes('breakdown')) {
        char.status = 'healthy';
      }

      if (char.status !== oldStatus) {
        console.log(`[Stat Effect] ${char.name} status changed: "${oldStatus}" -> "${char.status}"`);
      }
    }
  }

  async verifyCharacterStates(narrative, characters, elapsedMinutes = 30, turn = null) {
    // Build character descriptions for the prompt
    const charDescriptions = characters.map(c => {
      const stats = c.stats || {};
      const attitudesStr = c.attitudes ? Object.entries(c.attitudes).map(([targetId, feelings]) => {
        const targetChar = characters.find(ch => ch.id === targetId);
        const targetName = targetChar ? targetChar.name : targetId;
        const feelingsArr = Object.entries(feelings)
          .filter(([key, val]) => !key.startsWith('_') && typeof val === 'number')
          .map(([key, val]) => `${key}=${val}%`);
        return `towards ${targetName}: ${feelingsArr.join(', ')}`;
      }).join('; ') : 'none';
      return `- ${c.name} (id: ${c.id}): clothing="${c.clothing}", status="${c.status}", inventory=[${(c.inventory || []).join(', ')}]
    Stats: health=${stats.health ?? 100}%, stamina=${stats.stamina ?? 100}%, hunger=${stats.hunger ?? 0}%, thirst=${stats.thirst ?? 0}%, strength=${stats.strength ?? 50}%, dexterity=${stats.dexterity ?? 50}%, intelligence=${stats.intelligence ?? 50}%, encumbrance=${stats.encumbrance ?? 0}%, sanity=${stats.sanity ?? 100}%, anger=${stats.anger ?? 0}%, fear=${stats.fear ?? 0}%
    Attitudes: ${attitudesStr}`;
    }).join('\n');

    // Build list of other character IDs for attitude tracking
    const characterIds = characters.map(c => ({ id: c.id, name: c.name }));

    const prompt = `Based on this narrative and elapsed time, update character states, stats, and attitudes.

NARRATIVE:
${narrative}

ELAPSED TIME: ${elapsedMinutes} minutes

CHARACTERS: ${characterIds.map(c => `${c.name} (${c.id})`).join(', ')}

CURRENT CHARACTER STATES:
${charDescriptions}

Update clothing, status, inventory, stats, AND ATTITUDES for each character based on what happened.

CLOTHING GUIDELINES:
- If characters remove clothing, update to reflect what they're still wearing
- For intimate/sexual scenes: change clothing to "nude" or describe partial undress
- If characters get dressed again, update clothing accordingly
- Clothing can be damaged, torn, removed, or changed throughout the story

${generateStatGuidelinesText(statGuidelines)}

${generateAttitudeGuidelinesText(attitudeGuidelines)}

Respond with JSON only:
{
  "characterUpdates": [
    {
      "id": "character_id",
      "clothingChange": "new complete clothing description or null if unchanged",
      "statusChange": "new status or null if unchanged",
      "inventoryAdd": [],
      "inventoryRemove": [],
      "statsChange": {
        "health": 95,
        "stamina": 80,
        "hunger": 15,
        "thirst": 20,
        "strength": 50,
        "dexterity": 50,
        "intelligence": 50,
        "encumbrance": 10,
        "sanity": 90,
        "anger": 15,
        "fear": 25
      },
      "attitudesChange": {
        "other_character_id": {
          "love": 50,
          "anger": 10,
          "attraction": 20,
          "trust": 60,
          "fear": 5
        }
      }
    }
  ]
}

ALWAYS include statsChange AND attitudesChange for EVERY character.`;

    try {
      const result = await queryLLMJSON(prompt, { model: this.models.dm, role: 'verify-state', turn });
      // Normalize keys to lowercase (LLMs return varying cases)
      const normalized = normalizeKeys(result.parsed || {});
      return normalized.characterupdates || [];
    } catch (err) {
      console.error('Error verifying character states:', err.message);
      return [];
    }
  }

  getHistoryDir() {
    return join(this.getStoryDir(), 'history');
  }

  getLogsDir() {
    return join(this.getStoryDir(), 'logs');
  }

  saveStory() {
    if (!this.storyId) return;

    const storyDir = this.getStoryDir();
    const historyDir = this.getHistoryDir();
    mkdirSync(storyDir, { recursive: true });
    mkdirSync(historyDir, { recursive: true });

    // Save map.json with features and character paths
    const mapPath = join(storyDir, 'map.json');
    writeFileSync(mapPath, JSON.stringify({
      features: this.worldState.mapFeatures || [],
      characterPaths: this.characterPaths || {},
      generatedAt: this.createdAt,
      environment: this.worldState.environment
    }, null, 2));

    // Build markdown with images
    const mdContent = this.buildMarkdownWithImages();
    const mdPath = join(storyDir, 'story.md');
    writeFileSync(mdPath, mdContent);

    // Save each turn snapshot to separate file in history folder
    for (const snapshot of this.turnSnapshots) {
      const turnFile = join(historyDir, `turn-${snapshot.turn.toString().padStart(3, '0')}.json`);
      writeFileSync(turnFile, JSON.stringify(snapshot, null, 2));
    }

    // Save narrative.json (storyContent, history, sceneDescriptions)
    const narrativePath = join(storyDir, 'narrative.json');
    const narrativeData = {
      storyContent: this.storyContent,
      history: this.worldState.history,
      sceneDescriptions: this.sceneDescriptions
    };
    writeFileSync(narrativePath, JSON.stringify(narrativeData, null, 2));

    // Save current state JSON (without turnSnapshots, storyContent, history, sceneDescriptions)
    const jsonPath = join(storyDir, 'state.json');
    const worldStateSnapshot = this.worldState.getStateSnapshot();
    // Remove history from state.json since it's in narrative.json
    delete worldStateSnapshot.history;
    const stateData = {
      seed: this.seed,
      storyId: this.storyId,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      models: this.models,
      worldState: worldStateSnapshot,
      currentDay: this.currentDay,
      dayEvents: this.dayEvents,
      lastNovelTurn: this.lastNovelTurn
    };
    writeFileSync(jsonPath, JSON.stringify(stateData, null, 2));
  }

  buildMarkdownWithImages() {
    const lines = [];

    // Filter out any undefined/null entries
    const validContent = this.storyContent.filter(c => c !== undefined && c !== null);

    for (let i = 0; i < validContent.length; i++) {
      const content = validContent[i];

      lines.push(content);

      // Check if this is a turn header
      const turnMatch = content.match(/^## (Opening|Turn (\d+))/);
      if (turnMatch) {
        const turn = turnMatch[1] === 'Opening' ? 0 : parseInt(turnMatch[2]);
        const scene = this.sceneDescriptions.find(s => s.turn === turn);
        if (scene) {
          // Add narrative first (next content item), then image
          if (i + 1 < validContent.length) {
            lines.push(validContent[i + 1]);
            i++; // Skip the narrative in the next iteration
          }
          // Build alt text from scene visuals
          const altText = scene.sceneVisuals?.characterAction ||
                          scene.sceneVisuals?.objectDescription ||
                          scene.sceneVisuals?.phenomenonDescription ||
                          `Scene from ${turnMatch[1] === 'Opening' ? 'Opening' : 'Turn ' + turn}`;
          lines.push(`\n![${altText}](images/${scene.imagePath})`);
        }
      }
    }

    return lines.join('\n\n');
  }

  async loadFromStory(storyId, generateMissingImages = false) {
    const storyDir = join(STORIES_DIR, storyId);
    const jsonPath = join(storyDir, 'state.json');
    if (!existsSync(jsonPath)) {
      throw new Error(`Story not found: ${storyId}`);
    }

    const data = JSON.parse(readFileSync(jsonPath, 'utf-8'));

    this.seed = data.seed;
    this.storyId = data.storyId;
    this.createdAt = data.createdAt;

    // Load narrative data from narrative.json (or fall back to state.json for older stories)
    const narrativePath = join(storyDir, 'narrative.json');
    if (existsSync(narrativePath)) {
      const narrativeData = JSON.parse(readFileSync(narrativePath, 'utf-8'));
      this.storyContent = narrativeData.storyContent || [];
      this.sceneDescriptions = Array.isArray(narrativeData.sceneDescriptions) ? narrativeData.sceneDescriptions : [];
      // History will be restored to worldState below
      this._loadedHistory = narrativeData.history || [];
    } else {
      // Backward compatibility: load from state.json
      this.storyContent = data.storyContent || [];
      this.sceneDescriptions = Array.isArray(data.sceneDescriptions) ? data.sceneDescriptions : [];
      this._loadedHistory = null; // Will use data.worldState.history
    }

    // Set logs directory for this story
    setLogsDir(this.getLogsDir());

    // Load turn snapshots from history folder
    const historyDir = join(storyDir, 'history');
    this.turnSnapshots = [];
    if (existsSync(historyDir)) {
      const files = readdirSync(historyDir).filter(f => f.startsWith('turn-') && f.endsWith('.json')).sort();
      for (const file of files) {
        const snapshot = JSON.parse(readFileSync(join(historyDir, file), 'utf-8'));
        this.turnSnapshots.push(snapshot);
      }
    }

    // Restore models from saved state (constructor models are ignored, use saved models)
    if (data.models) {
      this.models = {
        dm: data.models.dm || null,
        character: data.models.character || null,
        narrator: data.models.narrator || null
      };
    } else if (data.model) {
      // Backward compatibility: single model for all roles
      this.models = { dm: data.model, character: data.model, narrator: data.model };
    }

    // Restore world state with defensive initialization
    this.worldState = new WorldState();
    this.worldState.turnNumber = data.worldState.turnNumber || 0;
    this.worldState.summary = data.worldState.summary || '';
    // History comes from narrative.json (or state.json for older stories)
    this.worldState.history = this._loadedHistory || data.worldState.history || [];
    delete this._loadedHistory; // Clean up temporary property
    this.worldState.time = data.worldState.time || { day: 1, hour: 8, minute: 0 };
    this.worldState.environment = data.worldState.environment || {
      type: '', terrain: '', lighting: '', weather: '', temperature: ''
    };

    // Restore narrative arc tracking
    this.worldState.storyGoal = data.worldState.storyGoal || '';
    this.worldState.victoryConditions = data.worldState.victoryConditions || null;
    this.worldState.narrativeArc = data.worldState.narrativeArc || '';
    this.worldState.majorEvents = Array.isArray(data.worldState.majorEvents) ? data.worldState.majorEvents : [];
    this.worldState.tensions = Array.isArray(data.worldState.tensions) ? data.worldState.tensions : [];

    // Restore story completion state
    this.worldState.storyComplete = data.worldState.storyComplete || false;
    this.worldState.storyEnding = data.worldState.storyEnding || null;

    // Ensure currentLocation has all required arrays
    const loc = data.worldState.currentLocation || {};
    this.worldState.currentLocation = {
      id: loc.id || 'unknown',
      name: loc.name || 'Unknown Location',
      description: loc.description || '',
      exits: Array.isArray(loc.exits) ? loc.exits : [],
      items: Array.isArray(loc.items) ? loc.items : [],
      npcs: Array.isArray(loc.npcs) ? loc.npcs : []
    };

    // Ensure characters have all required fields
    const characters = data.worldState.characters || [];
    this.worldState.characters = characters.map(c => ({
      id: c.id || 'unknown',
      name: c.name || 'Unknown',
      appearance: c.appearance || {},
      clothing: c.clothing || '',
      personality: c.personality || '',
      goals: c.goals || '',
      inventory: Array.isArray(c.inventory) ? c.inventory : [],
      status: c.status || 'unknown',
      stats: c.stats || { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, intelligence: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 },
      position: c.position || { x: 0, y: 0 },
      attitudes: c.attitudes || {},
      disposition: c.disposition || ''
    }));

    // Restore dead bodies, discovered objects, and turn action tracking
    this.worldState.deadBodies = Array.isArray(data.worldState.deadBodies) ? data.worldState.deadBodies : [];
    this.worldState.discoveredObjects = Array.isArray(data.worldState.discoveredObjects) ? data.worldState.discoveredObjects : [];
    this.worldState.lastTurnActions = data.worldState.lastTurnActions || data.worldState.lastTurnDialogue || {};

    // Restore author style for novel generation
    this.worldState.authorStyle = data.worldState.authorStyle || null;
    this.worldState.dmAuthorStyle = data.worldState.dmAuthorStyle || null;
    this.worldState.characterAuthorStyle = data.worldState.characterAuthorStyle || null;

    // Restore day tracking for novel generation
    this.currentDay = data.currentDay || this.worldState.time?.day || 1;
    this.dayEvents = data.dayEvents || [];
    this.lastNovelTurn = data.lastNovelTurn || 0;

    // Load map.json if it exists
    const mapPath = join(storyDir, 'map.json');
    if (existsSync(mapPath)) {
      const mapData = JSON.parse(readFileSync(mapPath, 'utf-8'));
      this.worldState.mapFeatures = mapData.features || [];
      this.characterPaths = mapData.characterPaths || {};
    } else {
      // Fallback to worldState.mapFeatures if stored there
      this.worldState.mapFeatures = Array.isArray(data.worldState.mapFeatures) ? data.worldState.mapFeatures : [];
      this.characterPaths = {};
    }

    // Recreate agents with role-specific models (only for living characters)
    this.dmAgent = new DMAgent(this.models.dm);
    this.playerAgents = this.worldState.characters.map(char => new PlayerAgent(char, this.models.character));
    this.llmLog = [];
    this.initialized = true;

    // Generate missing images if requested
    if (generateMissingImages) {
      await this.generateMissingImages();
    }

    return {
      seed: this.seed,
      worldState: this.worldState.getStateSnapshot(),
      storyContent: this.storyContent,
      storyId: this.storyId,
      models: this.models,
      characterPaths: this.characterPaths
    };
  }

  async generateMissingImages() {
    // Find turns that have scene descriptions but missing image files
    const imagesDir = this.getImagesDir();

    for (const scene of this.sceneDescriptions) {
      const imagePath = join(imagesDir, scene.imagePath);
      if (!existsSync(imagePath)) {
        console.log(`Generating missing image for turn ${scene.turn}...`);
        const sceneFocus = scene.sceneFocus || 'characters';
        const sceneVisuals = scene.sceneVisuals || {};
        await this.generateImage(scene.turn, sceneFocus, sceneVisuals, scene.narrative);
      }
    }
  }

  async readImageMetadata(turn) {
    const scene = this.sceneDescriptions.find(s => s.turn === turn);
    if (!scene) {
      throw new Error(`No scene description found for turn ${turn}`);
    }

    const imagesDir = this.getImagesDir();
    const imagePath = join(imagesDir, scene.imagePath);

    if (!existsSync(imagePath)) {
      throw new Error(`Image not found for turn ${turn}`);
    }

    return new Promise((resolve, reject) => {
      const proc = spawn(DRAW_SCRIPT, ['--read-metadata', imagePath]);

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0 && stdout.trim()) {
          try {
            const metadata = JSON.parse(stdout.trim());
            resolve(metadata);
          } catch (e) {
            reject(new Error(`Failed to parse metadata: ${e.message}`));
          }
        } else {
          reject(new Error(stderr || 'No metadata found in image'));
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  async regenerateTurn(turn) {
    if (!this.initialized) {
      throw new Error('Game not initialized');
    }

    if (turn < 1) {
      throw new Error('Cannot regenerate opening. Start a new story instead.');
    }

    if (turn > this.worldState.turnNumber) {
      throw new Error(`Turn ${turn} does not exist yet`);
    }

    console.log(`Regenerating from turn ${turn}, removing turns ${turn} to ${this.worldState.turnNumber}...`);

    // Remove images for turns being deleted
    const imagesDir = this.getImagesDir();
    for (let t = turn; t <= this.worldState.turnNumber; t++) {
      const imageName = `turn-${t.toString().padStart(3, '0')}.jpg`;
      const imagePath = join(imagesDir, imageName);
      if (existsSync(imagePath)) {
        unlinkSync(imagePath);
        console.log(`Deleted image for turn ${t}`);
      }
    }

    // Remove scene descriptions for deleted turns
    this.sceneDescriptions = this.sceneDescriptions.filter(s => s.turn < turn);

    // Remove history files for deleted turns
    const historyDir = this.getHistoryDir();
    for (let t = turn; t <= this.worldState.turnNumber; t++) {
      const historyFile = join(historyDir, `turn-${t.toString().padStart(3, '0')}.json`);
      if (existsSync(historyFile)) {
        unlinkSync(historyFile);
        console.log(`Deleted history file for turn ${t}`);
      }
    }

    // Remove turn snapshots for deleted turns
    this.turnSnapshots = this.turnSnapshots.filter(s => s.turn < turn);

    // Find snapshot for turn before the one we're regenerating (turn - 1)
    const previousTurn = turn - 1;
    const snapshot = this.turnSnapshots.find(s => s.turn === previousTurn);

    if (!snapshot) {
      throw new Error(`No snapshot found for turn ${previousTurn}. This story was created before snapshot support - please start a new story.`);
    }

    console.log(`Restoring state from turn ${previousTurn} snapshot...`);

    // Restore world state from snapshot
    const ws = snapshot.worldState;
    this.worldState.turnNumber = ws.turnNumber;
    this.worldState.summary = ws.summary || '';
    this.worldState.time = ws.time || { day: 1, hour: 8, minute: 0 };
    this.worldState.environment = ws.environment || {};
    this.worldState.storyGoal = ws.storyGoal || '';
    this.worldState.narrativeArc = ws.narrativeArc || '';
    this.worldState.majorEvents = Array.isArray(ws.majorEvents) ? [...ws.majorEvents] : [];
    this.worldState.tensions = Array.isArray(ws.tensions) ? [...ws.tensions] : [];
    this.worldState.discoveredObjects = Array.isArray(ws.discoveredObjects) ? ws.discoveredObjects.map(o => ({ ...o })) : [];
    this.worldState.deadBodies = Array.isArray(ws.deadBodies) ? ws.deadBodies.map(b => ({ ...b })) : [];
    this.worldState.mapFeatures = Array.isArray(ws.mapFeatures) ? ws.mapFeatures.map(f => ({ ...f })) : [];
    this.worldState.history = Array.isArray(ws.history) ? [...ws.history] : [];

    // Restore current location
    const loc = ws.currentLocation || {};
    this.worldState.currentLocation = {
      id: loc.id || 'unknown',
      name: loc.name || 'Unknown Location',
      description: loc.description || '',
      exits: Array.isArray(loc.exits) ? [...loc.exits] : [],
      items: Array.isArray(loc.items) ? [...loc.items] : [],
      npcs: Array.isArray(loc.npcs) ? [...loc.npcs] : []
    };

    // Restore characters with full state
    this.worldState.characters = (ws.characters || []).map(c => ({
      id: c.id || 'unknown',
      name: c.name || 'Unknown',
      appearance: c.appearance ? { ...c.appearance } : {},
      clothing: c.clothing || '',
      personality: c.personality || '',
      goals: c.goals || '',
      inventory: Array.isArray(c.inventory) ? [...c.inventory] : [],
      status: c.status || 'unknown'
    }));

    // Restore story content from snapshot
    this.storyContent = snapshot.storyContent ? [...snapshot.storyContent] : [];

    // Update player agents with restored character state
    this.playerAgents = this.worldState.characters.map(char => new PlayerAgent(char, this.models.character));

    // Save state after deletion
    this.saveStory();
    console.log(`Deleted turns from ${turn} onwards. Now at turn ${this.worldState.turnNumber}.`);

    return {
      turn: this.worldState.turnNumber,
      worldState: this.worldState.getStateSnapshot()
    };
  }

  async generateSceneDescription(turn, narrative) {
    // Generate a new scene description using the DM agent
    const prompt = `Based on this narrative from the story, write a vivid visual description for illustration (1 sentence capturing the key moment - characters, action, setting, lighting, mood - suitable for image generation).

Narrative: "${narrative}"

Characters in the scene:
${this.buildCharacterDescriptions().join('\n')}

Environment: ${this.buildEnvironmentDescription()}

Respond with ONLY a JSON object:
{"sceneDescription": "your description here"}`;

    const result = await this.dmAgent.generateSceneDescription ?
      this.dmAgent.generateSceneDescription(narrative, this.worldState.getStateSnapshot()) :
      await queryLLMJSON(prompt, { model: this.models.dm });

    return result.parsed?.sceneDescription || result.sceneDescription || null;
  }

  async regenerateImage(turn, maxRetries = 3, sceneFocus = 'characters') {
    // Find the scene record for this turn
    let scene = this.sceneDescriptions.find(s => s.turn === turn);

    // If no scene exists, we can't regenerate without sceneVisuals
    if (!scene || !scene.sceneVisuals) {
      console.log(`No scene visuals found for turn ${turn}, cannot regenerate with new focus`);

      // Try to find narrative for fallback
      let narrative = null;
      if (turn < this.worldState.history.length) {
        narrative = this.worldState.history[turn];
      }
      if (!narrative && this.storyContent) {
        const narrativeIndex = 2 + 2 * turn;
        if (narrativeIndex < this.storyContent.length) {
          narrative = this.storyContent[narrativeIndex];
        }
      }

      // Create minimal sceneVisuals based on focus
      const sceneVisuals = {};
      if (sceneFocus === 'characters') {
        sceneVisuals.characterAction = narrative ? narrative.substring(0, 100) : 'Characters in the scene';
      }

      // Remove existing entry and generate new
      this.sceneDescriptions = this.sceneDescriptions.filter(s => s.turn !== turn);
      const result = await this.generateImage(turn, sceneFocus, sceneVisuals, narrative, maxRetries);
      this.saveStory();
      return { success: result?.success || false };
    }

    // Generate fresh image with user-specified focus but using stored sceneVisuals
    console.log(`Generating image for turn ${turn} with sceneFocus=${sceneFocus}...`);

    // Remove existing scene entry so generateImage can add the new one
    this.sceneDescriptions = this.sceneDescriptions.filter(s => s.turn !== turn);

    const result = await this.generateImage(turn, sceneFocus, scene.sceneVisuals, scene.narrative, maxRetries);
    this.saveStory();
    return { success: result?.success || false };
  }

  runImageRegeneration(imagePath) {
    return new Promise((resolve, reject) => {
      const args = [
        '--regenerate', imagePath,
        '--output', imagePath  // Overwrite the existing image
      ];

      const proc = spawn(DRAW_SCRIPT, args);

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve(true);
        } else {
          console.error(`Image regeneration failed:`, stderr);
          resolve(false);
        }
      });

      proc.on('error', (err) => {
        reject(err);
      });
    });
  }

  async initializeFromSeed(seed, authorStyle = null, dmAuthorStyle = null, characterAuthorStyle = null) {
    this.worldState = new WorldState();
    this.dmAgent = new DMAgent(this.models.dm);
    this.playerAgents = [];
    this.llmLog = [];
    this.seed = seed;
    this.storyId = this.generateStoryId(seed);
    this.storyContent = [];
    this.createdAt = new Date().toISOString();

    // Set logs directory for this story
    setLogsDir(this.getLogsDir());

    const { data, llmLog } = await this.dmAgent.initializeWorld(seed, authorStyle, dmAuthorStyle);
    this.llmLog.push(llmLog);

    this.worldState.initialize(data);

    // Set author styles (these can also be changed later via worldState)
    if (dmAuthorStyle) {
      this.worldState.dmAuthorStyle = dmAuthorStyle;
    }
    if (characterAuthorStyle) {
      this.worldState.characterAuthorStyle = characterAuthorStyle;
    }

    for (const character of data.characters) {
      this.playerAgents.push(new PlayerAgent(character, this.models.character));
    }

    // Initialize character paths with starting positions
    this.characterPaths = {};
    this.updateCharacterPaths();

    this.initialized = true;

    // Build initial story content
    const timeStr = this.formatTime(data.time);
    this.storyContent.push(`# ${seed}`);
    this.storyContent.push(`## Opening${timeStr ? ` - ${timeStr}` : ''}`);
    this.storyContent.push(data.narrative);

    // Generate image for opening scene (keys are lowercase after normalizeKeys)
    if (data.scenefocus && data.scenevisuals) {
      await this.generateImage(0, data.scenefocus, data.scenevisuals, data.narrative);
    }

    // Save snapshot for turn 0 (opening) to enable rollback
    this.turnSnapshots = [{
      turn: 0,
      worldState: this.worldState.getStateSnapshot(),
      storyContent: [...this.storyContent]
    }];

    // Initialize day tracking for novel generation
    this.currentDay = data.time?.day || 1;
    this.dayEvents = [data.narrative]; // Opening narrative is first event of day 1

    this.saveStory();

    return {
      narrative: data.narrative,
      worldState: this.worldState.getStateSnapshot(),
      llmLog: this.llmLog,
      storyId: this.storyId,
      characterPaths: this.characterPaths
    };
  }

  async advanceTurn(dmInstructions = null) {
    if (!this.initialized) {
      throw new Error('Game not initialized. Call initializeFromSeed first.');
    }

    // Check if story is already complete
    if (this.worldState.storyComplete) {
      console.log(`[Story Complete] The story has ended. No more turns can be taken.`);
      return {
        narrative: this.worldState.storyEnding?.summary || 'The story has ended.',
        storyComplete: true,
        ending: this.worldState.storyEnding
      };
    }

    // Log DM instructions if provided
    if (dmInstructions) {
      console.log(`[Turn ${this.worldState.turnNumber + 1}] DM Instructions: ${dmInstructions}`);
    }

    const turnLogs = [];

    // Add DM instructions to the log if provided
    if (dmInstructions) {
      turnLogs.push({
        type: 'dm-instructions',
        turn: this.worldState.turnNumber + 1,
        instructions: dmInstructions,
        timestamp: new Date().toISOString()
      });
    }
    const recentHistory = this.worldState.getRecentHistory(7);
    const stateSnapshot = this.worldState.getStateSnapshot();

    // Get actions and dialogue from previous turn for each character (what they observed)
    const previousTurnInfoMap = {};
    for (const agent of this.playerAgents) {
      previousTurnInfoMap[agent.character.id] = this.worldState.getNearbyTurnInfo(agent.character.id);
    }

    // Helper to check if a character is incapacitated
    const isIncapacitated = (char) => {
      const stats = char.stats || {};
      const status = (char.status || '').toLowerCase();
      return stats.stamina <= 0 ||
             stats.health <= 0 ||
             stats.thirst >= 95 ||
             status.includes('collapsed') ||
             status.includes('unconscious') ||
             status.includes('paralyzed');
    };

    // ===== PHASE 1: Think and Talk =====
    // All players consider the situation and speak to nearby characters
    const currentTurn = this.worldState.turnNumber + 1;
    console.log(`[Turn ${currentTurn}] Phase 1: Think and Talk`);
    const thinkTalkResults = await Promise.all(
      this.playerAgents.map(agent => {
        // Incapacitated characters can't act
        if (isIncapacitated(agent.character)) {
          console.log(`[Turn ${currentTurn}] ${agent.character.name} is incapacitated and cannot act`);
          return {
            character: agent.character,
            thinking: 'Too weak to think clearly...',
            intendedAction: null,
            speech: null,
            llmLog: { type: 'player-think', character: agent.character.name, skipped: true, reason: 'incapacitated' }
          };
        }
        const prevTurnInfo = previousTurnInfoMap[agent.character.id] || [];
        return agent.thinkAndTalk(stateSnapshot, recentHistory, prevTurnInfo, currentTurn);
      })
    );

    // Log think/talk results
    turnLogs.push(...thinkTalkResults.map(result => result.llmLog));

    // Collect speech from think/talk phase for nearby characters
    // Build a map of character id -> speech for proximity filtering
    const thinkTalkSpeechMap = {};
    for (const result of thinkTalkResults) {
      if (result.speech) {
        thinkTalkSpeechMap[result.character.id] = {
          name: result.character.name,
          said: result.speech
        };
      }
    }

    // Build nearby speech for each character (what they hear from others in think/talk phase)
    const nearbySpeechMap = {};
    for (const agent of this.playerAgents) {
      const nearbyChars = this.worldState.getNearbyCharacters(agent.character.id);
      const nearbyCharIds = nearbyChars.map(c => c.id);
      nearbySpeechMap[agent.character.id] = nearbyCharIds
        .filter(id => thinkTalkSpeechMap[id])
        .map(id => thinkTalkSpeechMap[id]);
    }

    // ===== PHASE 2: Action =====
    // All players hear what nearby characters said and decide their final action
    console.log(`[Turn ${currentTurn}] Phase 2: Action`);
    const actionResults = await Promise.all(
      this.playerAgents.map(agent => {
        // Incapacitated characters can't act
        if (isIncapacitated(agent.character)) {
          const reason = agent.character.stats?.stamina <= 0 ? 'lies motionless, too exhausted to move' :
                        agent.character.stats?.health <= 20 ? 'is too injured to act' :
                        agent.character.stats?.thirst >= 95 ? 'is delirious from dehydration' :
                        'is incapacitated';
          return {
            character: agent.character,
            action: `${agent.character.name} ${reason}.`,
            dialogue: null,
            llmLog: { type: 'player-action', character: agent.character.name, skipped: true, reason: 'incapacitated' }
          };
        }
        const nearbySpeech = nearbySpeechMap[agent.character.id] || [];
        return agent.decideAction(stateSnapshot, recentHistory, nearbySpeech, currentTurn);
      })
    );

    const characterActions = actionResults.map(result => ({
      character: result.character,
      action: result.action,
      dialogue: result.dialogue
    }));

    // Collect all speech from Phase 1 for inclusion in narrative
    const characterSpeech = thinkTalkResults
      .filter(result => result.speech)
      .map(result => ({
        name: result.character.name,
        speech: result.speech
      }));

    // Record this turn's action and dialogue for next turn's proximity observation
    for (const result of actionResults) {
      this.worldState.recordTurnAction(result.character.id, result.action, result.dialogue);
    }

    turnLogs.push(...actionResults.map(result => result.llmLog));

    const resolution = await this.dmAgent.resolveActions(
      stateSnapshot,
      characterActions,
      characterSpeech,
      dmInstructions,
      currentTurn,
      this.characterPaths
    );

    // Defensive check for resolution
    if (!resolution) {
      throw new Error('DM resolution returned empty or undefined');
    }

    turnLogs.push(resolution.llmLog);

    // Log character updates for debugging (keys are lowercase after normalizeKeys)
    const charUpdates = resolution.worldChanges?.characterupdates;
    if (charUpdates && charUpdates.length > 0) {
      console.log(`[Turn ${currentTurn}] Character updates:`, JSON.stringify(charUpdates, null, 2));
    } else {
      console.log(`[Turn ${currentTurn}] No character updates in response`);
    }

    this.worldState.applyChanges(resolution.worldChanges);

    // Update character position history for map paths
    this.updateCharacterPaths();

    // Create player agents for any new characters added this turn (keys are lowercase after normalizeKeys)
    if (resolution.worldChanges?.newcharacters && Array.isArray(resolution.worldChanges.newcharacters)) {
      for (const newChar of resolution.worldChanges.newcharacters) {
        const addedChar = this.worldState.characters.find(c => c.id === newChar.id);
        if (addedChar && !this.playerAgents.some(agent => agent.character.id === addedChar.id)) {
          this.playerAgents.push(new PlayerAgent(addedChar, this.models.character));
          console.log(`[Turn ${currentTurn}] Created player agent for new character: ${addedChar.name}`);
        }
      }
    }

    // Calculate elapsed time for stat updates
    const oldTime = stateSnapshot.time || { day: 1, hour: 8, minute: 0 };
    const newTime = resolution.time || oldTime;
    const oldMinutes = (oldTime.day * 24 * 60) + (oldTime.hour * 60) + oldTime.minute;
    const newMinutes = (newTime.day * 24 * 60) + (newTime.hour * 60) + newTime.minute;
    const elapsedMinutes = Math.max(0, newMinutes - oldMinutes);

    // Verify and update character states based on narrative
    const verifiedUpdates = await this.verifyCharacterStates(resolution.narrative, stateSnapshot.characters, elapsedMinutes, currentTurn);
    if (verifiedUpdates && verifiedUpdates.length > 0) {
      console.log(`[Turn ${currentTurn}] Verified character updates:`, JSON.stringify(verifiedUpdates, null, 2));
      // Use lowercase key to match applyChanges expectations
      this.worldState.applyChanges({ characterupdates: verifiedUpdates });
    }

    // Process intimacy effects - reduce attraction after sex
    this.processIntimacyEffects(resolution.narrative);

    // Process stat-based status effects
    this.processStatEffects();

    // Process deaths - characters with health <= 0 become dead bodies
    const deadCharacters = this.worldState.processDeaths();
    if (deadCharacters.length > 0) {
      // Remove player agents for dead characters
      for (const deadChar of deadCharacters) {
        this.playerAgents = this.playerAgents.filter(agent => agent.character.id !== deadChar.id);
        console.log(`[Turn ${currentTurn}] Removed player agent for deceased character: ${deadChar.name}`);

        // Add death to major events
        this.worldState.majorEvents.push(`${deadChar.name} died`);
      }
    }

    // Check for story ending conditions
    let storyEnding = resolution.arcUpdates?.storyEnding || null;

    // Check if all characters are dead (automatic defeat)
    if (!storyEnding && this.worldState.characters.length === 0) {
      storyEnding = {
        type: 'defeat',
        summary: 'All characters have perished. The story ends in tragedy.'
      };
      console.log(`[Story Ending] All characters dead - story ends in defeat`);
    }

    // Apply story ending if detected
    if (storyEnding) {
      this.worldState.storyComplete = true;
      this.worldState.storyEnding = storyEnding;
      console.log(`[Story Ending] Type: ${storyEnding.type} - ${storyEnding.summary}`);
    }

    this.worldState.advanceTurn(resolution.narrative, resolution.worldSummary, resolution.time, resolution.arcUpdates);

    // Record DM instructions as a major event
    if (dmInstructions) {
      this.worldState.majorEvents.push(`[DM Turn ${this.worldState.turnNumber}] ${dmInstructions}`);
    }

    this.llmLog.push(...turnLogs);

    // Append turn to story
    const timeStr = this.formatTime(resolution.time);
    this.storyContent.push(`## Turn ${this.worldState.turnNumber}${timeStr ? ` - ${timeStr}` : ''}`);
    this.storyContent.push(resolution.narrative);

    // Generate image for this turn
    if (resolution.sceneFocus && resolution.sceneVisuals) {
      await this.generateImage(this.worldState.turnNumber, resolution.sceneFocus, resolution.sceneVisuals, resolution.narrative, 3);
    }

    // Save snapshot for this turn to enable rollback
    this.turnSnapshots.push({
      turn: this.worldState.turnNumber,
      worldState: this.worldState.getStateSnapshot(),
      storyContent: [...this.storyContent]
    });

    // Track events for daily novel generation
    this.dayEvents.push(resolution.narrative);

    // Check if day changed or 40 turns passed - generate novel chapter
    const newDay = resolution.time?.day || this.worldState.time?.day || 1;
    const turnsSinceLastNovel = this.worldState.turnNumber - this.lastNovelTurn;

    // If story is ending, prioritize the final chapter over day/40-turn chapters
    if (storyEnding && this.dayEvents.length > 0) {
      console.log(`[Novel] Story ended, generating final chapter...`);
      await this.generateNovelChapter(this.currentDay, false, true); // isEnding = true
      this.lastNovelTurn = this.worldState.turnNumber;
      this.dayEvents = [];
    } else if (newDay > this.currentDay) {
      // Day changed - generate chapter for the completed day
      await this.generateNovelChapter(this.currentDay);
      this.lastNovelTurn = this.worldState.turnNumber;
      this.currentDay = newDay;
      this.dayEvents = []; // Reset for new day
    } else if (turnsSinceLastNovel >= 40 && this.dayEvents.length > 0) {
      // 40 turns passed without day change - generate chapter anyway
      console.log(`[Novel] 40 turns since last chapter, generating mid-day chapter...`);
      await this.generateNovelChapter(this.currentDay, true); // true = continuation
      this.lastNovelTurn = this.worldState.turnNumber;
      this.dayEvents = []; // Reset events after writing
    }

    this.saveStory();

    return {
      turn: this.worldState.turnNumber,
      // Phase 1: Think and Talk results
      thinkTalk: thinkTalkResults.map(result => ({
        character: result.character.name,
        thinking: result.thinking,
        intendedAction: result.intendedAction,
        speech: result.speech,
        observed: previousTurnInfoMap[result.character.id] || []
      })),
      // Phase 2: Action results
      characterActions: actionResults.map(result => ({
        character: result.character.name,
        thinking: result.thinking,
        action: result.action,
        dialogue: result.dialogue,
        heardSpeech: nearbySpeechMap[result.character.id] || []
      })),
      narrative: resolution.narrative,
      worldState: this.worldState.getStateSnapshot(),
      turnLogs,
      characterPaths: this.characterPaths,
      // Story completion info
      storyComplete: this.worldState.storyComplete || false,
      storyEnding: this.worldState.storyEnding || null
    };
  }

  getState() {
    if (!this.initialized) {
      return null;
    }
    return this.worldState.getStateSnapshot();
  }

  getLLMLog() {
    return this.llmLog;
  }

  // Update a character's data (stats, inventory, attitudes)
  updateCharacter(characterId, updates) {
    if (!this.initialized) {
      throw new Error('Game not initialized');
    }

    const character = this.worldState.characters.find(c => c.id === characterId);
    if (!character) {
      throw new Error(`Character not found: ${characterId}`);
    }

    // Update stats
    if (updates.stats) {
      character.stats = { ...character.stats, ...updates.stats };
    }

    // Update inventory
    if (updates.inventory !== undefined) {
      character.inventory = updates.inventory;
    }

    // Update attitudes
    if (updates.attitudes) {
      character.attitudes = { ...character.attitudes, ...updates.attitudes };
    }

    // Update status
    if (updates.status !== undefined) {
      character.status = updates.status;
    }

    // Process stat effects to update status based on new stats
    this.processStatEffects();

    // Save changes
    this.saveStory();

    return character;
  }

  // Manually trigger novel chapter generation
  async triggerNovelGeneration() {
    if (!this.initialized) {
      throw new Error('Game not initialized');
    }

    if (this.dayEvents.length === 0) {
      return { success: false, message: 'No events to write about' };
    }

    const authorStyle = this.worldState.authorStyle;
    if (!authorStyle) {
      return { success: false, message: 'No author style set' };
    }

    console.log(`[Novel] Manual trigger - generating chapter...`);
    await this.generateNovelChapter(this.currentDay, true); // treat as continuation
    this.lastNovelTurn = this.worldState.turnNumber;
    this.dayEvents = []; // Reset events after writing
    this.saveStory();

    return { success: true, message: 'Novel chapter generated' };
  }

  // Generate a novel chapter for a completed day, mid-day continuation, or story ending
  async generateNovelChapter(dayNumber, isContinuation = false, isEnding = false) {
    const authorStyle = this.worldState.authorStyle;
    if (!authorStyle) {
      console.log(`[Novel] No author style set, skipping novel generation for day ${dayNumber}`);
      return;
    }

    if (this.dayEvents.length === 0) {
      console.log(`[Novel] No events for day ${dayNumber}, skipping novel generation`);
      return;
    }

    const chapterType = isEnding ? 'final chapter' : (isContinuation ? 'continuation' : 'chapter');
    console.log(`[Novel] Generating ${chapterType} for Day ${dayNumber} in the style of ${authorStyle}...`);

    // Read existing novel content for continuity
    const novelPath = join(this.getStoryDir(), 'novel.md');
    let existingNovel = null;
    if (existsSync(novelPath)) {
      existingNovel = readFileSync(novelPath, 'utf-8');
      console.log(`[Novel] Including ${existingNovel.length} characters of existing novel for context`);
    }

    try {
      const prompt = novelWritingPrompt(dayNumber, this.dayEvents, this.worldState.getStateSnapshot(), authorStyle, isContinuation, isEnding, existingNovel);

      const result = await queryLLMJSON(prompt, {
        systemPrompt: `You are a skilled novelist writing in the style of ${authorStyle}. Transform game events into compelling prose.`,
        model: this.models.narrator,
        role: 'novel-writer'
      });

      const parsed = result.parsed || {};

      // Append chapter to novel.md
      const novelPath = join(this.getStoryDir(), 'novel.md');
      let novelContent = '';

      if (existsSync(novelPath)) {
        novelContent = readFileSync(novelPath, 'utf-8');
      } else {
        // Initialize novel with title
        novelContent = `# ${this.seed}\n\n*Written in the style of ${authorStyle}*\n\n---\n\n`;
      }

      // Add the new chapter
      const chapterTitle = parsed.chapterTitle || (isEnding ? 'The End' : `Day ${dayNumber}`);
      const chapterText = parsed.chapterText || 'The day passed uneventfully.';

      novelContent += `## ${chapterTitle}\n\n${chapterText}\n\n`;

      // Add "THE END" marker for final chapters
      if (isEnding) {
        novelContent += `---\n\n# THE END\n\n`;
        const endingType = this.worldState.storyEnding?.type || 'conclusion';
        const endingSummary = this.worldState.storyEnding?.summary || '';
        if (endingSummary) {
          novelContent += `*${endingSummary}*\n\n`;
        }
      } else {
        novelContent += `---\n\n`;
      }

      writeFileSync(novelPath, novelContent);
      console.log(`[Novel] ${isEnding ? 'Final chapter' : `Chapter "${chapterTitle}"`} written to novel.md`);

      // Update summaries in world state if provided
      if (parsed.historySummary) {
        // Replace detailed history with summary
        const dayHistoryStart = this.worldState.history.findIndex(h => h.includes(`Day ${dayNumber}`));
        if (dayHistoryStart >= 0) {
          // Keep summary of this day instead of detailed entries
          this.worldState.history = [
            ...this.worldState.history.slice(0, dayHistoryStart),
            `Day ${dayNumber}: ${parsed.historySummary}`,
            ...this.worldState.history.slice(dayHistoryStart).filter(h => !h.includes(`Day ${dayNumber}`))
          ];
        } else {
          this.worldState.history.push(`Day ${dayNumber}: ${parsed.historySummary}`);
        }
      }

      if (parsed.majorEventsSummary && Array.isArray(parsed.majorEventsSummary)) {
        // Add summarized major events
        for (const event of parsed.majorEventsSummary) {
          if (!this.worldState.majorEvents.includes(event)) {
            this.worldState.majorEvents.push(event);
          }
        }
      }

      // Log the novel generation
      this.llmLog.push({
        type: 'novel_chapter',
        day: dayNumber,
        author: authorStyle,
        request: result.request,
        response: result.response,
        parsed: parsed,
        elapsed: result.elapsed
      });

    } catch (error) {
      console.error(`[Novel] Error generating chapter for day ${dayNumber}:`, error.message);
    }
  }
}
