#!/usr/bin/env ruby
# frozen_string_literal: true

# ==============================================================================
# AI Research Assistant
# ==============================================================================
# A tool that searches the web, fetches and processes content, then synthesizes
# research findings using a local LLM. Uses SearXNG for search and LM Studio
# for LLM inference.
# ==============================================================================

require 'net/http'
require 'json'
require 'uri'
require 'nokogiri'
require 'timeout'
require 'open3'

# ==============================================================================
# CONFIGURATION - Service URLs and Paths
# ==============================================================================
SEARXNG_URL = ENV.fetch('SEARXNG_URL', 'http://localhost:8080')
LLM_URL = ENV.fetch('LLM_URL', 'http://127.0.0.1:1234/v1/chat/completions')
LLM_MODEL = ENV.fetch('LLM_MODEL', 'mistral-nemo-instruct-2407')
LLM_CONTEXT_LENGTH = ENV.fetch('LLM_CONTEXT_LENGTH', '34523').to_i
SEARXNG_CONTAINER = ENV.fetch('SEARXNG_CONTAINER', 'searxng')
LMS_CLI_PATH = ENV.fetch('LMS_CLI_PATH', File.expand_path('~/.lmstudio/bin/lms'))
LM_STUDIO_APP = ENV.fetch('LM_STUDIO_APP', File.expand_path('~/Downloads/LM-Studio-0.3.37-1-x64.AppImage'))
SCRAPE_JS_PATH = ENV.fetch('SCRAPE_JS_PATH', File.expand_path('scrape.js', __dir__))
LOG_DIR = ENV.fetch('LOG_DIR', File.expand_path('logs', __dir__))

# ==============================================================================
# CONFIGURATION - Content Extraction
# ==============================================================================
MAX_CONTENT_LENGTH = 30_000  # Max chars per page to send to LLM
FETCH_TIMEOUT = 20           # Seconds to wait for page fetch
MAX_PARALLEL_FETCHES = 10    # Concurrent fetches

# ==============================================================================
# CONFIGURATION - Relevance Filtering
# ==============================================================================
MINIMUM_RELEVANCE = ENV.fetch('MINIMUM_RELEVANCE', '30').to_i        # Discard articles below this score (1-100)
MINIMUM_RELEVANT_ARTICLES = ENV.fetch('MINIMUM_RELEVANT_ARTICLES', '10').to_i  # Keep fetching until we have this many

# ==============================================================================
# LLM PROMPTS
# ==============================================================================

# Prompt for cleaning and scoring web page content
CLEAN_CONTENT_SYSTEM_PROMPT = <<~PROMPT
  You are a research assistant. Given a question and web page content, your task is to:
  1. Remove any information not related to the question (ads, navigation, boilerplate, unrelated sections)
  2. Clean up and format the remaining relevant content clearly
  3. Score the relevance of this content to the question from 1-100

  IMPORTANT: Do NOT summarize. Keep all relevant information intact, just remove the irrelevant parts and format cleanly.

  IMPORTANT: Content must contain actual ANSWERS or INFORMATION, not just questions.
  - A forum post asking a question without answers = relevance_score: 0
  - A page with only questions and no substantive answers = relevance_score: 0
  - Only content that provides actual information relevant to the research question should score above 0

  Respond with ONLY valid JSON in this exact format:
  {"cleaned_content": "the cleaned and formatted content here", "relevance_score": 85}

  If the content has no relevant information or only contains unanswered questions, return:
  {"cleaned_content": "", "relevance_score": 0}
PROMPT

CLEAN_CONTENT_USER_PROMPT = <<~PROMPT
  Question: %{question}

  Source Title: %{title}
  Source URL: %{url}

  Content:
  %{content}

  Remove irrelevant content, format cleanly, and score relevance. Do NOT summarize.
PROMPT

# Prompt for selecting the most relevant URLs from search results
SELECT_URLS_SYSTEM_PROMPT = <<~PROMPT
  You are a research assistant. Given a question and a list of search results (title, URL, snippet),
  select the %{max_urls} most relevant and promising URLs to fetch full content from.

  Consider:
  - Relevance to the question
  - Source credibility (prefer authoritative sources)
  - Diversity of perspectives
  - Likelihood of containing detailed information

  Respond with ONLY a JSON array of the selected URL strings, nothing else.
  Example: ["https://example.com/page1", "https://example.com/page2"]
PROMPT

SELECT_URLS_USER_PROMPT = <<~PROMPT
  Question: %{question}

  Search Results:
  %{results_text}

  Select the %{max_urls} best URLs to fetch full content from.
PROMPT

# Prompt for planning search queries
PLAN_SEARCHES_SYSTEM_PROMPT = <<~PROMPT
  You are a research planning assistant. Given a user's question, determine the best web search queries to find comprehensive information.

  Respond with ONLY a JSON array of search query strings, nothing else. Generate 3-5 targeted search queries that will cover different aspects of the question.

  Example response format:
  ["search query 1", "search query 2", "search query 3"]
PROMPT

PLAN_SEARCHES_USER_PROMPT = "Question: %{question}\n\nWhat search queries should I use to research this thoroughly?"

# Prompt for final research synthesis
RESEARCH_SYNTHESIS_SYSTEM_PROMPT = <<~PROMPT
  You are a research assistant. Analyze the provided sources and give a comprehensive,
  accurate answer to the user's question. Each source has been pre-processed to remove
  irrelevant content and scored for relevance (shown in parentheses).
  Cite sources using [1], [2], etc. when referencing specific information.
  Prioritize information from higher-relevance sources. Be objective and note any conflicting information found.
PROMPT

RESEARCH_SYNTHESIS_USER_PROMPT = <<~PROMPT
  Question: %{question}

  Sources:
  %{sources}

  Based on these sources, provide a comprehensive answer to the question.
PROMPT

# ==============================================================================
# LOG DIRECTORY INITIALIZATION
# ==============================================================================
Dir.mkdir(LOG_DIR) unless Dir.exist?(LOG_DIR)
%w[nokogiri scrape.js cleaned irrelevant].each do |subfolder|
  subdir = File.join(LOG_DIR, subfolder)
  Dir.mkdir(subdir) unless Dir.exist?(subdir)
  Dir.glob(File.join(subdir, '*.txt')).each { |f| File.delete(f) }
end
# Clear LLM prompt logs and results files from root log directory
Dir.glob(File.join(LOG_DIR, '*_llm_prompt.txt')).each { |f| File.delete(f) }
%w[SOURCES.txt RESEARCH_FINDINGS.txt].each do |filename|
  filepath = File.join(LOG_DIR, filename)
  File.delete(filepath) if File.exist?(filepath)
end

SESSION_TIMESTAMP = Time.now.strftime('%Y%m%d_%H%M%S')

# ==============================================================================
# LOGGING FUNCTIONS
# ==============================================================================

# Log raw scraped content from web pages
def log_scraped_content(url, content, method:)
  return if content.nil? || content.empty?

  # Determine subfolder based on method
  subfolder = method == 'playwright' ? 'scrape.js' : 'nokogiri'
  log_subdir = File.join(LOG_DIR, subfolder)
  Dir.mkdir(log_subdir) unless Dir.exist?(log_subdir)

  # Create a safe filename from URL
  safe_name = url.gsub(%r{https?://}, '').gsub(/[^a-zA-Z0-9]/, '_')[0, 50]
  timestamp = Time.now.strftime('%H%M%S')
  filename = "#{SESSION_TIMESTAMP}_#{timestamp}_#{safe_name}.txt"
  filepath = File.join(log_subdir, filename)

  File.open(filepath, 'w') do |f|
    f.puts "URL: #{url}"
    f.puts "Method: #{method}"
    f.puts "Timestamp: #{Time.now.iso8601}"
    f.puts "Content Length: #{content.length} chars"
    f.puts "=" * 60
    f.puts content
  end
rescue StandardError => e
  warn "  Failed to log content: #{e.message}"
end

# Log scraping errors
def log_scrape_error(url, error_output, method:)
  return if error_output.nil? || error_output.strip.empty?

  subfolder = method == 'playwright' ? 'scrape.js' : 'nokogiri'
  log_subdir = File.join(LOG_DIR, subfolder)
  Dir.mkdir(log_subdir) unless Dir.exist?(log_subdir)

  safe_name = url.gsub(%r{https?://}, '').gsub(/[^a-zA-Z0-9]/, '_')[0, 50]
  timestamp = Time.now.strftime('%H%M%S')
  filename = "#{SESSION_TIMESTAMP}_#{timestamp}_ERROR_#{safe_name}.txt"
  filepath = File.join(log_subdir, filename)

  File.open(filepath, 'w') do |f|
    f.puts "URL: #{url}"
    f.puts "Method: #{method}"
    f.puts "Timestamp: #{Time.now.iso8601}"
    f.puts "Status: ERROR"
    f.puts "=" * 60
    f.puts error_output
  end
rescue StandardError => e
  warn "  Failed to log error: #{e.message}"
end

# Log both original and LLM-cleaned content for comparison
def log_cleaned_content(url, title, original_content, cleaned_content, relevance_score)
  return if original_content.nil? || original_content.empty?

  log_subdir = File.join(LOG_DIR, 'cleaned')
  Dir.mkdir(log_subdir) unless Dir.exist?(log_subdir)

  safe_name = url.gsub(%r{https?://}, '').gsub(/[^a-zA-Z0-9]/, '_')[0, 50]
  timestamp = Time.now.strftime('%H%M%S')
  filename = "#{SESSION_TIMESTAMP}_#{timestamp}_#{safe_name}.txt"
  filepath = File.join(log_subdir, filename)

  File.open(filepath, 'w') do |f|
    f.puts "URL: #{url}"
    f.puts "Title: #{title}"
    f.puts "Timestamp: #{Time.now.iso8601}"
    f.puts "Relevance Score: #{relevance_score}/100"
    f.puts "Original Length: #{original_content.length} chars"
    f.puts "Cleaned Length: #{cleaned_content&.length || 0} chars"
    f.puts ""
    f.puts "=" * 60
    f.puts "ORIGINAL CONTENT"
    f.puts "=" * 60
    f.puts original_content
    f.puts ""
    f.puts "=" * 60
    f.puts "CLEANED CONTENT (Relevance: #{relevance_score}/100)"
    f.puts "=" * 60
    f.puts cleaned_content || "(No relevant content)"
  end
rescue StandardError => e
  warn "  Failed to log cleaned content: #{e.message}"
end

# Move log files for irrelevant articles to the irrelevant folder
def move_log_to_irrelevant(url)
  safe_name = url.gsub(%r{https?://}, '').gsub(/[^a-zA-Z0-9]/, '_')[0, 50]
  cleaned_dir = File.join(LOG_DIR, 'cleaned')
  irrelevant_dir = File.join(LOG_DIR, 'irrelevant')

  # Find matching log file in cleaned folder
  pattern = File.join(cleaned_dir, "*_#{safe_name}.txt")
  matching_files = Dir.glob(pattern)

  matching_files.each do |source_path|
    filename = File.basename(source_path)
    dest_path = File.join(irrelevant_dir, filename)
    File.rename(source_path, dest_path)
  end
rescue StandardError => e
  warn "  Failed to move log to irrelevant: #{e.message}"
end

# Log the full LLM prompt for debugging
def log_llm_prompt(question, system_prompt, user_prompt)
  timestamp = Time.now.strftime('%H%M%S')
  filename = "#{SESSION_TIMESTAMP}_#{timestamp}_llm_prompt.txt"
  filepath = File.join(LOG_DIR, filename)

  File.open(filepath, 'w') do |f|
    f.puts "Question: #{question}"
    f.puts "Timestamp: #{Time.now.iso8601}"
    f.puts "System Prompt Length: #{system_prompt.length} chars"
    f.puts "User Prompt Length: #{user_prompt.length} chars"
    f.puts "Total Length: #{system_prompt.length + user_prompt.length} chars"
    f.puts ""
    f.puts "=" * 60
    f.puts "SYSTEM PROMPT"
    f.puts "=" * 60
    f.puts system_prompt
    f.puts ""
    f.puts "=" * 60
    f.puts "USER PROMPT"
    f.puts "=" * 60
    f.puts user_prompt
  end
rescue StandardError => e
  warn "  Failed to log LLM prompt: #{e.message}"
end

# ==============================================================================
# SERVICE MANAGEMENT
# ==============================================================================

# Check if a service is available at the given URL
def service_available?(url, timeout: 2)
  uri = URI(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = (uri.scheme == 'https')
  http.open_timeout = timeout
  http.read_timeout = timeout
  http.head(uri.path.empty? ? '/' : uri.path)
  true
rescue StandardError
  false
end

# Start the SearXNG Docker container
def start_searxng
  puts "Starting SearXNG container..."
  result = system("docker start #{SEARXNG_CONTAINER} > /dev/null 2>&1")
  unless result
    warn "Failed to start SearXNG container '#{SEARXNG_CONTAINER}'"
    return false
  end

  # Wait for it to be ready
  10.times do
    sleep 1
    if service_available?(SEARXNG_URL)
      puts "SearXNG is ready."
      return true
    end
    print "."
  end
  warn "\nSearXNG failed to start in time."
  false
end

# Start LM Studio and load the configured model
def start_lm_studio
  puts "Starting LM Studio..."

  unless File.exist?(LM_STUDIO_APP)
    warn "LM Studio app not found at #{LM_STUDIO_APP}"
    return false
  end

  # Check if LM Studio is already running (look for the actual binary, not shell commands)
  lm_running = `ps aux | grep -E "/tmp/\\.mount_LM-Stu.*/lm-studio" | grep -v grep | awk '{print $2}' | head -1`.strip
  if lm_running.empty?
    puts "Launching LM Studio..."
    spawn(LM_STUDIO_APP, [:out, :err] => '/dev/null')
  else
    puts "LM Studio already running (PID: #{lm_running})."
  end

  # Wait for the API to be available (autoStartOnLaunch is enabled in config)
  print "Waiting for LM Studio API"
  40.times do
    sleep 1.5
    if service_available?(LLM_URL)
      puts "\nLM Studio API is ready."

      # Load model if needed (using CLI if available)
      if File.exist?(LMS_CLI_PATH)
        # Update CLI config with current app path
        app_path = `ps aux | grep "[l]m-studio" | head -1 | awk '{print $11}'`.strip
        if app_path && !app_path.empty?
          config_file = File.expand_path('~/.lmstudio/.internal/app-install-location.json')
          config = { path: app_path, argv: [app_path], cwd: Dir.pwd }
          File.write(config_file, config.to_json)
        end

        loaded = `#{LMS_CLI_PATH} ps 2>&1`
        if loaded.include?('No models are loaded')
          puts "Loading model: #{LLM_MODEL} (context: #{LLM_CONTEXT_LENGTH})..."
          system("#{LMS_CLI_PATH} load #{LLM_MODEL} --yes --context-length #{LLM_CONTEXT_LENGTH} 2>&1")
          sleep 5
        end
      end

      return true
    end
    print "."
  end

  warn "\nLM Studio API not available. Make sure a model is loaded and server is started."
  false
end

# Ensure both SearXNG and LM Studio are running
def ensure_services_running
  services_ok = true

  unless service_available?(SEARXNG_URL)
    services_ok = start_searxng && services_ok
  end

  unless service_available?(LLM_URL)
    services_ok = start_lm_studio && services_ok
  end

  services_ok
end

# ==============================================================================
# WEB SEARCH
# ==============================================================================

# Search the web using SearXNG
def search_web(query, num_results: 100)
  uri = URI("#{SEARXNG_URL}/search")
  params = {
    q: query,
    format: 'json',
    categories: 'general',
    engines: 'google,bing,duckduckgo'
  }
  uri.query = URI.encode_www_form(params)

  response = Net::HTTP.get_response(uri)

  unless response.is_a?(Net::HTTPSuccess)
    warn "SearXNG search failed: #{response.code} #{response.message}"
    return []
  end

  data = JSON.parse(response.body)
  results = data['results'] || []

  results.take(num_results).map do |r|
    {
      title: r['title'],
      url: r['url'],
      content: r['content']
    }
  end
rescue StandardError => e
  warn "Search error: #{e.message}"
  []
end

# ==============================================================================
# CONTENT FETCHING
# ==============================================================================

# Fetch page content using Playwright (for JavaScript-heavy sites)
def fetch_with_playwright(url)
  return nil unless File.exist?(SCRAPE_JS_PATH)

  stdout, stderr, status = Open3.capture3('node', SCRAPE_JS_PATH, url)

  # Log errors if any
  unless stderr.strip.empty?
    log_scrape_error(url, stderr, method: 'playwright')
    warn "  scrape.js error for #{url}: #{stderr.lines.first&.strip}"
  end

  return nil unless status.success?
  return nil if stdout.nil? || stdout.strip.empty?

  # Truncate if too long
  content = stdout.strip
  content = content.length > MAX_CONTENT_LENGTH ? content[0, MAX_CONTENT_LENGTH] + "\n[Content truncated...]" : content

  log_scraped_content(url, content, method: 'playwright')
  content
rescue StandardError => e
  warn "  Playwright fetch failed for #{url}: #{e.message}"
  nil
end

# Fetch page content, trying HTTP first then falling back to Playwright
def fetch_page_content(url)
  # Try normal HTTP fetch first
  content = fetch_page_content_http(url)
  return content if content

  # Fall back to Playwright/scrape.js for JS-heavy sites
  warn "  Retrying with Playwright: #{url[0, 50]}..."
  fetch_with_playwright(url)
end

# Fetch page content using standard HTTP requests
def fetch_page_content_http(url)
  uri = URI(url)
  return nil unless uri.is_a?(URI::HTTP) || uri.is_a?(URI::HTTPS)

  Timeout.timeout(FETCH_TIMEOUT) do
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = (uri.scheme == 'https')
    http.open_timeout = 5
    http.read_timeout = FETCH_TIMEOUT

    request = Net::HTTP::Get.new(uri)
    request['User-Agent'] = 'Mozilla/5.0 (compatible; ResearchBot/1.0)'
    request['Accept'] = 'text/html,application/xhtml+xml'

    response = http.request(request)

    # Follow redirects (up to 3)
    redirects = 0
    while response.is_a?(Net::HTTPRedirection) && redirects < 3
      redirect_url = response['location']
      redirect_url = URI.join(url, redirect_url).to_s if redirect_url.start_with?('/')
      uri = URI(redirect_url)
      http = Net::HTTP.new(uri.host, uri.port)
      http.use_ssl = (uri.scheme == 'https')
      request = Net::HTTP::Get.new(uri)
      request['User-Agent'] = 'Mozilla/5.0 (compatible; ResearchBot/1.0)'
      response = http.request(request)
      redirects += 1
    end

    return nil unless response.is_a?(Net::HTTPSuccess)
    return nil unless response.content_type&.include?('text/html')

    content = extract_main_content(response.body)
    log_scraped_content(url, content, method: 'http') if content
    content
  end
rescue StandardError => e
  warn "  HTTP fetch failed for #{url}: #{e.message}"
  nil
end

# ==============================================================================
# HTML CONTENT EXTRACTION
# ==============================================================================

# Extract main content from HTML, removing navigation and other noise
def extract_main_content(html)
  doc = Nokogiri::HTML(html)

  # Remove non-content elements
  %w[script style nav header footer aside iframe noscript svg
     .sidebar .navigation .menu .advertisement .ads .comments
     #sidebar #nav #header #footer #comments].each do |selector|
    doc.css(selector).remove
  end

  # Try to find main content area
  main_content = doc.at_css('main, article, [role="main"], .content, .post, .entry, #content, #main')
  content_node = main_content || doc.at_css('body')

  return nil unless content_node

  # Extract text, preserving some structure
  text = extract_text_with_structure(content_node)

  # Clean up whitespace
  text = text.gsub(/\n{3,}/, "\n\n").gsub(/[ \t]+/, ' ').strip

  # Truncate if too long
  text.length > MAX_CONTENT_LENGTH ? text[0, MAX_CONTENT_LENGTH] + "\n[Content truncated...]" : text
end

# Recursively extract text while preserving document structure
def extract_text_with_structure(node)
  result = []

  node.children.each do |child|
    case child.name
    when 'text'
      text = child.text.strip
      result << text unless text.empty?
    when 'p', 'div', 'section', 'article'
      inner = extract_text_with_structure(child)
      result << "\n#{inner}\n" unless inner.strip.empty?
    when 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'
      inner = child.text.strip
      result << "\n## #{inner}\n" unless inner.empty?
    when 'li'
      inner = extract_text_with_structure(child)
      result << "• #{inner}" unless inner.strip.empty?
    when 'br'
      result << "\n"
    when 'a', 'span', 'strong', 'em', 'b', 'i', 'code'
      inner = extract_text_with_structure(child)
      result << inner unless inner.strip.empty?
    else
      inner = extract_text_with_structure(child)
      result << inner unless inner.strip.empty?
    end
  end

  result.join(' ')
end

# ==============================================================================
# PARALLEL PROCESSING
# ==============================================================================

# Fetch multiple pages in parallel using a thread pool
def fetch_pages_parallel(results)
  return [] if results.empty?

  queue = Queue.new
  results.each { |r| queue << r }

  fetched = []
  mutex = Mutex.new

  threads = MAX_PARALLEL_FETCHES.times.map do
    Thread.new do
      while (result = queue.pop(true) rescue nil)
        puts "  Fetching: #{result[:url][0, 60]}..."
        content = fetch_page_content(result[:url])
        mutex.synchronize do
          fetched << result.merge(full_content: content)
        end
      end
    end
  end

  threads.each(&:join)
  fetched
end

# ==============================================================================
# CONTENT PROCESSING
# ==============================================================================

# Clean content and score relevance using the LLM
def clean_and_score_content(result, question)
  return result unless result[:full_content]

  user_prompt = format(CLEAN_CONTENT_USER_PROMPT,
    question: question,
    title: result[:title],
    url: result[:url],
    content: result[:full_content]
  )

  response = query_llm(user_prompt, system_prompt: CLEAN_CONTENT_SYSTEM_PROMPT)
  return result.merge(cleaned_content: nil, relevance_score: 0) unless response

  # Parse JSON response
  json_match = response.match(/\{.*\}/m)
  return result.merge(cleaned_content: nil, relevance_score: 0) unless json_match

  parsed = JSON.parse(json_match[0])
  cleaned_content = parsed['cleaned_content']
  relevance_score = parsed['relevance_score'].to_i

  # Log both original and cleaned content
  log_cleaned_content(
    result[:url],
    result[:title],
    result[:full_content],
    cleaned_content,
    relevance_score
  )

  result.merge(
    cleaned_content: cleaned_content,
    relevance_score: relevance_score
  )
rescue StandardError => e
  warn "  Content cleaning failed for #{result[:url]}: #{e.message}"
  result.merge(cleaned_content: nil, relevance_score: 0)
end

# Process multiple results in parallel, cleaning and scoring each
def process_results_parallel(results, question)
  return [] if results.empty?

  queue = Queue.new
  results.each { |r| queue << r }

  processed = []
  mutex = Mutex.new

  threads = MAX_PARALLEL_FETCHES.times.map do
    Thread.new do
      while (result = queue.pop(true) rescue nil)
        next unless result[:full_content]

        puts "  Cleaning: #{result[:url][0, 60]}..."
        cleaned = clean_and_score_content(result, question)
        mutex.synchronize do
          processed << cleaned
        end
      end
    end
  end

  threads.each(&:join)

  # Sort by relevance score descending
  processed.sort_by { |r| -(r[:relevance_score] || 0) }
end

# ==============================================================================
# URL SELECTION
# ==============================================================================

# Use LLM to select the most promising URLs from search results
def select_urls_for_scraping(results, question, max_urls: 8)
  return results if results.length <= max_urls

  results_text = results.each_with_index.map do |r, i|
    "[#{i + 1}] #{r[:title]}\nURL: #{r[:url]}\n#{r[:content]}"
  end.join("\n\n")

  system_prompt = format(SELECT_URLS_SYSTEM_PROMPT, max_urls: max_urls)
  user_prompt = format(SELECT_URLS_USER_PROMPT,
    question: question,
    results_text: results_text,
    max_urls: max_urls
  )

  response = query_llm(user_prompt, system_prompt: system_prompt)
  return results.take(max_urls) unless response

  json_match = response.match(/\[.*\]/m)
  return results.take(max_urls) unless json_match

  selected_urls = JSON.parse(json_match[0])
  selected = results.select { |r| selected_urls.include?(r[:url]) }

  # Fallback if parsing failed
  selected.empty? ? results.take(max_urls) : selected
rescue StandardError => e
  warn "URL selection failed: #{e.message}"
  results.take(max_urls)
end

# ==============================================================================
# UTILITY FUNCTIONS
# ==============================================================================

# Format search results for display or LLM input
def format_search_results(results, include_full_content: false)
  return "No search results found." if results.empty?

  results.each_with_index.map do |r, i|
    if include_full_content && r[:full_content]
      <<~RESULT
        [#{i + 1}] #{r[:title]}
        URL: #{r[:url]}

        #{r[:full_content]}

        ---
      RESULT
    else
      <<~RESULT
        [#{i + 1}] #{r[:title]}
        URL: #{r[:url]}
        #{r[:content]}
      RESULT
    end
  end.join("\n")
end

# Send a prompt to the local LLM and return the response
def query_llm(prompt, system_prompt: nil)
  uri = URI(LLM_URL)

  messages = []
  messages << { role: 'system', content: system_prompt } if system_prompt
  messages << { role: 'user', content: prompt }

  body = {
    model: LLM_MODEL,
    messages: messages,
    temperature: 0.7,
    max_tokens: 34000 #2048
  }

  http = Net::HTTP.new(uri.host, uri.port)
  http.read_timeout = 120

  request = Net::HTTP::Post.new(uri)
  request['Content-Type'] = 'application/json'
  request.body = body.to_json

  response = http.request(request)

  unless response.is_a?(Net::HTTPSuccess)
    warn "LLM request failed: #{response.code} #{response.message}"
    return nil
  end

  data = JSON.parse(response.body)
  data.dig('choices', 0, 'message', 'content')
rescue StandardError => e
  warn "LLM error: #{e.message}"
  nil
end

# ==============================================================================
# RESEARCH PLANNING
# ==============================================================================

# Use LLM to generate effective search queries for a research question
def plan_searches(question)
  user_prompt = format(PLAN_SEARCHES_USER_PROMPT, question: question)
  response = query_llm(user_prompt, system_prompt: PLAN_SEARCHES_SYSTEM_PROMPT)
  return nil unless response

  # Extract JSON array from response
  json_match = response.match(/\[.*\]/m)
  return nil unless json_match

  JSON.parse(json_match[0])
rescue JSON::ParserError => e
  warn "Failed to parse search queries: #{e.message}"
  nil
end

# ==============================================================================
# MAIN RESEARCH FUNCTION
# ==============================================================================

# Main entry point: orchestrates the full research workflow
def research(question)
  puts "Researching: #{question}\n\n"

  # Step 0: Ensure services are running
  unless ensure_services_running
    puts "Required services are not available. Exiting."
    return
  end
  puts ""

  # Step 1: Ask LLM to plan search queries
  puts "Planning search strategy..."
  search_queries = plan_searches(question)

  if search_queries.nil? || search_queries.empty?
    puts "Failed to generate search queries. Falling back to direct search."
    search_queries = [question]
  end

  puts "Search queries to execute:"
  search_queries.each_with_index { |q, i| puts "  #{i + 1}. #{q}" }
  puts

  # Step 2: Execute all searches
  all_results = []
  search_queries.each do |query|
    puts "Searching: #{query}"
    results = search_web(query)
    puts "  Found #{results.length} results"
    all_results.concat(results)
  end

  # Deduplicate by URL
  all_results.uniq! { |r| r[:url] }

  if all_results.empty?
    puts "\nNo search results found. Cannot proceed with research."
    return
  end

  puts "\nTotal unique results: #{all_results.length}"
  puts "Target: #{MINIMUM_RELEVANT_ARTICLES} articles with relevance >= #{MINIMUM_RELEVANCE}\n"

  # Step 3: Fetch and process articles until we have enough relevant ones
  remaining_results = all_results.dup
  relevant_results = []
  batch_number = 0

  while relevant_results.length < MINIMUM_RELEVANT_ARTICLES && !remaining_results.empty?
    batch_number += 1
    puts "\n--- Batch #{batch_number} ---"

    # Select next batch of URLs to fetch
    puts "Selecting sources from #{remaining_results.length} remaining..."
    selected_results = select_urls_for_scraping(remaining_results, question)
    puts "Selected #{selected_results.length} sources to fetch.\n"

    # Remove selected from remaining pool
    selected_urls = selected_results.map { |r| r[:url] }
    remaining_results.reject! { |r| selected_urls.include?(r[:url]) }

    # Fetch content
    puts "Fetching full page content..."
    fetched_results = fetch_pages_parallel(selected_results)
    successful_fetches = fetched_results.count { |r| r[:full_content] }
    puts "Successfully fetched content from #{successful_fetches}/#{fetched_results.length} pages.\n"

    # Clean and score
    puts "Cleaning content and scoring relevance..."
    processed_results = process_results_parallel(fetched_results, question)

    # Filter by minimum relevance and add to collection
    batch_relevant = processed_results.select { |r| r[:relevance_score] && r[:relevance_score] >= MINIMUM_RELEVANCE }
    batch_irrelevant = processed_results.select { |r| r[:relevance_score].nil? || r[:relevance_score] < MINIMUM_RELEVANCE }
    relevant_results.concat(batch_relevant)

    # Move logs for irrelevant articles to irrelevant folder
    batch_irrelevant.each { |r| move_log_to_irrelevant(r[:url]) }

    puts "Batch #{batch_number}: #{batch_relevant.length} relevant, #{batch_irrelevant.length} discarded (< #{MINIMUM_RELEVANCE})"
    puts "Total relevant articles so far: #{relevant_results.length}/#{MINIMUM_RELEVANT_ARTICLES} needed"
  end

  # Sort all relevant results by score
  relevant_results.sort_by! { |r| -(r[:relevance_score] || 0) }

  puts "\n" + "=" * 60
  puts "Finished fetching. Found #{relevant_results.length} relevant articles."
  puts "=" * 60 + "\n\n"

  if relevant_results.empty?
    puts "No articles met the minimum relevance threshold (#{MINIMUM_RELEVANCE})."
    return
  end

  # Step 5: Format cleaned results and send to LLM for final synthesis
  formatted_results = relevant_results.each_with_index.map do |r, i|
    <<~RESULT
      [#{i + 1}] #{r[:title]} (Relevance: #{r[:relevance_score]}/100)
      URL: #{r[:url]}

      #{r[:cleaned_content]}

      ---
    RESULT
  end.join("\n")

  user_prompt = format(RESEARCH_SYNTHESIS_USER_PROMPT,
    question: question,
    sources: formatted_results
  )

  puts "Analyzing sources with LLM...\n\n"
  log_llm_prompt(question, RESEARCH_SYNTHESIS_SYSTEM_PROMPT, user_prompt)
  answer = query_llm(user_prompt, system_prompt: RESEARCH_SYNTHESIS_SYSTEM_PROMPT)

  if answer
    # Build sources text
    sources_text = relevant_results.each_with_index.map do |r, i|
      "[#{i + 1}] #{r[:title]} (Relevance: #{r[:relevance_score]}/100)\n    #{r[:url]}"
    end.join("\n")

    # Save to files
    File.write(File.join(LOG_DIR, 'SOURCES.txt'), "Question: #{question}\n\n#{sources_text}")
    File.write(File.join(LOG_DIR, 'RESEARCH_FINDINGS.txt'), "Question: #{question}\n\n#{answer}")

    # Print to console
    puts "=" * 60
    puts "SOURCES (sorted by relevance)"
    puts "=" * 60
    puts sources_text
    puts "\n" + "=" * 60
    puts "RESEARCH FINDINGS"
    puts "=" * 60
    puts answer
    puts "\n" + "=" * 60
    puts "Results saved to:"
    puts "  #{File.join(LOG_DIR, 'SOURCES.txt')}"
    puts "  #{File.join(LOG_DIR, 'RESEARCH_FINDINGS.txt')}"
  else
    puts "Failed to get response from LLM."
  end
end

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================
if ARGV.empty?
  puts "Usage: #{$PROGRAM_NAME} <question>"
  puts ""
  puts "Environment variables:"
  puts "  SEARXNG_URL              - SearXNG instance URL (default: http://localhost:8080)"
  puts "  LLM_URL                  - Local LLM API URL (default: http://localhost:1234/v1/chat/completions)"
  puts "  LLM_MODEL                - Model name to use (default: local-model)"
  puts "  MINIMUM_RELEVANCE        - Discard articles below this score, 1-100 (default: 30)"
  puts "  MINIMUM_RELEVANT_ARTICLES - Keep fetching until this many relevant articles (default: 3)"
  puts ""
  puts "Example:"
  puts "  #{$PROGRAM_NAME} \"What are the latest developments in quantum computing?\""
  exit 1
end

question = ARGV.join(' ')
research(question)
