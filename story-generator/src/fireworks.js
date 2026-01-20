import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { FIREWORKS_API_URL, getAvailableModels, getFireworksModel, getApiKey, LLM_CONFIG, getMaxTokensForModel, DEFAULT_MAX_TOKENS } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MAX_RETRIES = 5;

// Store the current story logs directory (set by game engine)
let currentLogsDir = null;
let currentStoryDir = null;

export function setLogsDir(dir) {
  currentLogsDir = dir;
  // Story dir is parent of logs dir
  currentStoryDir = dir ? dirname(dir) : null;
}

// Log model errors to model_errors.md in the story directory
function logModelError(errorType, model, request, response, params, errorMessage, turn = null) {
  if (!currentStoryDir) return;

  try {
    const errorFile = join(currentStoryDir, 'model_errors.md');
    const timestamp = new Date().toISOString();
    const turnStr = turn !== null ? ` (Turn ${turn})` : '';

    // Truncate long content for readability
    const truncate = (str, maxLen = 500) => {
      if (!str) return 'null';
      const s = typeof str === 'string' ? str : JSON.stringify(str);
      return s.length > maxLen ? s.slice(0, maxLen) + '...[truncated]' : s;
    };

    // Format the request messages for readability
    const formatRequest = (req) => {
      if (!req) return 'null';
      if (req.messages) {
        return req.messages.map(m => `[${m.role}]: ${truncate(m.content, 300)}`).join('\n    ');
      }
      return truncate(JSON.stringify(req));
    };

    const entry = `
## ${errorType}${turnStr}
**Timestamp:** ${timestamp}
**Model:** ${model || 'default'}

### Error
${errorMessage}

### Model Parameters
\`\`\`json
${JSON.stringify(params || {}, null, 2)}
\`\`\`

### Request
\`\`\`
${formatRequest(request)}
\`\`\`

### Response
\`\`\`
${truncate(typeof response === 'string' ? response : JSON.stringify(response), 1000)}
\`\`\`

---
`;

    // Append to file or create new
    let content = '';
    if (existsSync(errorFile)) {
      content = readFileSync(errorFile, 'utf-8');
    } else {
      content = '# Model Errors Log\n\nThis file tracks errors and issues from LLM models during story generation.\n\n---\n';
    }

    writeFileSync(errorFile, content + entry);
    console.log(`[Model Error] ${errorType} logged to model_errors.md`);
  } catch (err) {
    console.error('Error writing to model_errors.md:', err.message);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function logLLMCall(request, response, modelKey, elapsed, role = 'llm', turn = null) {
  if (!currentLogsDir) return;

  try {
    mkdirSync(currentLogsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const modelName = modelKey || 'default';
    const turnStr = turn !== null ? `turn${String(turn).padStart(3, '0')}_` : '';
    const filename = `${timestamp}_${turnStr}${role}_${modelName}.json`;
    const filepath = join(currentLogsDir, filename);

    const logData = {
      timestamp: new Date().toISOString(),
      turn,
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

export function logImagePrompt(prompt, metadata, modelKey = 'z-image-turbo', turn = null) {
  if (!currentLogsDir) return;

  try {
    mkdirSync(currentLogsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const turnStr = turn !== null ? `turn${String(turn).padStart(3, '0')}_` : '';
    const filename = `${timestamp}_${turnStr}image_${modelKey}.json`;
    const filepath = join(currentLogsDir, filename);

    const logData = {
      timestamp: new Date().toISOString(),
      turn,
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
  const { systemPrompt = null, jsonMode = false, model = null, role = 'llm', turn = null } = options;

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
        const errorMsg = `Fireworks API error after ${MAX_RETRIES} retries: ${response.status} ${response.statusText} - ${text}`;
        const errorType = response.status === 429 ? 'Rate Limit Exceeded' : 'Server Error';
        logModelError(errorType, model, { messages, ...body }, text, { max_tokens: maxTokens, ...LLM_CONFIG }, errorMsg, turn);
        throw new Error(errorMsg);
      }
    }

    if (!response.ok) {
      const text = await response.text();
      const errorMsg = `Fireworks API error: ${response.status} ${response.statusText} - ${text}`;
      // Check for context window exceeded
      const errorType = text.includes('context') || text.includes('token') ? 'Context Window Exceeded' : 'API Error';
      logModelError(errorType, model, { messages, ...body }, text, { max_tokens: maxTokens, ...LLM_CONFIG }, errorMsg, turn);
      throw new Error(errorMsg);
    }

    const data = await response.json();

    if (data.error) {
      const errorMsg = `Fireworks API error: ${JSON.stringify(data.error)}`;
      logModelError('API Error', model, { messages, ...body }, data, { max_tokens: maxTokens, ...LLM_CONFIG }, errorMsg, turn);
      throw new Error(errorMsg);
    }

    const content = data.choices?.[0]?.message?.content;

    // Log the request and response
    logLLMCall({ messages, ...body }, data, model, elapsed, role, turn);

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
  const turn = options.turn;
  let result = await queryLLM(prompt, { ...options, jsonMode: true });

  // Check if response was truncated
  const finishReason = result.response?.choices?.[0]?.finish_reason;
  if (finishReason === 'length') {
    const truncatedPreview = result.content?.slice(-200) || '';
    const errorMsg = `Response truncated (hit max_tokens). Last 200 chars: ...${truncatedPreview}`;
    logModelError('Truncated Response', originalModel, result.request, result.content, { max_tokens: result.request?.max_tokens }, errorMsg, turn);
    throw new Error(errorMsg);
  }

  // Check for content refusal and retry with fallback model
  if (isContentRefusal(result.content) && originalModel !== FALLBACK_MODEL) {
    // Log the refusal before retrying
    logModelError('Content Refusal', originalModel, result.request, result.content, { max_tokens: result.request?.max_tokens }, `Model refused to generate content. Retrying with ${FALLBACK_MODEL}.`, turn);

    console.log(`[LLM] Content refusal detected from ${originalModel || 'default'}, retrying with ${FALLBACK_MODEL}...`);
    result = await queryLLM(prompt, { ...options, model: FALLBACK_MODEL, jsonMode: true });

    // Check truncation on retry
    const retryFinishReason = result.response?.choices?.[0]?.finish_reason;
    if (retryFinishReason === 'length') {
      const truncatedPreview = result.content?.slice(-200) || '';
      const errorMsg = `Response truncated on fallback (hit max_tokens). Last 200 chars: ...${truncatedPreview}`;
      logModelError('Truncated Response (Fallback)', FALLBACK_MODEL, result.request, result.content, { max_tokens: result.request?.max_tokens }, errorMsg, turn);
      throw new Error(errorMsg);
    }

    // Check if fallback also refused
    if (isContentRefusal(result.content)) {
      const errorMsg = `Fallback model ${FALLBACK_MODEL} also refused to generate content.`;
      logModelError('Content Refusal (Fallback)', FALLBACK_MODEL, result.request, result.content, { max_tokens: result.request?.max_tokens }, errorMsg, turn);
      throw new Error(errorMsg);
    }
  }

  try {
    result.parsed = JSON.parse(result.content);
  } catch (e) {
    const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        result.parsed = JSON.parse(jsonMatch[1]);
      } catch (e2) {
        const errorMsg = `Failed to parse JSON from code block: ${e2.message}`;
        logModelError('JSON Parse Error', originalModel, result.request, result.content, { max_tokens: result.request?.max_tokens }, errorMsg, turn);
        throw new Error(errorMsg);
      }
    } else {
      // Show more context for debugging truncation issues
      const contentPreview = result.content?.slice(-500) || result.content;
      const errorMsg = `Failed to parse JSON response (possibly truncated). Last 500 chars: ...${contentPreview}`;
      logModelError('JSON Parse Error', originalModel, result.request, result.content, { max_tokens: result.request?.max_tokens }, errorMsg, turn);
      throw new Error(errorMsg);
    }
  }

  return result;
}
