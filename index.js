require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { LocalSparseVectorDB } = require("./retriever.js");
const fs = require("fs");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-3-flash-preview",
    generationConfig: {
        temperature: 1.5
    }
});

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

let triggerKeywords = [];
if (fs.existsSync("trigger_keywords.json")) {
    triggerKeywords = JSON.parse(fs.readFileSync("trigger_keywords.json", "utf-8"));
}

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
      randomChunk[Math.floor(Math.random() * randomChunk.length)].content.replace(/💀/g, '');

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
  const finalTopK = 160; // Locked to 160 for production
  const finalPersonaCount = 160; // Locked to 160 for production
  
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

For example, if someone asks "what courses are you taking this term?", expand the keywords to ["course", "study", "term", "class", "credits", "school", "midterm"].
Return a JSON object with:
- "expanded_keywords": Array of 10-20 highly specific search keywords.
- "time_context_analysis": A brief analysis of what situational/temporal context matters here.

CHAT HISTORY:
${historyText}`;
      
      const analysisResult = await analyzerModel.generateContent(analysisPrompt);
      const analysisData = JSON.parse(analysisResult.response.text());
      
      expandedKeywords = analysisData.expanded_keywords || [];
      timeContextAnalysis = analysisData.time_context_analysis || "";

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

  prompt += `\nHere are some random examples of how Jay typically types and speaks:\n`;
  jayExamples.forEach((ex) => (prompt += `- "${ex}"\n`));
  prompt += `\nCRITICAL INSTRUCTIONS: Notice his tone, use of lowercase, capitalization habits, and slang. Mimic this EXACTLY. Never sound like an AI assistant. Keep responses short and conversational, exactly like a normal Discord message. Do not use punctuation if he doesn't. Do not be overly helpful or formal. YOU MUST NEVER USE ANY EMOJIS, ESPECIALLY NOT SKULL EMOJIS. YOUR RESPONSE MUST BE MEANINGFULLY DIFFERENT FROM THE PREVIOUS MESSAGES IN THE CHAT HISTORY. DO NOT PARROT OR SENSELESSLY REPEAT WHAT HAS ALREADY BEEN SAID.\n`;

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

  const content = message.content.toLowerCase();
  
  // Triggers: Bot mention, or specific names
  const isMentioned = message.mentions.has(client.user);
  let hasKeyword = content.includes("jay") || content.includes("jaylord") || content.includes("474381656925536257");
  
  // Also check if any distinct target-user-specific keyword was mentioned
  // (We check if the exact word is present, bounded by word boundaries to avoid partial matches)
  if (!hasKeyword && triggerKeywords.length > 0) {
      // Small optimization: instead of running regex 900+ times per message, 
      // tokenize the message content first, and check against a Set
      const messageWords = new Set(content.match(/\b[a-z]{4,}\b/g) || []);
      for (const kw of triggerKeywords) {
          if (messageWords.has(kw)) {
              hasKeyword = true;
              console.log(`[TRIGGER] Woke up because of rare keyword: "${kw}"`);
              break;
          }
      }
  }

  // Trigger when the bot is mentioned or a keyword is matched
  if (isMentioned || hasKeyword) {
    // Show typing indicator
    await message.channel.sendTyping();

    try {
      // Fetch the last 10 messages from the channel for context
      const fetchedMessages = await message.channel.messages.fetch({
        limit: 10,
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
