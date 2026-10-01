import { parseM3U, type Playlist } from './m3u';
import { playlistUrl, type PlaylistSource } from './source';

const TIMEOUT_MS = 45_000;

export class PlaylistError extends Error {}

/** Downloads and parses the playlist for an account. Returns the raw text too, for caching. */
export async function downloadPlaylist(
  source: PlaylistSource,
): Promise<{ text: string; playlist: Playlist }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let text: string;
  try {
    const res = await fetch(playlistUrl(source), { signal: controller.signal });
    // XUI / Xtream panels answer bad or expired credentials with a 404 page, not 401.
    if ([401, 403, 404].includes(res.status)) {
      throw new PlaylistError(
        'Incorrect username or password, or your subscription is not active.',
      );
    }
    if (!res.ok) {
      throw new PlaylistError(`The server replied with an error (${res.status}). Please try again.`);
    }
    text = await res.text();
  } catch (e) {
    if (e instanceof PlaylistError) throw e;
    if ((e as Error)?.name === 'AbortError') {
      throw new PlaylistError(
        `The server did not respond within ${TIMEOUT_MS / 1000} seconds. Please try again.`,
      );
    }
    throw new PlaylistError(
      'Could not reach the server. Check your internet connection and try again.',
    );
  } finally {
    clearTimeout(timer);
  }

  const playlist = parseM3U(text);
  if (playlist.channels.length === 0) {
    const trimmed = text.trimStart();
    if (trimmed.startsWith('{') || trimmed === '') {
      throw new PlaylistError(
        'No channels were returned. The username or password may be wrong, or the account has no channels assigned.',
      );
    }
    if (trimmed.startsWith('<')) {
      throw new PlaylistError('The server sent an unexpected response. Please try again later.');
    }
    throw new PlaylistError('Your account has no channels yet.');
  }

  return { text, playlist };
}
