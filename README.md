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
-   Reusable now playing message with low-latency controls
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

## Prerequisites

-   Node.js 22.19.0 or newer
-   A Discord application with a bot user

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
`YOUTUBE_DL_SKIP_PYTHON_CHECK=1` in the installation shell before running
`npm install`. This is an install-time variable, not a value loaded from `.env`.

``` bash
YOUTUBE_DL_SKIP_PYTHON_CHECK=1 npm install
```

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
YOUTUBE_STREAM_RETRIES=2
YOUTUBE_PREBUFFER_KB=128
YOUTUBE_STARTUP_TIMEOUT_MS=12000
YOUTUBE_TOTAL_TIMEOUT_MS=25000
YOUTUBE_PLAYLIST_TIMEOUT_MS=30000
PERFORMANCE_LOGGING=true
```

### How to get these values

-   TOKEN -- Discord Developer Portal → Bot → Reset Token. Required to run the
    bot and deploy commands.
-   CLIENT_ID -- Discord Developer Portal → General Information → Application
    ID. Required only by the command deployment script.
-   YOUTUBE_PROXY -- optional proxy URL used for YouTube extraction and media.
-   YOUTUBE_DL_AUTO_UPDATE -- check for a yt-dlp update at most once every 24
    hours. If the update service is unavailable, the installed binary is kept.
-   YOUTUBE_STREAM_RETRIES -- attempts for both YouTube stream startup and
    playlist metadata resolution, clamped from `1` to `5`.
-   YOUTUBE_PREBUFFER_KB -- audio buffered before FFmpeg starts, from `16` to
    `1024` KiB. `128` is recommended for local playback.
-   YOUTUBE_STARTUP_TIMEOUT_MS -- maximum wait for the first buffered audio in
    one attempt, from `3000` to `30000` milliseconds.
-   YOUTUBE_TOTAL_TIMEOUT_MS -- total stream startup deadline, from `5000` to
    `60000` milliseconds.
-   YOUTUBE_PLAYLIST_TIMEOUT_MS -- metadata deadline for one YouTube playlist
    attempt, from `5000` to `60000` milliseconds.
-   PERFORMANCE_LOGGING -- print command, resolver, and stream startup timings.
    Set it to `0` or `false` to disable timing logs.

## Install the Discord Application

In the [Discord Developer Portal](https://discord.com/developers/applications),
open the application and configure a **Guild Install**. Use the `bot` and
`applications.commands` scopes, then authorize the generated installation URL
for the target server.

Grant the bot these permissions in the command text channel and target voice
channel:

-   View Channels
-   Send Messages
-   Embed Links
-   Connect
-   Speak

Server members must also have permission to use application commands. The bot
does not require Administrator, Manage Messages, Message Content, or any other
privileged gateway intent.

## YouTube Playback

YouTube playback is fully anonymous and does not require an account, browser,
cookie, API key, or OAuth token. yt-dlp uses Node.js to process YouTube's player
challenge and streams audio directly to FFmpeg with a small startup buffer. It
retries temporary startup failures and is updated automatically by default.
Private, members-only, and some age-restricted videos are not available
anonymously.

When the update marker is stale, the first yt-dlp update attempt starts five
minutes after the bot launches and is deferred while YouTube streams are active.
A successful update writes `.data/yt-dlp-update-check` under the process working
directory, so that location must be writable. Update failures are nonfatal and
keep the installed binary. Set `YOUTUBE_DL_AUTO_UPDATE` to `0` or `false` to
disable automatic updates.

## Register Slash Commands

Register commands during initial setup and run the deployment again whenever
the definitions in `src/bot/commandDefinitions.ts` change:

``` bash
npm run deploy
```

This bulk-overwrites the Discord application's complete global command set with
the commands defined by this project. Do not run it against an application whose
other global commands are managed elsewhere. Discord clients can briefly show
cached command definitions after an update.

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

Commands are available only on servers. Join the target voice channel before
using `/play`.

| Command | Description |
| --- | --- |
| `/play` | Play music by name or URL |
| `/pause` | Pause or resume playback |
| `/skip` | Skip the current track |
| `/previous` | Play the previous track |
| `/repeat` | Toggle repeat for the current track |
| `/stop` | Stop playback and clear the queue |

## Project Structure

```text
src/
├── bot/          # Slash command definitions and Discord interactions
├── media/
│   ├── spotify/  # Spotify matching, bridging, and playlist artwork
│   └── youtube/  # yt-dlp streams, playlists, runtime state, and updater
├── player/       # Player setup, queue actions, controls, and messages
├── deploy.ts     # Global command deployment
├── index.ts      # Runtime entry point
└── performance.ts
```

The `bot`, `media`, and `player` directories are feature boundaries. YouTube
runtime coordination is internal to `src/media/youtube`.

## Notes

-   FFmpeg is automatically provided via ffmpeg-static.
-   YouTube account credentials and cookies are not used.
