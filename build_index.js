const fs = require('fs');

const stopwords = new Set([
    "the", "and", "to", "of", "a", "i", "in", "it", "you", "that", "is", "for",
    "on", "my", "with", "this", "but", "me", "was", "have", "not", "be", "just",
    "so", "like", "at", "as", "do", "we", "can", "if", "out", "about", "are",
    "all", "they", "your", "what", "up", "get", "one", "how", "from", "when",
    "there", "would", "know", "think", "good", "really", "people", "some",
    "time", "got", "or", "too", "it's", "i'm", "don't", "that's", "yeah", "no",
    "then", "he", "she", "them", "their", "because", "go", "going", "been", "had",
    "has", "will", "more", "an", "who", "why", "which", "make", "see", "even",
    "want", "well", "much", "could", "should", "here", "only", "also", "very",
    "https", "http", "com", "www", "discord", "can't", "didn't", "it’s", "i’m",
    "don’t", "that’s", "you're", "you’re", "its", "im", "dont", "thats", "youre",
    "are", "did", "now", "say", "said", "way", "right", "thing", "things", "than",
    "off", "over", "still", "those", "these", "am", "any", "lol", "lmao", "gif"
]);

console.log("Reading 15-minute chunk file...");
const data = JSON.parse(fs.readFileSync('chunked_messages.json', 'utf-8'));
const df = {}; // Document Frequency: how many chunks contain a word
const N = data.length;

// First pass: Calculate term frequencies and document frequencies
const chunkTokens = data.map(chunk => {
    const text = chunk.map(m => m.content).join(' ').toLowerCase();
    const words = text.match(/\b[a-z]{3,}\b/g) || [];
    const tf = {};
    
    words.forEach(w => {
        if (!stopwords.has(w)) {
            tf[w] = (tf[w] || 0) + 1;
        }
    });
    
    // Increment DF for each unique word in this chunk
    Object.keys(tf).forEach(w => {
        df[w] = (df[w] || 0) + 1;
    });
    
    return tf;
});

// Second pass: Calculate TF-IDF (Sparse Vector) and extract top keywords
const indexedData = data.map((chunk, index) => {
    const tf = chunkTokens[index];
    const scores = Object.keys(tf).map(w => {
        // TF-IDF Calculation
        // Term Frequency * Inverse Document Frequency
        const idf = Math.log(N / (1 + df[w]));
        return { word: w, score: tf[w] * idf };
    });
    
    // Sort words by importance score
    scores.sort((a, b) => b.score - a.score);
    
    // Take the top 15 most defining keywords for this chunk
    const topKeywords = scores.slice(0, 15).map(s => s.word);

    // Return the new enhanced object structure
    return {
        chunk_id: index,
        keywords: topKeywords,
        start_time: chunk[0].createdAt,
        end_time: chunk[chunk.length - 1].createdAt,
        message_count: chunk.length,
        messages: chunk
    };
});

fs.writeFileSync('indexed_chunks.json', JSON.stringify(indexedData, null, 2));
console.log(`✅ Successfully built sparse vector index with keyword metadata for ${indexedData.length} chunks!`);
console.log(`Saved to indexed_chunks.json`);

