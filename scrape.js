import { chromium } from 'playwright';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

// Strip base64 data URLs to reduce token usage when sending to LLM
function stripBase64(text) {
  // Match data URLs with base64 content (images, fonts, etc.)
  return text.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]+/g, '[base64 data removed]');
}

const input = process.argv[2];
const model = process.argv[3];
const extraPrompt = process.argv[4] || '';

if (!input) {
  console.error('Usage: node scrape.js <url|file> [model] [extra_prompt]');
  process.exit(1);
}

let html;
let sourceUrl;

// Check if input is a URL or a local file
const isUrl = input.startsWith('http://') || input.startsWith('https://');

if (isUrl) {
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(input, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(2000);
    html = await page.content();
    sourceUrl = input;
  } catch (err) {
    console.error(`Error fetching URL: ${err.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
} else {
  // Local file
  const filePath = resolve(input);
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    process.exit(1);
  }
  html = readFileSync(filePath, 'utf-8');
  sourceUrl = `file://${filePath}`;
}

const dom = new JSDOM(html, { url: sourceUrl });
const reader = new Readability(dom.window.document);
const article = reader.parse();

if (!article) {
  console.error('Could not extract readable content from page');
  process.exit(1);
}

// Use HTML content to preserve links, clean up whitespace
const cleanHtml = article.content
  .replace(/\t/g, ' ')
  .replace(/[ ]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const content = `Title: ${article.title}\n\n${cleanHtml}`;

if (!model) {
  console.log(content);
} else if (model === 'minimax') {
  // Use Fireworks AI API (minimax-m2p1 model)
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const apiKey = readFileSync(join(__dirname, 'fireworks_api.key'), 'utf-8').trim();

  const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'accounts/fireworks/models/minimax-m2p1',
      max_tokens: 4096,
      top_p: 1,
      top_k: 40,
      presence_penalty: 0,
      frequency_penalty: 0,
      temperature: 0.6,
      messages: [
        {
          role: 'system',
          content: 'You are a markdown editor. Clean up and improve the provided content, converting it to well-formatted Markdown. Fix formatting issues, remove redundant whitespace, and ensure proper markdown structure. Return ONLY the improved markdown.' + (extraPrompt ? ' Additional instructions: ' + extraPrompt : ' Preserve all the original information, do not summarize.')
        },
        {
          role: 'user',
          content: stripBase64(content)
        }
      ]
    })
  });

  const data = await response.json();
  if (data.error) {
    console.error('Fireworks API error:', data.error);
    process.exit(1);
  }
  console.log(data.choices[0].message.content);
} else if (model === 'deepseek') {
  // Use Fireworks AI API (deepseek-v3p2 model) with streaming for large responses
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const apiKey = readFileSync(join(__dirname, 'fireworks_api.key'), 'utf-8').trim();

  const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'accounts/fireworks/models/deepseek-v3p2',
      max_tokens: 20480,
      top_p: 1,
      top_k: 40,
      presence_penalty: 0,
      frequency_penalty: 0,
      temperature: 0.6,
      stream: true,
      messages: [
        {
          role: 'system',
          content: 'You are a markdown editor. Clean up and improve the provided content, converting it to well-formatted Markdown. Fix formatting issues, remove redundant whitespace, and ensure proper markdown structure. Return ONLY the improved markdown.' + (extraPrompt ? ' Additional instructions: ' + extraPrompt : ' Preserve all the original information, do not summarize.')
        },
        {
          role: 'user',
          content: stripBase64(content)
        }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Fireworks API error:', error);
    process.exit(1);
  }

  // Handle streaming response
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value);
    const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

    for (const line of lines) {
      const data = line.slice(6); // Remove 'data: ' prefix
      if (data === '[DONE]') break;

      try {
        const parsed = JSON.parse(data);
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) process.stdout.write(content);
      } catch (e) {
        // Skip invalid JSON
      }
    }
  }
  console.log(); // Final newline
} else {
  // Use Ollama (local)
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a markdown editor. Clean up and improve the provided content, converting it to well-formatted Markdown. Fix formatting issues, remove redundant whitespace, and ensure proper markdown structure. Return ONLY the improved markdown.' + (extraPrompt ? ' Additional instructions: ' + extraPrompt : ' Preserve all the original information, do not summarize.')
        },
        {
          role: 'user',
          content: stripBase64(content)
        }
      ],
      stream: false
    })
  });

  const data = await response.json();
  if (data.error) {
    console.error('Ollama error:', data.error);
    process.exit(1);
  }
  console.log(data.message.content);
}
