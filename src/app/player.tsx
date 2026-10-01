import { Ionicons } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoContentFit, type VideoSource } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/Button';
import { ChannelLogo } from '@/components/ChannelLogo';
import { Focusable, NATIVE_DRIVER } from '@/components/Focusable';
import { goBack } from '@/components/ScreenHeader';
import { useLayout } from '@/lib/layout';
import type { Channel } from '@/lib/m3u';
import { usePlaylist } from '@/lib/playlist-store';
import { favoriteKeyFor } from '@/lib/series';
import { colors, fonts, gradients } from '@/lib/theme';

/** Retries per channel before showing an error (4 attempts in total: auto, HLS, auto, HLS). */
const MAX_FAILURES = 3;
const RETRY_DELAY_MS = 1000;
const CONTROLS_TIMEOUT_MS = 4000;
const FITS: VideoContentFit[] = ['contain', 'cover', 'fill'];
const FIT_LABELS: Record<VideoContentFit, string> = { contain: 'Fit', cover: 'Zoom', fill: 'Stretch' };

const isHlsUrl = (url: string) => /\.m3u8($|[?#])/i.test(url);

/**
 * IPTV panels often serve streams from extension-less URLs (`/user/pass/123`),
 * which the player treats as progressive MPEG-TS. If that fails, every other
 * attempt is made as HLS instead, which covers servers that answer with a playlist.
 */
function toVideoSource(channel: Channel, failures: number): VideoSource {
  const asHls = isHlsUrl(channel.url) || failures % 2 === 1;
  return {
    uri: channel.url,
    contentType: asHls ? 'hls' : 'auto',
    headers: channel.headers,
    metadata: { title: channel.name, artist: channel.group },
  };
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { channels, getQueue, markWatched, favorites, toggleFavorite } = usePlaylist();
  const insets = useSafeAreaInsets();
  const { s, width, wide } = useLayout();

  const [queue] = useState(() => {
    const q = getQueue();
    return q.some((c) => c.id === id) ? q : channels;
  });
  const [index, setIndex] = useState(() => Math.max(0, queue.findIndex((c) => c.id === id)));
  const channel = queue[index] as Channel | undefined;
  const isVod = channel ? channel.kind !== 'live' : false;

  /** Failed attempts for the current channel; each increment triggers a reload. */
  const [failures, setFailures] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [fit, setFit] = useState<VideoContentFit>('contain');
  const [controlsVisible, setControlsVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [duration, setDuration] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const player = useVideoPlayer(null, (p) => {
    p.timeUpdateEventInterval = 1;
    p.staysActiveInBackground = false;
  });

  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { muted } = useEvent(player, 'mutedChange', { muted: player.muted });
  const time = useEvent(player, 'timeUpdate', {
    currentTime: 0,
    bufferedPosition: 0,
    currentLiveTimestamp: null,
    currentOffsetFromLive: null,
  });

  // Auto-hide the controls while playing; keep them up while paused or failed.
  const showControls = useCallback(() => {
    setControlsVisible(true);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControlsVisible(false), CONTROLS_TIMEOUT_MS);
  }, []);

  const scheduleRetry = useCallback(() => {
    clearTimeout(retryTimer.current);
    // Capped, so once MAX_FAILURES is reached the state stops changing and no reload happens.
    retryTimer.current = setTimeout(
      () => setFailures((f) => Math.min(f + 1, MAX_FAILURES)),
      RETRY_DELAY_MS,
    );
  }, []);

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    if (playing) showControls();
    else {
      clearTimeout(hideTimer.current);
      setControlsVisible(true);
    }
  });
  useEventListener(player, 'sourceLoad', ({ duration: d }) => setDuration(d));
  useEventListener(player, 'statusChange', ({ status: s }) => {
    if (s === 'error') scheduleRetry();
  });

  // (Re)load the stream whenever the channel changes or a retry is due. `replaceAsync`
  // loads the asset off the main thread on iOS, so zapping never freezes the UI.
  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    player
      .replaceAsync(toVideoSource(channel, failures))
      .then(() => {
        if (cancelled) return;
        setLoadFailed(false);
        player.play();
      })
      .catch(() => {
        // A newer load (zap or retry) cancels this one; only real failures count.
        if (cancelled) return;
        setLoadFailed(true);
        scheduleRetry();
      });
    return () => {
      cancelled = true;
    };
  }, [player, channel, failures, reloadKey, scheduleRetry]);

  useEffect(() => {
    if (channel) markWatched(channel.key);
  }, [channel, markWatched]);

  useEffect(
    () => () => {
      clearTimeout(retryTimer.current);
      clearTimeout(hideTimer.current);
    },
    [],
  );

  const tune = useCallback(
    (next: number) => {
      clearTimeout(retryTimer.current);
      setFailures(0);
      setLoadFailed(false);
      setIndex(((next % queue.length) + queue.length) % queue.length);
      showControls();
    },
    [queue.length, showControls],
  );

  const zap = useCallback(
    (delta: number) => {
      if (queue.length > 1) tune(index + delta);
    },
    [queue.length, index, tune],
  );

  const retry = () => {
    clearTimeout(retryTimer.current);
    setFailures(0);
    setLoadFailed(false);
    setReloadKey((k) => k + 1);
  };

  const togglePlay = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
    showControls();
  }, [player, showControls]);

  const seekBy = useCallback(
    (seconds: number) => {
      player.seekBy(seconds);
      showControls();
    },
    [player, showControls],
  );

  const cycleFit = () => {
    setFit((f) => FITS[(FITS.indexOf(f) + 1) % FITS.length]);
    showControls();
  };

  const toggleMute = useCallback(() => {
    player.muted = !player.muted;
    showControls();
  }, [player, showControls]);

  // Desktop browsers: keyboard shortcuts, like any desktop player.
  const keys = useRef({ togglePlay, zap, seekBy, toggleMute, isVod, panelOpen, setPanelOpen, cycleFit });
  keys.current = { togglePlay, zap, seekBy, toggleMute, isVod, panelOpen, setPanelOpen, cycleFit };
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.target instanceof HTMLInputElement) return;
      switch (e.key) {
        case ' ':
        case 'k':
          k.togglePlay();
          break;
        case 'ArrowUp':
        case 'PageUp':
          k.zap(-1);
          break;
        case 'ArrowDown':
        case 'PageDown':
          k.zap(1);
          break;
        case 'ArrowLeft':
          if (k.isVod) k.seekBy(-10);
          break;
        case 'ArrowRight':
          if (k.isVod) k.seekBy(10);
          break;
        case 'm':
          k.toggleMute();
          break;
        case 'f':
          toggleFullscreen();
          break;
        case 'c':
        case 'l':
          k.setPanelOpen((o) => !o);
          break;
        case 'z':
          k.cycleFit();
          break;
        case 'Escape':
          if (k.panelOpen) k.setPanelOpen(false);
          else if (!document.fullscreenElement) goBack();
          break;
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!channel) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.errorText}>This channel is no longer available.</Text>
        <Button label="Back" icon="arrow-back" variant="glass" onPress={goBack} />
      </View>
    );
  }

  const failed = status === 'error' || loadFailed;
  const gaveUp = failed && failures >= MAX_FAILURES;
  const busy = !gaveUp && (status === 'loading' || status === 'idle' || failed);
  // For an episode this is its show, so "My List" collects the whole series.
  const favoriteKey = favoriteKeyFor(channel, channels);
  const favorite = favorites.has(favoriteKey);
  const next = queue.length > 1 ? queue[(index + 1) % queue.length] : undefined;
  const sidePad = { paddingLeft: s(16) + insets.left, paddingRight: s(16) + insets.right };

  return (
    <View style={styles.screen}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit={fit} nativeControls={false} />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (panelOpen) setPanelOpen(false);
          else if (controlsVisible && isPlaying) setControlsVisible(false);
          else showControls();
        }}
        accessibilityLabel="Show controls"
        focusable={false}
      />

      {busy && (
        <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
          <View style={[styles.spinner, { width: s(84), height: s(84), borderRadius: s(42) }]}>
            <ActivityIndicator size="large" color="#fff" />
          </View>
          {failures > 0 && <Text style={[styles.statusText, { fontSize: s(15) }]}>Reconnecting…</Text>}
        </View>
      )}

      {gaveUp && (
        <View style={[StyleSheet.absoluteFill, styles.center, styles.errorBackdrop]}>
          <View style={[styles.errorIcon, { width: s(76), height: s(76), borderRadius: s(38) }]}>
            <Ionicons name="cloud-offline-outline" size={s(36)} color="#fff" />
          </View>
          <Text style={[styles.errorTitle, { fontSize: s(22) }]}>This channel isn’t playing</Text>
          <Text style={[styles.errorText, { fontSize: s(15), maxWidth: s(460) }]}>
            The stream could not be loaded. It may be offline right now, or your connection may be
            too slow.
          </Text>
          <View style={[styles.errorActions, { gap: s(12) }]}>
            <Button label="Try Again" icon="refresh" onPress={retry} hasTVPreferredFocus />
            {next && <Button label="Next Channel" icon="play-skip-forward" variant="glass" onPress={() => zap(1)} />}
            <Button label="Back" icon="arrow-back" variant="glass" onPress={goBack} />
          </View>
        </View>
      )}

      {controlsVisible && !gaveUp && !panelOpen && (
        <>
          <LinearGradient
            colors={gradients.scrimTop}
            style={[styles.topBar, sidePad, { paddingTop: s(14) + insets.top, gap: s(12) }]}
          >
            <IconButton icon="arrow-back" label="Back" onPress={goBack} filled size={44} />
            <ChannelLogo uri={channel.logo} name={channel.name} size={s(44)} />
            <View style={styles.titleBox}>
              <Text style={[styles.channelName, { fontSize: s(18) }]} numberOfLines={1}>
                {channel.name}
              </Text>
              <Text style={[styles.channelGroup, { fontSize: s(13) }]} numberOfLines={1}>
                {channel.group}
              </Text>
            </View>
            {!isVod && wide && <LiveBadge />}
            <IconButton
              icon={favorite ? 'heart' : 'heart-outline'}
              color={favorite ? colors.accent : '#fff'}
              label={favorite ? 'Remove from My List' : 'Add to My List'}
              onPress={() => {
                toggleFavorite(favoriteKey);
                showControls();
              }}
              filled
            />
            <IconButton
              icon={muted ? 'volume-mute' : 'volume-high'}
              label={muted ? 'Unmute' : 'Mute'}
              onPress={toggleMute}
              filled
            />
            <IconButton icon="scan-outline" label={`Picture: ${FIT_LABELS[fit]}`} onPress={cycleFit} filled />
            {Platform.OS === 'web' && (
              <IconButton icon="expand" label="Full screen" onPress={toggleFullscreen} filled />
            )}
            {queue.length > 1 && (
              <IconButton icon="list" label="Channels" onPress={() => setPanelOpen(true)} filled />
            )}
          </LinearGradient>

          <View style={[styles.centerControls, { gap: s(wide ? 56 : 36) }]} pointerEvents="box-none">
            {isVod ? (
              <IconButton icon="play-back" label="Back 10 seconds" size={60} onPress={() => seekBy(-10)} filled />
            ) : (
              <IconButton
                icon="play-skip-back"
                label="Previous channel"
                size={60}
                onPress={() => zap(-1)}
                filled
                style={queue.length < 2 && styles.hidden}
              />
            )}
            <Focusable
              onPress={togglePlay}
              zoom={1.08}
              accessibilityRole="button"
              accessibilityLabel={isPlaying ? 'Pause' : 'Play'}
              hasTVPreferredFocus
              style={[styles.playButton, { width: s(84), height: s(84), borderRadius: s(42) }]}
              focusStyle={styles.playFocused}
            >
              <Ionicons
                name={isPlaying ? 'pause' : 'play'}
                size={s(40)}
                color="#fff"
                style={!isPlaying && { marginLeft: s(4) }}
              />
            </Focusable>
            {isVod ? (
              <IconButton icon="play-forward" label="Forward 10 seconds" size={60} onPress={() => seekBy(10)} filled />
            ) : (
              <IconButton
                icon="play-skip-forward"
                label="Next channel"
                size={60}
                onPress={() => zap(1)}
                filled
                style={queue.length < 2 && styles.hidden}
              />
            )}
          </View>

          <LinearGradient
            colors={gradients.scrimBottom}
            style={[styles.bottomBar, sidePad, { paddingBottom: s(16) + insets.bottom, paddingTop: s(40) }]}
            pointerEvents="box-none"
          >
            {isVod && duration > 0 ? (
              <SeekBar
                current={time.currentTime}
                duration={duration}
                onSeek={(t) => seekBy(t - time.currentTime)}
              />
            ) : (
              <View style={[styles.liveRow, { gap: s(12) }]}>
                {!isVod && <LiveBadge />}
                {queue.length > 1 && (
                  <Text style={[styles.position, { fontSize: s(13) }]}>
                    Channel {index + 1} of {queue.length.toLocaleString()}
                  </Text>
                )}
                <View style={styles.flex} />
                {next && (
                  <Focusable
                    onPress={() => zap(1)}
                    zoom={1.04}
                    accessibilityRole="button"
                    accessibilityLabel={`Next: ${next.name}`}
                    style={[styles.upNext, { gap: s(10), padding: s(6), paddingRight: s(14), borderRadius: s(12) }]}
                    focusStyle={styles.upNextFocused}
                  >
                    <ChannelLogo uri={next.logo} name={next.name} size={s(34)} />
                    <View style={{ maxWidth: Math.min(s(220), width * 0.35) }}>
                      <Text style={[styles.upNextLabel, { fontSize: s(11) }]}>UP NEXT</Text>
                      <Text style={[styles.upNextName, { fontSize: s(14) }]} numberOfLines={1}>
                        {next.name}
                      </Text>
                    </View>
                  </Focusable>
                )}
              </View>
            )}
          </LinearGradient>
        </>
      )}

      <ChannelPanel
        open={panelOpen}
        queue={queue}
        index={index}
        onSelect={(i) => {
          tune(i);
          setPanelOpen(false);
        }}
        onClose={() => setPanelOpen(false)}
      />
    </View>
  );
}

function toggleFullscreen() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  else document.documentElement.requestFullscreen().catch(() => {});
}

function LiveBadge() {
  const { s } = useLayout();
  return (
    <View style={[styles.liveBadge, { paddingHorizontal: s(9), paddingVertical: s(4), borderRadius: s(6), gap: s(6) }]}>
      <View style={[styles.liveDot, { width: s(7), height: s(7), borderRadius: s(4) }]} />
      <Text style={[styles.liveText, { fontSize: s(12) }]}>LIVE</Text>
    </View>
  );
}

const PANEL_ROW = 68;

function ChannelPanel({
  open,
  queue,
  index,
  onSelect,
  onClose,
}: {
  open: boolean;
  queue: Channel[];
  index: number;
  onSelect(i: number): void;
  onClose(): void;
}) {
  const { s, width, wide } = useLayout();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.round(Math.min(s(400), width * (wide ? 0.42 : 0.85)));
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(open);
  const rowHeight = s(PANEL_ROW);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    Animated.timing(slide, {
      toValue: open ? 1 : 0,
      duration: 260,
      useNativeDriver: NATIVE_DRIVER,
    }).start(({ finished }) => {
      if (finished && !open) setMounted(false);
    });
  }, [open, slide]);

  if (!mounted) return null;

  return (
    <Animated.View
      style={[
        styles.panel,
        {
          width: panelWidth + insets.right,
          paddingRight: insets.right,
          transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [panelWidth + insets.right, 0] }) }],
        },
      ]}
    >
      <View style={[styles.panelHeader, { paddingTop: insets.top + s(16), paddingHorizontal: s(18), paddingBottom: s(12) }]}>
        <View style={styles.flex}>
          <Text style={[styles.panelTitle, { fontSize: s(20) }]}>Channels</Text>
          <Text style={[styles.panelCount, { fontSize: s(13) }]}>{queue.length.toLocaleString()} in this list</Text>
        </View>
        <IconButton icon="close" label="Close channel list" onPress={onClose} size={40} />
      </View>
      <FlatList
        data={queue}
        keyExtractor={(c) => c.id}
        initialScrollIndex={Math.max(0, index - 2)}
        getItemLayout={(_, i) => ({ length: rowHeight, offset: rowHeight * i, index: i })}
        initialNumToRender={14}
        windowSize={7}
        contentContainerStyle={{ paddingBottom: insets.bottom + s(16) }}
        renderItem={({ item, index: i }) => {
          const active = i === index;
          return (
            <Focusable
              onPress={() => onSelect(i)}
              accessibilityRole="button"
              accessibilityLabel={`Play ${item.name}`}
              accessibilityState={{ selected: active }}
              hasTVPreferredFocus={active}
              style={[styles.panelRow, { height: rowHeight, paddingHorizontal: s(18), gap: s(12) }, active && styles.panelRowActive]}
              focusStyle={styles.panelRowFocused}
            >
              {active && <View style={styles.panelMarker} />}
              <Text style={[styles.panelNumber, { fontSize: s(13), width: s(34) }, active && styles.panelActiveText]}>
                {i + 1}
              </Text>
              <ChannelLogo uri={item.logo} name={item.name} size={s(42)} />
              <View style={styles.flex}>
                <Text style={[styles.panelName, { fontSize: s(15) }, active && styles.panelActiveText]} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={[styles.panelGroup, { fontSize: s(12) }]} numberOfLines={1}>
                  {active ? 'Now playing' : item.group}
                </Text>
              </View>
              {active && <Ionicons name="volume-high" size={s(18)} color={colors.accent} />}
            </Focusable>
          );
        }}
      />
    </Animated.View>
  );
}

function SeekBar({
  current,
  duration,
  onSeek,
}: {
  current: number;
  duration: number;
  onSeek(seconds: number): void;
}) {
  const { s } = useLayout();
  const [width, setWidth] = useState(0);
  const progress = Math.min(1, Math.max(0, current / duration));
  const thumb = s(14);
  return (
    <View style={[styles.seekRow, { gap: s(14) }]}>
      <Text style={[styles.time, { fontSize: s(13), minWidth: s(48) }]}>{formatTime(current)}</Text>
      <Pressable
        style={[styles.seekTrackHit, { height: s(32) }]}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        onPress={(e) => width > 0 && onSeek((e.nativeEvent.locationX / width) * duration)}
        accessibilityRole="adjustable"
        accessibilityLabel="Seek"
        accessibilityValue={{ min: 0, max: Math.round(duration), now: Math.round(current) }}
      >
        <View style={[styles.seekTrack, { height: s(4) }]}>
          <View style={[styles.seekFill, { width: `${progress * 100}%` }]} />
        </View>
        <View
          style={[
            styles.seekThumb,
            { width: thumb, height: thumb, borderRadius: thumb / 2, left: progress * width - thumb / 2 },
          ]}
        />
      </Pressable>
      <Text style={[styles.time, { fontSize: s(13), minWidth: s(48) }]}>-{formatTime(duration - current)}</Text>
    </View>
  );
}

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  flex: { flex: 1, minWidth: 0 },
  hidden: { opacity: 0 },
  spinner: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  statusText: { color: '#fff', fontFamily: fonts.semibold },
  errorBackdrop: { backgroundColor: 'rgba(7,7,11,0.82)' },
  errorIcon: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,36,71,0.2)', marginBottom: 4 },
  errorTitle: { color: '#fff', fontFamily: fonts.bold, textAlign: 'center' },
  errorText: { color: '#C9CBD6', fontFamily: fonts.regular, textAlign: 'center', lineHeight: 22 },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: 12 },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 36,
  },
  titleBox: { flex: 1, minWidth: 0 },
  channelName: { color: '#fff', fontFamily: fonts.bold },
  channelGroup: { color: '#C9CBD6', fontFamily: fonts.medium, marginTop: 1 },
  liveBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.live },
  liveDot: { backgroundColor: '#fff' },
  liveText: { color: '#fff', fontFamily: fonts.extrabold, letterSpacing: 1.2 },
  centerControls: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,36,71,0.9)',
    boxShadow: '0px 10px 40px rgba(255,36,71,0.45)',
  },
  playFocused: { outlineWidth: 3, outlineColor: '#fff', outlineOffset: 4, outlineStyle: 'solid' },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  liveRow: { flexDirection: 'row', alignItems: 'center' },
  position: { color: '#C9CBD6', fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  upNext: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(20,20,28,0.7)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  upNextFocused: { borderColor: '#fff', backgroundColor: 'rgba(40,40,52,0.9)' },
  upNextLabel: { color: colors.accent, fontFamily: fonts.bold, letterSpacing: 1 },
  upNextName: { color: '#fff', fontFamily: fonts.semibold },
  seekRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  time: { color: '#fff', fontFamily: fonts.medium, fontVariant: ['tabular-nums'], textAlign: 'center' },
  seekTrackHit: { flex: 1, justifyContent: 'center' },
  seekTrack: { borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  seekFill: { height: '100%', backgroundColor: colors.accent },
  seekThumb: { position: 'absolute', backgroundColor: colors.accent, borderWidth: 2, borderColor: '#fff' },
  panel: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(10,10,15,0.94)',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: 'rgba(255,255,255,0.12)',
  },
  panelHeader: { flexDirection: 'row', alignItems: 'center' },
  panelTitle: { color: colors.text, fontFamily: fonts.extrabold },
  panelCount: { color: colors.textMuted, fontFamily: fonts.medium, marginTop: 2 },
  panelRow: { flexDirection: 'row', alignItems: 'center' },
  panelRowActive: { backgroundColor: 'rgba(255,36,71,0.12)' },
  panelRowFocused: { backgroundColor: 'rgba(255,255,255,0.1)' },
  panelMarker: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: colors.accent },
  panelNumber: { color: colors.textDim, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'], textAlign: 'right' },
  panelName: { color: colors.text, fontFamily: fonts.semibold },
  panelGroup: { color: colors.textMuted, fontFamily: fonts.regular, marginTop: 2 },
  panelActiveText: { color: colors.accentBright },
});
