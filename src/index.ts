import 'ffmpeg-static';
import dotenv from "dotenv";
import { setupPlayer } from "./player";
import { playCommand } from "./commands/play";
import { skipCommand } from './commands/skip';
import { stopCommand } from "./commands/stop";
import { Client, GatewayIntentBits } from "discord.js";

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

setupPlayer(client);

client.once('clientReady', () => {
    console.log(`Bot ${client.user?.tag} is ready!`);
});

client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'play') {
        await interaction.deferReply();
        await playCommand(interaction);
    }

    if (interaction.commandName === 'skip') {
        await skipCommand(interaction);
    }

    if (interaction.commandName === 'stop') {
        await stopCommand(interaction);
    }
});

client.login(process.env.TOKEN);