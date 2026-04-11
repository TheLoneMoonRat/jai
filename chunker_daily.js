const fs = require('fs');
const readline = require('readline');

async function processFile() {
    const inputPath = 'target_user_474381656925536257_guild_967962436906913792.jsonl';
    const outputPath = 'chunked_messages_daily.json';
    
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

    // Chunking logic: Daily windows (grouping by calendar day in UTC)
    const chunks = [];
    let currentChunk = [];
    let currentDayStr = null;

    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        
        // Extract the YYYY-MM-DD portion of the ISO string (UTC time)
        // e.g. "2023-06-29T19:38:41.718000+00:00" -> "2023-06-29"
        const msgDayStr = msg.createdAt.split('T')[0];
        
        if (currentChunk.length === 0) {
            currentChunk.push(msg);
            currentDayStr = msgDayStr;
            continue;
        }

        // If the current message falls on the exact same calendar day
        if (msgDayStr === currentDayStr) {
            currentChunk.push(msg);
        } else {
            // Day changed, save chunk and start a new daily window
            chunks.push(currentChunk);
            currentChunk = [msg];
            currentDayStr = msgDayStr;
        }
    }
    
    if (currentChunk.length > 0) {
        chunks.push(currentChunk);
    }
    
    console.log(`Created ${chunks.length} chunks based on daily (calendar) windows.`);
    
    // Write output
    fs.writeFileSync(outputPath, JSON.stringify(chunks, null, 2));
    console.log(`Saved chunks to ${outputPath}`);
}

processFile().catch(console.error);
