import { writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FIREWORKS_API_URL, getAvailableModels, getFireworksModel, getApiKey, LLM_CONFIG, getMaxTokensForModel, DEFAULT_MAX_TOKENS } from './config.js';

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

  // Get model-specific max_tokens based on context length
  const maxTokens = model ? getMaxTokensForModel(model) : DEFAULT_MAX_TOKENS;

  const body = {
    model: modelId,
    messages,
    ...LLM_CONFIG,
    max_tokens: maxTokens
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

// Fallback model when primary model refuses content
const FALLBACK_MODEL = 'llama-v3p3-70b-instruct';

// Check if response indicates content refusal
function isContentRefusal(content) {
  if (!content || content.length < 50) return true;

  const refusalPatterns = [
    /i('m| am) (unable|not able) to/i,
    /i can('t|not) (create|generate|write|produce|help with)/i,
    /i (cannot|can't) (assist|help)/i,
    /against my (guidelines|policies|programming)/i,
    /i apologize,? but/i,
    /i('m| am) sorry,? (but |i )/i,
    /this (request|content) (violates|goes against)/i,
    /i('m| am) not (able|going) to/i,
    /as an ai/i
  ];

  return refusalPatterns.some(pattern => pattern.test(content));
}

export async function queryLLMJSON(prompt, options = {}) {
  const originalModel = options.model;
  let result = await queryLLM(prompt, { ...options, jsonMode: true });

  // Check if response was truncated
  const finishReason = result.response?.choices?.[0]?.finish_reason;
  if (finishReason === 'length') {
    const truncatedPreview = result.content?.slice(-200) || '';
    throw new Error(`Response truncated (hit max_tokens). Last 200 chars: ...${truncatedPreview}`);
  }

  // Check for content refusal and retry with fallback model
  if (isContentRefusal(result.content) && originalModel !== FALLBACK_MODEL) {
    console.log(`[LLM] Content refusal detected from ${originalModel || 'default'}, retrying with ${FALLBACK_MODEL}...`);
    result = await queryLLM(prompt, { ...options, model: FALLBACK_MODEL, jsonMode: true });

    // Check truncation on retry
    const retryFinishReason = result.response?.choices?.[0]?.finish_reason;
    if (retryFinishReason === 'length') {
      const truncatedPreview = result.content?.slice(-200) || '';
      throw new Error(`Response truncated (hit max_tokens). Last 200 chars: ...${truncatedPreview}`);
    }
  }

  try {
    result.parsed = JSON.parse(result.content);
  } catch (e) {
    const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      result.parsed = JSON.parse(jsonMatch[1]);
    } else {
      // Show more context for debugging truncation issues
      const contentPreview = result.content?.slice(-500) || result.content;
      throw new Error(`Failed to parse JSON response (possibly truncated). Last 500 chars: ...${contentPreview}`);
    }
  }

  return result;
}
