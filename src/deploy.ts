import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import dotenv from 'dotenv';

dotenv.config();

const { TOKEN, CLIENT_ID } = process.env;

if (!TOKEN || !CLIENT_ID) {
    console.error('Missing TOKEN or CLIENT_ID');
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play music')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('Song name or link')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track'),
    new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop music and clear the queue'),
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded global slash commands!');
    } catch (error) {
        console.error('Error', error);
    }
})();