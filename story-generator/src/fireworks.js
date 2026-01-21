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

// Parse Server-Sent Events stream and accumulate content
async function parseSSEStream(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let content = '';
  let finishReason = null;
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            content += delta;
          }
          if (parsed.choices?.[0]?.finish_reason) {
            finishReason = parsed.choices[0].finish_reason;
          }
        } catch (e) {
          // Skip malformed JSON chunks
        }
      }
    }
  }

  return { content, finishReason };
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

  // Use streaming for max_tokens > 4096 (Fireworks API requirement)
  const useStreaming = maxTokens > 4096;

  const body = {
    model: modelId,
    messages,
    ...LLM_CONFIG,
    max_tokens: maxTokens,
    stream: useStreaming
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
        'Accept': useStreaming ? 'text/event-stream' : 'application/json',
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

    let content, data, finishReason;

    if (useStreaming) {
      // Parse streaming response
      const streamResult = await parseSSEStream(response);
      content = streamResult.content;
      finishReason = streamResult.finishReason;
      // Construct a response object similar to non-streaming for logging
      data = {
        choices: [{
          message: { content },
          finish_reason: finishReason
        }],
        model: modelId,
        streamed: true
      };
    } else {
      // Parse regular JSON response
      data = await response.json();

      if (data.error) {
        const errorMsg = `Fireworks API error: ${JSON.stringify(data.error)}`;
        logModelError('API Error', model, { messages, ...body }, data, { max_tokens: maxTokens, ...LLM_CONFIG }, errorMsg, turn);
        throw new Error(errorMsg);
      }

      content = data.choices?.[0]?.message?.content;
      finishReason = data.choices?.[0]?.finish_reason;
    }

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

// Try to repair space-key malformation where all keys are " " or empty
// This extracts values in order and maps them to expected field names
function tryRepairSpaceKeyJSON(content, expectedFields) {
  if (!content || !expectedFields || expectedFields.length === 0) return null;

  try {
    // Extract JSON object
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd <= jsonStart) return null;

    const jsonStr = content.slice(jsonStart, jsonEnd + 1);

    // Check if this looks like space-key malformation (multiple " " : patterns)
    const spaceKeyCount = (jsonStr.match(/" " *:/g) || []).length;
    if (spaceKeyCount < 2) return null; // Not space-key malformation

    console.log(`[LLM] Detected space-key malformation (${spaceKeyCount} space keys), attempting repair...`);

    // Extract values by finding all : followed by value patterns
    // We need to extract values in order, handling strings, arrays, and objects
    const values = [];
    let pos = 0;
    let depth = 0;
    let inString = false;
    let escapeNext = false;
    let currentValue = '';
    let collectingValue = false;
    let valueStart = -1;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inString) {
        escapeNext = true;
        continue;
      }

      if (char === '"' && !escapeNext) {
        inString = !inString;
      }

      if (!inString) {
        // When we see a colon at depth 1, the next value is what we want
        if (char === ':' && depth === 1 && !collectingValue) {
          collectingValue = true;
          valueStart = i + 1;
          continue;
        }

        // When collecting and we hit a comma at depth 1, or closing brace (which will transition to depth 0), capture the value
        const willCloseMainObject = char === '}' && depth === 1;
        if (collectingValue && (willCloseMainObject || (depth === 1 && char === ','))) {
          const valueStr = jsonStr.slice(valueStart, i).trim();
          if (valueStr) {
            try {
              values.push(JSON.parse(valueStr));
            } catch (e) {
              // If it doesn't parse as JSON, treat as raw string
              values.push(valueStr);
            }
          }
          collectingValue = false;
        }

        if (char === '{' || char === '[') depth++;
        if (char === '}' || char === ']') depth--;
      }
    }

    if (values.length === 0) return null;

    // Map values to expected fields in order
    const result = {};
    for (let i = 0; i < Math.min(values.length, expectedFields.length); i++) {
      result[expectedFields[i]] = values[i];
    }

    console.log(`[LLM] Successfully repaired space-key JSON: mapped ${values.length} values to ${Object.keys(result).length} fields`);
    return result;
  } catch (e) {
    console.log(`[LLM] Space-key repair failed: ${e.message}`);
    return null;
  }
}

// Try to repair common JSON malformations
function tryRepairJSON(content, expectedFields = null) {
  if (!content) return null;

  try {
    // First, check for space-key malformation if we have expected fields
    if (expectedFields) {
      const spaceKeyRepaired = tryRepairSpaceKeyJSON(content, expectedFields);
      if (spaceKeyRepaired) return spaceKeyRepaired;
    }

    // Try to find a valid JSON object in the content
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd > jsonStart) {
      const extracted = content.slice(jsonStart, jsonEnd + 1);
      try {
        return JSON.parse(extracted);
      } catch (e) {
        // Continue to other repair attempts
      }
    }

    // Try to fix common issues:
    let repaired = content;

    // Remove any text before the first { or after the last }
    const startIdx = repaired.indexOf('{');
    const endIdx = repaired.lastIndexOf('}');
    if (startIdx !== -1 && endIdx > startIdx) {
      repaired = repaired.slice(startIdx, endIdx + 1);
    }

    // Fix trailing commas before }
    repaired = repaired.replace(/,\s*}/g, '}');
    repaired = repaired.replace(/,\s*]/g, ']');

    // Fix missing quotes around keys (common LLM error)
    repaired = repaired.replace(/{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '{"$1":');
    repaired = repaired.replace(/,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, ',"$1":');

    // Try parsing the repaired content
    try {
      return JSON.parse(repaired);
    } catch (e) {
      // One more attempt: try to extract key-value pairs for player action format
      // Expected: {"thinking": "...", "action": "...", "dialogue": "..."}
      const thinkingMatch = content.match(/"?thinking"?\s*[:=]\s*"([^"]*(?:\\.[^"]*)*)"/i);
      const actionMatch = content.match(/"?action"?\s*[:=]\s*"([^"]*(?:\\.[^"]*)*)"/i);
      const dialogueMatch = content.match(/"?dialogue"?\s*[:=]\s*"([^"]*(?:\\.[^"]*)*)"/i);

      if (actionMatch) {
        return {
          thinking: thinkingMatch ? thinkingMatch[1] : '',
          action: actionMatch[1],
          dialogue: dialogueMatch ? dialogueMatch[1] : null
        };
      }

      // Try DM resolution format
      const narrativeMatch = content.match(/"?narrative"?\s*[:=]\s*"([^"]*(?:\\.[^"]*)*)"/i);
      if (narrativeMatch) {
        return {
          narrative: narrativeMatch[1],
          scenefocus: 'characters',
          scenevisuals: {},
          worldchanges: {},
          worldsummary: narrativeMatch[1].slice(0, 100),
          time: null,
          arcupdates: {}
        };
      }
    }

    return null;
  } catch (e) {
    return null;
  }
}

export async function queryLLMJSON(prompt, options = {}) {
  const originalModel = options.model;
  const turn = options.turn;
  const expectedFields = options.expectedFields || null; // For repairing space-key malformation
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
    // Extract refusal reason for clearer error message
    const refusalPreview = result.content?.slice(0, 500) || 'Empty response';
    const errorMsg = `Model refused to generate content. Retrying with ${FALLBACK_MODEL}.\n\nRefusal message:\n${refusalPreview}`;

    // Log the refusal before retrying
    logModelError('Content Refusal', originalModel, result.request, result.content, { max_tokens: result.request?.max_tokens }, errorMsg, turn);

    console.log(`[LLM] Content refusal detected from ${originalModel || 'default'}, retrying with ${FALLBACK_MODEL}...`);
    console.log(`[LLM] Refusal: ${refusalPreview.slice(0, 200)}...`);
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
      const fallbackRefusalPreview = result.content?.slice(0, 500) || 'Empty response';
      const errorMsg = `Fallback model ${FALLBACK_MODEL} also refused to generate content.\n\nRefusal message:\n${fallbackRefusalPreview}`;
      logModelError('Content Refusal (Fallback)', FALLBACK_MODEL, result.request, result.content, { max_tokens: result.request?.max_tokens }, errorMsg, turn);
      throw new Error(errorMsg);
    }
  }

  try {
    result.parsed = JSON.parse(result.content);
  } catch (e) {
    // Try to extract JSON from code block
    const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      try {
        result.parsed = JSON.parse(jsonMatch[1]);
      } catch (e2) {
        // Try repair on code block content
        const repaired = tryRepairJSON(jsonMatch[1], expectedFields);
        if (repaired) {
          result.parsed = repaired;
          console.log(`[LLM] Repaired malformed JSON from code block`);
        } else {
          const errorMsg = `Failed to parse JSON from code block: ${e2.message}`;
          logModelError('JSON Parse Error', originalModel, result.request, result.content, { max_tokens: result.request?.max_tokens }, errorMsg, turn);
          throw new Error(errorMsg);
        }
      }
    } else {
      // Try to repair malformed JSON
      const repaired = tryRepairJSON(result.content, expectedFields);
      if (repaired) {
        result.parsed = repaired;
        console.log(`[LLM] Repaired malformed JSON response`);
      } else {
        // Log the error and retry with fallback model if not already using it
        const contentPreview = result.content?.slice(-500) || result.content;
        logModelError('JSON Parse Error', originalModel, result.request, result.content, { max_tokens: result.request?.max_tokens }, `Malformed JSON, attempting fallback. Preview: ...${contentPreview}`, turn);

        // Retry with fallback model if this wasn't already a fallback attempt
        if (originalModel !== FALLBACK_MODEL) {
          console.log(`[LLM] JSON parse error from ${originalModel || 'default'}, retrying with ${FALLBACK_MODEL}...`);
          const retryResult = await queryLLM(prompt, { ...options, model: FALLBACK_MODEL, jsonMode: true });

          try {
            result.parsed = JSON.parse(retryResult.content);
            result.content = retryResult.content;
            result.response = retryResult.response;
            console.log(`[LLM] Fallback model returned valid JSON`);
          } catch (retryError) {
            const retryRepaired = tryRepairJSON(retryResult.content, expectedFields);
            if (retryRepaired) {
              result.parsed = retryRepaired;
              result.content = retryResult.content;
              result.response = retryResult.response;
              console.log(`[LLM] Repaired fallback model JSON`);
            } else {
              const errorMsg = `Failed to parse JSON response (possibly truncated). Last 500 chars: ...${contentPreview}`;
              logModelError('JSON Parse Error (Fallback)', FALLBACK_MODEL, retryResult.request, retryResult.content, { max_tokens: retryResult.request?.max_tokens }, errorMsg, turn);
              throw new Error(errorMsg);
            }
          }
        } else {
          const errorMsg = `Failed to parse JSON response (possibly truncated). Last 500 chars: ...${contentPreview}`;
          throw new Error(errorMsg);
        }
      }
    }
  }

  return result;
}
