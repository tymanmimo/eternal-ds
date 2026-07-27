import { SlashCommandBuilder } from 'discord.js';

export const commandNames = {
    play: 'play',
    pause: 'pause',
    skip: 'skip',
    previous: 'previous',
    repeat: 'repeat',
    stop: 'stop',
} as const;

export const commandDefinitions = [
    new SlashCommandBuilder()
        .setName(commandNames.play)
        .setDescription('Play music')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name or link')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName(commandNames.pause)
        .setDescription('Pause or resume playback'),
    new SlashCommandBuilder()
        .setName(commandNames.skip)
        .setDescription('Skip the current track'),
    new SlashCommandBuilder()
        .setName(commandNames.previous)
        .setDescription('Go back to the previous track'),
    new SlashCommandBuilder()
        .setName(commandNames.repeat)
        .setDescription('Toggle repeat for the current track'),
    new SlashCommandBuilder()
        .setName(commandNames.stop)
        .setDescription('Stop music and clear the queue'),
].map(command => command.toJSON());
