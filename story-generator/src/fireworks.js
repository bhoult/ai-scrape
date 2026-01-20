import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FIREWORKS_API_URL, getAvailableModels, getFireworksModel, getApiKey, LLM_CONFIG } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_RETRIES = 5;

// Store the current story logs directory (set by game engine)
let currentLogsDir = null;

export function setLogsDir(dir) {
  currentLogsDir = dir;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function logLLMCall(request, response, modelKey, elapsed, role = 'llm') {
  if (!currentLogsDir) return;

  try {
    mkdirSync(currentLogsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const modelName = modelKey || 'default';
    const filename = `${timestamp}_${role}_${modelName}.json`;
    const filepath = join(currentLogsDir, filename);

    const logData = {
      timestamp: new Date().toISOString(),
      role,
      model: modelKey,
      elapsed,
      request,
      response
    };

    writeFileSync(filepath, JSON.stringify(logData, null, 2));
  } catch (err) {
    console.error('Error writing LLM log:', err.message);
  }
}

export function logImagePrompt(prompt, metadata, modelKey = 'z-image-turbo') {
  if (!currentLogsDir) return;

  try {
    mkdirSync(currentLogsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${timestamp}_image_${modelKey}.json`;
    const filepath = join(currentLogsDir, filename);

    const logData = {
      timestamp: new Date().toISOString(),
      type: 'image',
      model: modelKey,
      prompt,
      metadata
    };

    writeFileSync(filepath, JSON.stringify(logData, null, 2));
  } catch (err) {
    console.error('Error writing image log:', err.message);
  }
}

export function getModelId(modelKey) {
  const models = getAvailableModels();
  if (modelKey && models[modelKey]) {
    return models[modelKey].id;
  }
  return getFireworksModel();
}

export async function queryLLM(prompt, options = {}) {
  const { systemPrompt = null, jsonMode = false, model = null, role = 'llm' } = options;

  const apiKey = getApiKey();
  const messages = [];

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const modelId = getModelId(model);

  const body = {
    model: modelId,
    messages,
    ...LLM_CONFIG
  };

  if (jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  let retries = 0;

  while (true) {
    const startTime = Date.now();

    const response = await fetch(FIREWORKS_API_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body)
    });

    const elapsed = Date.now() - startTime;

    // Retry on rate limit (429) or server errors (502, 503, 504)
    const retryableStatuses = [429, 502, 503, 504];
    if (retryableStatuses.includes(response.status)) {
      retries++;
      if (retries <= MAX_RETRIES) {
        const waitTime = Math.pow(2, retries) * 1000;
        console.log(`API error (${response.status}), retrying in ${waitTime/1000}s (attempt ${retries}/${MAX_RETRIES})...`);
        await sleep(waitTime);
        continue;
      } else {
        const text = await response.text();
        throw new Error(`Fireworks API error after ${MAX_RETRIES} retries: ${response.status} ${response.statusText} - ${text}`);
      }
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Fireworks API error: ${response.status} ${response.statusText} - ${text}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Fireworks API error: ${JSON.stringify(data.error)}`);
    }

    const content = data.choices?.[0]?.message?.content;

    // Log the request and response
    logLLMCall({ messages, ...body }, data, model, elapsed, role);

    return {
      content,
      request: { messages, ...body },
      response: data,
      elapsed
    };
  }
}

export async function queryLLMJSON(prompt, options = {}) {
  const result = await queryLLM(prompt, { ...options, jsonMode: true });

  try {
    result.parsed = JSON.parse(result.content);
  } catch (e) {
    const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      result.parsed = JSON.parse(jsonMatch[1]);
    } else {
      throw new Error(`Failed to parse JSON response: ${result.content}`);
    }
  }

  return result;
}
