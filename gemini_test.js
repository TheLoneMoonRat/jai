require("dotenv").config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { LocalSparseVectorDB } = require("./retriever.js");
const fs = require("fs");

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" }); // using flash for fast tests

const db = new LocalSparseVectorDB("indexed_chunks.json");

// Helper to extract some random generalized quotes to build a persona
function getPersonaExamples(count = 20) {
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

async function testApproach(approachName, simulatedChatHistory, useExamples) {
  console.log(`\n===========================================`);
  console.log(`TESTING APPROACH: ${approachName}`);
  console.log(`===========================================`);

  // Create the search query from the last few messages in the chat history
  const query = simulatedChatHistory.map((m) => m.content).join(" ");

  // Retrieve context from Vector DB
  const retrievedContext = db.generateAgentContext(query, 3);

  // Build the Prompt
  let prompt = `You are roleplaying as "Jay", a real person based on a Discord chat history.\n`;

  if (useExamples) {
    prompt += `\nHere are some random examples of how Jay typically types and speaks:\n`;
    jayExamples.forEach((ex) => (prompt += `- "${ex}"\n`));
    prompt += `\nNotice his tone, use of lowercase, capitalization habits, and slang. Mimic this EXACTLY.\n`;
  }

  prompt += `\nHere is some retrieved historical context from Jay's past conversations that might be relevant to the current chat:\n`;
  prompt += retrievedContext;

  prompt += `\n--- CURRENT CHAT HISTORY ---\n`;
  simulatedChatHistory.forEach((m) => {
    prompt += `${m.user}: ${m.content}\n`;
  });

  prompt += `\nBased on the history and your persona, write Jay's next response.\nJay: `;

  try {
    const result = await model.generateContent(prompt);
    const response = result.response.text();
    console.log(`\n--- JAY'S GENERATED RESPONSE ---`);
    console.log(response.trim());
    console.log(`--------------------------------\n`);
  } catch (e) {
    console.error("Gemini API Error:", e.message);
  }
}

async function runTests() {
  const testChat1 = [
    { user: "Nathan", content: "yo jay you going to the gym today?" },
    { user: "Pratham", content: "yeah we should hit chest" },
  ];

  const testChat2 = [
    { user: "Alice", content: "did anyone finish the homework for cs?" },
    {
      user: "Bob",
      content: "nah it's way too hard, I got stuck on question 3",
    },
  ];

  const testChat3 = [
    { user: "Friend", content: "bro i just saw the craziest movie" },
    { user: "Friend", content: "it had wild plot twists" },
  ];

  console.log("Extracted Baseline Persona Examples:");
  console.log(jayExamples);

  // Approach A: Only RAG Context
  await testApproach(
    "Approach A (RAG Context Only - Gym Topic)",
    testChat1,
    false,
  );

  // Approach B: Persona Examples + RAG Context
  await testApproach(
    "Approach B (Persona + RAG Context - Gym Topic)",
    testChat1,
    true,
  );

  // Approach C: Persona + RAG Context on different topic
  await testApproach(
    "Approach C (Persona + RAG Context - Homework Topic)",
    testChat2,
    true,
  );
}

runTests();
