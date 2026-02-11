# Eternal DS -- Discord Music Bot

![Eternal DS Preview](assets/preview.png)

Eternal DS is a Discord music bot built with TypeScript, discord.js v14,
and discord-player v7. It supports slash commands and interactive
message buttons for controlling music playback in voice channels.

## Features

-   Play music by song name or URL
-   Pause / Resume playback
-   Skip current track
-   Go back to previous track
-   Stop playback and clear queue
-   Interactive control buttons under the now playing message
-   Automatic deletion of previous player message
-   FFmpeg bundled via ffmpeg-static

## Tech Stack

-   Node.js
-   TypeScript
-   discord.js v14
-   discord-player v7
-   @discord-player/extractor
-   @discordjs/voice
-   ffmpeg-static

## Installation

### 1. Clone the repository

``` bash
git clone https://github.com/your-username/eternal-ds.git
cd eternal-ds
```

### 2. Install dependencies

``` bash
npm install
```

## Environment Variables

Create a `.env` file in the root directory:

    TOKEN=YOUR_DISCORD_BOT_TOKEN
    CLIENT_ID=YOUR_APPLICATION_CLIENT_ID

### How to get these values

-   TOKEN -- Discord Developer Portal → Bot → Reset Token
-   CLIENT_ID -- Discord Developer Portal → General Information →
    Application ID

## Register Slash Commands

Before starting the bot, deploy slash commands:

``` bash
npm run deploy
```

This registers global slash commands.

## Development

Run the bot in development mode:

``` bash
npm run dev
```

## Production Build

Compile TypeScript:

``` bash
npm run build
```

Start the compiled bot:

``` bash
npm start
```

## Available Commands

  Command       Description
  ------------- -----------------------------------
  `/play`  -  Play music by name or URL<br>
  `/pause`  -  Pause or resume playback<br>
  `/skip`  -  Skip current track<br>
  `/previous`  -  Play previous track<br>
  `/stop`  -  Stop playback and clear the queue

## Required Bot Permissions

Make sure your bot has:

-   Send Messages
-   Embed Links
-   Connect
-   Speak
-   Use Slash Commands
-   Read Message Content

## Notes

-   FFmpeg is automatically provided via ffmpeg-static.
-   Global slash commands may take up to 1 hour to update.
-   Node.js 18+ is recommended.
