import type { Player } from 'discord-player';
import type { Client } from 'discord.js';
import { logTiming } from '../performance';
import {
    playPreviousTrack,
    skipTrack,
    stopPlayback,
    togglePause,
    toggleTrackRepeat,
    type PlayerActionResult,
} from '../player/actions';
import { createPlayerControls, playerControlIds } from '../player/ui';
import { commandNames } from './commandDefinitions';
import { playCommand } from './playCommand';

export const registerInteractionHandler = (client: Client, player: Player) => {
    const activeButtonGuilds = new Set<string>();

    client.on('interactionCreate', async interaction => {
        if (interaction.isChatInputCommand()) {
            try {
                const guildId = interaction.guildId;
                if (!guildId) {
                    await interaction.reply({ content: 'This command is only available in a server', ephemeral: true });
                    return;
                }

                if (interaction.commandName === commandNames.play) {
                    await interaction.deferReply();
                    await playCommand(interaction);
                    return;
                }
                if (interaction.commandName === commandNames.previous) {
                    await interaction.deferReply({ ephemeral: true });
                    const result = await playPreviousTrack(guildId);
                    await interaction.editReply(result.message);
                    return;
                }

                let result: PlayerActionResult | undefined;
                if (interaction.commandName === commandNames.pause) result = togglePause(guildId);
                if (interaction.commandName === commandNames.repeat) result = toggleTrackRepeat(guildId);
                if (interaction.commandName === commandNames.skip) result = skipTrack(guildId);
                if (interaction.commandName === commandNames.stop) result = stopPlayback(guildId);

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

        if (!interaction.isButton()) return;

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

            let result: PlayerActionResult;
            switch (interaction.customId) {
                case playerControlIds.previous:
                    await interaction.deferUpdate();
                    result = await playPreviousTrack(guildId);
                    break;
                case playerControlIds.pauseResume:
                    result = togglePause(guildId);
                    break;
                case playerControlIds.repeatTrack:
                    result = toggleTrackRepeat(guildId);
                    break;
                case playerControlIds.skip:
                    await interaction.deferUpdate();
                    result = skipTrack(guildId);
                    break;
                case playerControlIds.stop:
                    await interaction.deferUpdate();
                    result = stopPlayback(guildId);
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
    });
};
