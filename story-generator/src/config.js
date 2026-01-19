import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';

export const AVAILABLE_MODELS = {
  'minimax-m2p1': {
    id: 'accounts/fireworks/models/minimax-m2p1',
    name: 'MiniMax M2P1',
    description: 'Fast and efficient'
  },
  'gpt-oss-120b': {
    id: 'accounts/fireworks/models/gpt-oss-120b',
    name: 'GPT OSS 120B',
    description: 'Larger model, higher quality'
  },
  'deepseek-v3p2': {
    id: 'accounts/fireworks/models/deepseek-v3p2',
    name: 'DeepSeek V3.2',
    description: 'DeepSeek latest model'
  }
};

export const DEFAULT_MODEL = 'minimax-m2p1';

// For backward compatibility
export const FIREWORKS_MODEL = AVAILABLE_MODELS[DEFAULT_MODEL].id;

export function getApiKey() {
  const keyPath = join(__dirname, '../../fireworks_api.key');
  return readFileSync(keyPath, 'utf-8').trim();
}

export const LLM_CONFIG = {
  temperature: 0.7,
  max_tokens: 4096,
  top_p: 1,
  top_k: 40,
  presence_penalty: 0,
  frequency_penalty: 0
};
