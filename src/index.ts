import dotenv from "dotenv";
import { setupPlayer } from "./player";
import { playCommand } from "./commands/play";
import { pauseCommand } from "./commands/pause";
import { skipCommand } from './commands/skip';
import { stopCommand } from "./commands/stop";
import { ActionRowBuilder, ButtonInteraction, Client, GatewayIntentBits } from "discord.js";
import { previousCommand } from "./commands/previous";


dotenv.config();

async function main() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent
        ]
    });

    const player = await setupPlayer(client);

    client.once('clientReady', () => {
        console.log(`Bot ${client.user?.tag} is ready`);
    });

    client.on('interactionCreate', async (interaction) => {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'play') {
                await interaction.deferReply();
                await playCommand(interaction);
            }
            
            else {
                await interaction.deferReply({ ephemeral: true });
                await interaction.deleteReply();

                if (interaction.commandName === 'previous') await previousCommand(interaction);
                if (interaction.commandName === 'pause') await pauseCommand(interaction);
                if (interaction.commandName === 'skip') await skipCommand(interaction);
                if (interaction.commandName === 'stop') await stopCommand(interaction);
            }
        }

        if (interaction.isButton()) {
            await interaction.deferUpdate();

            switch (interaction.customId) {
                case 'previous':
                    await previousCommand(interaction as ButtonInteraction);
                    break;
                case 'pause_resume':
                    await pauseCommand(interaction as ButtonInteraction);
                    break;
                case 'skip':
                    await skipCommand(interaction as ButtonInteraction);
                    break;
                case 'stop':
                    await stopCommand(interaction as ButtonInteraction);
                    break;
            }
        }
    });

    client.login(process.env.TOKEN);
}

main().catch(console.error);