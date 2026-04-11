const fs = require('fs');
const readline = require('readline');

async function processFile() {
    const inputPath = 'target_user_474381656925536257_guild_967962436906913792.jsonl';
    const outputPath = 'chunked_messages_2days.json';
    
    console.log(`Reading from ${inputPath}...`);
    
    if (!fs.existsSync(inputPath)) {
        console.error("Input file not found!");
        return;
    }

    const messages = [];
    
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
    
    // Sort by date from oldest to newest
    messages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
    console.log("Sorted messages chronologically.");

    // Chunking logic: 2-day windows (48 hours)
    const chunks = [];
    let currentChunk = [];
    let windowStartTime = null;
    const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const msgTime = new Date(msg.createdAt).getTime();
        
        if (currentChunk.length === 0) {
            currentChunk.push(msg);
            windowStartTime = msgTime; // Start the 48-hour timer for this chunk
            continue;
        }

        // If the current message falls within 48 hours of the FIRST message in this chunk
        if (msgTime - windowStartTime <= TWO_DAYS_MS) {
            currentChunk.push(msg);
        } else {
            // Window expired, save chunk and start a new 48-hour window
            chunks.push(currentChunk);
            currentChunk = [msg];
            windowStartTime = msgTime;
        }
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    
    console.log(`Created ${chunks.length} chunks based on 2-day (48-hour) windows.`);
    
    // Write output
    fs.writeFileSync(outputPath, JSON.stringify(chunks, null, 2));
    console.log(`Saved chunks to ${outputPath}`);
}

processFile().catch(console.error);
