import dotenv from "dotenv";
import { setupPlayer } from "./player";
import { playCommand } from "./commands/play";
import { pauseCommand } from "./commands/pause";
import { skipCommand } from './commands/skip';
import { stopCommand } from "./commands/stop";
import { ActionRowBuilder, Client, GatewayIntentBits } from "discord.js";


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
            if (interaction.commandName === 'pause') await pauseCommand(interaction);
            if (interaction.commandName === 'skip') await skipCommand(interaction);
            if (interaction.commandName === 'stop') await stopCommand(interaction);
        }

        if (interaction.isButton()) {
            const queue = player.nodes.get(interaction.guildId!);

            if (!queue || !queue.isPlaying()) {
                return interaction.reply({ content: 'The queue is empty or the music is not playing', ephemeral: true });
            }

            switch (interaction.customId) {
                case 'pause_resume':
                    const isPaused = queue.node.isPaused();
                    queue.node.setPaused(!isPaused);
                    const rows = interaction.message.components.map(row => {
                        const actionRow = ActionRowBuilder.from(row as any);
                        actionRow.components.forEach((component: any) => {
                            if (component.data.custom_id === 'pause_resume') {
                                component.setLabel(isPaused ? '⏸' : '▶');
                            }
                        });
                        return actionRow;
                    });
                    await interaction.update({ components: rows as any });
                    break;

                case 'skip':
                    queue.node.skip();
                    await interaction.deferUpdate();
                    break;

                case 'stop':
                    queue.delete();
                    await interaction.message.delete().catch(() => { });
                    break;
            }
        }
    });

    client.login(process.env.TOKEN);
}

main().catch(console.error);