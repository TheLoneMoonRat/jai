const fs = require('fs');

console.log("Analyzing indexed chunks for rare/distinct trigger keywords...");

const data = JSON.parse(fs.readFileSync('indexed_chunks.json', 'utf-8'));
const keywordFreq = {};

// Count frequency of all keywords that the preprocessor decided were important enough to index
data.forEach(chunk => {
    chunk.keywords.forEach(kw => {
        // Only count words that are actual words (no numbers/weird symbols) and decent length
        if (kw.length >= 4 && /^[a-z]+$/.test(kw)) {
            keywordFreq[kw] = (keywordFreq[kw] || 0) + 1;
        }
    });
});

const triggers = [];

// Filter for words that appear in at least 3 chunks (so it's not just a one-off typo) 
// but fewer than 30 chunks (so it's highly distinct/specific to him)
Object.entries(keywordFreq).forEach(([word, freq]) => {
    if (freq >= 3 && freq <= 30) {
        triggers.push(word);
    }
});

console.log(`Found ${triggers.length} distinct trigger keywords.`);

// Save to a file so the bot can load them dynamically
fs.writeFileSync('trigger_keywords.json', JSON.stringify(triggers, null, 2));
console.log("Saved to trigger_keywords.json");

