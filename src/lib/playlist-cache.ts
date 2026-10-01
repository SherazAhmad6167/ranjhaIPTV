import { File, Paths } from 'expo-file-system';

// Playlists can be several MB (thousands of channels plus VOD), which is too
// big for AsyncStorage on Android, so the raw text is kept in a file.
const file = () => new File(Paths.document, 'playlist.m3u');

export async function readCachedPlaylist(): Promise<string | null> {
  const f = file();
  return f.exists ? f.text() : null;
}

export async function writeCachedPlaylist(text: string): Promise<void> {
  const f = file();
  if (!f.exists) f.create();
  f.write(text);
}

export async function clearCachedPlaylist(): Promise<void> {
  const f = file();
  if (f.exists) f.delete();
}
