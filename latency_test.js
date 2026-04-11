const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function runLatencyTest() {
    console.log("Starting latency profiling...\n");

    const startAnalyzer = Date.now();
    const analyzerModel = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: { responseMimeType: "application/json" }
    });
    
    const analysisPrompt = `You are a search query expander. Return JSON with keys: "expanded_keywords" (array), "time_context_analysis" (string), "recommended_top_k" (int 5-100), "recommended_persona_count" (int 5-100).
CHAT HISTORY:
User: hey what's up`;

    try {
        await analyzerModel.generateContent(analysisPrompt);
        const analyzerTime = Date.now() - startAnalyzer;
        console.log(`⏱️ Preprocessor AI (gemini-2.5-flash JSON) latency: ${analyzerTime}ms`);
    } catch (e) {
        console.log("Analyzer failed:", e.message);
    }
}

runLatencyTest();
