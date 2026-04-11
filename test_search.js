require('dotenv').config();
const { REST } = require('@discordjs/rest');
const TARGET_USER_ID = '474381656925536257';

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function test() {
    try {
        const response = await rest.get(
            `/guilds/967962436906913792/messages/search`,
            {
                query: new URLSearchParams({
                    author_id: TARGET_USER_ID,
                    limit: 1,
                    sort_order: 'asc',
                    min_id: '1124061399610556547' // The first message ID
                })
            }
        );
        console.log("Next message ID:", response.messages[0]?.[0]?.id);
    } catch (e) {
        console.error(e.message, e.status);
    }
}
test();
