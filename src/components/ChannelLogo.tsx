import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, tileGradient } from '@/lib/theme';

interface Props {
  uri?: string;
  name: string;
  size?: number;
}

/** Square channel logo on the channel's tile colours, with initials as a fallback. */
export function ChannelLogo({ uri, name, size = 44 }: Props) {
  const [failed, setFailed] = useState(false);
  const [from, to] = tileGradient(name);
  const box = { width: size, height: size, borderRadius: Math.round(size * 0.24) };

  return (
    <View style={[styles.frame, box]}>
      <LinearGradient colors={[from, to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
      {uri && !failed ? (
        <Image
          source={uri}
          style={[styles.image, { margin: Math.round(size * 0.1) }]}
          contentFit="contain"
          cachePolicy="memory-disk"
          recyclingKey={uri}
          transition={120}
          onError={() => setFailed(true)}
        />
      ) : (
        <Text style={[styles.initials, { fontSize: Math.round(size * 0.36) }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

export function initials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

const styles = StyleSheet.create({
  frame: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  image: { alignSelf: 'stretch', flex: 1 },
  initials: { color: 'rgba(255,255,255,0.9)', fontFamily: fonts.black },
});
