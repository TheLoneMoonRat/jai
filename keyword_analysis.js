const fs = require('fs');

// A basic set of English stop words and common discord/internet slang to filter out
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
    "off", "over", "still", "those", "these", "am", "any"
]);

const data = JSON.parse(fs.readFileSync('chunked_messages.json', 'utf-8'));
const documentFrequencies = {}; // word -> number of chunks it appears in
const totalFrequencies = {};    // word -> total occurrences

data.forEach(chunk => {
    // Combine all messages in the chunk and convert to lowercase
    const chunkText = chunk.map(m => m.content).join(' ').toLowerCase();
    
    // Extract words with 3+ characters (basic regex tokenization)
    const words = chunkText.match(/\b[a-z]{3,}\b/g) || [];
    const uniqueWordsInChunk = new Set();
    
    words.forEach(word => {
        if (!stopwords.has(word)) {
            uniqueWordsInChunk.add(word);
            totalFrequencies[word] = (totalFrequencies[word] || 0) + 1;
        }
    });
    
    // Increment Document Frequency (DF) for each unique word in this chunk
    uniqueWordsInChunk.forEach(word => {
        documentFrequencies[word] = (documentFrequencies[word] || 0) + 1;
    });
});

const totalChunks = data.length;
let uniqueWordsCount = Object.keys(documentFrequencies).length;

// Group keywords into buckets based on how many chunks they appear in
let rare = 0; // 1-2 chunks
let indexable = 0; // 3 to 100 chunks
let common = 0; // 101 to 500 chunks
let ubiquitous = 0; // 500+ chunks

const indexableWords = [];

Object.entries(documentFrequencies).forEach(([word, df]) => {
    if (df <= 2) {
        rare++;
    } else if (df <= 100) {
        indexable++;
        indexableWords.push({ word, df, tf: totalFrequencies[word] });
    } else if (df <= 500) {
        common++;
    } else {
        ubiquitous++;
    }
});

// Sort indexable words by frequency to show examples
indexableWords.sort((a, b) => b.df - a.df);

console.log(`\n=== Keyword Analysis (TF-IDF Viability) ===`);
console.log(`Total Chunks Processed: ${totalChunks}`);
console.log(`Total Unique Words (excluding stopwords): ${uniqueWordsCount}`);

console.log(`\n--- Keyword Distribution (Document Frequency) ---`);
console.log(`[Rare / Typos / Links] (1-2 chunks): ${rare} words (${Math.round(rare/uniqueWordsCount*100)}%)`);
console.log(`[Indexable / Specific] (3-100 chunks): ${indexable} words (${Math.round(indexable/uniqueWordsCount*100)}%)`);
console.log(`[Common / Broad Topics] (101-500 chunks): ${common} words (${Math.round(common/uniqueWordsCount*100)}%)`);
console.log(`[Ubiquitous / Stopwords] (500+ chunks): ${ubiquitous} words (${Math.round(ubiquitous/uniqueWordsCount*100)}%)`);

console.log(`\n--- Example 'Indexable' Keywords (Perfect for search indexing) ---`);
// Showing a mix from the top of the indexable bucket
console.log(indexableWords.slice(0, 30).map(w => `${w.word.padEnd(12)} (in ${w.df} chunks)`).join('\n'));

console.log(`\n--- Example 'Common' Keywords (Broad Topics) ---`);
const commonWords = Object.entries(documentFrequencies)
    .filter(([_, df]) => df > 100 && df <= 500)
    .sort((a, b) => b[1] - a[1]);
console.log(commonWords.slice(0, 30).map(w => `${w[0].padEnd(12)} (in ${w[1]} chunks)`).join('\n'));

