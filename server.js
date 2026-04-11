const express = require("express");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { LocalSparseVectorDB } = require("./retriever.js");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static("public"));

// Initialize Gemini (switching to gemini-3.0-flash as requested)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Load the DB
const db = new LocalSparseVectorDB("indexed_chunks.json");

// Helper to get generalized persona quotes
function getPersonaExamples(count = 20) {
  if (!fs.existsSync("chunked_messages.json")) return [];

  const data = JSON.parse(fs.readFileSync("chunked_messages.json", "utf-8"));
  const examples = [];
  let attempts = 0;
  while (examples.length < count && attempts < 1000) {
    attempts++;
    const randomChunk = data[Math.floor(Math.random() * data.length)];
    const randomMsg =
      randomChunk[Math.floor(Math.random() * randomChunk.length)].content;

    if (
      randomMsg &&
      randomMsg.length > 5 &&
      randomMsg.length < 100 &&
      !randomMsg.includes("http")
    ) {
      examples.push(randomMsg);
    }
  }
  return examples;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { history, params } = req.body;

    // Destructure tweaking parameters
    const { temperature, topP, topK, personaCount, systemPrompt } = params;

    // 1. Get Persona Examples
    const jayExamples = getPersonaExamples(personaCount);

    // 2. Retrieve past context from Vector DB (using the FULL history for the keyword query)
    const query = history.map((m) => m.content).join(" ");
    const retrievedContext =
      topK > 0 ? db.generateAgentContext(query, topK) : "RAG Context Disabled.";

    // 3. Build the Persona Prompt
    let prompt = systemPrompt + `\n`;

    if (personaCount > 0) {
      prompt += `\nHere are some random examples of how Jay typically types and speaks:\n`;
      jayExamples.forEach((ex) => (prompt += `- "${ex}"\n`));
    }

    if (topK > 0) {
      prompt += `\nHere is some retrieved historical context from Jay's past conversations that might be relevant to the current topic:\n`;
      prompt += retrievedContext;
    }

    prompt += `\n--- CURRENT CHAT HISTORY ---\n`;
    history.forEach((m) => {
      prompt += `${m.user}: ${m.content}\n`;
    });

    prompt += `\nBased on the history and your persona, write Jay's next response. Output ONLY the raw message text, nothing else.\nJay: `;

    // 4. Call Gemini with tweaked parameters
    const model = genAI.getGenerativeModel({
      model: "gemini-3-flash-preview",
      generationConfig: {
        temperature: parseFloat(temperature),
        topP: parseFloat(topP),
      },
    });

    const result = await model.generateContent(prompt);
    const textResponse = result.response.text().trim();

    res.json({
      response: textResponse,
      debug: {
        promptUsed: prompt,
        retrievedContext: retrievedContext,
        examplesUsed: jayExamples,
      },
    });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`\n===========================================`);
  console.log(`🚀 Local Testing UI running at http://localhost:${port}`);
  console.log(`===========================================\n`);
});
