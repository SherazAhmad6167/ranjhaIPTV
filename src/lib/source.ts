import type { Channel } from './m3u';

/**
 * The signed-in account. Credentials are typed in by the user on the login
 * screen and stored on the device only — never hardcode them here.
 */
export interface PlaylistSource {
  username: string;
  password: string;
  /** The address in `SERVERS` the playlist and streams currently come from. */
  server?: string;
}

/**
 * Addresses of the XUI panel this app is built for, in order of preference.
 * XUI serves `get.php` (M3U), `player_api.php` and the streams themselves on
 * the same port. The local server comes first, so viewers on the local network
 * stream from it directly instead of through the public IP; the public IP is
 * last, as the fallback that works from anywhere.
 */
export const SERVERS: readonly string[] = ['http://20.20.20.70:8090', 'http://103.66.149.193:8090'];

/** Playlist URL for an account. Xtream-compatible panels serve M3U from `get.php`. */
export function playlistUrl(source: PlaylistSource, server: string): string {
  const q = new URLSearchParams({
    username: source.username,
    password: source.password,
    type: 'm3u_plus',
    output: 'ts',
  });
  return `${server}/get.php?${q.toString()}`;
}

/** Moves a URL on one of the panel's addresses over to `server`; any other URL is left alone. */
function rebase(url: string, server: string): string {
  const from = SERVERS.find((s) => url.startsWith(`${s}/`));
  return from && from !== server ? server + url.slice(from.length) : url;
}

/**
 * The panel writes one of its own addresses into the stream and logo URLs of
 * the playlist, which isn't necessarily one this device can reach. Points them
 * at `server`, the address the playlist came from. Keys keep the panel's
 * original URL, so favorites, recents and progress survive a switch.
 */
export function retarget(channels: Channel[], server: string): Channel[] {
  return channels.map((c) => {
    const url = rebase(c.url, server);
    const logo = c.logo && rebase(c.logo, server);
    return url === c.url && logo === c.logo ? c : { ...c, url, logo };
  });
}

/**
 * Reads an account saved by any version of the app. Older builds could also
 * sign in with an M3U link or demo channels; those sessions are dropped so the
 * user signs in again with a username and password.
 */
export function parseSavedSource(value: unknown): PlaylistSource | null {
  if (!value || typeof value !== 'object') return null;
  const { username, password, server } = value as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  if (!username || !password) return null;
  // Saved before servers were remembered, or an address since removed from SERVERS.
  if (typeof server !== 'string' || !SERVERS.includes(server)) return { username, password };
  return { username, password, server };
}
