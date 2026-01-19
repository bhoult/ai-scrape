import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { GameEngine, listStories } from './src/game-engine.js';
import { AVAILABLE_MODELS, DEFAULT_MODEL } from './src/config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
app.use('/stories', express.static(join(__dirname, 'stories')));

let gameEngine = null;

// Get available models
app.get('/api/models', (req, res) => {
  res.json({
    models: AVAILABLE_MODELS,
    default: DEFAULT_MODEL
  });
});

// Set model for current game
app.post('/api/game/model', (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress' });
    }

    const { model } = req.body;
    if (!model || !AVAILABLE_MODELS[model]) {
      return res.status(400).json({ error: 'Invalid model' });
    }

    gameEngine.setModel(model);
    res.json({ success: true, model });
  } catch (error) {
    console.error('Error setting model:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all saved stories
app.get('/api/stories', (req, res) => {
  try {
    const stories = listStories();
    res.json({ stories });
  } catch (error) {
    console.error('Error listing stories:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load a saved story
app.post('/api/stories/:id/load', async (req, res) => {
  try {
    const { id } = req.params;
    const { generateMissingImages, model } = req.body;
    gameEngine = new GameEngine(model || DEFAULT_MODEL);
    const result = await gameEngine.loadFromStory(id, !!generateMissingImages);

    res.json({
      success: true,
      seed: result.seed,
      worldState: result.worldState,
      storyContent: result.storyContent,
      storyId: result.storyId,
      model: result.model
    });
  } catch (error) {
    console.error('Error loading story:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/game', async (req, res) => {
  try {
    const { seed, model } = req.body;
    if (!seed) {
      return res.status(400).json({ error: 'Seed is required' });
    }

    gameEngine = new GameEngine(model || DEFAULT_MODEL);
    const result = await gameEngine.initializeFromSeed(seed);

    res.json({
      success: true,
      narrative: result.narrative,
      worldState: result.worldState,
      llmLog: result.llmLog,
      storyId: result.storyId
    });
  } catch (error) {
    console.error('Error initializing game:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/game/turn', async (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress. Start a game first.' });
    }

    const { dmInstructions } = req.body;
    const result = await gameEngine.advanceTurn(dmInstructions || null);

    res.json({
      success: true,
      turn: result.turn,
      characterActions: result.characterActions,
      narrative: result.narrative,
      worldState: result.worldState,
      turnLogs: result.turnLogs
    });
  } catch (error) {
    console.error('Error advancing turn:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/game/delete-from-turn', async (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress' });
    }

    const { turn } = req.body;
    if (turn === undefined || turn === null) {
      return res.status(400).json({ error: 'Turn number is required' });
    }

    console.log(`[API] Deleting from turn ${turn}...`);
    const result = await gameEngine.regenerateTurn(turn);
    console.log(`[API] Deleted. Now at turn ${result.turn}`);

    res.json({
      success: true,
      turn: result.turn,
      worldState: result.worldState
    });
  } catch (error) {
    console.error('Error deleting turns:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/game/regenerate-image', async (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress' });
    }

    const { turn, promptOrder } = req.body;
    if (turn === undefined || turn === null) {
      return res.status(400).json({ error: 'Turn number is required' });
    }

    const validOrders = ['characters-first', 'scene-first', 'environment-only'];
    const order = validOrders.includes(promptOrder) ? promptOrder : 'characters-first';

    const result = await gameEngine.regenerateImage(turn, 3, order);

    res.json({ success: true, imageGenerated: result?.success || false });
  } catch (error) {
    console.error('Error regenerating image:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/game/image-metadata/:turn', async (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress' });
    }

    const turn = parseInt(req.params.turn, 10);
    if (isNaN(turn)) {
      return res.status(400).json({ error: 'Invalid turn number' });
    }

    const metadata = await gameEngine.readImageMetadata(turn);
    res.json({ success: true, metadata });
  } catch (error) {
    console.error('Error reading image metadata:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/game/state', (req, res) => {
  if (!gameEngine) {
    return res.status(400).json({ error: 'No game in progress' });
  }

  res.json({
    worldState: gameEngine.getState()
  });
});

app.get('/api/game/log', (req, res) => {
  if (!gameEngine) {
    return res.status(400).json({ error: 'No game in progress' });
  }

  res.json({
    llmLog: gameEngine.getLLMLog()
  });
});

app.listen(PORT, () => {
  console.log(`Story Generator server running at http://localhost:${PORT}`);
});
