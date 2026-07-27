import dotenv from "dotenv";
import { Client, GatewayIntentBits } from "discord.js";
import { registerInteractionHandler } from "./bot/interactionHandler";
import { startYoutubeDlUpdater } from "./media/youtube/updater";
import { setupPlayer } from "./player/setupPlayer";


dotenv.config();

async function main() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates
        ]
    });

    const player = await setupPlayer(client);
    registerInteractionHandler(client, player);
    startYoutubeDlUpdater();

    client.once('clientReady', () => {
        console.log(`Bot ${client.user?.tag} is ready`);
    });

    client.login(process.env.TOKEN);
}

main().catch(console.error);
