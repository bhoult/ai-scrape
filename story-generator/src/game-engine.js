import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { WorldState } from './world-state.js';
import { DMAgent } from './agents/dm-agent.js';
import { PlayerAgent } from './agents/player-agent.js';
import { queryLLMJSON, setLogsDir, logImagePrompt } from './fireworks.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORIES_DIR = join(__dirname, '../stories');
const DRAW_SCRIPT = join(__dirname, '../../draw.py');

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
  constructor(model = null) {
    this.worldState = null;
    this.dmAgent = null;
    this.playerAgents = [];
    this.llmLog = [];
    this.initialized = false;
    this.seed = null;
    this.storyId = null;
    this.storyContent = [];
    this.createdAt = null;
    this.sceneDescriptions = []; // Array of { turn, description, imagePath }
    this.model = model; // LLM model to use
    this.turnSnapshots = []; // Array of world state snapshots at each turn for rollback
  }

  setModel(model) {
    this.model = model;
    if (this.dmAgent) {
      this.dmAgent.setModel(model);
    }
    for (const agent of this.playerAgents) {
      agent.setModel(model);
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

  buildCharacterDescriptions() {
    const characters = this.worldState?.characters || [];
    return characters.map(c => {
      const appearance = c.appearance || {};
      const hairDesc = [appearance.hairLength, appearance.hairColor, appearance.hairStyle].filter(Boolean).join(' ');
      const parts = [
        c.name,
        appearance.gender,
        appearance.age,
        appearance.skinTone ? `${appearance.skinTone} skin` : null,
        appearance.height,
        appearance.build,
        hairDesc ? `${hairDesc} hair` : null,
        appearance.facialHair && appearance.facialHair !== 'none' ? appearance.facialHair : null,
        appearance.eyeColor ? `${appearance.eyeColor} eyes` : null,
        appearance.face,
        appearance.distinguishing,
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

  buildImagePrompt(sceneDescription, promptOrder = 'characters-first') {
    // Build prompt with configurable order
    // 'characters-first': characters, scene, environment (default)
    // 'scene-first': scene, characters, environment
    // 'environment-only': only environment description (no characters or scene)
    const parts = [];

    const characterDescs = this.buildCharacterDescriptions();
    const charDesc = characterDescs.length > 0 ? characterDescs.join('. ') : null;
    const envDesc = this.buildEnvironmentDescription();

    if (promptOrder === 'environment-only') {
      // Only environment, no characters or scene
      if (envDesc) parts.push(envDesc);
    } else if (promptOrder === 'scene-first') {
      if (sceneDescription) parts.push(sceneDescription);
      if (charDesc) parts.push(charDesc);
      if (envDesc) parts.push(envDesc);
    } else {
      // Characters first (default)
      if (charDesc) parts.push(charDesc);
      if (sceneDescription) parts.push(sceneDescription);
      if (envDesc) parts.push(envDesc);
    }

    return parts.join('. ');
  }

  buildImageMetadata(turn, sceneDescription, narrative, prompt, promptOrder) {
    return {
      turn,
      sceneDescription,
      narrative,
      characters: this.buildCharacterDescriptions(),
      environment: this.buildEnvironmentDescription(),
      prompt,
      promptOrder: promptOrder || 'characters-first'
    };
  }

  async generateImage(turn, sceneDescription, narrative = null, maxRetries = 3, promptOrder = 'characters-first') {
    if (!sceneDescription || !this.storyId) return null;

    const imagesDir = this.getImagesDir();
    mkdirSync(imagesDir, { recursive: true });

    const imageName = `turn-${turn.toString().padStart(3, '0')}.jpg`;
    const imagePath = join(imagesDir, imageName);

    // Build full prompt with configurable order
    const imagePrompt = this.buildImagePrompt(sceneDescription, promptOrder);

    // Build metadata to embed in image (includes prompt and order)
    const metadata = this.buildImageMetadata(turn, sceneDescription, narrative, imagePrompt, promptOrder);
    const metadataJson = JSON.stringify(metadata);

    // Log the image prompt
    logImagePrompt(imagePrompt, { turn, sceneDescription, promptOrder }, 'flux');

    // Always save the scene description record so we can regenerate later if needed
    const record = { turn, description: sceneDescription, narrative, imagePath: imageName, success: false };

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

  async verifyCharacterStates(narrative, characters, elapsedMinutes = 30) {
    // Build character descriptions for the prompt
    const charDescriptions = characters.map(c => {
      const stats = c.stats || {};
      return `- ${c.name} (id: ${c.id}): clothing="${c.clothing}", status="${c.status}", inventory=[${(c.inventory || []).join(', ')}]
    Stats: health=${stats.health ?? 100}%, stamina=${stats.stamina ?? 100}%, hunger=${stats.hunger ?? 0}%, thirst=${stats.thirst ?? 0}%, strength=${stats.strength ?? 50}%, dexterity=${stats.dexterity ?? 50}%, encumbrance=${stats.encumbrance ?? 0}%, sanity=${stats.sanity ?? 100}%, anger=${stats.anger ?? 0}%, fear=${stats.fear ?? 0}%`;
    }).join('\n');

    const prompt = `Based on this narrative and elapsed time, update character states and stats.

NARRATIVE:
${narrative}

ELAPSED TIME: ${elapsedMinutes} minutes

CURRENT CHARACTER STATES:
${charDescriptions}

Update clothing, status, inventory, AND STATS for each character based on what happened.

STAT GUIDELINES (all values 0-100):
- health: Decrease for injuries, increase slowly with rest/medical care
- stamina: Decrease with physical exertion (running, fighting, climbing), recover with rest
- hunger: Increase ~2-5% per hour of activity, decrease when eating
- thirst: Increase ~3-8% per hour (faster in heat/exertion), decrease when drinking
- strength/dexterity: Usually stable, but temporary penalties from injury/exhaustion
- encumbrance: Based on inventory weight (0=empty hands, 100=overburdened)
- sanity: Decrease from trauma, horror, isolation, or disturbing events; recover slowly with safety/companionship
- anger: Increase from frustration, conflict, injustice, or provocation; decrease with time/resolution
- fear: Increase from danger, threats, or frightening events; decrease with safety or facing fears

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
        "encumbrance": 10,
        "sanity": 90,
        "anger": 15,
        "fear": 25
      }
    }
  ]
}

ALWAYS include statsChange for EVERY character, even if just natural hunger/thirst increase from elapsed time.`;

    try {
      const result = await queryLLMJSON(prompt, { model: this.model, role: 'verify-state' });
      return result.parsed?.characterUpdates || [];
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

    // Build markdown with images
    const mdContent = this.buildMarkdownWithImages();
    const mdPath = join(storyDir, 'story.md');
    writeFileSync(mdPath, mdContent);

    // Save each turn snapshot to separate file in history folder
    for (const snapshot of this.turnSnapshots) {
      const turnFile = join(historyDir, `turn-${snapshot.turn.toString().padStart(3, '0')}.json`);
      writeFileSync(turnFile, JSON.stringify(snapshot, null, 2));
    }

    // Save current state JSON (without turnSnapshots)
    const jsonPath = join(storyDir, 'state.json');
    const stateData = {
      seed: this.seed,
      storyId: this.storyId,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      model: this.model,
      worldState: this.worldState.getStateSnapshot(),
      storyContent: this.storyContent,
      sceneDescriptions: this.sceneDescriptions
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
          lines.push(`\n![${scene.description}](images/${scene.imagePath})`);
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
    this.storyContent = data.storyContent || [];
    this.sceneDescriptions = Array.isArray(data.sceneDescriptions) ? data.sceneDescriptions : [];

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

    // Restore model from saved state (constructor model is ignored, use saved model)
    if (data.model) {
      this.model = data.model;
    }

    // Restore world state with defensive initialization
    this.worldState = new WorldState();
    this.worldState.turnNumber = data.worldState.turnNumber || 0;
    this.worldState.summary = data.worldState.summary || '';
    this.worldState.history = data.worldState.history || [];
    this.worldState.time = data.worldState.time || { day: 1, hour: 8, minute: 0 };
    this.worldState.environment = data.worldState.environment || {
      type: '', terrain: '', lighting: '', weather: '', temperature: ''
    };

    // Restore narrative arc tracking
    this.worldState.storyGoal = data.worldState.storyGoal || '';
    this.worldState.narrativeArc = data.worldState.narrativeArc || '';
    this.worldState.majorEvents = Array.isArray(data.worldState.majorEvents) ? data.worldState.majorEvents : [];
    this.worldState.tensions = Array.isArray(data.worldState.tensions) ? data.worldState.tensions : [];

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
      stats: c.stats || { health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50, dexterity: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0 },
      position: c.position || { x: 0, y: 0 }
    }));

    // Restore dead bodies and dialogue tracking
    this.worldState.deadBodies = Array.isArray(data.worldState.deadBodies) ? data.worldState.deadBodies : [];
    this.worldState.lastTurnDialogue = data.worldState.lastTurnDialogue || {};

    // Recreate agents with model (only for living characters)
    this.dmAgent = new DMAgent(this.model);
    this.playerAgents = this.worldState.characters.map(char => new PlayerAgent(char, this.model));
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
      model: this.model
    };
  }

  async generateMissingImages() {
    // Find turns that have scene descriptions but missing image files
    const imagesDir = this.getImagesDir();

    for (const scene of this.sceneDescriptions) {
      const imagePath = join(imagesDir, scene.imagePath);
      if (!existsSync(imagePath)) {
        console.log(`Generating missing image for turn ${scene.turn}...`);
        await this.generateImage(scene.turn, scene.description, scene.narrative);
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
    this.playerAgents = this.worldState.characters.map(char => new PlayerAgent(char, this.model));

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
      await queryLLMJSON(prompt, { model: this.model });

    return result.parsed?.sceneDescription || result.sceneDescription || null;
  }

  async regenerateImage(turn, maxRetries = 3, promptOrder = 'characters-first') {
    // Find the scene description for this turn
    let scene = this.sceneDescriptions.find(s => s.turn === turn);

    const imagesDir = this.getImagesDir();
    const imageName = `turn-${turn.toString().padStart(3, '0')}.jpg`;
    const imagePath = join(imagesDir, imageName);

    // If no scene description exists, try to generate one from the narrative
    if (!scene) {
      console.log(`No scene description found for turn ${turn}, generating new one...`);

      // Find the narrative for this turn from history or storyContent
      let narrative = null;

      // Try history first (history[0] = opening, history[N] = turn N)
      if (turn < this.worldState.history.length) {
        narrative = this.worldState.history[turn];
      }

      // Fallback to storyContent if not in history
      // storyContent structure: [title, "## Opening", narrative0, "## Turn 1", narrative1, ...]
      // For turn N: narrative is at index 2 + 2*N
      if (!narrative && this.storyContent) {
        const narrativeIndex = 2 + 2 * turn;
        if (narrativeIndex < this.storyContent.length) {
          narrative = this.storyContent[narrativeIndex];
        }
      }

      if (!narrative) {
        throw new Error(`Cannot find narrative for turn ${turn} to generate scene description (history length: ${this.worldState.history.length}, storyContent length: ${this.storyContent?.length || 0})`);
      }

      const sceneDescription = await this.generateSceneDescription(turn, narrative);
      if (!sceneDescription) {
        throw new Error(`Failed to generate scene description for turn ${turn}`);
      }

      // Generate fresh image with new scene description
      const result = await this.generateImage(turn, sceneDescription, narrative, maxRetries, promptOrder);
      this.saveStory();
      return { success: result?.success || false };
    }

    // Always generate fresh with new prompt order (don't use --regenerate which uses embedded prompt)
    console.log(`Generating image for turn ${turn} with ${promptOrder} ordering...`);

    // Remove existing scene description entry so generateImage can add the new one
    this.sceneDescriptions = this.sceneDescriptions.filter(s => s.turn !== turn);

    const result = await this.generateImage(turn, scene.description, scene.narrative, maxRetries, promptOrder);
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

  async initializeFromSeed(seed) {
    this.worldState = new WorldState();
    this.dmAgent = new DMAgent(this.model);
    this.playerAgents = [];
    this.llmLog = [];
    this.seed = seed;
    this.storyId = this.generateStoryId(seed);
    this.storyContent = [];
    this.createdAt = new Date().toISOString();

    // Set logs directory for this story
    setLogsDir(this.getLogsDir());

    const { data, llmLog } = await this.dmAgent.initializeWorld(seed);
    this.llmLog.push(llmLog);

    this.worldState.initialize(data);

    for (const character of data.characters) {
      this.playerAgents.push(new PlayerAgent(character, this.model));
    }

    this.initialized = true;

    // Build initial story content
    const timeStr = this.formatTime(data.time);
    this.storyContent.push(`# ${seed}`);
    this.storyContent.push(`## Opening${timeStr ? ` - ${timeStr}` : ''}`);
    this.storyContent.push(data.narrative);

    // Generate image for opening scene
    if (data.sceneDescription) {
      await this.generateImage(0, data.sceneDescription, data.narrative);
    }

    // Save snapshot for turn 0 (opening) to enable rollback
    this.turnSnapshots = [{
      turn: 0,
      worldState: this.worldState.getStateSnapshot(),
      storyContent: [...this.storyContent]
    }];

    this.saveStory();

    return {
      narrative: data.narrative,
      worldState: this.worldState.getStateSnapshot(),
      llmLog: this.llmLog,
      storyId: this.storyId
    };
  }

  async advanceTurn(dmInstructions = null) {
    if (!this.initialized) {
      throw new Error('Game not initialized. Call initializeFromSeed first.');
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
    const recentHistory = this.worldState.getRecentHistory(3);
    const stateSnapshot = this.worldState.getStateSnapshot();

    // Get nearby dialogue for each character from last turn
    const nearbyDialogueMap = {};
    for (const agent of this.playerAgents) {
      nearbyDialogueMap[agent.character.id] = this.worldState.getNearbyDialogue(agent.character.id);
    }

    // Run all player action LLM calls in parallel, passing nearby dialogue
    const playerResults = await Promise.all(
      this.playerAgents.map(agent => {
        const nearbyDialogue = nearbyDialogueMap[agent.character.id] || [];
        return agent.decideAction(stateSnapshot, recentHistory, nearbyDialogue);
      })
    );

    const characterActions = playerResults.map(result => ({
      character: result.character,
      action: result.action,
      dialogue: result.dialogue
    }));

    // Record this turn's dialogue for next turn's proximity communication
    for (const result of playerResults) {
      this.worldState.recordDialogue(result.character.id, result.dialogue);
    }

    turnLogs.push(...playerResults.map(result => result.llmLog));

    const resolution = await this.dmAgent.resolveActions(
      stateSnapshot,
      characterActions,
      dmInstructions
    );
    turnLogs.push(resolution.llmLog);

    // Log character updates for debugging
    const charUpdates = resolution.worldChanges?.characterUpdates;
    if (charUpdates && charUpdates.length > 0) {
      console.log(`[Turn ${this.worldState.turnNumber + 1}] Character updates:`, JSON.stringify(charUpdates, null, 2));
    } else {
      console.log(`[Turn ${this.worldState.turnNumber + 1}] No character updates in response`);
    }

    this.worldState.applyChanges(resolution.worldChanges);

    // Calculate elapsed time for stat updates
    const oldTime = stateSnapshot.time || { day: 1, hour: 8, minute: 0 };
    const newTime = resolution.time || oldTime;
    const oldMinutes = (oldTime.day * 24 * 60) + (oldTime.hour * 60) + oldTime.minute;
    const newMinutes = (newTime.day * 24 * 60) + (newTime.hour * 60) + newTime.minute;
    const elapsedMinutes = Math.max(0, newMinutes - oldMinutes);

    // Verify and update character states based on narrative
    const verifiedUpdates = await this.verifyCharacterStates(resolution.narrative, stateSnapshot.characters, elapsedMinutes);
    if (verifiedUpdates && verifiedUpdates.length > 0) {
      console.log(`[Turn ${this.worldState.turnNumber + 1}] Verified character updates:`, JSON.stringify(verifiedUpdates, null, 2));
      this.worldState.applyChanges({ characterUpdates: verifiedUpdates });
    }

    // Process deaths - characters with health <= 0 become dead bodies
    const deadCharacters = this.worldState.processDeaths();
    if (deadCharacters.length > 0) {
      // Remove player agents for dead characters
      for (const deadChar of deadCharacters) {
        this.playerAgents = this.playerAgents.filter(agent => agent.character.id !== deadChar.id);
        console.log(`[Turn ${this.worldState.turnNumber + 1}] Removed player agent for deceased character: ${deadChar.name}`);

        // Add death to major events
        this.worldState.majorEvents.push(`${deadChar.name} died`);
      }
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
    if (resolution.sceneDescription) {
      await this.generateImage(this.worldState.turnNumber, resolution.sceneDescription, resolution.narrative);
    }

    // Save snapshot for this turn to enable rollback
    this.turnSnapshots.push({
      turn: this.worldState.turnNumber,
      worldState: this.worldState.getStateSnapshot(),
      storyContent: [...this.storyContent]
    });

    this.saveStory();

    return {
      turn: this.worldState.turnNumber,
      characterActions: characterActions.map(ca => ({
        character: ca.character.name,
        action: ca.action,
        dialogue: ca.dialogue
      })),
      narrative: resolution.narrative,
      worldState: this.worldState.getStateSnapshot(),
      turnLogs
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
}
