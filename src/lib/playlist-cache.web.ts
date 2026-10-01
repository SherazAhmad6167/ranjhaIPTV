import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-file-system has no web implementation; localStorage is fine for the
// browser build, which is only used for development.
const KEY = 'iptv.playlistText';

export async function readCachedPlaylist(): Promise<string | null> {
  return AsyncStorage.getItem(KEY);
}

export async function writeCachedPlaylist(text: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, text);
  } catch {
    // Quota exceeded: the playlist will just be re-downloaded next launch.
  }
}

export async function clearCachedPlaylist(): Promise<void> {
  await AsyncStorage.removeItem(KEY);
}
