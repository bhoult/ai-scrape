const seedInput = document.getElementById('seed');
const startBtn = document.getElementById('start-btn');
const turnBtn = document.getElementById('turn-btn');
const turnCounter = document.getElementById('turn-counter');
const timeDisplay = document.getElementById('time-display');
const dmControls = document.getElementById('dm-controls');
const dmInstructionsInput = document.getElementById('dm-instructions');
const storyContent = document.getElementById('story-content');
const worldState = document.getElementById('world-state');
const llmLog = document.getElementById('llm-log');
const loading = document.getElementById('loading');
const menuBtn = document.getElementById('menu-btn');
const storyMenu = document.getElementById('story-menu');
const menuCloseBtn = document.getElementById('menu-close-btn');
const storyList = document.getElementById('story-list');
const generateImagesCheckbox = document.getElementById('generate-images-checkbox');
const turnCountInput = document.getElementById('turn-count');
const storyViewer = document.getElementById('story-viewer');
const storyViewerTitle = document.getElementById('story-viewer-title');
const storyViewerBody = document.getElementById('story-viewer-body');
const viewerCloseBtn = document.getElementById('viewer-close-btn');

let currentTurn = 0;
let currentStoryId = null;

function formatTime(time) {
  if (!time) return '';
  const hour = time.hour.toString().padStart(2, '0');
  const minute = time.minute.toString().padStart(2, '0');
  return `Day ${time.day}, ${hour}:${minute}`;
}

function showLoading() {
  loading.classList.remove('hidden');
}

function hideLoading() {
  loading.classList.add('hidden');
}

function renderNarrative(narrative, turn, characterActions = null, time = null) {
  const entry = document.createElement('div');
  entry.className = 'narrative-entry';

  const timeStr = time ? ` - ${formatTime(time)}` : '';
  if (turn > 0) {
    entry.innerHTML = `<div class="turn-marker">Turn ${turn}${timeStr}</div>`;
  } else {
    entry.innerHTML = `<div class="turn-marker">Opening${timeStr}</div>`;
  }

  if (characterActions && characterActions.length > 0) {
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'character-actions';
    actionsDiv.innerHTML = characterActions.map(ca => {
      let html = `<div class="character-action"><span class="character-name">${ca.character}:</span> ${ca.action}`;
      if (ca.dialogue) {
        html += ` <span class="dialogue">"${ca.dialogue}"</span>`;
      }
      html += '</div>';
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

  const narrativeP = document.createElement('p');
  narrativeP.textContent = narrative;
  entry.appendChild(narrativeP);

  storyContent.appendChild(entry);
  storyContent.scrollTop = storyContent.scrollHeight;
}

function pollForImage(turn, container) {
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
      storyContent.scrollTop = storyContent.scrollHeight;
    };
    img.onerror = () => {
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(checkImage, 2000); // Check every 2 seconds
      } else {
        container.innerHTML = '<div class="image-failed">Image generation failed</div>';
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
  };
  img.onerror = () => {
    // No image exists, remove the empty container
    container.remove();
  };
  img.src = imageUrl;
}

function showImageOverlay(imageUrl) {
  const overlay = document.createElement('div');
  overlay.className = 'image-overlay';

  const img = document.createElement('img');
  img.src = imageUrl;
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

function renderLogEntry(log) {
  const entry = document.createElement('div');
  entry.className = 'log-entry';

  let typeLabel = log.type;
  if (log.type === 'player_action' && log.character) {
    typeLabel = `${log.character}'s Action`;
  } else if (log.type === 'dm_init') {
    typeLabel = 'DM: Initialize';
  } else if (log.type === 'dm_resolution') {
    typeLabel = 'DM: Resolution';
  }

  entry.innerHTML = `
    <div class="log-header">
      <span class="log-type ${log.type}">${typeLabel}</span>
      <span class="log-time">${log.elapsed}ms</span>
    </div>
    <div class="log-content">
      <div class="log-section">
        <div class="log-section-title">Request</div>
        <pre>${JSON.stringify(log.request?.messages || log.request, null, 2)}</pre>
      </div>
      <div class="log-section">
        <div class="log-section-title">Response (Parsed)</div>
        <pre>${JSON.stringify(log.parsed, null, 2)}</pre>
      </div>
    </div>
  `;

  const header = entry.querySelector('.log-header');
  const content = entry.querySelector('.log-content');

  header.addEventListener('click', () => {
    content.classList.toggle('expanded');
  });

  llmLog.appendChild(entry);
  llmLog.scrollTop = llmLog.scrollHeight;
}

async function startGame() {
  const seed = seedInput.value.trim();
  if (!seed) {
    alert('Please enter a story seed');
    return;
  }

  showLoading();
  storyContent.innerHTML = '';
  llmLog.innerHTML = '';
  currentTurn = 0;

  try {
    const response = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seed })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to start game');
    }

    currentStoryId = data.storyId;
    renderNarrative(data.narrative, 0, null, data.worldState.time);
    renderWorldState(data.worldState);

    for (const log of data.llmLog) {
      renderLogEntry(log);
    }

    turnBtn.disabled = false;
    turnCounter.textContent = 'Turn: 0';
    timeDisplay.textContent = formatTime(data.worldState.time);
    dmControls.style.display = 'block';
  } catch (error) {
    alert('Error starting game: ' + error.message);
    console.error(error);
  } finally {
    hideLoading();
  }
}

async function advanceTurn() {
  const turnCount = parseInt(turnCountInput.value) || 1;
  showLoading();
  turnBtn.disabled = true;
  turnCountInput.disabled = true;

  const dmInstructions = dmInstructionsInput.value.trim() || null;

  try {
    for (let i = 0; i < turnCount; i++) {
      // Update loading message for multiple turns
      if (turnCount > 1) {
        loading.querySelector('p').textContent = `Processing turn ${i + 1} of ${turnCount}...`;
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
      turnCounter.textContent = `Turn: ${currentTurn}`;
      timeDisplay.textContent = formatTime(data.worldState.time);

      renderNarrative(data.narrative, data.turn, data.characterActions, data.worldState.time);
      renderWorldState(data.worldState);

      for (const log of data.turnLogs) {
        renderLogEntry(log);
      }
    }

    dmInstructionsInput.value = '';
  } catch (error) {
    alert('Error advancing turn: ' + error.message);
    console.error(error);
  } finally {
    loading.querySelector('p').textContent = 'Processing...';
    hideLoading();
    turnBtn.disabled = false;
    turnCountInput.disabled = false;
  }
}

startBtn.addEventListener('click', startGame);
turnBtn.addEventListener('click', advanceTurn);

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

  try {
    const response = await fetch(`/api/stories/${storyId}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generateMissingImages })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Failed to load story');
    }

    currentStoryId = data.storyId;

    // Clear current content
    storyContent.innerHTML = '';
    llmLog.innerHTML = '<p class="placeholder">LLM log cleared for loaded story</p>';

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
          entry.innerHTML = `<div class="turn-marker">${turnMatch[1]}${timeStr ? ` - ${timeStr}` : ''}</div>`;

          // Add image container (before narrative for float wrapping)
          const imageContainer = document.createElement('div');
          imageContainer.className = 'turn-image';
          imageContainer.dataset.turn = turn;
          entry.appendChild(imageContainer);
          checkForExistingImage(turn, imageContainer);

          const narrativeP = document.createElement('p');
          narrativeP.textContent = narrative;
          entry.appendChild(narrativeP);

          storyContent.appendChild(entry);
        }
      }
    }

    // Update UI state
    seedInput.value = data.seed;
    currentTurn = data.worldState.turnNumber;
    turnCounter.textContent = `Turn: ${currentTurn}`;
    timeDisplay.textContent = formatTime(data.worldState.time);
    renderWorldState(data.worldState);

    turnBtn.disabled = false;
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
