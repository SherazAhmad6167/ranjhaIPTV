import {
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
  Outfit_800ExtraBold,
  Outfit_900Black,
  useFonts,
} from '@expo-google-fonts/outfit';
import { DarkTheme, Stack, ThemeProvider, type Theme } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';

import { BrandIntro } from '@/components/BrandIntro';
import { PlaylistProvider, usePlaylist } from '@/lib/playlist-store';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

const theme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
    Outfit_800ExtraBold,
    Outfit_900Black,
  });

  return (
    <ThemeProvider value={theme}>
      <PlaylistProvider>
        <StatusBar style="light" />
        {(fontsLoaded || fontError) && <RootNavigator />}
      </PlaylistProvider>
    </ThemeProvider>
  );
}

function RootNavigator() {
  const { hydrated, source } = usePlaylist();
  const [introDone, setIntroDone] = useState(false);
  const finishIntro = useCallback(() => setIntroDone(true), []);

  // Keep the native splash up until the saved session is known, so the first
  // screen is already the right one (home or login) when the intro reveals it.
  useEffect(() => {
    if (hydrated) SplashScreen.hideAsync().catch(() => {});
  }, [hydrated]);

  if (!hydrated) return null;
  const signedIn = source !== null;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="index" />
          <Stack.Screen name="browse" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="series" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="search" />
          <Stack.Screen name="account" options={{ animation: 'slide_from_bottom' }} />
          <Stack.Screen
            name="player"
            options={{
              orientation: 'landscape',
              statusBarHidden: true,
              navigationBarHidden: true,
              contentStyle: { backgroundColor: '#000' },
            }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      {!introDone && <BrandIntro onDone={finishIntro} />}
    </>
  );
}
