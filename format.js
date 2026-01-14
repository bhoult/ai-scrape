import { stdin } from 'process';

const model = process.argv[2] || 'llama3.2';

let input = '';
for await (const chunk of stdin) {
  input += chunk;
}

const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model,
    prompt: `Clean up and format the following text. Remove any navigation elements, ads, or other noise. Output only the cleaned article content with proper formatting:\n\n${input}`,
    stream: false
  })
});

const data = await response.json();
console.log(data.response);
