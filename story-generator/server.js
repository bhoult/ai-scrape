import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { GameEngine, listStories } from './src/game-engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
app.use('/stories', express.static(join(__dirname, 'stories')));

let gameEngine = null;

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
    const { generateMissingImages } = req.body;
    gameEngine = new GameEngine();
    const result = await gameEngine.loadFromStory(id, !!generateMissingImages);

    res.json({
      success: true,
      seed: result.seed,
      worldState: result.worldState,
      storyContent: result.storyContent,
      storyId: result.storyId
    });
  } catch (error) {
    console.error('Error loading story:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/game', async (req, res) => {
  try {
    const { seed } = req.body;
    if (!seed) {
      return res.status(400).json({ error: 'Seed is required' });
    }

    gameEngine = new GameEngine();
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
