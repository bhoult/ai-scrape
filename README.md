# AI Scrape & Research Tools

A collection of tools for web scraping and AI-powered research synthesis.

## Tools

### research.rb

An AI research assistant that searches the web, fetches and processes content, then synthesizes research findings using an LLM.

#### Features

- Automated web search via SearXNG
- Intelligent URL selection using LLM
- Content fetching with HTTP and Playwright fallback
- LLM-based content cleaning and relevance scoring (1-100)
- Parallel processing for efficiency
- Iterative fetching until minimum relevant articles found
- Comprehensive logging of all stages
- Final synthesis with source citations
- **Supports both local LLM (LM Studio) and Fireworks AI (MiniMax-M2)**

#### Usage

```bash
./research.rb [--fireworks] "your research question here"
```

#### Options

| Option | Description |
|--------|-------------|
| `--fireworks`, `-f` | Use Fireworks AI (MiniMax-M2) instead of local LLM |

#### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SEARXNG_URL` | `http://localhost:8080` | SearXNG instance URL |
| `LLM_URL` | `http://127.0.0.1:1234/v1/chat/completions` | Local LLM API URL |
| `LLM_MODEL` | `mistral-nemo-instruct-2407` | Model name to use |
| `LLM_CONTEXT_LENGTH` | `34523` | Context length for model loading |
| `SEARXNG_CONTAINER` | `searxng` | Docker container name for SearXNG |
| `LMS_CLI_PATH` | `~/.lmstudio/bin/lms` | Path to LM Studio CLI |
| `LM_STUDIO_APP` | `~/Downloads/LM-Studio-*.AppImage` | Path to LM Studio app |
| `SCRAPE_JS_PATH` | `./scrape.js` | Path to Playwright scraper |
| `LOG_DIR` | `./logs` | Directory for log files |
| `MINIMUM_RELEVANCE` | `30` | Discard articles below this score (1-100) |
| `MINIMUM_RELEVANT_ARTICLES` | `10` | Keep fetching until this many relevant articles |

#### Examples

```bash
# Basic usage (local LLM via LM Studio)
./research.rb "What are the best practices for Ruby error handling?"

# Use Fireworks AI instead of local LLM
./research.rb --fireworks "What are the best practices for Ruby error handling?"
./research.rb -f "your question"

# With custom thresholds
MINIMUM_RELEVANCE=50 MINIMUM_RELEVANT_ARTICLES=5 ./research.rb "your question"

# Fireworks AI with custom thresholds
MINIMUM_RELEVANCE=40 ./research.rb --fireworks "your question"
```

#### Output

Results are saved to the `logs/` directory:
- `SOURCES.txt` - List of sources with relevance scores
- `RESEARCH_FINDINGS.txt` - Final synthesized answer
- `cleaned/` - Processed content for relevant articles
- `irrelevant/` - Discarded low-relevance articles
- `nokogiri/` and `scrape.js/` - Raw scraped content

---

### scrape.js

A web scraper that extracts readable content from URLs or local HTML files using Playwright and Mozilla's Readability library. Optionally processes content through an LLM for cleanup.

#### Features

- Fetches pages using Playwright (handles JavaScript-heavy sites)
- Extracts main content using Mozilla Readability
- Optional LLM processing via Fireworks AI or local Ollama
- Supports streaming responses for large content

#### Usage

```bash
node scrape.js <url|file> [model] [extra_prompt]
```

#### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `url\|file` | Yes | URL to fetch or path to local HTML file |
| `model` | No | LLM model: `minimax`, `deepseek`, or Ollama model name |
| `extra_prompt` | No | Additional instructions for the LLM |

#### Models

- **No model**: Outputs extracted content directly
- **`minimax`**: Uses Fireworks AI minimax-m2p1 model
- **`deepseek`**: Uses Fireworks AI deepseek-v3p2 model (streaming)
- **Other**: Uses local Ollama with specified model name

#### Examples

```bash
# Extract content only (no LLM processing)
node scrape.js https://example.com/article

# Process with Fireworks AI (minimax)
node scrape.js https://example.com/article minimax

# Process with Fireworks AI (deepseek) with extra instructions
node scrape.js https://example.com/article deepseek "Focus on code examples"

# Process with local Ollama
node scrape.js https://example.com/article llama2

# Process a local HTML file
node scrape.js ./saved-page.html minimax
```

#### API Key

For Fireworks AI models, create a file named `fireworks_api.key` in the project directory containing your API key. This file is used by both `scrape.js` (for `minimax`/`deepseek` models) and `research.rb` (when using `--fireworks` flag).

---

### format.js

A utility script for formatting content (see source for details).

## Requirements

- Ruby 3.x (for research.rb)
- Node.js 18+ (for scrape.js)
- Docker (for SearXNG)
- LM Studio or compatible local LLM server (not required if using `--fireworks`)
- Fireworks AI API key (only if using `--fireworks` flag or Fireworks models in scrape.js)

### Node Dependencies

```bash
npm install
```

Required packages:
- `playwright` - Browser automation
- `@mozilla/readability` - Content extraction
- `jsdom` - DOM parsing

### SearXNG Setup

Run SearXNG in Docker with JSON format enabled:

```bash
docker run -d --name searxng -p 8080:8080 searxng/searxng
```

Ensure your SearXNG settings enable JSON output format.

## License

MIT
