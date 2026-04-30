import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  Dimensions,
  StatusBar,
  Platform,
  AppState,
  AppStateStatus,
  BackHandler,
  ActivityIndicator,
} from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Play, Pause, Volume2, VolumeX,
  X, RefreshCw, PictureInPicture2,
} from 'lucide-react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { captureWarn } from '@/lib/errorReporter';

import Colors from '@/constants/colors';
import LoadingState from '@/components/LoadingState';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { configureAudioSession } from '@/lib/audioSession';
import { WifiOff, RefreshCw as RefreshIcon, AlertTriangle } from 'lucide-react-native';

export default function EventLiveScreen() {
  useKeepAwake();

  const { url, label } = useLocalSearchParams<{ url: string; label: string }>();
  const streamUrl = (Array.isArray(url) ? url[0] : url) ?? '';
  const streamLabel = (Array.isArray(label) ? label[0] : label) ?? 'LIVE';

  const videoViewRef = useRef<VideoView>(null);
  const insets = useSafeAreaInsets();
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  const controlsTimeoutRef = useRef<number | null>(null);

  const [streamError, setStreamError] = useState<boolean>(false);
  const [isAutoRetrying, setIsAutoRetrying] = useState<boolean>(false);
  const [loadingTooLong, setLoadingTooLong] = useState<boolean>(false);
  const [isStalled, setIsStalled] = useState<boolean>(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoRetryCountRef = useRef<number>(0);
  const MAX_AUTO_RETRIES = 2;
  const lastTimeRef = useRef<number>(0);
  const stallCountRef = useRef<number>(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isMountedRef = useRef(true);
  const isFullscreenRef = useRef(true);
  const prevConnectedRef = useRef<boolean | null>(null);
  const { isConnected, checkNow } = useNetworkStatus();
  const isConnectedRef = useRef(isConnected);
  const handleRetryStreamRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
    };
  }, []);

  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  useEffect(() => {
    void configureAudioSession();
  }, []);

  const player = useVideoPlayer(
    { uri: streamUrl, headers: { Referer: 'LiraTVPlay' } },
    (p) => {
      p.loop = false;
      p.staysActiveInBackground = true;
      p.play();
    }
  );

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status: playerStatus } = useEvent(player, 'statusChange', { status: player.status });
  const isLoading = playerStatus === 'loading' || playerStatus === 'idle';

  // Mantieni isConnectedRef sincronizzato
  useEffect(() => { isConnectedRef.current = isConnected; }, [isConnected]);

  useEffect(() => {
    if (playerStatus === 'error') {
      const errMsg = (player as unknown as { error?: { message?: string } })?.error?.message ?? 'Player error';
      captureWarn(new Error(errMsg), 'event-live', 'player_status_error');
      setIsStalled(false);
      if (!isConnectedRef.current) {
        setStreamError(true);
        setIsAutoRetrying(false);
        return;
      }
      autoRetryCountRef.current += 1;
      if (autoRetryCountRef.current <= MAX_AUTO_RETRIES) {
        console.log(`[EventLive] Auto-retry ${autoRetryCountRef.current}/${MAX_AUTO_RETRIES} in 6s...`);
        setIsAutoRetrying(true);
        setStreamError(false);
        if (autoRetryTimerRef.current) clearTimeout(autoRetryTimerRef.current);
        autoRetryTimerRef.current = setTimeout(() => {
          if (!isMountedRef.current) return;
          setIsAutoRetrying(false);
          handleRetryStreamRef.current();
        }, 6000);
      } else {
        setStreamError(true);
        setIsAutoRetrying(false);
      }
    } else if (playerStatus === 'readyToPlay') {
      if (autoRetryTimerRef.current) { clearTimeout(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
      autoRetryCountRef.current = 0;
      setIsAutoRetrying(false);
      setStreamError(false);
      setIsStalled(false);
      setLoadingTooLong(false);
      stallCountRef.current = 0;
    }
  }, [playerStatus]);

  useEffect(() => {
    stallCheckRef.current = setInterval(() => {
      if (!isMountedRef.current || !player || streamError || isLoading) return;
      try {
        const currentTime = (player.currentTime ?? 0) * 1000;
        if (isPlaying && currentTime > 0) {
          if (Math.abs(currentTime - lastTimeRef.current) < 100) {
            stallCountRef.current += 1;
            if (stallCountRef.current >= 4) {
              if (isMountedRef.current) setIsStalled(true);
            }
          } else {
            stallCountRef.current = 0;
            if (isMountedRef.current) setIsStalled(false);
          }
        }
        lastTimeRef.current = currentTime;
      } catch {}
    }, 1500);
    return () => {
      if (stallCheckRef.current) clearInterval(stallCheckRef.current);
    };
  }, [player, streamError, isLoading, isPlaying]);

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === 'background' || nextState === 'inactive') {
        try { player.pause(); } catch {}
      } else if (prev.match(/inactive|background/) && nextState === 'active') {
        try {
          const status = player.status;
          if (status === 'error') {
            // Cancella eventuale auto-retry in sospeso prima di fare il replace
            if (autoRetryTimerRef.current) { clearTimeout(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
            setIsAutoRetrying(false);
            autoRetryCountRef.current = 0;
            player.replace(streamUrl);
            player.play();
          }
        } catch {}
        stallCountRef.current = 0;
        if (isMountedRef.current) setIsStalled(false);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [player, streamUrl]);

  useEffect(() => {
    if (prevConnectedRef.current === false && isConnected === true) {
      if (streamError || isStalled || isAutoRetrying) {
        // Cancella auto-retry in sospeso: la rete è tornata, ripartiamo subito
        if (autoRetryTimerRef.current) { clearTimeout(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
        autoRetryCountRef.current = 0;
        setIsAutoRetrying(false);
        setStreamError(false);
        setIsStalled(false);
        setLoadingTooLong(false);
        try {
          player.replace(streamUrl);
          player.play();
        } catch {}
      }
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, streamError, isStalled, isAutoRetrying, player, streamUrl]);

  useEffect(() => {
    if (isLoading && !streamError) {
      loadingTimerRef.current = setTimeout(() => {
        setLoadingTooLong(true);
      }, 20000);
    } else {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
      if (!isLoading) setLoadingTooLong(false);
    }
    return () => {
      if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
    };
  }, [isLoading, streamError]);

  const handleRetryStream = useCallback(async () => {
    if (autoRetryTimerRef.current) { clearTimeout(autoRetryTimerRef.current); autoRetryTimerRef.current = null; }
    // Reset contatore: ogni retry manuale dell'utente riparte da zero auto-retry
    autoRetryCountRef.current = 0;
    setIsAutoRetrying(false);
    setStreamError(false);
    setIsStalled(false);
    setLoadingTooLong(false);
    stallCountRef.current = 0;
    const online = await checkNow();
    if (!online) return;
    try {
      player.replace(streamUrl);
      player.play();
    } catch {
      setStreamError(true);
    }
  }, [player, checkNow, streamUrl]);
  // Sincronizza il ref con l'ultima versione del callback
  useEffect(() => { handleRetryStreamRef.current = handleRetryStream; }, [handleRetryStream]);

  useEffect(() => {
    if (showControls) {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000) as unknown as number;
    }
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [showControls]);

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions(window);
    });
    return () => subscription?.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const setup = async () => {
      if (Platform.OS !== 'web') {
        try {
          if (isFullscreen) {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            if (Platform.OS === 'android' && !cancelled) {
              try { await NavigationBar.setVisibilityAsync('hidden'); } catch {}
            }
          } else {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            if (Platform.OS === 'android' && !cancelled) {
              try { await NavigationBar.setVisibilityAsync('visible'); } catch {}
            }
          }
        } catch {}
      }
    };
    void setup();
    return () => {
      cancelled = true;
      if (Platform.OS !== 'web' && isFullscreen) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
        if (Platform.OS === 'android') {
          NavigationBar.setVisibilityAsync('visible').catch(() => {});
        }
      }
    };
  }, [isFullscreen]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (isFullscreenRef.current) {
        handleGoBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => sub.remove();
  }, []);

  const handleGoBack = useCallback(async () => {
    try {
      player.pause();
    } catch {}
    if (Platform.OS !== 'web') {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } catch {}
      if (Platform.OS === 'android') {
        try { await NavigationBar.setVisibilityAsync('visible'); } catch {}
      }
    }
    router.back();
  }, [player]);

  const handleMuteToggle = () => {
    const newMuted = !isMuted;
    player.muted = newMuted;
    setIsMuted(newMuted);
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleVideoPress = () => {
    setShowControls(prev => !prev);
  };

  const handlePiP = useCallback(() => {
    try {
      void videoViewRef.current?.startPictureInPicture();
    } catch {}
  }, []);

  const isLandscape = dimensions.width > dimensions.height;
  const videoContainerStyle = isFullscreen
    ? { flex: 1, backgroundColor: '#000' } as const
    : { width: dimensions.width * 0.9, height: (dimensions.width * 0.9) * (9 / 16), backgroundColor: '#000', alignSelf: 'center' as const };

  return (
    <View style={isFullscreen ? styles.fullscreenContainer : styles.container}>
      <StatusBar hidden={isFullscreen && isLandscape} />

      {!isFullscreen && (
        <View style={styles.headerContainer}>
          <View style={styles.headerContent}>
            <View style={styles.liveBadge}>
              <View style={styles.liveBadgeDot} />
              <Text style={styles.liveBadgeText}>{streamLabel}</Text>
            </View>
          </View>
        </View>
      )}

      <View style={videoContainerStyle}>
        <VideoView
          ref={videoViewRef}
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically
          onPictureInPictureStop={() => {
            if (appStateRef.current !== 'active') {
              try { player.pause(); } catch {}
            }
          }}
        />

        <Pressable style={StyleSheet.absoluteFill} onPress={handleVideoPress} />

        {isAutoRetrying && (
          <View style={styles.autoRetryOverlay} pointerEvents="box-none">
            <ActivityIndicator color={Colors.dark.accent} size="large" />
            <Text style={styles.autoRetryText}>Riconnessione in corso…</Text>
            <TouchableOpacity onPress={handleRetryStream} activeOpacity={0.7}>
              <Text style={styles.autoRetryLinkText}>Riprova ora</Text>
            </TouchableOpacity>
          </View>
        )}

        {(streamError || isStalled || (!isConnected && isLoading)) && (
          <View style={styles.errorOverlay}>
            {!isConnected
              ? <WifiOff color={Colors.dark.textSecondary} size={48} />
              : <AlertTriangle color={Colors.dark.error} size={48} />
            }
            <Text style={styles.errorOverlayTitle}>
              {!isConnected
                ? 'Nessuna connessione'
                : isStalled
                  ? 'Streaming temporaneamente non disponibile'
                  : 'Stream non disponibile'}
            </Text>
            <Text style={styles.errorOverlayDesc}>
              {!isConnected
                ? 'Controlla la tua connessione internet e riprova'
                : isStalled
                  ? 'La riproduzione si è interrotta. Riprova per continuare.'
                  : 'Lo stream potrebbe essere temporaneamente offline'}
            </Text>
            <TouchableOpacity style={styles.retryButton} onPress={handleRetryStream} activeOpacity={0.7}>
              <RefreshIcon color={Colors.dark.text} size={18} />
              <Text style={styles.retryButtonText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading && !streamError && !isStalled && isConnected && (
          <View style={styles.loadingOverlay}>
            <LoadingState />
            {loadingTooLong && (
              <View style={styles.loadingHint}>
                <Text style={styles.loadingHintText}>Il caricamento sta richiedendo più del solito...</Text>
                <TouchableOpacity style={styles.retryButtonSmall} onPress={handleRetryStream} activeOpacity={0.7}>
                  <RefreshIcon color={Colors.dark.accent} size={14} />
                  <Text style={styles.retryButtonSmallText}>Riprova</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {showControls && !isLoading && (
          <>
            <View style={[
              styles.topControls,
              isFullscreen && styles.topControlsFullscreen,
              { paddingTop: isFullscreen ? Math.max(insets.top, 16) : 8 },
            ]}>
              <TouchableOpacity onPress={handleGoBack} style={styles.controlButton} activeOpacity={0.7}>
                <X color={Colors.dark.text} size={24} />
              </TouchableOpacity>
              {isFullscreen && (
                <View style={styles.programInfo}>
                  <Text style={styles.programTitle} numberOfLines={1}>{streamLabel}</Text>
                </View>
              )}
              <View style={styles.spacer} />
              <TouchableOpacity onPress={handleMuteToggle} style={styles.controlButton} activeOpacity={0.7}>
                {isMuted
                  ? <VolumeX color={Colors.dark.text} size={22} />
                  : <Volume2 color={Colors.dark.text} size={22} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePiP} style={styles.controlButton} activeOpacity={0.7}>
                <PictureInPicture2 color={Colors.dark.text} size={22} />
              </TouchableOpacity>
            </View>

            <View style={styles.centerControls} pointerEvents="box-none">
              <TouchableOpacity style={styles.playButton} onPress={handlePlayPause} activeOpacity={0.7}>
                {isPlaying
                  ? <Pause color={Colors.dark.text} size={40} fill={Colors.dark.text} />
                  : <Play color={Colors.dark.text} size={40} fill={Colors.dark.text} />}
              </TouchableOpacity>
            </View>

            {!streamError && !isStalled && (
              <View style={[styles.liveChip, isFullscreen && { bottom: Math.max(insets.bottom + 16, 24), left: 16 }]}>
                <View style={styles.liveChipDot} />
                <Text style={styles.liveChipText}>LIVE</Text>
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 12,
    backgroundColor: Colors.dark.background,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    gap: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 10,
  },
  topControlsFullscreen: {
    padding: 16,
    paddingTop: 50,
    gap: 12,
  },
  programInfo: {
    flex: 1,
  },
  programTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '600' as const,
  },
  centerControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  controlButton: {
    padding: 8,
  },
  spacer: {
    flex: 1,
  },
  errorOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  errorOverlayTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    textAlign: 'center',
    marginTop: 4,
  },
  errorOverlayDesc: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dark.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  retryButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  loadingHint: {
    alignItems: 'center',
    marginTop: 16,
    gap: 10,
  },
  loadingHintText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },
  retryButtonSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  retryButtonSmallText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.accent,
  },
  liveChip: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(220,38,38,0.92)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
  },
  liveChipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveChipText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(220,38,38,0.92)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  liveBadgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveBadgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  autoRetryOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  autoRetryText: {
    color: Colors.dark.text,
    fontSize: 15,
    fontWeight: '500' as const,
  },
  autoRetryLinkText: {
    color: Colors.dark.accent,
    fontSize: 13,
    textDecorationLine: 'underline',
    marginTop: 4,
  },
});
