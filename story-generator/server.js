import express from 'express';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { GameEngine, listStories } from './src/game-engine.js';
import { fetchAvailableModels, getAvailableModels, getDefaultModel } from './src/config.js';
import { exportStoryToPDF } from './src/pdf-export.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
app.use('/stories', express.static(join(__dirname, 'stories')));

let gameEngine = null;

// Get current models (uses getter functions for dynamic values)
function getModels() {
  return {
    models: getAvailableModels(),
    default: getDefaultModel()
  };
}

// Get available models
app.get('/api/models', (req, res) => {
  const { models, default: defaultModel } = getModels();
  res.json({
    models,
    default: defaultModel
  });
});

// Set models for current game (role-specific)
app.post('/api/game/models', (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress' });
    }

    const { models: roleModels } = req.body;
    const { models: availableModels } = getModels();

    // Validate each model
    for (const [role, model] of Object.entries(roleModels || {})) {
      if (model && !availableModels[model]) {
        return res.status(400).json({ error: `Invalid model for ${role}: ${model}` });
      }
    }

    gameEngine.setModels(roleModels);
    res.json({ success: true, models: roleModels });
  } catch (error) {
    console.error('Error setting models:', error);
    res.status(500).json({ error: error.message });
  }
});

// Backward compatibility: Set single model for all roles
app.post('/api/game/model', (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress' });
    }

    const { model } = req.body;
    const { models } = getModels();
    if (!model || !models[model]) {
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

// Get LLM logs for current story
app.get('/api/game/logs', (req, res) => {
  try {
    if (!gameEngine || !gameEngine.storyId) {
      return res.json({ logs: [] });
    }
    const logsDir = join(__dirname, 'stories', gameEngine.storyId, 'logs');
    if (!existsSync(logsDir)) {
      return res.json({ logs: [] });
    }

    const logFiles = readdirSync(logsDir)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first

    const logs = logFiles.map(filename => {
      const content = JSON.parse(readFileSync(join(logsDir, filename), 'utf-8'));
      return {
        filename,
        timestamp: content.timestamp,
        turn: content.turn,
        role: content.role,
        model: content.model,
        elapsed: content.elapsed,
        // Include summary of request/response for display
        requestPreview: content.request?.messages?.[content.request.messages.length - 1]?.content?.substring(0, 200) + '...',
        responsePreview: content.response?.choices?.[0]?.message?.content?.substring(0, 500) || 'No response'
      };
    });

    res.json({ logs, storyId: gameEngine.storyId });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get full log entry content
app.get('/api/game/logs/:filename', (req, res) => {
  try {
    if (!gameEngine || !gameEngine.storyId) {
      return res.status(404).json({ error: 'No active story' });
    }
    const { filename } = req.params;
    const logPath = join(__dirname, 'stories', gameEngine.storyId, 'logs', filename);
    if (!existsSync(logPath)) {
      return res.status(404).json({ error: 'Log file not found' });
    }
    const content = JSON.parse(readFileSync(logPath, 'utf-8'));
    res.json(content);
  } catch (error) {
    console.error('Error fetching log:', error);
    res.status(500).json({ error: error.message });
  }
});

// Load a saved story
app.post('/api/stories/:id/load', async (req, res) => {
  try {
    const { id } = req.params;
    const { generateMissingImages, models: roleModels } = req.body;
    const { default: defaultModel } = getModels();
    // Use provided role models or fall back to default for all
    const models = roleModels || { dm: defaultModel, character: defaultModel, narrator: defaultModel };
    gameEngine = new GameEngine(models);
    const result = await gameEngine.loadFromStory(id, !!generateMissingImages);

    res.json({
      success: true,
      seed: result.seed,
      worldState: result.worldState,
      storyContent: result.storyContent,
      storyId: result.storyId,
      models: result.models,
      characterPaths: result.characterPaths
    });
  } catch (error) {
    console.error('Error loading story:', error);
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/game', async (req, res) => {
  try {
    const { seed, models: roleModels, authorStyle, dmAuthorStyle, characterAuthorStyle } = req.body;
    if (!seed) {
      return res.status(400).json({ error: 'Seed is required' });
    }

    const { default: defaultModel } = getModels();
    // Use provided role models or fall back to default for all
    const models = roleModels || { dm: defaultModel, character: defaultModel, narrator: defaultModel };
    gameEngine = new GameEngine(models);
    const result = await gameEngine.initializeFromSeed(seed, authorStyle || null, dmAuthorStyle || null, characterAuthorStyle || null);

    res.json({
      success: true,
      narrative: result.narrative,
      worldState: result.worldState,
      llmLog: result.llmLog,
      storyId: result.storyId,
      characterPaths: result.characterPaths
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
      turnLogs: result.turnLogs,
      characterPaths: result.characterPaths
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
      worldState: result.worldState,
      characterPaths: gameEngine.characterPaths
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

    const { turn, sceneFocus } = req.body;
    if (turn === undefined || turn === null) {
      return res.status(400).json({ error: 'Turn number is required' });
    }

    const validFocus = ['characters', 'landscape', 'object', 'phenomenon'];
    const focus = validFocus.includes(sceneFocus) ? sceneFocus : 'characters';

    const result = await gameEngine.regenerateImage(turn, 3, focus);

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

// Manually trigger novel chapter generation
app.post('/api/game/generate-novel', async (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress' });
    }

    const result = await gameEngine.triggerNovelGeneration();
    res.json(result);
  } catch (error) {
    console.error('Error generating novel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update author styles for current game
app.post('/api/game/author-styles', (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress' });
    }

    const { authorStyle, dmAuthorStyle, characterAuthorStyle } = req.body;
    gameEngine.setAuthorStyles({ authorStyle, dmAuthorStyle, characterAuthorStyle });
    res.json({ success: true });
  } catch (error) {
    console.error('Error setting author styles:', error);
    res.status(500).json({ error: error.message });
  }
});

// Update character data (stats, inventory, attitudes)
app.post('/api/game/character/:id', (req, res) => {
  try {
    if (!gameEngine) {
      return res.status(400).json({ error: 'No game in progress' });
    }

    const { id } = req.params;
    const { stats, inventory, attitudes, status } = req.body;

    const character = gameEngine.updateCharacter(id, { stats, inventory, attitudes, status });
    res.json({ success: true, character });
  } catch (error) {
    console.error('Error updating character:', error);
    res.status(500).json({ error: error.message });
  }
});

// Export story as PDF
app.get('/api/stories/:id/export/pdf', async (req, res) => {
  try {
    const { id } = req.params;
    const includeCharacters = req.query.includeCharacters !== 'false';
    const imageSize = ['small', 'medium', 'large'].includes(req.query.imageSize)
      ? req.query.imageSize
      : 'medium';

    const storyPath = join(__dirname, 'stories', id);
    const pdfBuffer = await exportStoryToPDF(storyPath, {
      includeCharacters,
      imageSize
    });

    // Create a safe filename from the story ID
    const filename = `${id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('Error exporting PDF:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get novel content for a story
app.get('/api/stories/:id/novel', (req, res) => {
  try {
    const { id } = req.params;
    const novelPath = join(__dirname, 'stories', id, 'novel.md');

    if (!existsSync(novelPath)) {
      return res.status(404).json({ error: 'Novel not found. The novel is generated at the end of each in-game day.' });
    }

    const content = readFileSync(novelPath, 'utf-8');
    res.json({ success: true, content });
  } catch (error) {
    console.error('Error reading novel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Download novel as markdown file
app.get('/api/stories/:id/novel/download', (req, res) => {
  try {
    const { id } = req.params;
    const novelPath = join(__dirname, 'stories', id, 'novel.md');

    if (!existsSync(novelPath)) {
      return res.status(404).json({ error: 'Novel not found' });
    }

    const content = readFileSync(novelPath, 'utf-8');
    const filename = `${id}-novel.md`;

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);
  } catch (error) {
    console.error('Error downloading novel:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check if novel exists for a story
app.get('/api/stories/:id/novel/exists', (req, res) => {
  try {
    const { id } = req.params;
    const novelPath = join(__dirname, 'stories', id, 'novel.md');
    res.json({ exists: existsSync(novelPath) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Fetch available models before starting server
async function startServer() {
  console.log('Fetching available models from Fireworks API...');
  await fetchAvailableModels();

  app.listen(PORT, () => {
    console.log(`Story Generator server running at http://localhost:${PORT}`);
  });
}

startServer();
