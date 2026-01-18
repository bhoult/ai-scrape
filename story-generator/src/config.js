import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const FIREWORKS_API_URL = 'https://api.fireworks.ai/inference/v1/chat/completions';
export const FIREWORKS_MODEL = 'accounts/fireworks/models/minimax-m2p1';

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
