import dotenv from "dotenv";
import { setupPlayer } from "./player";
import { playCommand } from "./commands/play";
import { pauseCommand } from "./commands/pause";
import { skipCommand } from './commands/skip';
import { stopCommand } from "./commands/stop";
import { Client, GatewayIntentBits } from "discord.js";
import { previousCommand } from "./commands/previous";
import { repeatCommand } from "./commands/repeat";
import { startYoutubeDlUpdater } from "./youtubeStream";
import { createPlayerControls } from "./playerControls";
import type { PlayerCommandResult } from "./commands/playerCommandResult";
import { logTiming } from "./performance";


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
            try {
                const guildId = interaction.guildId;
                if (!guildId) {
                    await interaction.reply({ content: 'This command is only available in a server', ephemeral: true });
                    return;
                }

                if (interaction.commandName === 'play') {
                    await interaction.deferReply();
                    await playCommand(interaction);
                    return;
                }

                if (interaction.commandName === 'previous') {
                    await interaction.deferReply({ ephemeral: true });
                    const result = await previousCommand(guildId);
                    await interaction.editReply(result.message);
                    return;
                }

                let result: PlayerCommandResult | undefined;
                if (interaction.commandName === 'pause') result = pauseCommand(guildId);
                if (interaction.commandName === 'repeat') result = repeatCommand(guildId);
                if (interaction.commandName === 'skip') result = skipCommand(guildId);
                if (interaction.commandName === 'stop') result = stopCommand(guildId);

                if (result) {
                    await interaction.reply({ content: result.message, ephemeral: true });
                }
            } catch (error) {
                console.error(`[Command Error] ${interaction.commandName}:`, error);
                const message = 'Unable to process this command';
                if (interaction.deferred) await interaction.editReply(message).catch(() => undefined);
                else if (interaction.replied) {
                    await interaction.followUp({ content: message, ephemeral: true }).catch(() => undefined);
                } else {
                    await interaction.reply({ content: message, ephemeral: true }).catch(() => undefined);
                }
            }
            return;
        }

        if (interaction.isButton()) {
            const interactionStartedAt = performance.now();
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

            try {
                const queue = player.nodes.get(guildId);
                if (!queue?.currentTrack) {
                    await interaction.update({ components: [] });
                    return;
                }

                let result: PlayerCommandResult;
                switch (interaction.customId) {
                    case 'previous':
                        await interaction.deferUpdate();
                        result = await previousCommand(guildId);
                        break;
                    case 'pause_resume':
                        result = pauseCommand(guildId);
                        break;
                    case 'repeat_track':
                        result = repeatCommand(guildId);
                        break;
                    case 'skip':
                        await interaction.deferUpdate();
                        result = skipCommand(guildId);
                        break;
                    case 'stop':
                        await interaction.deferUpdate();
                        result = stopCommand(guildId);
                        break;
                    default:
                        await interaction.deferUpdate();
                        return;
                }

                if (!result.ok) {
                    const response = { content: result.message, ephemeral: true } as const;
                    if (interaction.deferred || interaction.replied) await interaction.followUp(response);
                    else await interaction.reply(response);
                    return;
                }

                const currentQueue = player.nodes.get(guildId);
                if (!interaction.deferred && !interaction.replied && currentQueue?.currentTrack) {
                    await interaction.update({ components: [createPlayerControls(currentQueue)] });
                }
            } catch (error) {
                console.error(`[Button Error] ${interaction.customId}:`, error);
                const response = { content: 'Unable to process this control', ephemeral: true } as const;
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(response).catch(() => undefined);
                } else {
                    await interaction.reply(response).catch(() => undefined);
                }
            } finally {
                activeButtonGuilds.delete(guildId);
                logTiming(`button.${interaction.customId}`, interactionStartedAt);
            }
        }
    });

    client.login(process.env.TOKEN);
}

main().catch(console.error);
