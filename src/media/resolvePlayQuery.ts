import type { Player } from 'discord-player';
import type { User } from 'discord.js';
import { decorateSpotifyPlaylistThumbnail } from './spotify/playlistThumbnail';
import { isYoutubePlaylistUrl, resolveYoutubePlaylist } from './youtube/playlist';

export interface ResolvePlayQueryDependencies {
    isYoutubePlaylistUrl: typeof isYoutubePlaylistUrl;
    resolveYoutubePlaylist: typeof resolveYoutubePlaylist;
    decorateSpotifyPlaylistThumbnail: typeof decorateSpotifyPlaylistThumbnail;
}

export const createPlayQueryResolver = (dependencies: ResolvePlayQueryDependencies) => {
    return async (player: Player, query: string, requestedBy: User) => {
        if (dependencies.isYoutubePlaylistUrl(query)) {
            return dependencies.resolveYoutubePlaylist(player, query, requestedBy);
        }

        const result = await player.search(query, { requestedBy });
        void dependencies.decorateSpotifyPlaylistThumbnail(result, query);
        return result;
    };
};

export const resolvePlayQuery = createPlayQueryResolver({
    isYoutubePlaylistUrl,
    resolveYoutubePlaylist,
    decorateSpotifyPlaylistThumbnail,
});
