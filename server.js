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

let cachedChunksData = null;
// Helper to get generalized persona quotes
function getPersonaExamples(count = 20) {
  if (!fs.existsSync("chunked_messages.json")) return [];
  if (!cachedChunksData) {
      cachedChunksData = JSON.parse(fs.readFileSync("chunked_messages.json", "utf-8"));
  }

  const examples = [];
  let attempts = 0;
  while (examples.length < count && attempts < 1000) {
    attempts++;
    const randomChunk = cachedChunksData[Math.floor(Math.random() * cachedChunksData.length)];
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
    const { temperature, topP, topK, personaCount, systemPrompt, autoAdjust } = params;

    // 1. Context Analysis & Query Expansion (Gemini 2.5 Flash mini-prompt)
    let expandedKeywords = [];
    let timeContextAnalysis = "";
    let reasoningForParams = "";
    let finalTopK = parseInt(topK);
    let finalPersonaCount = parseInt(personaCount);
    let aiRecommendedTopK = finalTopK;
    let aiRecommendedPersona = finalPersonaCount;
    
    // Always run the analyzer to get the keywords and recommended context bounds
    try {
        const analyzerModel = genAI.getGenerativeModel({
            model: "gemini-2.5-flash",
            generationConfig: { responseMimeType: "application/json" }
        });
        
        const historyText = history.map((m) => m.user + ": " + m.content).join("\n");
        const analysisPrompt = `You are a search query expander and context analyzer for a chatbot persona named "Jay".
Read the following recent chat history and determine what information we need to pull from a historical message database.
Extrapolate keywords (synonyms, related entities, broader concepts) and analyze temporal/situational context. 
Also, determine the optimal amount of context to provide the final generation model:
- 'recommended_top_k' (5 to 100): How many past conversation chunks to retrieve via RAG. Use lower values (5-15) for simple greetings or straightforward questions to keep responses fast. Use higher values (20-100) for deep philosophical questions, long stories, or questions about his past.
- 'recommended_persona_count' (5 to 100): How many random past messages to include to establish his writing style.

For example, if someone asks "what courses are you taking this term?", expand the keywords to ["course", "study", "term", "class", "credits", "school", "midterm"].
Return a JSON object with:
- "expanded_keywords": Array of 10-20 highly specific search keywords.
- "time_context_analysis": A brief analysis of what situational/temporal context matters here.
- "recommended_top_k": Integer between 5 and 100.
- "recommended_persona_count": Integer between 5 and 100.
- "reasoning_for_parameters": A short explanation of why you chose these parameter values.

CHAT HISTORY:
${historyText}`;
        
        const analysisResult = await analyzerModel.generateContent(analysisPrompt);
        const analysisData = JSON.parse(analysisResult.response.text());
        
        expandedKeywords = analysisData.expanded_keywords || [];
        timeContextAnalysis = analysisData.time_context_analysis || "";
        reasoningForParams = analysisData.reasoning_for_parameters || "";
        
        if (analysisData.recommended_top_k) {
            aiRecommendedTopK = Math.max(5, Math.min(100, parseInt(analysisData.recommended_top_k)));
        }
        if (analysisData.recommended_persona_count) {
            aiRecommendedPersona = Math.max(5, Math.min(100, parseInt(analysisData.recommended_persona_count)));
        }
        
    } catch (err) {
        console.error("Analyzer Error:", err);
        // Fallback to basic extraction
        expandedKeywords = history.map((m) => m.content.split(' ')).flat();
    }

    // Apply auto adjust if enabled
    if (autoAdjust) {
        finalTopK = aiRecommendedTopK;
        finalPersonaCount = aiRecommendedPersona;
    }

    // 2. Get Persona Examples
    const jayExamples = getPersonaExamples(finalPersonaCount);

    // 3. Retrieve past context from Vector DB (using the AI expanded keywords)
    const query = expandedKeywords.join(" ");
    const retrievedContext =
      finalTopK > 0 ? db.generateAgentContext(query, finalTopK) : "RAG Context Disabled.";

    // 4. Build the Persona Prompt
    let prompt = systemPrompt + `\n`;

    if (personaCount > 0) {
      prompt += `\nHere are some random examples of how Jay typically types and speaks:\n`;
      jayExamples.forEach((ex) => (prompt += `- "${ex}"\n`));
    }

    if (topK > 0) {
      prompt += `\nHere is an AI-generated analysis of the situational/temporal context required to answer accurately:\n"${timeContextAnalysis}"\n`;
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
                expandedKeywords: expandedKeywords,
                timeContextAnalysis: timeContextAnalysis,
                reasoningForParams: reasoningForParams,
                finalTopK: finalTopK,
                finalPersonaCount: finalPersonaCount
            }
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
