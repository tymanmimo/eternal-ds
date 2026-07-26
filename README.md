# Eternal DS - Discord Music Bot

![Eternal DS Preview](assets/preview.png)

Eternal DS is a Discord music bot built with TypeScript, discord.js v14,
and discord-player v7. It supports slash commands and interactive
message buttons for controlling music playback in voice channels.

## Features

-   Play music by song name or URL
-   Play YouTube videos and playlists
-   Play Spotify tracks, albums, and playlists through validated YouTube matches
-   Pause / Resume playback
-   Skip current track
-   Go back to previous track
-   Repeat the current track indefinitely
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
-   discord-player-youtubei v3 beta
-   mediaplex
-   @snazzah/davey for Discord DAVE voice encryption
-   yt-dlp playback via youtube-dl-exec
-   ffmpeg-static

## Installation

### 1. Clone the repository

``` bash
git clone https://github.com/tymanmimo/eternal-ds.git
cd eternal-ds
```

### 2. Install dependencies

``` bash
npm install
```

`youtube-dl-exec` checks for Python during installation even though it downloads
a standalone binary. If Python 3.9+ is not installed, set
`YOUTUBE_DL_SKIP_PYTHON_CHECK=1` before running `npm install`:

``` powershell
$env:YOUTUBE_DL_SKIP_PYTHON_CHECK = "1"
npm install
```

``` bat
set YOUTUBE_DL_SKIP_PYTHON_CHECK=1
npm install
```

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

```dotenv
TOKEN=YOUR_DISCORD_BOT_TOKEN
CLIENT_ID=YOUR_APPLICATION_CLIENT_ID

YOUTUBE_PROXY=
YOUTUBE_DL_AUTO_UPDATE=true
YOUTUBE_STREAM_RETRIES=3
```

### How to get these values

-   TOKEN -- Discord Developer Portal → Bot → Reset Token
-   CLIENT_ID -- Discord Developer Portal → General Information →
    Application ID
-   YOUTUBE_PROXY -- optional proxy URL used for YouTube extraction and media.
-   YOUTUBE_DL_AUTO_UPDATE -- check for a yt-dlp update at most once every 24
    hours. If the update service is unavailable, the installed binary is kept.
-   YOUTUBE_STREAM_RETRIES -- stream extraction attempts from `1` to `10`.

## YouTube Playback

YouTube playback is fully anonymous and does not require an account, browser,
cookie, API key, or OAuth token. yt-dlp uses Node.js to process YouTube's player
challenge, retries temporary failures, and is updated automatically by default.
Private, members-only, and some age-restricted videos are not available
anonymously.

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
  `/repeat`  -  Toggle repeat for the current track<br>
  `/stop`  -  Stop playback and clear the queue

## Required Bot Permissions

Make sure your bot has:

-   Send Messages
-   Embed Links
-   Connect
-   Speak
-   Use Slash Commands

## Notes

-   FFmpeg is automatically provided via ffmpeg-static.
-   YouTube account credentials and cookies are not used.
-   Global slash commands may take up to 1 hour to update.
-   Node.js 22.19.0 or newer is required.
