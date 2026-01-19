import { FIREWORKS_API_URL, FIREWORKS_MODEL, AVAILABLE_MODELS, getApiKey, LLM_CONFIG } from './config.js';

const MAX_RETRIES = 5;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function getModelId(modelKey) {
  if (modelKey && AVAILABLE_MODELS[modelKey]) {
    return AVAILABLE_MODELS[modelKey].id;
  }
  return FIREWORKS_MODEL;
}

export async function queryLLM(prompt, options = {}) {
  const { systemPrompt = null, jsonMode = false, model = null } = options;

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
