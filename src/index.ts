import dotenv from "dotenv";
import { setTimeout as delay } from "node:timers/promises";
import { setupPlayer, type PlayerMetadata } from "./player";
import { playCommand } from "./commands/play";
import { pauseCommand } from "./commands/pause";
import { skipCommand } from './commands/skip';
import { stopCommand } from "./commands/stop";
import { Client, GatewayIntentBits } from "discord.js";
import { previousCommand } from "./commands/previous";
import { repeatCommand } from "./commands/repeat";
import { startYoutubeDlUpdater } from "./youtubeStream";
import { createPlayerControls } from "./playerControls";


dotenv.config();

async function main() {
    const activeButtonGuilds = new Set<string>();
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildVoiceStates
        ]
    });

    const player = await setupPlayer(client);
    startYoutubeDlUpdater();

    client.once('clientReady', () => {
        console.log(`Bot ${client.user?.tag} is ready`);
    });

    client.on('interactionCreate', async (interaction) => {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'play') {
                await interaction.deferReply();
                await playCommand(interaction);
            }

            else if (interaction.commandName === 'repeat') {
                await interaction.deferReply({ ephemeral: true });
                await repeatCommand(interaction);
            }
            
            else {
                await interaction.deferReply({ ephemeral: true });
                let succeeded = false;

                if (interaction.commandName === 'previous') succeeded = await previousCommand(interaction);
                if (interaction.commandName === 'pause') succeeded = await pauseCommand(interaction);
                if (interaction.commandName === 'skip') succeeded = await skipCommand(interaction);
                if (interaction.commandName === 'stop') succeeded = await stopCommand(interaction);

                if (succeeded) await interaction.deleteReply();
            }
        }

        if (interaction.isButton()) {
            const guildId = interaction.guildId;
            if (!guildId) {
                await interaction.deferUpdate();
                return;
            }

            if (activeButtonGuilds.has(guildId)) {
                await interaction.deferUpdate().catch(() => undefined);
                return;
            }

            activeButtonGuilds.add(guildId);
            const messageId = interaction.message.id;

            try {
                const queue = player.nodes.get(guildId);
                if (!queue?.currentTrack) {
                    await interaction.update({ components: [] });
                    return;
                }

                await interaction.update({ components: [createPlayerControls(queue, true)] });

                let trackTransitionStarted = false;
                switch (interaction.customId) {
                    case 'previous':
                        trackTransitionStarted = await previousCommand(interaction);
                        break;
                    case 'pause_resume':
                        await pauseCommand(interaction);
                        break;
                    case 'repeat_track':
                        await repeatCommand(interaction);
                        break;
                    case 'skip':
                        trackTransitionStarted = await skipCommand(interaction);
                        break;
                    case 'stop':
                        await stopCommand(interaction);
                        break;
                }

                if (trackTransitionStarted) {
                    const timeoutAt = Date.now() + 60_000;
                    while (Date.now() < timeoutAt) {
                        const currentQueue = player.nodes.get(guildId);
                        const metadata = currentQueue?.metadata as PlayerMetadata | undefined;
                        if (!currentQueue?.currentTrack || metadata?.lastMessage?.id !== messageId) break;
                        await delay(250);
                    }
                }
            } catch (error) {
                console.error(`[Button Error] ${interaction.customId}:`, error);
            } finally {
                const queue = player.nodes.get(guildId);
                const metadata = queue?.metadata as PlayerMetadata | undefined;

                if (metadata?.lastMessage?.id === messageId) {
                    await interaction.editReply({
                        components: queue?.currentTrack ? [createPlayerControls(queue)] : [],
                    }).catch(() => undefined);
                }
                activeButtonGuilds.delete(guildId);
            }
        }
    });

    client.login(process.env.TOKEN);
}

main().catch(console.error);
