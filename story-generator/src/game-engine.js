import { writeFileSync, readFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { dirname, join, basename } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { WorldState } from './world-state.js';
import { DMAgent } from './agents/dm-agent.js';
import { PlayerAgent } from './agents/player-agent.js';

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
  constructor() {
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

  async generateImage(turn, sceneDescription) {
    if (!sceneDescription || !this.storyId) return null;

    const imagesDir = this.getImagesDir();
    mkdirSync(imagesDir, { recursive: true });

    const imageName = `turn-${turn.toString().padStart(3, '0')}.jpg`;
    const imagePath = join(imagesDir, imageName);

    return new Promise((resolve, reject) => {
      const args = [
        sceneDescription,
        '--output', imagePath,
        '--width', '512',
        '--height', '512',
        '--steps', '8'
      ];

      const proc = spawn(DRAW_SCRIPT, args);

      let stderr = '';
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          const record = { turn, description: sceneDescription, imagePath: imageName };
          this.sceneDescriptions.push(record);
          resolve(record);
        } else {
          console.error(`Image generation failed for turn ${turn}:`, stderr);
          resolve(null); // Don't fail the turn if image generation fails
        }
      });

      proc.on('error', (err) => {
        console.error(`Failed to spawn draw.py:`, err);
        resolve(null);
      });
    });
  }

  formatTime(time) {
    if (!time) return '';
    const hour = time.hour.toString().padStart(2, '0');
    const minute = time.minute.toString().padStart(2, '0');
    return `Day ${time.day}, ${hour}:${minute}`;
  }

  saveStory() {
    if (!this.storyId) return;

    const storyDir = this.getStoryDir();
    mkdirSync(storyDir, { recursive: true });

    // Build markdown with images
    const mdContent = this.buildMarkdownWithImages();
    const mdPath = join(storyDir, 'story.md');
    writeFileSync(mdPath, mdContent);

    // Save state JSON
    const jsonPath = join(storyDir, 'state.json');
    const stateData = {
      seed: this.seed,
      storyId: this.storyId,
      createdAt: this.createdAt,
      updatedAt: new Date().toISOString(),
      worldState: this.worldState.getStateSnapshot(),
      storyContent: this.storyContent,
      sceneDescriptions: this.sceneDescriptions
    };
    writeFileSync(jsonPath, JSON.stringify(stateData, null, 2));
  }

  buildMarkdownWithImages() {
    const lines = [];

    for (let i = 0; i < this.storyContent.length; i++) {
      const content = this.storyContent[i];
      lines.push(content);

      // Check if this is a turn header
      const turnMatch = content.match(/^## (Opening|Turn (\d+))/);
      if (turnMatch) {
        const turn = turnMatch[1] === 'Opening' ? 0 : parseInt(turnMatch[2]);
        const scene = this.sceneDescriptions.find(s => s.turn === turn);
        if (scene) {
          // Add narrative first (next content item), then image
          if (i + 1 < this.storyContent.length) {
            lines.push(this.storyContent[i + 1]);
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
      status: c.status || 'unknown'
    }));

    // Recreate agents
    this.dmAgent = new DMAgent();
    this.playerAgents = this.worldState.characters.map(char => new PlayerAgent(char));
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
      storyId: this.storyId
    };
  }

  async generateMissingImages() {
    // Find turns that have scene descriptions but missing image files
    const imagesDir = this.getImagesDir();

    for (const scene of this.sceneDescriptions) {
      const imagePath = join(imagesDir, scene.imagePath);
      if (!existsSync(imagePath)) {
        console.log(`Generating missing image for turn ${scene.turn}...`);
        await this.generateImage(scene.turn, scene.description);
      }
    }
  }

  async initializeFromSeed(seed) {
    this.worldState = new WorldState();
    this.dmAgent = new DMAgent();
    this.playerAgents = [];
    this.llmLog = [];
    this.seed = seed;
    this.storyId = this.generateStoryId(seed);
    this.storyContent = [];
    this.createdAt = new Date().toISOString();

    const { data, llmLog } = await this.dmAgent.initializeWorld(seed);
    this.llmLog.push(llmLog);

    this.worldState.initialize(data);

    for (const character of data.characters) {
      this.playerAgents.push(new PlayerAgent(character));
    }

    this.initialized = true;

    // Build initial story content
    const timeStr = this.formatTime(data.time);
    this.storyContent.push(`# ${seed}`);
    this.storyContent.push(`## Opening${timeStr ? ` - ${timeStr}` : ''}`);
    this.storyContent.push(data.narrative);

    // Generate image for opening scene
    if (data.sceneDescription) {
      await this.generateImage(0, data.sceneDescription);
    }

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

    const turnLogs = [];
    const recentHistory = this.worldState.getRecentHistory(3);
    const stateSnapshot = this.worldState.getStateSnapshot();

    // Run all player action LLM calls in parallel
    const playerResults = await Promise.all(
      this.playerAgents.map(agent => agent.decideAction(stateSnapshot, recentHistory))
    );

    const characterActions = playerResults.map(result => ({
      character: result.character,
      action: result.action,
      dialogue: result.dialogue
    }));

    turnLogs.push(...playerResults.map(result => result.llmLog));

    const resolution = await this.dmAgent.resolveActions(
      stateSnapshot,
      characterActions,
      dmInstructions
    );
    turnLogs.push(resolution.llmLog);

    this.worldState.applyChanges(resolution.worldChanges);
    this.worldState.advanceTurn(resolution.narrative, resolution.worldSummary, resolution.time, resolution.arcUpdates);

    this.llmLog.push(...turnLogs);

    // Append turn to story
    const timeStr = this.formatTime(resolution.time);
    this.storyContent.push(`## Turn ${this.worldState.turnNumber}${timeStr ? ` - ${timeStr}` : ''}`);
    this.storyContent.push(resolution.narrative);

    // Generate image for this turn
    if (resolution.sceneDescription) {
      await this.generateImage(this.worldState.turnNumber, resolution.sceneDescription);
    }

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
