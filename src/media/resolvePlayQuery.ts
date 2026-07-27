import type { Player } from 'discord-player';
import type { User } from 'discord.js';
import { decorateSpotifyPlaylistThumbnail } from './spotify/playlistThumbnail';
import { isYoutubePlaylistUrl, resolveYoutubePlaylist } from './youtube/playlist';

export const resolvePlayQuery = async (player: Player, query: string, requestedBy: User) => {
    if (isYoutubePlaylistUrl(query)) {
        return resolveYoutubePlaylist(player, query, requestedBy);
    }

    const result = await player.search(query, { requestedBy });
    decorateSpotifyPlaylistThumbnail(result, query);
    return result;
};
