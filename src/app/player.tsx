import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useEvent, useEventListener } from 'expo';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams } from 'expo-router';
import {
  isPictureInPictureSupported,
  useVideoPlayer,
  VideoView,
  type AudioTrack,
  type SubtitleTrack,
  type VideoContentFit,
  type VideoPlayer,
  type VideoSource,
} from 'expo-video';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton } from '@/components/Button';
import { ChannelLogo } from '@/components/ChannelLogo';
import { Focusable } from '@/components/Focusable';
import { goBack } from '@/components/ScreenHeader';
import { SidePanel } from '@/components/SidePanel';
import { TrackPanel } from '@/components/TrackPanel';
import { useLayout } from '@/lib/layout';
import type { Channel } from '@/lib/m3u';
import { usePlaylist } from '@/lib/playlist-store';
import { preferences, SUBTITLES_OFF, usePreferences } from '@/lib/preferences';
import { isFinished, resumePosition } from '@/lib/progress';
import { watchProgress } from '@/lib/progress-store';
import { episodeCode, episodeTitle, favoriteKeyFor, getSeries, nextEpisode } from '@/lib/series';
import { colors, fonts, gradients } from '@/lib/theme';
import { languageCode, preferredTrack } from '@/lib/tracks';

/** Retries per channel before showing an error (4 attempts in total: auto, HLS, auto, HLS). */
const MAX_FAILURES = 3;
const RETRY_DELAY_MS = 1000;
const CONTROLS_TIMEOUT_MS = 4000;
/** How long "Resumed from 47:12 · Start Over" stays up. */
const RESUME_NOTICE_MS = 7000;
/** Countdown before the next episode starts on its own. */
const NEXT_EPISODE_S = 10;
/** Time for the app to come back to the foreground after picture-in-picture ends. */
const PIP_CLOSE_GRACE_MS = 700;
const FITS: VideoContentFit[] = ['contain', 'cover', 'fill'];
const FIT_LABELS: Record<VideoContentFit, string> = { contain: 'Fit', cover: 'Zoom', fill: 'Stretch' };

type Panel = 'channels' | 'tracks';

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

// The player is driven by assigning its properties. That happens out here because the
// React Compiler treats whatever a hook returns as immutable inside a component.
function seekTo(player: VideoPlayer, seconds: number) {
  player.currentTime = seconds;
}

function setMuted(player: VideoPlayer, muted: boolean) {
  player.muted = muted;
}

function selectAudio(player: VideoPlayer, track: AudioTrack) {
  player.audioTrack = track;
}

function selectSubtitles(player: VideoPlayer, track: SubtitleTrack | null) {
  player.subtitleTrack = track;
}

/** Switches to the viewer's usual audio language, when the stream has it. */
function applyAudioPreference(player: VideoPlayer, tracks: AudioTrack[]) {
  const pick = preferredTrack(tracks, player.audioTrack, preferences.get().audioLanguage);
  if (pick) selectAudio(player, pick);
}

/** Turns subtitles on in the viewer's language, or off, as they last chose. */
function applySubtitlePreference(player: VideoPlayer, tracks: SubtitleTrack[]) {
  const wanted = preferences.get().subtitleLanguage;
  if (wanted === SUBTITLES_OFF) {
    if (player.subtitleTrack) selectSubtitles(player, null);
    return;
  }
  const pick = preferredTrack(tracks, player.subtitleTrack, wanted);
  if (pick) selectSubtitles(player, pick);
}

function canPictureInPicture(): boolean {
  if (Platform.isTV) return false;
  try {
    return isPictureInPictureSupported();
  } catch {
    return false;
  }
}

export default function PlayerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { channels, getQueue, markWatched, favorites, toggleFavorite } = usePlaylist();
  const { autoPictureInPicture } = usePreferences();
  const insets = useSafeAreaInsets();
  const { s, width, wide, isTV } = useLayout();

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
  const [panel, setPanel] = useState<Panel | null>(null);
  const [duration, setDuration] = useState(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Last position reached in the current title; a reload after an error carries on from here. */
  const position = useRef(0);
  /** Where the current load should start; until it's applied, positions reported are stale. */
  const pendingSeek = useRef<number | null>(null);
  const loadedKey = useRef<string | null>(null);
  const [resumedAt, setResumedAt] = useState<number | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [ended, setEnded] = useState(false);
  /** Seconds until the next episode starts, while counting down. */
  const [autoNextIn, setAutoNextIn] = useState<number | null>(null);

  const videoRef = useRef<VideoView>(null);
  const [pipSupported] = useState(canPictureInPicture);
  const [inPip, setInPip] = useState(false);
  const pipCloseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
  // The player starts empty, so the track lists do too until a stream reports its own.
  const { availableAudioTracks } = useEvent(player, 'availableAudioTracksChange', {
    availableAudioTracks: [] as AudioTrack[],
  });
  const { audioTrack } = useEvent(player, 'audioTrackChange', { audioTrack: null as AudioTrack | null });
  const { availableSubtitleTracks } = useEvent(player, 'availableSubtitleTracksChange', {
    availableSubtitleTracks: [] as SubtitleTrack[],
  });
  const { subtitleTrack } = useEvent(player, 'subtitleTrackChange', {
    subtitleTrack: null as SubtitleTrack | null,
  });

  // The episode after this one, when it's in the list being played through.
  const upNext = useMemo(() => {
    if (channel?.kind !== 'series') return undefined;
    const episode = nextEpisode(getSeries(channels), channel);
    const at = episode ? queue.findIndex((c) => c.key === episode.channel.key) : -1;
    return episode && at >= 0 ? { episode, index: at } : undefined;
  }, [channel, channels, queue]);

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

  const showResumeNotice = useCallback((at: number) => {
    setResumedAt(at);
    clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setResumedAt(null), RESUME_NOTICE_MS);
  }, []);

  useEventListener(player, 'playingChange', ({ isPlaying: playing }) => {
    if (playing) {
      setEnded(false);
      showControls();
    } else {
      clearTimeout(hideTimer.current);
      setControlsVisible(true);
      // Pausing is a natural place to stop: make sure the spot is saved and shown everywhere.
      watchProgress.flush();
    }
  });
  useEventListener(player, 'sourceLoad', (e) => {
    setDuration(e.duration);
    applyAudioPreference(player, e.availableAudioTracks);
    applySubtitlePreference(player, e.availableSubtitleTracks);
  });
  useEventListener(player, 'availableAudioTracksChange', (e) => applyAudioPreference(player, e.availableAudioTracks));
  useEventListener(player, 'availableSubtitleTracksChange', (e) =>
    applySubtitlePreference(player, e.availableSubtitleTracks),
  );
  useEventListener(player, 'statusChange', ({ status: s }) => {
    if (s === 'error') scheduleRetry();
    if (s === 'readyToPlay' && pendingSeek.current !== null) {
      const target = pendingSeek.current;
      pendingSeek.current = null;
      // Some streams ignore a seek made before they're ready; make sure it took.
      if (Math.abs(player.currentTime - target) > 5) seekTo(player, target);
    }
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    // Only real playback counts: not the zero reported while loading, nor a position from before a seek.
    if (!channel || !isVod || !isPlaying || pendingSeek.current !== null) return;
    position.current = currentTime;
    watchProgress.record(channel.key, currentTime, duration);
  });
  useEventListener(player, 'playToEnd', () => {
    if (!channel) return;
    // A live stream that ends has dropped; reconnect.
    if (!isVod) {
      scheduleRetry();
      return;
    }
    watchProgress.finish(channel.key, duration);
    watchProgress.flush();
    position.current = 0;
    setEnded(true);
    clearTimeout(hideTimer.current);
    setControlsVisible(true);
    if (upNext) setAutoNextIn(NEXT_EPISODE_S);
  });

  // (Re)load the stream whenever the channel changes or a retry is due. `replaceAsync`
  // loads the asset off the main thread on iOS, so zapping never freezes the UI.
  useEffect(() => {
    if (!channel) return;
    let cancelled = false;
    // A new title starts where the viewer left it; a reload of the same one (a retry)
    // carries on from where it had got to.
    const sameTitle = loadedKey.current === channel.key;
    loadedKey.current = channel.key;
    const startAt =
      channel.kind === 'live' ? 0 : sameTitle ? position.current : resumePosition(watchProgress.get(channel.key));
    position.current = startAt;
    pendingSeek.current = startAt > 0 ? startAt : null;

    player
      .replaceAsync(toVideoSource(channel, failures))
      .then(() => {
        if (cancelled) return;
        setLoadFailed(false);
        if (startAt > 0) {
          seekTo(player, startAt);
          if (!sameTitle) showResumeNotice(startAt);
        }
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
  }, [player, channel, failures, reloadKey, scheduleRetry, showResumeNotice]);

  useEffect(() => {
    if (channel) markWatched(channel.key);
  }, [channel, markWatched]);

  // Leaving the app saves the spot straight away, in case it never comes back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') watchProgress.flush();
    });
    return () => sub.remove();
  }, []);

  useEffect(
    () => () => {
      clearTimeout(retryTimer.current);
      clearTimeout(hideTimer.current);
      clearTimeout(resumeTimer.current);
      clearTimeout(pipCloseTimer.current);
      watchProgress.flush();
    },
    [],
  );

  const tune = useCallback(
    (next: number) => {
      const target = ((next % queue.length) + queue.length) % queue.length;
      if (target === index) {
        showControls();
        return;
      }
      watchProgress.flush();
      clearTimeout(retryTimer.current);
      clearTimeout(resumeTimer.current);
      setFailures(0);
      setLoadFailed(false);
      setEnded(false);
      setAutoNextIn(null);
      setResumedAt(null);
      setDuration(0);
      setIndex(target);
      showControls();
    },
    [queue.length, index, showControls],
  );

  const zap = useCallback(
    (delta: number) => {
      if (queue.length > 1) tune(index + delta);
    },
    [queue.length, index, tune],
  );

  const playNext = useCallback(() => {
    if (!upNext) return;
    if (channel) watchProgress.finish(channel.key, duration);
    tune(upNext.index);
  }, [upNext, channel, duration, tune]);

  // The next episode starts by itself once the countdown runs out.
  useEffect(() => {
    if (autoNextIn === null) return;
    const timer = setTimeout(() => {
      if (autoNextIn <= 1) playNext();
      else setAutoNextIn(autoNextIn - 1);
    }, 1000);
    return () => clearTimeout(timer);
  }, [autoNextIn, playNext]);

  const retry = () => {
    clearTimeout(retryTimer.current);
    setFailures(0);
    setLoadFailed(false);
    setReloadKey((k) => k + 1);
  };

  const togglePlay = useCallback(() => {
    if (ended) {
      setAutoNextIn(null);
      player.replay();
    } else if (player.playing) player.pause();
    else player.play();
    showControls();
  }, [player, ended, showControls]);

  const seekBy = useCallback(
    (seconds: number) => {
      setEnded(false);
      player.seekBy(seconds);
      showControls();
    },
    [player, showControls],
  );

  const seekToTime = (seconds: number) => {
    setEnded(false);
    setAutoNextIn(null);
    seekTo(player, seconds);
    position.current = seconds;
    if (channel && isVod) watchProgress.record(channel.key, seconds, duration);
    showControls();
  };

  const startOver = () => {
    clearTimeout(resumeTimer.current);
    setResumedAt(null);
    seekToTime(0);
    player.play();
  };

  const cycleFit = () => {
    setFit((f) => FITS[(FITS.indexOf(f) + 1) % FITS.length]);
    showControls();
  };

  const toggleMute = useCallback(() => {
    setMuted(player, !player.muted);
    showControls();
  }, [player, showControls]);

  const chooseAudio = (track: AudioTrack) => {
    selectAudio(player, track);
    // Remembered, so the next title plays in the same language when it can.
    const code = languageCode(track.language);
    if (code) preferences.set({ audioLanguage: code });
  };

  const chooseSubtitles = (track: SubtitleTrack | null) => {
    selectSubtitles(player, track);
    const code = track ? languageCode(track.language) : SUBTITLES_OFF;
    if (code) preferences.set({ subtitleLanguage: code });
  };

  const enterPictureInPicture = () => {
    setPanel(null);
    videoRef.current?.startPictureInPicture().catch(() => {});
  };

  const onPictureInPictureStop = () => {
    setInPip(false);
    showControls();
    clearTimeout(pipCloseTimer.current);
    // Closing the floating window (rather than expanding it) leaves the app in the
    // background. Stop there instead of playing on to nobody.
    pipCloseTimer.current = setTimeout(() => {
      if (AppState.currentState !== 'active') player.pause();
    }, PIP_CLOSE_GRACE_MS);
  };

  // Desktop browsers: keyboard shortcuts, like any desktop player.
  const keys = useRef({ togglePlay, zap, seekBy, toggleMute, isVod, panel, setPanel, cycleFit });
  keys.current = { togglePlay, zap, seekBy, toggleMute, isVod, panel, setPanel, cycleFit };
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
          k.setPanel((p) => (p === 'channels' ? null : 'channels'));
          break;
        case 'z':
          k.cycleFit();
          break;
        case 'Escape':
          if (k.panel) k.setPanel(null);
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
  const busy = !gaveUp && !ended && (status === 'loading' || status === 'idle' || failed);
  // For an episode this is its show, so "My List" collects the whole series.
  const favoriteKey = favoriteKeyFor(channel, channels);
  const favorite = favorites.has(favoriteKey);
  const next = queue.length > 1 ? queue[(index + 1) % queue.length] : undefined;
  const listTitle = channel.kind === 'series' ? 'Episodes' : channel.kind === 'movie' ? 'Movies' : 'Channels';
  const hasTracks = availableAudioTracks.length > 1 || availableSubtitleTracks.length > 0;
  const sidePad = { paddingLeft: s(16) + insets.left, paddingRight: s(16) + insets.right };
  const overlays = !gaveUp && !inPip;
  const showControlsNow = controlsVisible && overlays && !panel;
  // Above the seek bar while the controls are up, near the bottom edge otherwise.
  const floatBottom = insets.bottom + s(showControlsNow ? 92 : 24);
  // Offered from the credits on; counts down once the episode is over.
  const offerNext =
    !!upNext && overlays && !panel && (autoNextIn !== null || (duration > 0 && isFinished(time.currentTime, duration)));

  return (
    <View style={styles.screen}>
      <VideoView
        ref={videoRef}
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={fit}
        nativeControls={false}
        allowsPictureInPicture={pipSupported}
        startsPictureInPictureAutomatically={pipSupported && autoPictureInPicture && isPlaying}
        onPictureInPictureStart={() => {
          clearTimeout(pipCloseTimer.current);
          setInPip(true);
          setPanel(null);
        }}
        onPictureInPictureStop={onPictureInPictureStop}
      />

      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => {
          if (panel) setPanel(null);
          else if (controlsVisible && isPlaying) setControlsVisible(false);
          else showControls();
        }}
        accessibilityLabel="Show controls"
        focusable={false}
      />

      {busy && !inPip && (
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

      {inPip && (
        // iOS keeps the app open behind an in-app floating window; Android hides it altogether.
        <View style={[StyleSheet.absoluteFill, styles.center, styles.pipBackdrop]}>
          <MaterialIcons name="picture-in-picture-alt" size={s(44)} color={colors.textMuted} />
          <Text style={[styles.errorTitle, { fontSize: s(18) }]}>Playing in picture-in-picture</Text>
          <Button
            label="Bring It Back"
            icon="expand"
            variant="glass"
            onPress={() => videoRef.current?.stopPictureInPicture().catch(() => {})}
          />
        </View>
      )}

      {showControlsNow && (
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
            {hasTracks && (
              <IconButton
                icon="chatbox-ellipses-outline"
                label="Audio and subtitles"
                onPress={() => setPanel('tracks')}
                filled
              />
            )}
            <IconButton icon="scan-outline" label={`Picture: ${FIT_LABELS[fit]}`} onPress={cycleFit} filled />
            {pipSupported && (
              <IconButton
                icon={{ material: 'picture-in-picture-alt' }}
                label="Picture in picture"
                onPress={enterPictureInPicture}
                filled
              />
            )}
            {Platform.OS === 'web' && (
              <IconButton icon="expand" label="Full screen" onPress={toggleFullscreen} filled />
            )}
            {queue.length > 1 && (
              <IconButton icon="list" label={listTitle} onPress={() => setPanel('channels')} filled />
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
              accessibilityLabel={ended ? 'Play again' : isPlaying ? 'Pause' : 'Play'}
              hasTVPreferredFocus
              style={[styles.playButton, { width: s(84), height: s(84), borderRadius: s(42) }]}
              focusStyle={styles.playFocused}
            >
              <Ionicons
                name={ended ? 'reload' : isPlaying ? 'pause' : 'play'}
                size={s(40)}
                color="#fff"
                style={!isPlaying && !ended && { marginLeft: s(4) }}
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
              <SeekBar current={ended ? duration : time.currentTime} duration={duration} onSeek={seekToTime} />
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

      {resumedAt !== null && overlays && !panel && (
        <View
          style={[
            styles.floating,
            { left: s(16) + insets.left, bottom: floatBottom, gap: s(10), padding: s(6), paddingLeft: s(14), borderRadius: s(12) },
          ]}
        >
          <Ionicons name="time-outline" size={s(18)} color={colors.textMuted} />
          <Text style={[styles.floatingText, { fontSize: s(14) }]}>Resumed from {formatTime(resumedAt)}</Text>
          <Focusable
            onPress={startOver}
            zoom={1.04}
            accessibilityRole="button"
            accessibilityLabel="Start over from the beginning"
            style={[styles.floatingAction, { gap: s(6), paddingHorizontal: s(12), paddingVertical: s(7), borderRadius: s(8) }]}
            focusStyle={styles.floatingActionFocused}
          >
            <Ionicons name="refresh" size={s(16)} color="#fff" />
            <Text style={[styles.floatingActionText, { fontSize: s(13) }]}>Start Over</Text>
          </Focusable>
        </View>
      )}

      {offerNext && upNext && (
        <View
          style={[
            styles.floating,
            { right: s(16) + insets.right, bottom: floatBottom, gap: s(6), padding: s(6), borderRadius: s(12) },
          ]}
        >
          <Focusable
            onPress={playNext}
            zoom={1.04}
            accessibilityRole="button"
            accessibilityLabel={`Play next episode, ${episodeTitle(upNext.episode)}`}
            hasTVPreferredFocus={isTV && autoNextIn !== null}
            style={[styles.nextButton, { gap: s(10), paddingVertical: s(8), paddingHorizontal: s(14), borderRadius: s(9) }]}
            focusStyle={styles.playFocused}
          >
            <Ionicons name="play-skip-forward" size={s(18)} color="#0A0A0F" />
            <View style={{ maxWidth: Math.min(s(240), width * 0.36) }}>
              <Text style={[styles.nextLabel, { fontSize: s(11) }]}>
                {autoNextIn !== null ? `NEXT EPISODE IN ${autoNextIn}` : 'NEXT EPISODE'}
              </Text>
              <Text style={[styles.nextTitle, { fontSize: s(14) }]} numberOfLines={1}>
                {[episodeCode(upNext.episode), episodeTitle(upNext.episode)].filter(Boolean).join(' · ')}
              </Text>
            </View>
          </Focusable>
          {autoNextIn !== null && (
            <IconButton icon="close" label="Don’t play the next episode" onPress={() => setAutoNextIn(null)} size={38} />
          )}
        </View>
      )}

      <ChannelPanel
        open={panel === 'channels'}
        title={listTitle}
        queue={queue}
        index={index}
        onSelect={(i) => {
          tune(i);
          setPanel(null);
        }}
        onClose={() => setPanel(null)}
      />
      <TrackPanel
        open={panel === 'tracks'}
        audioTracks={availableAudioTracks}
        audioTrack={audioTrack}
        subtitleTracks={availableSubtitleTracks}
        subtitleTrack={subtitleTrack}
        onSelectAudio={chooseAudio}
        onSelectSubtitles={chooseSubtitles}
        onClose={() => setPanel(null)}
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
  title,
  queue,
  index,
  onSelect,
  onClose,
}: {
  open: boolean;
  title: string;
  queue: Channel[];
  index: number;
  onSelect(i: number): void;
  onClose(): void;
}) {
  const { s, width, wide, isTV } = useLayout();
  const insets = useSafeAreaInsets();
  const panelWidth = Math.round(Math.min(s(400), width * (wide ? 0.42 : 0.85)));
  const rowHeight = s(PANEL_ROW);

  return (
    <SidePanel
      open={open}
      width={panelWidth}
      title={title}
      subtitle={`${queue.length.toLocaleString()} in this list`}
      onClose={onClose}
    >
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
              hasTVPreferredFocus={isTV && active}
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
    </SidePanel>
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
  pipBackdrop: { backgroundColor: colors.bg },
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
  floating: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(14,14,20,0.86)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  floatingText: { color: '#fff', fontFamily: fonts.medium, fontVariant: ['tabular-nums'] },
  floatingAction: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  floatingActionFocused: { backgroundColor: 'rgba(255,255,255,0.28)' },
  floatingActionText: { color: '#fff', fontFamily: fonts.bold },
  nextButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff' },
  nextLabel: { color: colors.accent, fontFamily: fonts.extrabold, letterSpacing: 1 },
  nextTitle: { color: '#0A0A0F', fontFamily: fonts.bold },
  seekRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  time: { color: '#fff', fontFamily: fonts.medium, fontVariant: ['tabular-nums'], textAlign: 'center' },
  seekTrackHit: { flex: 1, justifyContent: 'center' },
  seekTrack: { borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.28)', overflow: 'hidden' },
  seekFill: { height: '100%', backgroundColor: colors.accent },
  seekThumb: { position: 'absolute', backgroundColor: colors.accent, borderWidth: 2, borderColor: '#fff' },
  panelRow: { flexDirection: 'row', alignItems: 'center' },
  panelRowActive: { backgroundColor: 'rgba(255,36,71,0.12)' },
  panelRowFocused: { backgroundColor: 'rgba(255,255,255,0.1)' },
  panelMarker: { position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: colors.accent },
  panelNumber: { color: colors.textDim, fontFamily: fonts.semibold, fontVariant: ['tabular-nums'], textAlign: 'right' },
  panelName: { color: colors.text, fontFamily: fonts.semibold },
  panelGroup: { color: colors.textMuted, fontFamily: fonts.regular, marginTop: 2 },
  panelActiveText: { color: colors.accentBright },
});
