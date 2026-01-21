const seedInput = document.getElementById('seed');
const startBtn = document.getElementById('start-btn');
const turnBtn = document.getElementById('turn-btn');
const statusLine = document.getElementById('status-line');
const dmControls = document.getElementById('dm-controls');
const dmInstructionsInput = document.getElementById('dm-instructions');
const storyContent = document.getElementById('story-content');
const worldState = document.getElementById('world-state');
const loading = document.getElementById('loading');
const menuBtn = document.getElementById('menu-btn');
const storyMenu = document.getElementById('story-menu');
const menuCloseBtn = document.getElementById('menu-close-btn');
const llmLogBtn = document.getElementById('llm-log-btn');
const llmLogMenu = document.getElementById('llm-log-menu');
const llmLogCloseBtn = document.getElementById('llm-log-close-btn');
const llmLogList = document.getElementById('llm-log-list');
const storyList = document.getElementById('story-list');
const generateImagesCheckbox = document.getElementById('generate-images-checkbox');
const turnCountInput = document.getElementById('turn-count');
const storyViewer = document.getElementById('story-viewer');
const storyViewerTitle = document.getElementById('story-viewer-title');
const storyViewerBody = document.getElementById('story-viewer-body');
const viewerCloseBtn = document.getElementById('viewer-close-btn');
const modelDmSelect = document.getElementById('model-dm');
const modelCharacterSelect = document.getElementById('model-character');
const modelNarratorSelect = document.getElementById('model-narrator');
const authorStyleInput = document.getElementById('author-style');
const dmAuthorStyleInput = document.getElementById('dm-author-style');
const characterAuthorStyleInput = document.getElementById('character-author-style');
const characterDisplay = document.getElementById('character-display');
const writeChapterBtn = document.getElementById('write-chapter-btn');
const turnProgress = document.getElementById('turn-progress');
const progressText = document.getElementById('progress-text');
const cancelProgressBtn = document.getElementById('cancel-progress-btn');
const mapContainer = document.getElementById('map-container');
const gameMap = document.getElementById('game-map');
const storySection = document.getElementById('story-section');
const storyResizeHandle = document.getElementById('story-resize-handle');

let currentTurn = 0;
let currentStoryId = null;
let availableModels = {};
let defaultModel = null;
let previousCharacterStats = {}; // Track previous stats for change indicators
let characterPaths = {}; // Character position history for map paths (from server)

// Map pan/zoom state
let mapTransform = { x: 0, y: 0, scale: 1 };
let isDragging = false;
let dragStart = { x: 0, y: 0 };

// Load available models on startup
async function loadModels() {
  try {
    const response = await fetch('/api/models');
    const data = await response.json();
    availableModels = data.models;
    defaultModel = data.default;

    // Populate all three model selects
    const selects = [modelDmSelect, modelCharacterSelect, modelNarratorSelect];
    for (const select of selects) {
      select.innerHTML = '';
      for (const [key, model] of Object.entries(availableModels)) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = model.name;
        option.title = model.description + (model.context_length ? ` (${model.context_length} ctx)` : '');
        if (key === defaultModel) {
          option.selected = true;
        }
        select.appendChild(option);
      }
    }
  } catch (error) {
    console.error('Error loading models:', error);
    const errorOption = '<option value="">Error loading models</option>';
    modelDmSelect.innerHTML = errorOption;
    modelCharacterSelect.innerHTML = errorOption;
    modelNarratorSelect.innerHTML = errorOption;
  }
}

// Get current model selections
function getModelSelections() {
  return {
    dm: modelDmSelect.value || defaultModel,
    character: modelCharacterSelect.value || defaultModel,
    narrator: modelNarratorSelect.value || defaultModel
  };
}

// Change model for current game
async function changeModels() {
  if (!currentStoryId) return;

  try {
    const models = getModelSelections();
    const response = await fetch('/api/game/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ models })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to change models');
    }
  } catch (error) {
    console.error('Error changing models:', error);
  }
}

// Update models when any select changes
modelDmSelect.addEventListener('change', changeModels);
modelCharacterSelect.addEventListener('change', changeModels);
modelNarratorSelect.addEventListener('change', changeModels);

// Update author styles when changed during a game
async function changeAuthorStyles() {
  if (!currentStoryId) return;

  try {
    const authorStyles = {
      authorStyle: authorStyleInput.value.trim() || null,
      dmAuthorStyle: dmAuthorStyleInput.value.trim() || null,
      characterAuthorStyle: characterAuthorStyleInput.value.trim() || null
    };
    const response = await fetch('/api/game/author-styles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authorStyles)
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to change author styles');
    }
  } catch (error) {
    console.error('Error changing author styles:', error);
  }
}

// Debounce author style changes to avoid too many requests
let authorStyleTimeout = null;
function debouncedChangeAuthorStyles() {
  if (authorStyleTimeout) clearTimeout(authorStyleTimeout);
  authorStyleTimeout = setTimeout(changeAuthorStyles, 500);
}

authorStyleInput.addEventListener('change', debouncedChangeAuthorStyles);
dmAuthorStyleInput.addEventListener('change', debouncedChangeAuthorStyles);
characterAuthorStyleInput.addEventListener('change', debouncedChangeAuthorStyles);

// Initialize models on page load
loadModels();

function formatTime(time) {
  if (!time) return '';
  const hour = time.hour.toString().padStart(2, '0');
  const minute = time.minute.toString().padStart(2, '0');
  return `Day ${time.day}, ${hour}:${minute}`;
}

function updateStatusLine(turn, time) {
  const timeStr = formatTime(time);
  statusLine.textContent = timeStr ? `Turn ${turn} · ${timeStr}` : `Turn ${turn}`;
}

function showLoading() {
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

// Format narrative text as proper paragraphs
function formatNarrativeText(text) {
  if (!text) return '';

  // Escape HTML to prevent XSS
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Split by double newlines first (explicit paragraphs)
  let paragraphs = escaped.split(/\n\n+/);

  // If only one paragraph, try splitting by single newlines
  if (paragraphs.length === 1) {
    paragraphs = escaped.split(/\n/);
  }

  // Filter out empty paragraphs and wrap in <p> tags
  return paragraphs
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(p => `<p>${p}</p>`)
    .join('');
}

function renderNarrative(narrative, turn, characterActions = null, time = null, thinkTalk = null) {
  const entry = document.createElement('div');
  entry.className = 'narrative-entry';
  entry.dataset.turn = turn;

  const timeStr = time ? ` - ${formatTime(time)}` : '';
  const turnMarker = document.createElement('div');
  turnMarker.className = 'turn-marker';

  if (turn > 0) {
    turnMarker.innerHTML = `<span>Turn ${turn}${timeStr}</span>`;
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-turn-btn';
    deleteBtn.textContent = '✕';
    deleteBtn.title = 'Delete from this point';
    deleteBtn.addEventListener('click', () => deleteFromTurn(turn));
    turnMarker.appendChild(deleteBtn);
  } else {
    turnMarker.innerHTML = `<span>Opening${timeStr}</span>`;
  }
  entry.appendChild(turnMarker);

  // Phase 1: Think and Talk - what each character observed and said
  if (thinkTalk && thinkTalk.length > 0) {
    const thinkTalkDiv = document.createElement('div');
    thinkTalkDiv.className = 'think-talk-section';
    thinkTalkDiv.innerHTML = '<div class="section-header">Discussion</div>';

    thinkTalkDiv.innerHTML += thinkTalk.map(tt => {
      let html = `<div class="think-talk-entry">`;
      html += `<span class="character-name">${tt.character}</span>`;

      // What they observed from last turn
      if (tt.observed && tt.observed.length > 0) {
        html += `<div class="observed">`;
        tt.observed.forEach(obs => {
          if (obs.action) {
            html += `<span class="observed-action">Saw ${obs.name}: ${obs.action}</span>`;
          }
          if (obs.dialogue) {
            html += `<span class="observed-dialogue">Heard ${obs.name}: "${obs.dialogue}"</span>`;
          }
        });
        html += `</div>`;
      }

      // Their thinking
      if (tt.thinking) {
        html += `<div class="thinking"><em>${tt.thinking}</em></div>`;
      }

      // What they say
      if (tt.speech) {
        html += `<div class="speech">"${tt.speech}"</div>`;
      }

      html += `</div>`;
      return html;
    }).join('');

    entry.appendChild(thinkTalkDiv);
  }

  // Phase 2: Actions - what each character did after hearing others
  if (characterActions && characterActions.length > 0) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'character-actions';
    actionsDiv.innerHTML = '<div class="section-header">Actions</div>';

    actionsDiv.innerHTML += characterActions.map(ca => {
      let html = `<div class="character-action">`;
      html += `<span class="character-name">${ca.character}</span>`;

      // What they heard from think/talk phase
      if (ca.heardSpeech && ca.heardSpeech.length > 0) {
        html += `<div class="heard-speech">`;
        ca.heardSpeech.forEach(hs => {
          html += `<span class="heard">Heard ${hs.name}: "${hs.said}"</span>`;
        });
        html += `</div>`;
      }

      // Their action
      html += `<div class="action">${ca.action}</div>`;

      // What they say while acting
      if (ca.dialogue) {
        html += `<div class="action-dialogue">"${ca.dialogue}"</div>`;
      }

      html += `</div>`;
      return html;
    }).join('');

    entry.appendChild(actionsDiv);
  }

  // Add image placeholder (before narrative for float wrapping)
  if (currentStoryId) {
    const imageContainer = document.createElement('div');
    imageContainer.className = 'turn-image';
    imageContainer.dataset.turn = turn;
    imageContainer.innerHTML = '<div class="image-loading">Generating image...</div>';
    entry.appendChild(imageContainer);
    pollForImage(turn, imageContainer);
  }

  const narrativeDiv = document.createElement('div');
  narrativeDiv.className = 'dm-narrative';
  narrativeDiv.innerHTML = '<span class="section-header">Narrative</span>' + formatNarrativeText(narrative);
  entry.appendChild(narrativeDiv);

  storyContent.appendChild(entry);
  storyContent.scrollTop = storyContent.scrollHeight;
}

function pollForImage(turn, container, preserveScroll = false) {
  const turnStr = turn.toString().padStart(3, '0');
  const imageUrl = `/stories/${currentStoryId}/images/turn-${turnStr}.jpg`;
  let attempts = 0;
  const maxAttempts = 60; // Poll for up to 2 minutes

  const checkImage = () => {
    const img = new Image();
    img.onload = () => {
      container.innerHTML = '';
      img.className = 'story-image';
      img.alt = `Turn ${turn} illustration`;
      img.dataset.fullSrc = imageUrl;
      img.addEventListener('click', () => showImageOverlay(imageUrl));
      container.appendChild(img);
      addRegenerateButton(turn, container);
      if (!preserveScroll) {
        storyContent.scrollTop = storyContent.scrollHeight;
      }
    };
    img.onerror = () => {
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkImage, 2000); // Check every 2 seconds
      } else {
        container.innerHTML = '<div class="image-failed">Image generation failed</div>';
        addRegenerateButton(turn, container);
      }
    };
    img.src = imageUrl + '?t=' + Date.now(); // Cache bust
  };

  checkImage();
}

function checkForExistingImage(turn, container) {
  const turnStr = turn.toString().padStart(3, '0');
  const imageUrl = `/stories/${currentStoryId}/images/turn-${turnStr}.jpg`;

  const img = new Image();
  img.onload = () => {
    container.innerHTML = '';
    img.className = 'story-image';
    img.alt = `Turn ${turn} illustration`;
    img.dataset.fullSrc = imageUrl;
    img.addEventListener('click', () => showImageOverlay(imageUrl));
    container.appendChild(img);
    addRegenerateButton(turn, container);
  };
  img.onerror = () => {
    // No image exists, show placeholder with regenerate buttons
    container.innerHTML = '<div class="image-missing">No image</div>';
    addRegenerateButton(turn, container);
  };
  img.src = imageUrl;
}

function addRegenerateButton(turn, container) {
  const btnContainer = document.createElement('div');
  btnContainer.className = 'image-buttons';

  // Characters focus button
  const charBtn = document.createElement('button');
  charBtn.className = 'regenerate-btn';
  charBtn.textContent = '↻C';
  charBtn.title = 'Regenerate with characters as focus (includes character descriptions)';
  charBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    regenerateImage(turn, container, 'characters');
  });
  btnContainer.appendChild(charBtn);

  // Landscape focus button
  const landscapeBtn = document.createElement('button');
  landscapeBtn.className = 'regenerate-btn';
  landscapeBtn.textContent = '↻L';
  landscapeBtn.title = 'Regenerate with landscape as focus (no character details)';
  landscapeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    regenerateImage(turn, container, 'landscape');
  });
  btnContainer.appendChild(landscapeBtn);

  // Object focus button
  const objectBtn = document.createElement('button');
  objectBtn.className = 'regenerate-btn';
  objectBtn.textContent = '↻O';
  objectBtn.title = 'Regenerate with object/discovery as focus';
  objectBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    regenerateImage(turn, container, 'object');
  });
  btnContainer.appendChild(objectBtn);

  // Phenomenon focus button
  const phenomenonBtn = document.createElement('button');
  phenomenonBtn.className = 'regenerate-btn';
  phenomenonBtn.textContent = '↻P';
  phenomenonBtn.title = 'Regenerate with phenomenon as focus (weather, wildlife, event)';
  phenomenonBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    regenerateImage(turn, container, 'phenomenon');
  });
  btnContainer.appendChild(phenomenonBtn);

  const metadataBtn = document.createElement('button');
  metadataBtn.className = 'metadata-btn';
  metadataBtn.textContent = 'ℹ';
  metadataBtn.title = 'View image metadata';
  metadataBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showImageMetadata(turn);
  });
  btnContainer.appendChild(metadataBtn);

  container.appendChild(btnContainer);
}

async function regenerateImage(turn, container, sceneFocus = 'characters') {
  // Show loading state on the container
  const existingImg = container.querySelector('img');
  const existingButtons = container.querySelector('.image-buttons');

  // Add regenerating overlay
  const overlay = document.createElement('div');
  overlay.className = 'image-regenerating';
  overlay.innerHTML = `<div class="regenerate-spinner"></div><div class="regenerate-text">Regenerating<br>(${sceneFocus})</div>`;
  container.appendChild(overlay);

  // Disable buttons
  if (existingButtons) {
    existingButtons.querySelectorAll('button').forEach(btn => btn.disabled = true);
  }

  try {
    const response = await fetch('/api/game/regenerate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turn, sceneFocus })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to regenerate image');
    }

    if (data.imageGenerated) {
      // Image was generated, show it
      container.innerHTML = '';
      const turnStr = turn.toString().padStart(3, '0');
      const imageUrl = `/stories/${currentStoryId}/images/turn-${turnStr}.jpg?t=${Date.now()}`;
      const img = document.createElement('img');
      img.className = 'story-image';
      img.alt = `Turn ${turn} illustration`;
      img.dataset.fullSrc = imageUrl;
      img.addEventListener('click', () => showImageOverlay(imageUrl));
      img.src = imageUrl;
      container.appendChild(img);
      addRegenerateButton(turn, container);
    } else {
      // Image generation failed
      container.innerHTML = '<div class="image-failed">Generation failed</div>';
      addRegenerateButton(turn, container);
    }
  } catch (error) {
    alert('Error regenerating image: ' + error.message);
    container.innerHTML = '<div class="image-missing">No image</div>';
    addRegenerateButton(turn, container);
  }
}

async function deleteFromTurn(turn) {
  if (!confirm(`Delete from turn ${turn}? This will remove turn ${turn} and all turns after it.`)) {
    return;
  }

  showLoading();
  loading.querySelector('p').textContent = `Deleting from turn ${turn}...`;

  try {
    console.log(`[Frontend] Calling delete-from-turn API for turn ${turn}...`);
    const response = await fetch('/api/game/delete-from-turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ turn })
    });

    const data = await response.json();
    console.log(`[Frontend] API response:`, data);

    if (!response.ok) {
      throw new Error(data.error || 'Failed to delete turns');
    }

    // Remove all narrative entries from the deleted turn onwards
    const entries = storyContent.querySelectorAll('.narrative-entry');
    console.log(`[Frontend] Removing ${Array.from(entries).filter(e => parseInt(e.dataset.turn) >= turn).length} entries from turn ${turn} onwards`);
    entries.forEach(entry => {
      const entryTurn = parseInt(entry.dataset.turn);
      if (entryTurn >= turn) {
        entry.remove();
      }
    });

    // Update UI state
    currentTurn = data.turn;
    updateStatusLine(currentTurn, data.worldState.time);
    renderWorldState(data.worldState);
    renderCharacterDisplay(data.worldState.characters);
    characterPaths = data.characterPaths || {};
    renderMap(data.worldState);

    console.log(`[Frontend] Deleted. Now at turn ${data.turn}`);
  } catch (error) {
    alert('Error deleting turns: ' + error.message);
    console.error('[Frontend] Error deleting turns:', error);
  } finally {
    loading.querySelector('p').textContent = 'Processing...';
    hideLoading();
  }
}

async function showImageMetadata(turn) {
  try {
    const response = await fetch(`/api/game/image-metadata/${turn}`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to read metadata');
    }

    const metadata = data.metadata;
    const genParams = metadata.generation_params || {};

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'metadata-overlay';

    const modal = document.createElement('div');
    modal.className = 'metadata-modal';

    let html = `<h3>Image Metadata - Turn ${metadata.turn || turn}</h3>`;

    // Narrative (story text)
    if (metadata.narrative) {
      html += `<div class="metadata-section"><strong>Story Text:</strong><p>${escapeHtml(metadata.narrative)}</p></div>`;
    }

    // Scene description (visual prompt for image generation)
    if (metadata.sceneDescription) {
      html += `<div class="metadata-section"><strong>Scene Description:</strong><p>${escapeHtml(metadata.sceneDescription)}</p></div>`;
    }

    // Full prompt sent to image generator
    if (metadata.prompt) {
      html += `<div class="metadata-section"><strong>Image Prompt:</strong><p>${escapeHtml(metadata.prompt)}</p></div>`;
    }

    // Prompt order
    if (metadata.sceneFocus) {
      html += `<div class="metadata-section"><strong>Scene Focus:</strong><p>${escapeHtml(metadata.sceneFocus)}</p></div>`;
    }

    // Generation parameters
    if (genParams.seed !== undefined) {
      html += `<div class="metadata-section"><strong>Seed:</strong><p>${genParams.seed}</p></div>`;
    }
    if (genParams.width && genParams.height) {
      html += `<div class="metadata-section"><strong>Size:</strong><p>${genParams.width}x${genParams.height}, ${genParams.steps || 8} steps</p></div>`;
    }

    // Characters
    if (metadata.characters && metadata.characters.length > 0) {
      html += `<div class="metadata-section"><strong>Characters:</strong><ul>`;
      for (const char of metadata.characters) {
        html += `<li>${escapeHtml(char)}</li>`;
      }
      html += `</ul></div>`;
    }

    // Environment
    if (metadata.environment) {
      html += `<div class="metadata-section"><strong>Environment:</strong><p>${escapeHtml(metadata.environment)}</p></div>`;
    }

    html += `<div class="metadata-section"><strong>Generated:</strong><p>${metadata.generated_at || metadata.generatedAt || 'Unknown'}</p></div>`;
    html += `<button class="metadata-close-btn">Close</button>`;

    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close handlers
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
    modal.querySelector('.metadata-close-btn').addEventListener('click', () => overlay.remove());
    const closeOnEscape = (e) => {
      if (e.key === 'Escape') {
        overlay.remove();
        document.removeEventListener('keydown', closeOnEscape);
      }
    };
    document.addEventListener('keydown', closeOnEscape);
  } catch (error) {
    alert('Error reading metadata: ' + error.message);
  }
}

function showImageOverlay(imageUrl) {
  const overlay = document.createElement('div');
  overlay.className = 'image-overlay';

  const img = document.createElement('img');
  // Add cache-busting parameter to ensure fresh image after regeneration
  // Handle URLs that might already have query parameters
  const separator = imageUrl.includes('?') ? '&' : '?';
  img.src = imageUrl + separator + 't=' + Date.now();
  img.alt = 'Full size illustration';

  overlay.appendChild(img);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => {
    overlay.remove();
  });

  // Also close on escape key
  const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', closeOnEscape);
    }
  };
  document.addEventListener('keydown', closeOnEscape);
}

function renderWorldState(state) {
  if (!state) {
    worldState.innerHTML = '<p class="placeholder">No world state available</p>';
    return;
  }

  let html = '';

  // Environment info
  if (state.environment) {
    const env = state.environment;
    const envParts = [env.type, env.terrain, env.lighting, env.weather, env.temperature].filter(Boolean);
    if (envParts.length > 0) {
      html += `<div class="environment-info"><strong>Environment:</strong> ${envParts.join(', ')}</div>`;
    }
  }

  if (state.currentLocation) {
    const loc = state.currentLocation;
    html += `
      <div class="location-info">
        <div class="location-name">${loc.name || 'Unknown Location'}</div>
        <p>${loc.description || 'No description available'}</p>
        <p><strong>Exits:</strong> ${Array.isArray(loc.exits) && loc.exits.length > 0 ? loc.exits.join(', ') : 'None visible'}</p>
        <p><strong>Items:</strong> ${Array.isArray(loc.items) && loc.items.length > 0 ? loc.items.join(', ') : 'Nothing notable'}</p>
      </div>
    `;
  } else {
    html += '<div class="location-info"><p>Location unknown</p></div>';
  }

  if (state.characters && state.characters.length > 0) {
    html += '<div class="characters-list"><strong>Characters:</strong>';
    for (const char of state.characters) {
      const appearance = char.appearance || {};
      const hairDesc = [appearance.hairLength, appearance.hairColor, appearance.hairStyle].filter(Boolean).join(' ');
      const appearanceParts = [
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
      ].filter(Boolean);
      const appearanceStr = appearanceParts.length > 0 ? appearanceParts.join(', ') : 'No description';

      html += `
        <div class="character-card">
          <span class="name">${char.name || 'Unknown'}</span> - ${appearanceStr}
          <br><em>Clothing:</em> ${char.clothing || 'Unknown'}
          <br><em>Goals:</em> ${char.goals || 'Unknown'}
          <br><em>Inventory:</em> ${Array.isArray(char.inventory) && char.inventory.length > 0 ? char.inventory.join(', ') : 'Nothing'}
          <br><em>Status:</em> ${char.status || 'Unknown'}
        </div>
      `;
    }
    html += '</div>';
  }

  if (state.summary) {
    html += `<p style="margin-top: 0.5rem;"><strong>Summary:</strong> ${state.summary}</p>`;
  }

  // Narrative arc tracking
  if (state.storyGoal || state.narrativeArc || (state.tensions && state.tensions.length > 0)) {
    html += '<div class="narrative-arc">';
    if (state.storyGoal) {
      html += `<p><strong>Story Goal:</strong> ${state.storyGoal}</p>`;
    }
    if (state.narrativeArc) {
      html += `<p><strong>Arc:</strong> ${state.narrativeArc}</p>`;
    }
    if (state.tensions && state.tensions.length > 0) {
      html += `<p><strong>Tensions:</strong> ${state.tensions.join('; ')}</p>`;
    }
    if (state.majorEvents && state.majorEvents.length > 0) {
      html += `<p><strong>Major Events:</strong> ${state.majorEvents.slice(-5).join('; ')}</p>`;
    }
    html += '</div>';
  }

  worldState.innerHTML = html;
}

// Store base map bounds for pan/zoom calculations
let mapBounds = { minX: -1000, maxX: 1000, minY: -1000, maxY: 1000 };
let baseViewWidth = 2000; // Store the base view width for marker scaling

// Render the SVG map with features, characters, and paths
function renderMap(state) {
  if (!state) {
    mapContainer.querySelector('.placeholder').style.display = 'block';
    return;
  }

  mapContainer.querySelector('.placeholder').style.display = 'none';

  const gridGroup = gameMap.querySelector('.map-grid');
  const pathsGroup = gameMap.querySelector('.map-paths');
  const featuresGroup = gameMap.querySelector('.map-features');
  const objectsGroup = gameMap.querySelector('.map-objects');
  const charactersGroup = gameMap.querySelector('.map-characters');

  // Calculate bounds for viewBox
  let minX = -1000, maxX = 1000, minY = -1000, maxY = 1000;

  // Include map features in bounds
  if (state.mapFeatures && state.mapFeatures.length > 0) {
    for (const feature of state.mapFeatures) {
      if (feature.position) {
        minX = Math.min(minX, feature.position.x - 500);
        maxX = Math.max(maxX, feature.position.x + 500);
        minY = Math.min(minY, feature.position.y - 500);
        maxY = Math.max(maxY, feature.position.y + 500);
      }
    }
  }

  // Include characters in bounds
  if (state.characters && state.characters.length > 0) {
    for (const char of state.characters) {
      if (char.position) {
        minX = Math.min(minX, char.position.x - 500);
        maxX = Math.max(maxX, char.position.x + 500);
        minY = Math.min(minY, char.position.y - 500);
        maxY = Math.max(maxY, char.position.y + 500);
      }
    }
  }

  // Include dead bodies in bounds
  if (state.deadBodies && state.deadBodies.length > 0) {
    for (const body of state.deadBodies) {
      if (body.position) {
        minX = Math.min(minX, body.position.x - 300);
        maxX = Math.max(maxX, body.position.x + 300);
        minY = Math.min(minY, body.position.y - 300);
        maxY = Math.max(maxY, body.position.y + 300);
      }
    }
  }

  // Include discovered objects in bounds
  if (state.discoveredObjects && state.discoveredObjects.length > 0) {
    for (const obj of state.discoveredObjects) {
      if (obj.position) {
        minX = Math.min(minX, obj.position.x - 300);
        maxX = Math.max(maxX, obj.position.x + 300);
        minY = Math.min(minY, obj.position.y - 300);
        maxY = Math.max(maxY, obj.position.y + 300);
      }
    }
  }

  // Include paths in bounds
  for (const charId in characterPaths) {
    for (const pos of characterPaths[charId]) {
      minX = Math.min(minX, pos.x - 200);
      maxX = Math.max(maxX, pos.x + 200);
      minY = Math.min(minY, pos.y - 200);
      maxY = Math.max(maxY, pos.y + 200);
    }
  }

  // Add padding
  const padding = 500;
  minX -= padding;
  maxX += padding;
  minY -= padding;
  maxY += padding;

  // Store base bounds
  mapBounds = { minX, maxX, minY, maxY };
  baseViewWidth = maxX - minX; // Store for marker scaling

  // Apply pan/zoom transform to viewBox
  const baseWidth = maxX - minX;
  const baseHeight = maxY - minY;
  const viewWidth = baseWidth / mapTransform.scale;
  const viewHeight = baseHeight / mapTransform.scale;
  const viewX = minX + (baseWidth - viewWidth) / 2 + mapTransform.x;
  const viewY = minY + (baseHeight - viewHeight) / 2 + mapTransform.y;
  gameMap.setAttribute('viewBox', `${viewX} ${viewY} ${viewWidth} ${viewHeight}`);

  // Update scale indicator
  updateScaleIndicator(viewWidth);

  // Calculate marker scale factor (keeps markers same visual size regardless of zoom)
  const markerScale = viewWidth / baseViewWidth;

  // Render grid
  gridGroup.innerHTML = '';
  const gridSize = 1000;
  const gridStartX = Math.floor(minX / gridSize) * gridSize;
  const gridStartY = Math.floor(minY / gridSize) * gridSize;

  for (let x = gridStartX; x <= maxX; x += gridSize) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x);
    line.setAttribute('y1', minY);
    line.setAttribute('x2', x);
    line.setAttribute('y2', maxY);
    if (x === 0) line.classList.add('axis');
    gridGroup.appendChild(line);
  }

  for (let y = gridStartY; y <= maxY; y += gridSize) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', minX);
    line.setAttribute('y1', y);
    line.setAttribute('x2', maxX);
    line.setAttribute('y2', y);
    if (y === 0) line.classList.add('axis');
    gridGroup.appendChild(line);
  }

  // Render character paths
  pathsGroup.innerHTML = '';
  let pathIndex = 0;
  for (const charId in characterPaths) {
    const positions = characterPaths[charId];
    if (positions && positions.length >= 2) {
      const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      const points = positions.map(p => `${p.x},${p.y}`).join(' ');
      polyline.setAttribute('points', points);
      polyline.classList.add(`char-path-${pathIndex % 7}`);
      polyline.style.strokeWidth = 40 * markerScale; // Scale stroke width
      pathsGroup.appendChild(polyline);
    }
    pathIndex++;
  }

  // Collect all labeled items for clustering
  const labeledItems = [];

  // Render map features with scaled markers (collect labels)
  featuresGroup.innerHTML = '';
  if (state.mapFeatures && state.mapFeatures.length > 0) {
    for (const feature of state.mapFeatures) {
      if (!feature.position) continue;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.classList.add('map-feature');
      g.classList.add(feature.type || 'unknown');
      g.classList.add(feature.discovered ? 'discovered' : 'undiscovered');
      g.setAttribute('transform', `translate(${feature.position.x}, ${feature.position.y})`);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', 150 * markerScale);
      circle.style.strokeWidth = 20 * markerScale;
      g.appendChild(circle);

      // Tooltip on hover
      g.addEventListener('mouseenter', (e) => {
        const desc = feature.discovered ? feature.description : 'Undiscovered';
        g.setAttribute('title', `${feature.name}: ${desc}`);
      });

      featuresGroup.appendChild(g);

      // Collect for label clustering (only if discovered)
      if (feature.discovered) {
        labeledItems.push({
          x: feature.position.x,
          y: feature.position.y + 280 * markerScale,
          label: feature.name || feature.id,
          fontSize: 200,
          type: 'feature'
        });
      }
    }
  }

  // Render objects (dead bodies and discovered objects) with scaled markers
  objectsGroup.innerHTML = '';

  // Render dead bodies (collect labels)
  if (state.deadBodies && state.deadBodies.length > 0) {
    for (const body of state.deadBodies) {
      if (!body.position) continue;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.classList.add('map-object');
      g.classList.add('dead-body');
      g.setAttribute('transform', `translate(${body.position.x}, ${body.position.y})`);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', 100 * markerScale);
      circle.style.strokeWidth = 15 * markerScale;
      g.appendChild(circle);

      g.addEventListener('mouseenter', () => {
        g.setAttribute('title', body.name);
      });

      objectsGroup.appendChild(g);

      // Collect for label clustering
      const name = body.originalCharacter?.name || body.name.replace('dead body of ', '');
      labeledItems.push({
        x: body.position.x,
        y: body.position.y + 180 * markerScale,
        label: '☠' + name.split(' ')[0],
        fontSize: 140,
        type: 'dead-body'
      });
    }
  }

  // Render discovered objects (collect labels)
  if (state.discoveredObjects && state.discoveredObjects.length > 0) {
    for (const obj of state.discoveredObjects) {
      if (!obj.position) continue;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.classList.add('map-object');
      g.classList.add('discovered-object');
      g.setAttribute('transform', `translate(${obj.position.x}, ${obj.position.y})`);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', 80 * markerScale);
      circle.style.strokeWidth = 15 * markerScale;
      g.appendChild(circle);

      g.addEventListener('mouseenter', () => {
        g.setAttribute('title', `${obj.name}: ${obj.description || 'No description'}`);
      });

      objectsGroup.appendChild(g);

      // Collect for label clustering
      labeledItems.push({
        x: obj.position.x,
        y: obj.position.y + 160 * markerScale,
        label: obj.name || obj.id,
        fontSize: 120,
        type: 'object'
      });
    }
  }

  // Render characters with scaled markers (collect labels)
  charactersGroup.innerHTML = '';
  if (state.characters && state.characters.length > 0) {
    for (const char of state.characters) {
      const pos = char.position || { x: 0, y: 0 };

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.classList.add('map-character');
      if (char.status === 'dead') g.classList.add('dead');
      g.setAttribute('transform', `translate(${pos.x}, ${pos.y})`);

      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', 120 * markerScale);
      circle.style.strokeWidth = 30 * markerScale;
      g.appendChild(circle);

      charactersGroup.appendChild(g);

      // Collect for label clustering
      labeledItems.push({
        x: pos.x,
        y: pos.y + 220 * markerScale,
        label: char.name ? char.name.split(' ')[0] : '?',
        fontSize: 160,
        type: 'character'
      });
    }
  }

  // Cluster nearby labels and render combined text
  renderClusteredLabels(labeledItems, markerScale);
}

// Cluster nearby labels and render as combined text elements
function renderClusteredLabels(items, markerScale) {
  if (items.length === 0) return;

  // Get or create labels group
  let labelsGroup = gameMap.querySelector('.map-labels');
  if (!labelsGroup) {
    labelsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    labelsGroup.classList.add('map-labels');
    gameMap.appendChild(labelsGroup);
  }
  labelsGroup.innerHTML = '';

  // Clustering threshold - items within this distance will be grouped
  const clusterThreshold = 300 * markerScale;

  // Simple clustering: assign each item to a cluster
  const clusters = [];
  const assigned = new Set();

  for (let i = 0; i < items.length; i++) {
    if (assigned.has(i)) continue;

    const cluster = [items[i]];
    assigned.add(i);

    // Find all items within threshold distance
    for (let j = i + 1; j < items.length; j++) {
      if (assigned.has(j)) continue;

      const dx = items[i].x - items[j].x;
      const dy = items[i].y - items[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= clusterThreshold) {
        cluster.push(items[j]);
        assigned.add(j);
      }
    }

    clusters.push(cluster);
  }

  // Render each cluster as a single text element
  for (const cluster of clusters) {
    // Calculate cluster center (average position)
    let sumX = 0, sumY = 0, maxFontSize = 0;
    const labels = [];

    for (const item of cluster) {
      sumX += item.x;
      sumY += item.y;
      maxFontSize = Math.max(maxFontSize, item.fontSize);
      labels.push(item.label);
    }

    const centerX = sumX / cluster.length;
    const centerY = sumY / cluster.length;

    // Create combined label text
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', centerX);
    text.setAttribute('y', centerY);
    text.setAttribute('font-size', maxFontSize * markerScale);
    text.dataset.baseFontSize = maxFontSize; // Store for zoom updates
    text.classList.add('map-label');

    // Join labels with comma, or show count if too many
    if (labels.length <= 3) {
      text.textContent = labels.join(', ');
    } else {
      text.textContent = labels.slice(0, 2).join(', ') + ' +' + (labels.length - 2);
    }

    labelsGroup.appendChild(text);
  }
}

// Update scale indicator
function updateScaleIndicator(viewWidth) {
  let scaleIndicator = mapContainer.querySelector('.map-scale');
  if (!scaleIndicator) {
    scaleIndicator = document.createElement('div');
    scaleIndicator.className = 'map-scale';
    scaleIndicator.innerHTML = '<div class="scale-bar"></div><span class="scale-label"></span>';
    mapContainer.appendChild(scaleIndicator);
  }

  // Calculate meters per pixel (approximate based on container width)
  const containerWidth = mapContainer.clientWidth || 300;
  const metersPerPixel = viewWidth / containerWidth;

  // Choose a nice round number for the scale
  const targetBarWidth = 80; // pixels
  const targetMeters = metersPerPixel * targetBarWidth;

  // Round to nice numbers
  let scaleMeters;
  if (targetMeters >= 5000) scaleMeters = Math.round(targetMeters / 1000) * 1000;
  else if (targetMeters >= 500) scaleMeters = Math.round(targetMeters / 500) * 500;
  else if (targetMeters >= 100) scaleMeters = Math.round(targetMeters / 100) * 100;
  else if (targetMeters >= 50) scaleMeters = Math.round(targetMeters / 50) * 50;
  else scaleMeters = Math.round(targetMeters / 10) * 10 || 10;

  const barWidth = scaleMeters / metersPerPixel;
  const bar = scaleIndicator.querySelector('.scale-bar');
  const label = scaleIndicator.querySelector('.scale-label');

  bar.style.width = `${barWidth}px`;
  label.textContent = scaleMeters >= 1000 ? `${scaleMeters / 1000}km` : `${scaleMeters}m`;
}

// Map pan/zoom event handlers
function initMapInteraction() {
  // Mouse drag for panning
  gameMap.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // Left click only
    isDragging = true;
    dragStart = { x: e.clientX, y: e.clientY };
    gameMap.style.cursor = 'grabbing';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    // Convert screen pixels to map units
    const viewBox = gameMap.getAttribute('viewBox').split(' ').map(Number);
    const viewWidth = viewBox[2];
    const containerWidth = mapContainer.clientWidth || 300;
    const scale = viewWidth / containerWidth;

    mapTransform.x -= dx * scale;
    mapTransform.y -= dy * scale;
    dragStart = { x: e.clientX, y: e.clientY };

    applyMapTransform();
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      gameMap.style.cursor = 'grab';
    }
  });

  // Mouse wheel for zooming
  mapContainer.addEventListener('wheel', (e) => {
    e.preventDefault();

    const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(0.1, Math.min(10, mapTransform.scale * zoomFactor));

    // Zoom toward mouse position
    const rect = mapContainer.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    // Adjust pan to zoom toward mouse
    const viewBox = gameMap.getAttribute('viewBox').split(' ').map(Number);
    const viewWidth = viewBox[2];
    const scaleRatio = viewWidth / rect.width;

    const offsetX = (mouseX - centerX) * scaleRatio;
    const offsetY = (mouseY - centerY) * scaleRatio;

    mapTransform.x += offsetX * (1 - zoomFactor);
    mapTransform.y += offsetY * (1 - zoomFactor);
    mapTransform.scale = newScale;

    applyMapTransform();
  });

  // Double-click to reset view
  gameMap.addEventListener('dblclick', () => {
    mapTransform = { x: 0, y: 0, scale: 1 };
    applyMapTransform();
  });

  gameMap.style.cursor = 'grab';
}

// Apply current transform to map viewBox
function applyMapTransform() {
  const baseWidth = mapBounds.maxX - mapBounds.minX;
  const baseHeight = mapBounds.maxY - mapBounds.minY;
  const viewWidth = baseWidth / mapTransform.scale;
  const viewHeight = baseHeight / mapTransform.scale;
  const viewX = mapBounds.minX + (baseWidth - viewWidth) / 2 + mapTransform.x;
  const viewY = mapBounds.minY + (baseHeight - viewHeight) / 2 + mapTransform.y;
  gameMap.setAttribute('viewBox', `${viewX} ${viewY} ${viewWidth} ${viewHeight}`);
  updateScaleIndicator(viewWidth);
  updateMarkerSizes(viewWidth);
}

// Update marker sizes to keep them visually consistent when zooming
function updateMarkerSizes(viewWidth) {
  const markerScale = viewWidth / baseViewWidth;

  // Update feature markers (circles only, text is in labels group)
  gameMap.querySelectorAll('.map-feature').forEach(g => {
    const circle = g.querySelector('circle');
    if (circle) circle.setAttribute('r', 150 * markerScale);
  });

  // Update feature circle stroke width
  gameMap.querySelectorAll('.map-feature circle').forEach(circle => {
    circle.style.strokeWidth = 20 * markerScale;
  });

  // Update character markers (circles only, text is in labels group)
  gameMap.querySelectorAll('.map-character').forEach(g => {
    const circle = g.querySelector('circle');
    if (circle) circle.setAttribute('r', 120 * markerScale);
  });

  // Update character circle stroke width
  gameMap.querySelectorAll('.map-character circle').forEach(circle => {
    circle.style.strokeWidth = 30 * markerScale;
  });

  // Update object markers (circles only, text is in labels group)
  gameMap.querySelectorAll('.map-object.dead-body').forEach(g => {
    const circle = g.querySelector('circle');
    if (circle) {
      circle.setAttribute('r', 100 * markerScale);
      circle.style.strokeWidth = 15 * markerScale;
    }
  });

  gameMap.querySelectorAll('.map-object.discovered-object').forEach(g => {
    const circle = g.querySelector('circle');
    if (circle) {
      circle.setAttribute('r', 80 * markerScale);
      circle.style.strokeWidth = 15 * markerScale;
    }
  });

  // Update path stroke width
  gameMap.querySelectorAll('.map-paths polyline').forEach(polyline => {
    polyline.style.strokeWidth = 40 * markerScale;
  });

  // Update clustered label font sizes
  gameMap.querySelectorAll('.map-labels text').forEach(text => {
    // Get original base font size from data attribute, or default to 160
    let baseFontSize = parseFloat(text.dataset.baseFontSize);
    if (!baseFontSize) {
      baseFontSize = 160;
      text.dataset.baseFontSize = baseFontSize;
    }
    text.setAttribute('font-size', baseFontSize * markerScale);
  });
}

// Initialize map interaction on load
initMapInteraction();

// Story panel resize functionality
let isResizing = false;
let resizeStartY = 0;
let resizeStartHeight = 0;

function initStoryResize() {
  storyResizeHandle.addEventListener('mousedown', (e) => {
    isResizing = true;
    resizeStartY = e.clientY;
    resizeStartHeight = storySection.offsetHeight;
    storyResizeHandle.classList.add('active');
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isResizing) return;

    const deltaY = e.clientY - resizeStartY;
    const newHeight = Math.max(150, Math.min(window.innerHeight - 300, resizeStartHeight + deltaY));
    storySection.style.height = newHeight + 'px';
  });

  document.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      storyResizeHandle.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // Save height to localStorage
      localStorage.setItem('storyPanelHeight', storySection.offsetHeight);
    }
  });

  // Restore saved height
  const savedHeight = localStorage.getItem('storyPanelHeight');
  if (savedHeight) {
    const height = parseInt(savedHeight, 10);
    if (height >= 150 && height <= window.innerHeight - 300) {
      storySection.style.height = height + 'px';
    }
  }
}

initStoryResize();

// Store characters globally for editing
let currentCharacters = [];

function renderCharacterDisplay(characters) {
  if (!characters || characters.length === 0) {
    characterDisplay.innerHTML = '<p class="placeholder">No characters yet</p>';
    currentCharacters = [];
    return;
  }

  currentCharacters = characters;

  const statLabels = {
    health: 'Health',
    stamina: 'Stamina',
    hunger: 'Hunger',
    thirst: 'Thirst',
    strength: 'Strength',
    dexterity: 'Dexterity',
    intelligence: 'Intelligence',
    encumbrance: 'Encumbrance',
    sanity: 'Sanity',
    anger: 'Anger',
    fear: 'Fear'
  };

  const statDefaults = {
    health: 100,
    stamina: 100,
    hunger: 0,
    thirst: 0,
    strength: 50,
    dexterity: 50,
    intelligence: 50,
    encumbrance: 0,
    sanity: 100,
    anger: 0,
    fear: 0
  };

  let html = '';

  for (const char of characters) {
    const stats = char.stats || {};
    const prevStats = previousCharacterStats[char.id] || {};

    const disposition = char.disposition || '';
    const dispositionClass = disposition === 'hostile' ? 'hostile' : disposition === 'friendly' ? 'friendly' : '';
    html += `<div class="character-card ${dispositionClass}" data-character-id="${char.id}">
      <h3>
        <span>${char.name}${disposition ? ` <span class="disposition ${dispositionClass}">[${disposition}]</span>` : ''}</span>
        <span class="status">${char.status || 'Unknown'}</span>
      </h3>
      <div class="character-stats clickable" data-edit="stats" title="Click to edit stats">`;

    for (const [stat, label] of Object.entries(statLabels)) {
      const value = stats[stat] ?? statDefaults[stat];
      const prevValue = prevStats[stat];
      let changeIndicator = '';

      if (prevValue !== undefined && prevValue !== value) {
        if (value > prevValue) {
          changeIndicator = `<span class="stat-change up">+${value - prevValue}</span>`;
        } else {
          changeIndicator = `<span class="stat-change down">${value - prevValue}</span>`;
        }
      }

      html += `
        <div class="stat-item">
          <span class="stat-label">${label}</span>
          <span class="stat-value">${Math.round(value)}%${changeIndicator}</span>
          <div class="stat-bar">
            <div class="stat-bar-fill ${stat}" style="width: ${value}%"></div>
          </div>
        </div>`;
    }

    html += `</div>`;

    // Add inventory section
    const inventory = char.inventory || [];
    html += `<div class="character-inventory clickable" data-edit="inventory" title="Click to edit inventory">
      <span class="inventory-label">Inventory:</span>
      <span class="inventory-items">${inventory.length > 0 ? inventory.join(', ') : 'Nothing'}</span>
    </div>`;

    // Add attitudes section - show towards all other characters
    const attitudes = char.attitudes || {};
    const otherCharacters = characters.filter(c => c.id !== char.id);
    if (otherCharacters.length > 0) {
      html += `<div class="character-attitudes clickable" data-edit="attitudes" title="Click to edit attitudes">
        <span class="attitudes-label">Attitudes:</span>`;
      for (const targetChar of otherCharacters) {
        const feelings = attitudes[targetChar.id] || {};
        html += `<div class="attitude-row">
          <span class="attitude-target">${targetChar.name}:</span>
          <span class="attitude-feelings">`;
        const feelingLabels = { love: 'L', anger: 'A', attraction: 'At', trust: 'T', fear: 'F' };
        const defaultValues = { love: 50, anger: 0, attraction: 0, trust: 50, fear: 0 };
        for (const [feeling, label] of Object.entries(feelingLabels)) {
          const value = feelings[feeling] ?? defaultValues[feeling];
          html += `<span class="attitude-item ${feeling}" title="${feeling}: ${value}%">${label}:${value}</span>`;
        }
        html += `</span></div>`;
      }
      html += `</div>`;
    }

    html += `</div>`;
  }

  characterDisplay.innerHTML = html;

  // Add click handlers for editing
  characterDisplay.querySelectorAll('.clickable').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const card = el.closest('.character-card');
      const charId = card.dataset.characterId;
      const editType = el.dataset.edit;
      const char = currentCharacters.find(c => c.id === charId);
      if (char) {
        openCharacterEditor(char, editType);
      }
    });
  });

  // Store current stats for next comparison
  for (const char of characters) {
    previousCharacterStats[char.id] = { ...(char.stats || statDefaults) };
  }
}

// Character Editor Modal
function openCharacterEditor(character, editType) {
  const overlay = document.createElement('div');
  overlay.className = 'editor-overlay';

  const modal = document.createElement('div');
  modal.className = 'editor-modal';

  let content = `<h3>Edit ${character.name} - ${editType.charAt(0).toUpperCase() + editType.slice(1)}</h3>`;

  if (editType === 'stats') {
    content += buildStatsEditor(character);
  } else if (editType === 'inventory') {
    content += buildInventoryEditor(character);
  } else if (editType === 'attitudes') {
    content += buildAttitudesEditor(character);
  }

  content += `
    <div class="editor-buttons">
      <button class="editor-save-btn">Save</button>
      <button class="editor-cancel-btn">Cancel</button>
    </div>
  `;

  modal.innerHTML = content;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Close handlers
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
  modal.querySelector('.editor-cancel-btn').addEventListener('click', () => overlay.remove());

  // Save handler
  modal.querySelector('.editor-save-btn').addEventListener('click', async () => {
    const updates = {};

    if (editType === 'stats') {
      updates.stats = {};
      modal.querySelectorAll('.stat-input').forEach(input => {
        updates.stats[input.dataset.stat] = parseInt(input.value) || 0;
      });
    } else if (editType === 'inventory') {
      const inventoryText = modal.querySelector('.inventory-input').value;
      updates.inventory = inventoryText.split(',').map(s => s.trim()).filter(s => s);
    } else if (editType === 'attitudes') {
      updates.attitudes = {};
      modal.querySelectorAll('.attitude-target-group').forEach(group => {
        const targetId = group.dataset.targetId;
        updates.attitudes[targetId] = {};
        group.querySelectorAll('.attitude-input').forEach(input => {
          updates.attitudes[targetId][input.dataset.feeling] = parseInt(input.value) || 0;
        });
      });
    }

    await saveCharacterUpdate(character.id, updates);
    overlay.remove();
  });

  // Escape key handler
  const closeOnEscape = (e) => {
    if (e.key === 'Escape') {
      overlay.remove();
      document.removeEventListener('keydown', closeOnEscape);
    }
  };
  document.addEventListener('keydown', closeOnEscape);
}

function buildStatsEditor(character) {
  const stats = character.stats || {};
  const statLabels = {
    health: 'Health',
    stamina: 'Stamina',
    hunger: 'Hunger',
    thirst: 'Thirst',
    strength: 'Strength',
    dexterity: 'Dexterity',
    intelligence: 'Intelligence',
    encumbrance: 'Encumbrance',
    sanity: 'Sanity',
    anger: 'Anger',
    fear: 'Fear'
  };
  const statDefaults = {
    health: 100, stamina: 100, hunger: 0, thirst: 0, strength: 50,
    dexterity: 50, intelligence: 50, encumbrance: 0, sanity: 100, anger: 0, fear: 0
  };

  let html = '<div class="stats-editor">';
  for (const [stat, label] of Object.entries(statLabels)) {
    const value = stats[stat] ?? statDefaults[stat];
    html += `
      <div class="stat-edit-row">
        <label>${label}</label>
        <input type="range" class="stat-input" data-stat="${stat}" value="${value}" min="0" max="100">
        <span class="stat-edit-value">${value}%</span>
      </div>
    `;
  }
  html += '</div>';

  // Add script for live value updates
  setTimeout(() => {
    document.querySelectorAll('.stat-input').forEach(input => {
      input.addEventListener('input', (e) => {
        e.target.nextElementSibling.textContent = e.target.value + '%';
      });
    });
  }, 0);

  return html;
}

function buildInventoryEditor(character) {
  const inventory = character.inventory || [];
  return `
    <div class="inventory-editor">
      <p>Enter items separated by commas:</p>
      <textarea class="inventory-input" rows="4">${inventory.join(', ')}</textarea>
    </div>
  `;
}

function buildAttitudesEditor(character) {
  const attitudes = character.attitudes || {};
  const otherCharacters = currentCharacters.filter(c => c.id !== character.id);
  const feelingLabels = { love: 'Love', anger: 'Anger', attraction: 'Attraction', trust: 'Trust', fear: 'Fear' };
  const defaultValues = { love: 50, anger: 0, attraction: 0, trust: 50, fear: 0 };

  let html = '<div class="attitudes-editor">';

  for (const target of otherCharacters) {
    const feelings = attitudes[target.id] || {};
    html += `<div class="attitude-target-group" data-target-id="${target.id}">
      <h4>Towards ${target.name}</h4>`;

    for (const [feeling, label] of Object.entries(feelingLabels)) {
      const value = feelings[feeling] ?? defaultValues[feeling];
      html += `
        <div class="attitude-edit-row">
          <label>${label}</label>
          <input type="range" class="attitude-input" data-feeling="${feeling}" value="${value}" min="0" max="100">
          <span class="attitude-edit-value">${value}%</span>
        </div>
      `;
    }

    html += '</div>';
  }

  html += '</div>';

  // Add script for live value updates
  setTimeout(() => {
    document.querySelectorAll('.attitude-input').forEach(input => {
      input.addEventListener('input', (e) => {
        e.target.nextElementSibling.textContent = e.target.value + '%';
      });
    });
  }, 0);

  return html;
}

async function saveCharacterUpdate(characterId, updates) {
  try {
    const response = await fetch(`/api/game/character/${characterId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to update character');
    }

    // Refresh the display
    const stateResponse = await fetch('/api/game/state');
    const stateData = await stateResponse.json();
    if (stateData.worldState) {
      renderCharacterDisplay(stateData.worldState.characters);
      renderWorldState(stateData.worldState);
      renderMap(stateData.worldState);
    }
  } catch (error) {
    alert('Error saving character: ' + error.message);
    console.error(error);
  }
}

// LLM Log Modal Functions
async function openLlmLogMenu() {
  llmLogMenu.classList.remove('hidden');
  await fetchAndRenderLogs();
}

function closeLlmLogMenu() {
  llmLogMenu.classList.add('hidden');
}

async function fetchAndRenderLogs() {
  llmLogList.innerHTML = '<p class="placeholder">Loading logs...</p>';

  try {
    const response = await fetch('/api/game/logs');
    const data = await response.json();

    if (!data.logs || data.logs.length === 0) {
      llmLogList.innerHTML = '<p class="placeholder">No logs available. Start or load a story first.</p>';
      return;
    }

    // Group logs by turn (logs are already sorted most recent first)
    const turnGroups = {};
    for (const log of data.logs) {
      const turn = log.turn ?? 0;
      if (!turnGroups[turn]) {
        turnGroups[turn] = [];
      }
      turnGroups[turn].push(log);
    }

    // Sort turns in descending order (most recent first)
    const sortedTurns = Object.keys(turnGroups).map(Number).sort((a, b) => b - a);

    llmLogList.innerHTML = '';

    for (const turn of sortedTurns) {
      const logs = turnGroups[turn];

      // Create turn group container
      const turnGroup = document.createElement('div');
      turnGroup.className = 'log-turn-group';

      // Create turn header
      const turnHeader = document.createElement('div');
      turnHeader.className = 'log-turn-header';
      const turnLabel = turn === 0 ? 'Opening' : `Turn ${turn}`;
      const totalTime = logs.reduce((sum, l) => sum + (l.elapsed || 0), 0);
      turnHeader.innerHTML = `
        <span class="log-turn-label">${turnLabel}</span>
        <span class="log-turn-count">${logs.length} calls</span>
        <span class="log-turn-time">${totalTime}ms total</span>
        <span class="log-turn-expand">▼</span>
      `;
      turnGroup.appendChild(turnHeader);

      // Create entries container
      const entriesContainer = document.createElement('div');
      entriesContainer.className = 'log-turn-entries';

      // Sort logs within turn by timestamp (oldest first for chronological order)
      logs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      for (const log of logs) {
        const entry = document.createElement('div');
        entry.className = 'log-entry';

        // Format the role for display
        let roleLabel = log.role || 'unknown';
        roleLabel = roleLabel.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        entry.innerHTML = `
          <div class="log-header">
            <span class="log-role">${roleLabel}</span>
            <span class="log-model">${log.model}</span>
            <span class="log-time">${log.elapsed}ms</span>
          </div>
          <div class="log-preview">${escapeHtml(log.responsePreview || '')}</div>
        `;

        entry.addEventListener('click', (e) => {
          e.stopPropagation();
          showFullLog(log.filename);
        });
        entriesContainer.appendChild(entry);
      }

      turnGroup.appendChild(entriesContainer);

      // Toggle expand/collapse on header click
      turnHeader.addEventListener('click', () => {
        turnGroup.classList.toggle('collapsed');
        turnHeader.querySelector('.log-turn-expand').textContent =
          turnGroup.classList.contains('collapsed') ? '▶' : '▼';
      });

      llmLogList.appendChild(turnGroup);
    }
  } catch (error) {
    console.error('Error fetching logs:', error);
    llmLogList.innerHTML = `<p class="placeholder">Error loading logs: ${error.message}</p>`;
  }
}

async function showFullLog(filename) {
  try {
    const response = await fetch(`/api/game/logs/${filename}`);
    const log = await response.json();

    // Configure renderjson for collapsible display
    renderjson.set_show_to_level(1);
    renderjson.set_icons('+', '-');
    renderjson.set_sort_objects(false);

    // Create a modal to show full log
    const modal = document.createElement('div');
    modal.className = 'log-detail-modal';
    modal.innerHTML = `
      <div class="log-detail-content">
        <div class="log-detail-header">
          <h3>Log Details</h3>
          <button class="close-btn">&times;</button>
        </div>
        <div class="log-detail-body">
          <div class="log-section">
            <div class="log-section-title">Info</div>
            <pre>Turn: ${log.turn}\nRole: ${log.role}\nModel: ${log.model}\nTime: ${log.elapsed}ms</pre>
          </div>
          <div class="log-section">
            <div class="log-section-title">Request</div>
            <div class="json-viewer" id="request-json"></div>
          </div>
          <div class="log-section">
            <div class="log-section-title">Response</div>
            <div class="json-viewer" id="response-json"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    // Render JSON with collapsible tree view
    const requestData = log.request?.messages || log.request;
    const responseData = log.response?.choices?.[0]?.message?.content || log.response;

    // Parse response content if it's a JSON string
    let parsedResponse = responseData;
    if (typeof responseData === 'string') {
      try {
        parsedResponse = JSON.parse(responseData);
      } catch (e) {
        // Keep as string if not valid JSON
      }
    }

    modal.querySelector('#request-json').appendChild(renderjson(requestData));
    modal.querySelector('#response-json').appendChild(renderjson(parsedResponse));

    modal.querySelector('.close-btn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });
  } catch (error) {
    console.error('Error loading log details:', error);
    alert('Error loading log details: ' + error.message);
  }
}

async function startGame() {
  const seed = seedInput.value.trim();
  if (!seed) {
    alert('Please enter a story seed');
    return;
  }

  showLoading();
  storyContent.innerHTML = '';
  currentTurn = 0;

  const models = getModelSelections();
  const authorStyle = authorStyleInput.value.trim() || null;
  const dmAuthorStyle = dmAuthorStyleInput.value.trim() || null;
  const characterAuthorStyle = characterAuthorStyleInput.value.trim() || null;

  try {
    const response = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed, models, authorStyle, dmAuthorStyle, characterAuthorStyle })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to start game');
    }

    currentStoryId = data.storyId;
    previousCharacterStats = {}; // Reset stats tracking for new story
    characterPaths = data.characterPaths || {}; // Use server-provided paths
    mapTransform = { x: 0, y: 0, scale: 1 }; // Reset map view
    renderNarrative(data.narrative, 0, null, data.worldState.time);
    renderWorldState(data.worldState);
    renderCharacterDisplay(data.worldState.characters);
    renderMap(data.worldState);

    turnBtn.disabled = false;
    writeChapterBtn.disabled = false;
    updateStatusLine(0, data.worldState.time);
    dmControls.style.display = 'block';

    // Update author style inputs with values from world state
    if (data.worldState.authorStyle) {
      authorStyleInput.value = data.worldState.authorStyle;
    }
    if (data.worldState.dmAuthorStyle) {
      dmAuthorStyleInput.value = data.worldState.dmAuthorStyle;
    }
    if (data.worldState.characterAuthorStyle) {
      characterAuthorStyleInput.value = data.worldState.characterAuthorStyle;
    }
  } catch (error) {
    alert('Error starting game: ' + error.message);
    console.error(error);
  } finally {
    hideLoading();
  }
}

let cancelTurnsRequested = false;

function showProgress(message) {
  progressText.textContent = message;
  turnProgress.classList.remove('hidden');
}

function hideProgress() {
  turnProgress.classList.add('hidden');
  cancelProgressBtn.classList.add('hidden');
}

async function advanceTurn() {
  const turnCount = parseInt(turnCountInput.value) || 1;
  cancelTurnsRequested = false;
  turnBtn.disabled = true;
  turnCountInput.disabled = true;

  // Show non-blocking progress indicator
  if (turnCount > 1) {
    showProgress(`Processing turn 1 of ${turnCount}...`);
    cancelProgressBtn.classList.remove('hidden');
    cancelProgressBtn.disabled = false;
    cancelProgressBtn.textContent = 'Stop';
  } else {
    showProgress('Processing turn...');
  }

  const dmInstructions = dmInstructionsInput.value.trim() || null;

  try {
    for (let i = 0; i < turnCount; i++) {
      // Check for cancellation before starting next turn
      if (i > 0 && cancelTurnsRequested) {
        console.log(`Cancelled after turn ${i} of ${turnCount}`);
        break;
      }

      // Update progress message
      if (turnCount > 1) {
        showProgress(`Processing turn ${i + 1} of ${turnCount}...`);
      }

      const response = await fetch('/api/game/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dmInstructions: i === 0 ? dmInstructions : null })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to advance turn');
      }

      currentTurn = data.turn;
      updateStatusLine(currentTurn, data.worldState.time);

      renderNarrative(data.narrative, data.turn, data.characterActions, data.worldState.time, data.thinkTalk);
      renderWorldState(data.worldState);
      renderCharacterDisplay(data.worldState.characters);
      characterPaths = data.characterPaths || characterPaths; // Update from server
      renderMap(data.worldState);

      // Check if story completed
      if (data.storyComplete) {
        console.log('Story completed, stopping turns');
        break;
      }
    }

    dmInstructionsInput.value = '';
  } catch (error) {
    alert('Error advancing turn: ' + error.message);
    console.error(error);
  } finally {
    hideProgress();
    turnBtn.disabled = false;
    turnCountInput.disabled = false;
    cancelTurnsRequested = false;
  }
}

// Cancel button handler
cancelProgressBtn.addEventListener('click', () => {
  cancelTurnsRequested = true;
  cancelProgressBtn.textContent = 'Stopping...';
  cancelProgressBtn.disabled = true;
});

startBtn.addEventListener('click', startGame);
turnBtn.addEventListener('click', advanceTurn);
writeChapterBtn.addEventListener('click', writeChapter);

// Write a novel chapter manually
async function writeChapter() {
  if (!currentStoryId) return;

  showLoading();
  loading.querySelector('p').textContent = 'Writing chapter...';
  writeChapterBtn.disabled = true;

  try {
    const response = await fetch('/api/game/generate-novel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to generate chapter');
    }

    if (data.success) {
      alert('Novel chapter written successfully!');
    } else {
      alert(data.message || 'No chapter generated');
    }
  } catch (error) {
    alert('Error writing chapter: ' + error.message);
    console.error(error);
  } finally {
    loading.querySelector('p').textContent = 'Processing...';
    hideLoading();
    writeChapterBtn.disabled = false;
  }
}

// Story menu functions
async function loadStoryList() {
  try {
    const response = await fetch('/api/stories');
    const data = await response.json();

    if (data.stories.length === 0) {
      storyList.innerHTML = '<p class="placeholder">No saved stories yet. Start a new game!</p>';
      return;
    }

    storyList.innerHTML = data.stories.map(story => {
      const timeStr = story.time ? formatTime(story.time) : '';
      const date = new Date(story.updatedAt).toLocaleDateString();
      return `
        <div class="story-item" data-id="${story.id}">
          <div class="story-item-title">${story.seed}</div>
          <div class="story-item-meta">
            <span>Turn ${story.turn}</span>
            ${timeStr ? `<span>${timeStr}</span>` : ''}
            <span>Updated: ${date}</span>
          </div>
          <div class="story-item-actions">
            <button class="story-view-btn" data-id="${story.id}">View</button>
            <button class="story-text-btn" data-id="${story.id}">Copy Text</button>
            <button class="story-pdf-btn" data-id="${story.id}">PDF</button>
            <button class="story-novel-btn" data-id="${story.id}" title="View/Download Novel">Novel</button>
            <button class="story-continue-btn" data-id="${story.id}">Continue</button>
          </div>
        </div>
      `;
    }).join('');

    // Add click handlers
    storyList.querySelectorAll('.story-view-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewStory(btn.dataset.id);
      });
    });
    storyList.querySelectorAll('.story-text-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        copyStoryText(btn.dataset.id, btn);
      });
    });
    storyList.querySelectorAll('.story-pdf-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        downloadPDF(btn.dataset.id, btn);
      });
    });
    storyList.querySelectorAll('.story-novel-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        showNovelMenu(btn.dataset.id, btn);
      });
    });
    storyList.querySelectorAll('.story-continue-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        loadStory(btn.dataset.id);
      });
    });
  } catch (error) {
    storyList.innerHTML = '<p class="placeholder">Error loading stories</p>';
    console.error('Error loading stories:', error);
  }
}

async function loadStory(storyId) {
  showLoading();
  storyMenu.classList.add('hidden');

  const generateMissingImages = generateImagesCheckbox.checked;
  const models = getModelSelections();

  try {
    const response = await fetch(`/api/stories/${storyId}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generateMissingImages, models })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load story');
    }

    currentStoryId = data.storyId;

    // Clear current content
    storyContent.innerHTML = '';

    // Render story content from saved markdown sections
    if (data.storyContent && data.storyContent.length > 0) {
      // Parse saved content - skip the title (first element)
      for (let i = 1; i < data.storyContent.length; i += 2) {
        const header = data.storyContent[i] || '';
        const narrative = data.storyContent[i + 1] || '';

        // Parse header to get turn and time
        const turnMatch = header.match(/## (Opening|Turn (\d+))(?:\s*-\s*(.+))?/);
        if (turnMatch) {
          const turn = turnMatch[1] === 'Opening' ? 0 : parseInt(turnMatch[2]);
          const timeStr = turnMatch[3] || '';

          const entry = document.createElement('div');
          entry.className = 'narrative-entry';
          entry.dataset.turn = turn;

          // Create turn marker with regenerate button
          const turnMarker = document.createElement('div');
          turnMarker.className = 'turn-marker';
          if (turn > 0) {
            turnMarker.innerHTML = `<span>Turn ${turn}${timeStr ? ` - ${timeStr}` : ''}</span>`;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-turn-btn';
            deleteBtn.textContent = '✕';
            deleteBtn.title = 'Delete from this point';
            deleteBtn.addEventListener('click', () => deleteFromTurn(turn));
            turnMarker.appendChild(deleteBtn);
          } else {
            turnMarker.innerHTML = `<span>Opening${timeStr ? ` - ${timeStr}` : ''}</span>`;
          }
          entry.appendChild(turnMarker);

          // Add image container (before narrative for float wrapping)
          const imageContainer = document.createElement('div');
          imageContainer.className = 'turn-image';
          imageContainer.dataset.turn = turn;
          entry.appendChild(imageContainer);
          checkForExistingImage(turn, imageContainer);

          const narrativeDiv = document.createElement('div');
          narrativeDiv.className = 'dm-narrative';
          narrativeDiv.innerHTML = formatNarrativeText(narrative);
          entry.appendChild(narrativeDiv);

          storyContent.appendChild(entry);
        }
      }
    }

    // Update UI state
    seedInput.value = data.seed;
    currentTurn = data.worldState.turnNumber;
    updateStatusLine(currentTurn, data.worldState.time);
    renderWorldState(data.worldState);
    previousCharacterStats = {};  // Reset for loaded story - no change indicators
    characterPaths = data.characterPaths || {};  // Load paths from server
    mapTransform = { x: 0, y: 0, scale: 1 }; // Reset map view
    renderCharacterDisplay(data.worldState.characters);
    renderMap(data.worldState);

    // Restore model selections
    if (data.models) {
      if (data.models.dm && modelDmSelect.querySelector(`option[value="${data.models.dm}"]`)) {
        modelDmSelect.value = data.models.dm;
      }
      if (data.models.character && modelCharacterSelect.querySelector(`option[value="${data.models.character}"]`)) {
        modelCharacterSelect.value = data.models.character;
      }
      if (data.models.narrator && modelNarratorSelect.querySelector(`option[value="${data.models.narrator}"]`)) {
        modelNarratorSelect.value = data.models.narrator;
      }
    } else if (data.model) {
      // Backward compatibility: single model for all roles
      if (modelDmSelect.querySelector(`option[value="${data.model}"]`)) {
        modelDmSelect.value = data.model;
        modelCharacterSelect.value = data.model;
        modelNarratorSelect.value = data.model;
      }
    }

    // Restore author styles
    if (data.worldState.authorStyle) {
      authorStyleInput.value = data.worldState.authorStyle;
    }
    if (data.worldState.dmAuthorStyle) {
      dmAuthorStyleInput.value = data.worldState.dmAuthorStyle;
    } else {
      dmAuthorStyleInput.value = '';
    }
    if (data.worldState.characterAuthorStyle) {
      characterAuthorStyleInput.value = data.worldState.characterAuthorStyle;
    } else {
      characterAuthorStyleInput.value = '';
    }

    turnBtn.disabled = false;
    writeChapterBtn.disabled = false;
    dmControls.style.display = 'block';

    storyContent.scrollTop = storyContent.scrollHeight;
  } catch (error) {
    alert('Error loading story: ' + error.message);
    console.error(error);
  } finally {
    hideLoading();
  }
}

function openStoryMenu() {
  storyMenu.classList.remove('hidden');
  loadStoryList();
}

function closeStoryMenu() {
  storyMenu.classList.add('hidden');
}

menuBtn.addEventListener('click', openStoryMenu);
menuCloseBtn.addEventListener('click', closeStoryMenu);
storyMenu.addEventListener('click', (e) => {
  if (e.target === storyMenu) closeStoryMenu();
});

// LLM Log menu event listeners
llmLogBtn.addEventListener('click', openLlmLogMenu);
llmLogCloseBtn.addEventListener('click', closeLlmLogMenu);
llmLogMenu.addEventListener('click', (e) => {
  if (e.target === llmLogMenu) closeLlmLogMenu();
});

// Download story as PDF
async function downloadPDF(storyId, btn) {
  const originalText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;

  try {
    const response = await fetch(`/api/stories/${storyId}/export/pdf`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Failed to generate PDF');
    }

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${storyId}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    btn.textContent = 'Done!';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    alert('Error downloading PDF: ' + error.message);
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

// Copy story as plain text
async function copyStoryText(storyId, btn) {
  const originalText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;

  try {
    const response = await fetch(`/stories/${storyId}/story.md`);
    if (!response.ok) {
      throw new Error('Story file not found');
    }
    const markdown = await response.text();

    // Convert markdown to plain text for LLM
    const plainText = markdownToPlainText(markdown);

    // Copy to clipboard
    await navigator.clipboard.writeText(plainText);

    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.disabled = false;
    }, 2000);
  } catch (error) {
    alert('Error copying story: ' + error.message);
    btn.textContent = originalText;
    btn.disabled = false;
  }
}

function markdownToPlainText(markdown) {
  const lines = markdown.split('\n');
  const textLines = [];

  for (const line of lines) {
    // Skip empty lines
    if (!line.trim()) {
      textLines.push('');
      continue;
    }

    // Convert H1 to plain title
    if (line.startsWith('# ')) {
      textLines.push(line.substring(2).toUpperCase());
      textLines.push('');
      continue;
    }

    // Convert H2 to section header
    if (line.startsWith('## ')) {
      textLines.push('---');
      textLines.push(line.substring(3));
      textLines.push('');
      continue;
    }

    // Skip image lines
    if (line.match(/^!\[.*\]\(.*\)$/)) {
      continue;
    }

    // Regular text
    textLines.push(line);
  }

  // Clean up multiple empty lines
  let result = textLines.join('\n');
  result = result.replace(/\n{3,}/g, '\n\n');

  return result.trim();
}

// Story viewer functions
async function viewStory(storyId) {
  storyMenu.classList.add('hidden');
  showLoading();

  try {
    const response = await fetch(`/stories/${storyId}/story.md`);
    if (!response.ok) {
      throw new Error('Story file not found');
    }
    const markdown = await response.text();

    // Parse and render markdown
    const html = renderMarkdownStory(markdown, storyId);
    storyViewerBody.innerHTML = html;

    // Extract title from first h1
    const titleMatch = markdown.match(/^# (.+)$/m);
    storyViewerTitle.textContent = titleMatch ? titleMatch[1] : 'Story';

    // Add click handlers for images
    storyViewerBody.querySelectorAll('.story-image-container img').forEach(img => {
      img.addEventListener('click', () => showImageOverlay(img.src));
    });

    storyViewer.classList.remove('hidden');
  } catch (error) {
    alert('Error loading story: ' + error.message);
    console.error(error);
  } finally {
    hideLoading();
  }
}

// Novel menu popup
let activeNovelMenu = null;

function showNovelMenu(storyId, button) {
  // Remove any existing menu
  if (activeNovelMenu) {
    activeNovelMenu.remove();
    activeNovelMenu = null;
  }

  const menu = document.createElement('div');
  menu.className = 'novel-menu';
  menu.innerHTML = `
    <button class="novel-menu-item" data-action="view">View Novel</button>
    <button class="novel-menu-item" data-action="copy">Copy to Clipboard</button>
    <button class="novel-menu-item" data-action="download">Download</button>
  `;

  // Position menu near button
  const rect = button.getBoundingClientRect();
  menu.style.position = 'fixed';
  menu.style.top = `${rect.bottom + 5}px`;
  menu.style.left = `${rect.left}px`;
  menu.style.zIndex = '2000';

  document.body.appendChild(menu);
  activeNovelMenu = menu;

  // Handle menu item clicks
  menu.querySelectorAll('.novel-menu-item').forEach(item => {
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = item.dataset.action;
      menu.remove();
      activeNovelMenu = null;

      switch (action) {
        case 'view':
          await viewNovel(storyId);
          break;
        case 'copy':
          await copyNovel(storyId, button);
          break;
        case 'download':
          downloadNovel(storyId);
          break;
      }
    });
  });

  // Close menu when clicking outside
  const closeMenu = (e) => {
    if (!menu.contains(e.target) && e.target !== button) {
      menu.remove();
      activeNovelMenu = null;
      document.removeEventListener('click', closeMenu);
    }
  };
  setTimeout(() => document.addEventListener('click', closeMenu), 0);
}

async function viewNovel(storyId) {
  storyMenu.classList.add('hidden');
  showLoading();

  try {
    const response = await fetch(`/api/stories/${storyId}/novel`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load novel');
    }

    // Render markdown content
    const html = renderNovelMarkdown(data.content);
    storyViewerBody.innerHTML = html;

    // Extract title from first h1
    const titleMatch = data.content.match(/^# (.+)$/m);
    storyViewerTitle.textContent = titleMatch ? `${titleMatch[1]} (Novel)` : 'Novel';

    storyViewer.classList.remove('hidden');
  } catch (error) {
    alert('Error loading novel: ' + error.message);
    console.error(error);
  } finally {
    hideLoading();
  }
}

async function copyNovel(storyId, button) {
  try {
    const response = await fetch(`/api/stories/${storyId}/novel`);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load novel');
    }

    await navigator.clipboard.writeText(data.content);

    // Show feedback
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    button.disabled = true;
    setTimeout(() => {
      button.textContent = originalText;
      button.disabled = false;
    }, 2000);
  } catch (error) {
    alert('Error copying novel: ' + error.message);
    console.error(error);
  }
}

function downloadNovel(storyId) {
  // Trigger download via the API
  window.location.href = `/api/stories/${storyId}/novel/download`;
}

function renderNovelMarkdown(markdown) {
  // Markdown rendering that groups consecutive lines into paragraphs
  let html = '';
  const lines = markdown.split('\n');
  let paragraphBuffer = [];

  // Flush accumulated paragraph lines as a single <p>
  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join(' ').trim();
      if (text) {
        html += `<p>${escapeHtml(text)}</p>`;
      }
      paragraphBuffer = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (line.startsWith('# ')) {
      flushParagraph();
      html += `<h1>${escapeHtml(line.substring(2))}</h1>`;
    } else if (line.startsWith('## ')) {
      flushParagraph();
      html += `<h2>${escapeHtml(line.substring(3))}</h2>`;
    } else if (line.startsWith('---')) {
      flushParagraph();
      html += '<hr>';
    } else if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**') && trimmed.length > 2) {
      // Italics line (like the author style line)
      flushParagraph();
      html += `<p><em>${escapeHtml(trimmed.slice(1, -1))}</em></p>`;
    } else if (trimmed === '') {
      // Empty line marks paragraph break
      flushParagraph();
    } else {
      // Accumulate regular text lines into paragraph
      paragraphBuffer.push(trimmed);
    }
  }

  // Flush any remaining paragraph
  flushParagraph();

  return html;
}

function renderMarkdownStory(markdown, storyId) {
  const lines = markdown.split('\n');
  let html = '';
  let sectionHeader = '';
  let sectionImage = '';
  let sectionText = [];

  function flushSection() {
    if (sectionHeader || sectionImage || sectionText.length > 0) {
      html += '<div class="section">';
      if (sectionHeader) {
        html += sectionHeader;
      }
      // Image comes first for float wrapping
      if (sectionImage) {
        html += sectionImage;
      }
      for (const text of sectionText) {
        html += text;
      }
      html += '</div>';
    }
    sectionHeader = '';
    sectionImage = '';
    sectionText = [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // H1 - Title
    if (line.startsWith('# ')) {
      html += `<h1>${escapeHtml(line.substring(2))}</h1>`;
      continue;
    }

    // H2 - Turn headers (start new section)
    if (line.startsWith('## ')) {
      flushSection();
      sectionHeader = `<h2>${escapeHtml(line.substring(3))}</h2>`;
      continue;
    }

    // Image
    const imageMatch = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      const alt = imageMatch[1];
      let src = imageMatch[2];
      // Fix relative path
      if (!src.startsWith('/') && !src.startsWith('http')) {
        src = `/stories/${storyId}/${src}`;
      }
      sectionImage = `<div class="story-image-container"><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"></div>`;
      continue;
    }

    // Regular text (non-empty lines)
    if (line.trim()) {
      sectionText.push(`<p>${escapeHtml(line)}</p>`);
    }
  }

  // Flush final section
  flushSection();

  return html;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function closeStoryViewer() {
  storyViewer.classList.add('hidden');
}

viewerCloseBtn.addEventListener('click', closeStoryViewer);
storyViewer.addEventListener('click', (e) => {
  if (e.target === storyViewer) closeStoryViewer();
});

seedInput.value = "Two survivors of a plane crash in the desert. Sarah is a doctor, Mike is an engineer. They must find water and shelter.";
