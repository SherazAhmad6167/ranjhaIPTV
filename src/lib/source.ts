/**
 * The signed-in account. Credentials are typed in by the user on the login
 * screen and stored on the device only — never hardcode them here.
 */
export interface PlaylistSource {
  username: string;
  password: string;
}

/**
 * The XUI panel this app is built for. XUI serves `get.php` (M3U),
 * `player_api.php` and the streams themselves on the same port.
 */
export const SERVER = 'http://103.66.149.193:8090';

/** Playlist URL for an account. Xtream-compatible panels serve M3U from `get.php`. */
export function playlistUrl(source: PlaylistSource): string {
  const q = new URLSearchParams({
    username: source.username,
    password: source.password,
    type: 'm3u_plus',
    output: 'ts',
  });
  return `${SERVER}/get.php?${q.toString()}`;
}

/**
 * Reads an account saved by any version of the app. Older builds could also
 * sign in with an M3U link or demo channels; those sessions are dropped so the
 * user signs in again with a username and password.
 */
export function parseSavedSource(value: unknown): PlaylistSource | null {
  if (!value || typeof value !== 'object') return null;
  const { username, password } = value as Record<string, unknown>;
  if (typeof username !== 'string' || typeof password !== 'string') return null;
  if (!username || !password) return null;
  return { username, password };
}
