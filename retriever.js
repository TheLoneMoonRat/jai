const fs = require('fs');

class LocalSparseVectorDB {
    constructor(indexPath) {
        this.chunks = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        
        // Build an "Inverted Index" in memory for lightning fast retrieval
        // This maps a keyword to an array of chunk_ids that contain it
        this.invertedIndex = {};
        
        this.chunks.forEach((chunk, idx) => {
            chunk.keywords.forEach(kw => {
                if (!this.invertedIndex[kw]) this.invertedIndex[kw] = [];
                this.invertedIndex[kw].push(idx);
            });
        });
        console.log(`Loaded Local Vector DB with ${this.chunks.length} chunks.`);
    }

    search(query, topK = 3) {
        // Tokenize the prompt/query
        const words = query.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        const scores = {};

        // Sparse vector dot-product (scoring chunks by keyword overlap/relevance)
        words.forEach(w => {
            if (this.invertedIndex[w]) {
                // If the word exists in our index, give points to all chunks containing it
                this.invertedIndex[w].forEach(chunkIdx => {
                    scores[chunkIdx] = (scores[chunkIdx] || 0) + 1;
                });
            }
        });

        // Sort chunks by highest score
        const sortedIndexes = Object.entries(scores)
            .sort((a, b) => b[1] - a[1]) // Sort descending by score
            .slice(0, topK); // Take top K

        return sortedIndexes.map(([idx, score]) => ({
            score,
            chunk: this.chunks[idx]
        }));
    }
    
    // Formats the retrieval into a perfect prompt for an AI agent
    generateAgentContext(query, topK = 3) {
        const results = this.search(query, topK);
        
        if (results.length === 0) {
            return `No relevant conversation context found for query: "${query}"\n`;
        }

        let prompt = `=================================================\n`;
        prompt += `RETRIEVED CONTEXT FOR QUERY: "${query}"\n`;
        prompt += `=================================================\n\n`;
        
        results.forEach((res, i) => {
            prompt += `--- Context Chunk ${i+1} (Relevance Score: ${res.score}) ---\n`;
            prompt += `Timeframe: ${res.chunk.start_time} to ${res.chunk.end_time}\n`;
            prompt += `Topic Keywords: ${res.chunk.keywords.join(', ')}\n\n`;
            
            res.chunk.messages.forEach(m => {
                // Format the messages cleanly for the LLM
                prompt += `User: ${m.content}\n`;
            });
            prompt += `\n`;
        });
        
        return prompt;
    }
}

// Export the DB for use in other files
module.exports = { LocalSparseVectorDB };

// === RUN A TEST (Only if executed directly) ===
if (require.main === module) {
    const db = new LocalSparseVectorDB('indexed_chunks.json');
    const testQuery = process.argv[2] || "going to the gym to workout with pratham";

    console.log("\nSearching...");
    const contextPrompt = db.generateAgentContext(testQuery, 3);
    console.log(contextPrompt);
}

