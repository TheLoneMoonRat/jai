const fs = require('fs');
const readline = require('readline');

async function processFile() {
    const inputPath = 'target_user_474381656925536257_guild_967962436906913792.jsonl';
    const outputPath = 'chunked_messages.json';
    
    console.log(`Reading from ${inputPath}...`);
    
    if (!fs.existsSync(inputPath)) {
        console.error("Input file not found!");
        return;
    }

    const messages = [];
    
    // Read the file line by line
    const fileStream = fs.createReadStream(inputPath);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });

    for await (const line of rl) {
        if (!line.trim()) continue;
        try {
            messages.push(JSON.parse(line));
        } catch (e) {
            console.error("Error parsing line:", e.message);
        }
    }
    
    console.log(`Loaded ${messages.length} messages.`);
    
    // 1. Sort by date from oldest to newest
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    console.log("Sorted messages chronologically.");

    // 2. Chunking logic (Time-based: 15 minutes threshold as a sensible default)
    const chunks = [];
    let currentChunk = [];
    const TIME_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        
        if (currentChunk.length === 0) {
            currentChunk.push(msg);
            continue;
        }

        const prevMsg = currentChunk[currentChunk.length - 1];
        const timeDiff = new Date(msg.createdAt) - new Date(prevMsg.createdAt);
        
        // If messages are in the same channel AND within 15 minutes of each other, group them
        if (msg.channelId === prevMsg.channelId && timeDiff <= TIME_THRESHOLD_MS) {
            currentChunk.push(msg);
        } else {
            // Otherwise, start a new chunk
            chunks.push(currentChunk);
            currentChunk = [msg];
        }
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    
    console.log(`Created ${chunks.length} conversation chunks.`);
    
    // Write output
    fs.writeFileSync(outputPath, JSON.stringify(chunks, null, 2));
    console.log(`Saved chunks to ${outputPath}`);
}

processFile().catch(console.error);
