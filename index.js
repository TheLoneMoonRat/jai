require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { LocalSparseVectorDB } = require("./retriever.js");
const fs = require("fs");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Load the DB
const db = new LocalSparseVectorDB("indexed_chunks.json");
const groundingInfo = JSON.parse(fs.readFileSync("grounding_info.json", "utf-8"));

let cachedChunksData = null;

// Helper to get generalized persona quotes from the chunked messages
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

    // Filter out URLs, empty strings, and super long blocks for the baseline persona
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

// The generalized prompt builder
async function generateJayResponse(chatHistoryContext) {
  // 1. Context Analysis & Query Expansion (Gemini 2.5 Flash mini-prompt)
  let expandedKeywords = [];
  let timeContextAnalysis = "";
  let finalTopK = 5; // Default fallback
  let finalPersonaCount = 15; // Default fallback
  
  try {
      // Fallback to gemini-2.5-flash for speed
      const analyzerModel = genAI.getGenerativeModel({
          model: "gemini-2.5-flash",
          generationConfig: { responseMimeType: "application/json" }
      });
      
      const historyText = chatHistoryContext.map((m) => m.user + ": " + m.content).join("\n");
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
      
      if (analysisData.recommended_top_k) {
          finalTopK = Math.max(5, Math.min(100, parseInt(analysisData.recommended_top_k)));
      }
      if (analysisData.recommended_persona_count) {
          finalPersonaCount = Math.max(5, Math.min(100, parseInt(analysisData.recommended_persona_count)));
      }

  } catch (err) {
      console.error("Analyzer Error:", err);
      expandedKeywords = chatHistoryContext.map((m) => m.content.split(' ')).flat();
  }

  const jayExamples = getPersonaExamples(finalPersonaCount);

  // 2. Retrieve past context from Vector DB (using the AI expanded keywords)
  const query = expandedKeywords.join(" ");
  const retrievedContext = db.generateAgentContext(query, finalTopK);

  // 3. Build the Persona Prompt
  let prompt = `You are roleplaying as "Jay", a real person based on a Discord chat history. You are currently in a Discord channel chatting with friends.\n`;

  // 3.1 Inject Grounding Information
  prompt += `\n--- GROUNDING INFORMATION (Facts about you) ---\n`;
  prompt += `You are a ${groundingInfo.ethnicity} ${groundingInfo.gender}.\n`;
  prompt += `You are ${groundingInfo.height} tall.\n`;
  prompt += `You are in your ${groundingInfo.education.year} studying ${groundingInfo.education.program} at the ${groundingInfo.education.university}.\n`;

  prompt += `\nHere are some random examples of how Jay typically types and speaks:\n`;
  jayExamples.forEach((ex) => (prompt += `- "${ex}"\n`));
  prompt += `\nCRITICAL INSTRUCTIONS: Notice his tone, use of lowercase, capitalization habits, and slang. Mimic this EXACTLY. Never sound like an AI assistant. Keep responses short and conversational, exactly like a normal Discord message. Do not use punctuation if he doesn't. Do not be overly helpful or formal.\n`;

  prompt += `\nHere is an AI-generated analysis of the situational/temporal context required to answer accurately:\n"${timeContextAnalysis}"\n`;
  prompt += `\nHere is some retrieved historical context from Jay's past conversations that might be relevant to the current topic:\n`;
  prompt += retrievedContext;

  prompt += `\n--- CURRENT CHAT HISTORY ---\n`;
  chatHistoryContext.forEach((m) => {
    prompt += `${m.user}: ${m.content}\n`;
  });

  prompt += `\nBased on the history and your persona, write Jay's next response. Output ONLY the raw message text, nothing else.\nJay: `;

  try {
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (e) {
    console.error("Gemini API Error:", e.message);
    return "bruh something broke";
  }
}

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
  console.log(
    `Bot is ready to simulate Jay. Mention the bot to trigger a response!`,
  );
});

client.on("messageCreate", async (message) => {
  // Ignore other bots
  if (message.author.bot) return;

  // Trigger when the bot is mentioned
  if (message.mentions.has(client.user)) {
    // Show typing indicator
    await message.channel.sendTyping();

    try {
      // Fetch the last 100 messages from the channel for context
      const fetchedMessages = await message.channel.messages.fetch({
        limit: 100,
      });

      // Convert to an array and reverse it so it's chronologically oldest -> newest
      const messageArray = Array.from(fetchedMessages.values()).reverse();

      // Format the chat history for the prompt
      const chatHistoryContext = messageArray.map((msg) => ({
        user: msg.author.username,
        content: msg.content.replace(`<@${client.user.id}>`, "Jay").trim(), // Replace the bot mention with 'Jay'
      }));

      console.log(`Generating response for ${message.author.username}...`);
      const jayReply = await generateJayResponse(chatHistoryContext);

      await message.reply(jayReply);
    } catch (error) {
      console.error("Error processing message:", error);
      await message.reply("my brain hurts rn");
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
