require("dotenv").config();
const { Client, GatewayIntentBits } = require("discord.js");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { LocalSparseVectorDB } = require("./retriever.js");
const fs = require("fs");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

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

// Helper to get generalized persona quotes from the chunked messages
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

const jayExamples = getPersonaExamples(15);

// The generalized prompt builder
async function generateJayResponse(chatHistoryContext) {
  // 1. Create a search query from the ENTIRE provided chat history (up to 100 messages)
  // This allows the keyword retriever to find the most relevant chunks based on the broad context of the current conversation
  const query = chatHistoryContext.map((m) => m.content).join(" ");

  // 2. Retrieve past context from Vector DB
  const retrievedContext = db.generateAgentContext(query, 3);

  // 3. Build the Persona Prompt
  let prompt = `You are roleplaying as "Jay", a real person based on a Discord chat history. You are currently in a Discord channel chatting with friends.\n`;

  prompt += `\nHere are some random examples of how Jay typically types and speaks:\n`;
  jayExamples.forEach((ex) => (prompt += `- "${ex}"\n`));
  prompt += `\nCRITICAL INSTRUCTIONS: Notice his tone, use of lowercase, capitalization habits, and slang. Mimic this EXACTLY. Never sound like an AI assistant. Keep responses short and conversational, exactly like a normal Discord message. Do not use punctuation if he doesn't. Do not be overly helpful or formal.\n`;

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
