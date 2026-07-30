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

export interface InteractionHandlerDependencies {
    playCommand: typeof playCommand;
    playPreviousTrack: typeof playPreviousTrack;
    skipTrack: typeof skipTrack;
    stopPlayback: typeof stopPlayback;
    togglePause: typeof togglePause;
    toggleTrackRepeat: typeof toggleTrackRepeat;
    createPlayerControls: typeof createPlayerControls;
    logTiming: typeof logTiming;
    now: () => number;
}

export const createInteractionHandler = (dependencies: InteractionHandlerDependencies) => (client: Client, player: Player) => {
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
                    await dependencies.playCommand(interaction, player);
                    return;
                }
                if (interaction.commandName === commandNames.previous) {
                    await interaction.deferReply({ ephemeral: true });
                    const result = await dependencies.playPreviousTrack(guildId);
                    await interaction.editReply(result.message);
                    return;
                }

                let result: PlayerActionResult | undefined;
                if (interaction.commandName === commandNames.pause) result = dependencies.togglePause(guildId);
                if (interaction.commandName === commandNames.repeat) result = dependencies.toggleTrackRepeat(guildId);
                if (interaction.commandName === commandNames.skip) result = dependencies.skipTrack(guildId);
                if (interaction.commandName === commandNames.stop) result = dependencies.stopPlayback(guildId);

                if (result) {
                    await interaction.reply({ content: result.message, ephemeral: true });
                } else {
                    await interaction.reply({ content: 'Unknown command', ephemeral: true });
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

        const interactionStartedAt = dependencies.now();
        let timingOutcome = 'ok';
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
                    result = await dependencies.playPreviousTrack(guildId);
                    break;
                case playerControlIds.pauseResume:
                    result = dependencies.togglePause(guildId);
                    break;
                case playerControlIds.repeatTrack:
                    result = dependencies.toggleTrackRepeat(guildId);
                    break;
                case playerControlIds.skip:
                    await interaction.deferUpdate();
                    result = dependencies.skipTrack(guildId);
                    break;
                case playerControlIds.stop:
                    await interaction.deferUpdate();
                    result = dependencies.stopPlayback(guildId);
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
            if (!interaction.deferred && !interaction.replied) {
                const components = currentQueue?.currentTrack
                    ? [dependencies.createPlayerControls(currentQueue)]
                    : [];
                await interaction.update({ components });
            }
        } catch (error) {
            timingOutcome = 'failed';
            console.error(`[Button Error] ${interaction.customId}:`, error);
            const response = { content: 'Unable to process this control', ephemeral: true } as const;
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(response).catch(() => undefined);
            } else {
                await interaction.reply(response).catch(() => undefined);
            }
        } finally {
            activeButtonGuilds.delete(guildId);
            dependencies.logTiming(`button.${interaction.customId}`, interactionStartedAt, timingOutcome);
        }
    });
};

/* node:coverage disable */
export const registerInteractionHandler = createInteractionHandler({
    playCommand,
    playPreviousTrack,
    skipTrack,
    stopPlayback,
    togglePause,
    toggleTrackRepeat,
    createPlayerControls,
    logTiming,
    now: () => performance.now(),
});
/* node:coverage enable */
