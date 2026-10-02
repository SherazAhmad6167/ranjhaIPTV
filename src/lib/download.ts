import { parseM3U, type Playlist } from './m3u';
import { playlistUrl, SERVERS, type PlaylistSource } from './source';

const TIMEOUT_MS = 45_000;
/** Plenty for the local server to answer on the local network; anywhere else it doesn't answer at all. */
const PROBE_MS = 4_000;

const UNREACHABLE = 'Could not reach the server. Check your internet connection and try again.';

export class PlaylistError extends Error {}

/** The address couldn't be reached or didn't answer like the panel, so the next one is worth a try. */
class ServerUnavailable extends PlaylistError {}

/**
 * Whether anything answers at `server` within PROBE_MS. Off the local network
 * requests to the local server hang rather than fail, so this spares a
 * download the full TIMEOUT_MS wait before falling back.
 */
async function answers(server: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_MS);
  try {
    await fetch(`${server}/`, { method: 'HEAD', signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The first address in SERVERS that answers from this network, else the last one. */
export async function findServer(): Promise<string> {
  for (const server of SERVERS.slice(0, -1)) {
    if (await answers(server)) return server;
  }
  return SERVERS[SERVERS.length - 1];
}

/**
 * Downloads and parses the playlist for an account from the first of the
 * panel's addresses that serves it. Returns that address and the raw text too,
 * for caching. A rejected login is final: every address leads to the same
 * panel, so trying the others would only keep the user waiting.
 */
export async function downloadPlaylist(
  source: PlaylistSource,
): Promise<{ text: string; playlist: Playlist; server: string }> {
  let lastError: PlaylistError | undefined;
  for (const [i, server] of SERVERS.entries()) {
    try {
      // The last address is the fallback and always gets the full attempt.
      if (i < SERVERS.length - 1 && !(await answers(server))) throw new ServerUnavailable(UNREACHABLE);
      return { ...(await downloadFrom(source, server)), server };
    } catch (e) {
      if (!(e instanceof ServerUnavailable)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}

async function downloadFrom(
  source: PlaylistSource,
  server: string,
): Promise<{ text: string; playlist: Playlist }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let text: string;
  try {
    const res = await fetch(playlistUrl(source, server), { signal: controller.signal });
    // XUI / Xtream panels answer bad or expired credentials with a 404 page, not 401.
    if ([401, 403, 404].includes(res.status)) {
      throw new PlaylistError(
        'Incorrect username or password, or your subscription is not active.',
      );
    }
    if (!res.ok) {
      throw new ServerUnavailable(
        `The server replied with an error (${res.status}). Please try again.`,
      );
    }
    text = await res.text();
  } catch (e) {
    if (e instanceof PlaylistError) throw e;
    if ((e as Error)?.name === 'AbortError') {
      throw new ServerUnavailable(
        `The server did not respond within ${TIMEOUT_MS / 1000} seconds. Please try again.`,
      );
    }
    throw new ServerUnavailable(UNREACHABLE);
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
      // A web page instead of a playlist: often a router or captive portal answering on that address.
      throw new ServerUnavailable('The server sent an unexpected response. Please try again later.');
    }
    throw new PlaylistError('Your account has no channels yet.');
  }

  return { text, playlist };
}
