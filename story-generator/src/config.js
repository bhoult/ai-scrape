import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
// Fireworks models API - 'fireworks' account contains public models
export const FIREWORKS_MODELS_URL = 'https://api.fireworks.ai/v1/accounts/fireworks/models';

// Will be populated by fetchAvailableModels()
export let AVAILABLE_MODELS = {};
export let DEFAULT_MODEL = null;

// Fallback models if API fails
const FALLBACK_MODELS = {
  'deepseek-v3': {
    id: 'accounts/fireworks/models/deepseek-v3',
    name: 'DeepSeek V3',
    description: 'DeepSeek model'
  },
  'llama-v3p1-70b-instruct': {
    id: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
    name: 'Llama 3.1 70B Instruct',
    description: 'Meta Llama model'
  }
};

// For backward compatibility - will be set after fetching models
export let FIREWORKS_MODEL = null;

// Fetch available models from Fireworks API
export async function fetchAvailableModels() {
  try {
    const apiKey = getApiKey();
    let allModels = [];
    let pageToken = null;

    // Fetch all pages of models
    do {
      const url = new URL(FIREWORKS_MODELS_URL);
      url.searchParams.set('pageSize', '200');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      allModels = allModels.concat(data.models || []);
      pageToken = data.nextPageToken;
    } while (pageToken);

    const models = {};

    // Filter for serverless chat/completion models only
    for (const model of allModels) {
      const modelName = model.name || '';
      const modelId = modelName.replace(/^accounts\/fireworks\/models\//, '');

      // Only include serverless models
      if (!model.supportsServerless) {
        continue;
      }

      // Skip non-text models (image, embedding, audio, vision, etc.)
      if (!modelId ||
          modelId.includes('embed') ||
          modelId.includes('whisper') ||
          modelId.includes('flux') ||
          modelId.includes('sdxl') ||
          modelId.includes('stable-diffusion') ||
          modelId.includes('playground') ||
          modelId.includes('llava') ||
          modelId.includes('firellava') ||
          modelId.includes('firefunction') ||
          modelId.includes('audio') ||
          model.supportsImageInput === true) {
        continue;
      }

      models[modelId] = {
        id: modelName,
        name: model.displayName || modelId.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: model.description || 'Fireworks AI model',
        context_length: model.contextLength || 'Unknown'
      };
    }

    if (Object.keys(models).length === 0) {
      console.warn('No models returned from API, using fallback');
      AVAILABLE_MODELS = FALLBACK_MODELS;
    } else {
      AVAILABLE_MODELS = models;
    }

    // Set default model - prefer these in order if available
    const preferredDefaults = ['deepseek-v3', 'deepseek-v3-0324', 'llama-v3p1-70b-instruct', 'qwen2p5-72b-instruct'];
    DEFAULT_MODEL = preferredDefaults.find(m => AVAILABLE_MODELS[m]) || Object.keys(AVAILABLE_MODELS)[0];
    FIREWORKS_MODEL = AVAILABLE_MODELS[DEFAULT_MODEL]?.id;

    console.log(`Loaded ${Object.keys(AVAILABLE_MODELS).length} serverless models from Fireworks API`);
    console.log(`Default model: ${DEFAULT_MODEL}`);

    return AVAILABLE_MODELS;
  } catch (error) {
    console.error('Error fetching models from Fireworks API:', error.message);
    console.log('Using fallback models');
    AVAILABLE_MODELS = FALLBACK_MODELS;
    DEFAULT_MODEL = Object.keys(FALLBACK_MODELS)[0];
    FIREWORKS_MODEL = FALLBACK_MODELS[DEFAULT_MODEL].id;
    return AVAILABLE_MODELS;
  }
}

export function getApiKey() {
  const keyPath = join(__dirname, '../../fireworks_api.key');
  return readFileSync(keyPath, 'utf-8').trim();
}

// Getter functions for dynamic values (ensures current values after fetch)
export function getAvailableModels() {
  return AVAILABLE_MODELS;
}

export function getDefaultModel() {
  return DEFAULT_MODEL;
}

export function getFireworksModel() {
  return FIREWORKS_MODEL;
}

export const LLM_CONFIG = {
  temperature: 0.7,
  top_p: 1,
  top_k: 40,
  presence_penalty: 0,
  frequency_penalty: 0
};

// Default max_tokens (streaming is used automatically for >4096)
export const DEFAULT_MAX_TOKENS = 4096;

// Model-specific max_tokens overrides (streaming enabled automatically)
const MODEL_MAX_TOKENS = {
  'llama-v3p3-70b-instruct': 16384,
  'llama-v3p1-70b-instruct': 16384,
  'llama-v3p1-405b-instruct': 16384,
  'minimax-m1': 16384,
  'minimax-m2': 16384,
  'deepseek-v3': 16384,
  'deepseek-v3-0324': 16384,
  'deepseek-r1': 16384
};

// Get max output tokens for a model
export function getMaxTokensForModel(modelKey) {
  if (modelKey && MODEL_MAX_TOKENS[modelKey]) {
    return MODEL_MAX_TOKENS[modelKey];
  }
  return DEFAULT_MAX_TOKENS;
}
