const fs = require('fs');
const { get_encoding } = require('tiktoken');

const encoder = get_encoding('cl100k_base');

function getTokenCount(text) {
    if (!text) return 0;
    const tokens = encoder.encode(text);
    return tokens.length;
}

function analyzeFile(filePath, chunkTypeName) {
    if (!fs.existsSync(filePath)) {
        console.log(`File not found: ${filePath}`);
        return;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    
    let maxTokens = 0;
    let maxTokensChunkIndex = -1;
    let maxTokensChunkLength = 0;
    let totalTokens = 0;
    const tokenCounts = [];

    for (let i = 0; i < data.length; i++) {
        const chunk = data[i];
        
        const chunkText = chunk.map(msg => msg.content).join('\n');
        const tokenCount = getTokenCount(chunkText);
        
        tokenCounts.push(tokenCount);
        totalTokens += tokenCount;
        
        if (tokenCount > maxTokens) {
            maxTokens = tokenCount;
            maxTokensChunkIndex = i;
            maxTokensChunkLength = chunk.length;
        }
    }
    
    tokenCounts.sort((a, b) => a - b);
    const avgTokens = Math.round(totalTokens / data.length);
    const medianTokens = tokenCounts[Math.floor(tokenCounts.length / 2)];
    
    console.log(`\n=== Analysis for ${chunkTypeName} (${filePath}) ===`);
    console.log(`Total Chunks: ${data.length}`);
    console.log(`Average Tokens per Chunk: ${avgTokens}`);
    console.log(`Median Tokens per Chunk: ${medianTokens}`);
    console.log(`Total Tokens Across All Chunks: ${totalTokens}`);
    console.log(`\n🏆 HIGHEST TOKEN CHUNK:`);
    console.log(`Index: #${maxTokensChunkIndex}`);
    console.log(`Token Count: ${maxTokens} tokens`);
    console.log(`Message Count: ${maxTokensChunkLength} messages`);
    
    if (maxTokensChunkIndex !== -1) {
        const biggestChunk = data[maxTokensChunkIndex];
        const firstMsg = biggestChunk[0];
        const lastMsg = biggestChunk[biggestChunk.length - 1];
        console.log(`Time Span: ${firstMsg.createdAt} to ${lastMsg.createdAt}`);
    }
}

analyzeFile('chunked_messages_2days.json', '2-Day Windows');

encoder.free();
