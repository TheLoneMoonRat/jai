# Jay Persona Simulator 🤖

This project is a multi-stage AI Discord bot designed to scrape the chat history of a specific target user, chunk it, index it using a custom Vector Search, and simulate that user's persona in live chat using Gemini.

## 🚀 Features Implemented

### 1. High-Performance Discord Scraping
Bypassed Discord's standard 10,000-message offset pagination limit by utilizing the `messages/search` API endpoint with chronological `min_id` sliding. This allows lightning-fast scraping of all historical messages sent by a target user across an entire server, safely appending to a `.jsonl` file in real-time.

### 2. Conversational Chunking Strategies
Developed multiple strategies to group raw messages into contextual "chunks" suitable for AI ingestion:
- **15-Minute Conversational Chunks:** Groups messages sent in the same channel within a 15-minute window.
- **2-Hour Windows:** Groups messages into strict 2-hour blocks.
- **Daily Windows:** Groups messages by UTC calendar day.
- **2-Day Windows:** Groups messages into 48-hour blocks.

### 3. Keyword TF-IDF Analysis & Local Vector Database
- Built an internal analytical engine using `tiktoken` to count tokens and analyze keyword viability.
- Created a **Local Sparse Vector Database** (`retriever.js`) built on TF-IDF scoring. It extracts the top 15 most defining keywords for every conversational chunk, stores them as metadata, and uses an Inverted Index for lightning-fast RAG (Retrieval-Augmented Generation) lookups.

### 4. AI Query Expansion & Context Analysis
Implemented a "two-stage" AI pipeline:
1. **Query Expander (Gemini 2.5 Flash):** When the bot receives a prompt, it feeds the last 100 messages to Gemini 2.5 Flash via a JSON-structured mini-prompt. The AI extrapolates related keywords, synonyms, and evaluates temporal context (e.g., expanding "this term" into "course, study, term, class").
2. **Database Search:** These expanded keywords are passed to the Local Vector Database to pull the absolute most relevant historical conversation chunks.

### 5. Gemini 3.0 Persona Generation
The final RAG context, the temporal analysis, up to 100 random baseline persona quotes, and the full chat history are packaged into a massive prompt and sent to `gemini-3.0-flash`. The model mimics the target user's syntax, lowercase habits, slang, and specific knowledge to formulate a hyper-realistic response.

### 6. Local Testing UI Simulator
Built an Express/HTML local web simulator (`server.js`) that mimics Discord's interface. 
- Run the simulator to tweak generation parameters (Temperature, Top P, Top K Context chunks, Persona Examples) in real-time.
- Features a Debug Panel to visualize exactly what keywords the Query Expander extracted and what RAG chunks were retrieved.

## 🛠️ How to Run

### Local Testing Web Simulator
To test the bot, tweak parameters, and view debug context in your browser:
```bash
node server.js
```
Then navigate to `http://localhost:3000`.

### Live Discord Bot
To run the live bot in your Discord server (listening for `@mentions`):
```bash
npm start
```
*(Or run `node index.js`)*

## Prerequisites
- Node.js (v18+)
- A Discord Bot Token (set as `DISCORD_TOKEN` in `.env`)
- A Google Gemini API Key (set as `GEMINI_API_KEY` in `.env`)
