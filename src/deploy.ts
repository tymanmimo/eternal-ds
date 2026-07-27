import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { commandDefinitions } from './bot/commandDefinitions';

dotenv.config();

const { TOKEN, CLIENT_ID } = process.env;

if (!TOKEN || !CLIENT_ID) {
    console.error('Missing TOKEN or CLIENT_ID');
    process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
    try {
        await rest.put(
            Routes.applicationCommands(CLIENT_ID),
            { body: commandDefinitions },
        );
        console.log('Successfully reloaded global slash commands');
    } catch (error) {
        console.error('Error', error);
    }
})();
