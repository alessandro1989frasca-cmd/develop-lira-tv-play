import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  StatusBar,
  Dimensions,
  Text,
  Platform,
  Image,
  Animated,
  PanResponder,
  LayoutChangeEvent,
  AppState,
  AppStateStatus,
  BackHandler,
} from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useQueryClient } from '@tanstack/react-query';
import { Play, Pause, Volume2, VolumeX, X, SkipForward, PictureInPicture2 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import LoadingState from '@/components/LoadingState';
import { VideoContent } from '@/types';
import { getDeviceId } from '@/lib/deviceId';
import { trackVideoView, trackSessionDirect } from '@/utils/dataService';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { configureAudioSession, deactivateAudioSession } from '@/lib/audioSession';
import { captureException } from '@/lib/errorReporter';
import { WifiOff, RefreshCw as RefreshIcon, AlertTriangle } from 'lucide-react-native';

const NEXT_VIDEO_COUNTDOWN = 8;

export default function PlayerScreen() {
  useKeepAwake();
  const params = useLocalSearchParams<{ url?: string; title?: string; date?: string; category?: string; videoId?: string }>();
  const queryClient = useQueryClient();
  const videoViewRef = useRef<VideoView>(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isFullscreen] = useState(true);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  const [videoEnded, setVideoEnded] = useState(false);
  const [countdown, setCountdown] = useState(NEXT_VIDEO_COUNTDOWN);
  const [durationMillis, setDurationMillis] = useState<number>(0);
  const [positionMillis, setPositionMillis] = useState<number>(0);
  const [isSeeking, setIsSeeking] = useState<boolean>(false);
  const [seekPositionMillis, setSeekPositionMillis] = useState<number>(0);
  const [progressBarWidth, setProgressBarWidth] = useState<number>(0);
  const controlsTimeoutRef = useRef<NodeJS.Timeout | number | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | number | null>(null);
  const progressAnim = useRef(new Animated.Value(1)).current;

  const [orientationReady, setOrientationReady] = useState<boolean>(Platform.OS === 'web');
  const [isClosing, setIsClosing] = useState<boolean>(false);
  const [playerError, setPlayerError] = useState<boolean>(false);
  const [loadingTooLong, setLoadingTooLong] = useState<boolean>(false);
  const [isStalled, setIsStalled] = useState<boolean>(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimeRef = useRef<number>(0);
  const stallCountRef = useRef<number>(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isMountedRef = useRef(true);
  const videoFinishedRef = useRef(false);
  const prevConnectedRef = useRef<boolean | null>(null);
  const { isConnected, checkNow } = useNetworkStatus();

  const videoUrl = params.url || '';
  const videoTitle = params.title || '';
  const videoDate = params.date || '';
  const videoCategory = params.category || '';
  const videoId = params.videoId || '';

  const viewTrackedRef = useRef(false);
  const sessionStartRef = useRef<number>(Date.now());
  const deviceIdRef = useRef<string>('');

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    getDeviceId().then((id) => {
      deviceIdRef.current = id;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (videoId && !viewTrackedRef.current) {
      viewTrackedRef.current = true;
      void getDeviceId().then((deviceId) => {
        console.log('[Player] Tracking view for:', videoId);
        trackVideoView(videoId, deviceId).catch(() => console.log('[Player] Track view error'));
      }).catch(() => console.log('[Player] Track view error'));
    }
  }, [videoId]);

  useEffect(() => {
    sessionStartRef.current = Date.now();
    const currentVideoId = videoId;
    return () => {
      const durationSec = Math.round((Date.now() - sessionStartRef.current) / 1000);
      if (durationSec >= 3 && currentVideoId && deviceIdRef.current) {
        console.log('[Player] Tracking session via direct fetch:', durationSec, 'sec for:', currentVideoId);
        trackSessionDirect(deviceIdRef.current, 'video', currentVideoId, durationSec).catch(() => {});
      }
    };
  }, [videoId]);

  const hasNextVideo = videoCategory === 'sport' || videoCategory === 'cronaca';

  useEffect(() => {
    void configureAudioSession();
    return () => {
      void deactivateAudioSession();
    };
  }, []);

  const player = useVideoPlayer(videoUrl, (p) => {
    p.loop = false;
    p.staysActiveInBackground = true;
    p.play();
  });

  const { isPlaying: playerIsPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status: playerStatus } = useEvent(player, 'statusChange', { status: player.status });

  const categoryVideos = useMemo<VideoContent[]>(() => {
    if (!hasNextVideo) return [];
    const cached = queryClient.getQueryData<VideoContent[]>(['videos']);
    if (!cached) return [];
    return cached.filter(v => v.category === videoCategory)
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  }, [hasNextVideo, videoCategory, queryClient]);

  const currentIndex = useMemo(() => {
    if (!hasNextVideo || categoryVideos.length === 0) return -1;
    const idx = categoryVideos.findIndex(v => v.videoUrl === videoUrl || v.id === videoId);
    return idx;
  }, [categoryVideos, videoUrl, videoId, hasNextVideo]);

  const nextVideo = useMemo<VideoContent | null>(() => {
    if (currentIndex < 0 || currentIndex >= categoryVideos.length - 1) return null;
    return categoryVideos[currentIndex + 1];
  }, [categoryVideos, currentIndex]);

  useEffect(() => {
    setIsPlaying(playerIsPlaying);
  }, [playerIsPlaying]);

  useEffect(() => {
    if (playerStatus === 'error') {
      const errMsg = (player as unknown as { error?: { message?: string } })?.error?.message ?? 'Player error';
      console.log('[Player] Player error detected:', errMsg);
      captureException(new Error(errMsg), 'player', 'player_status_error');
      setPlayerError(true);
      setIsStalled(false);
      setIsLoading(false);
    } else if (playerStatus === 'readyToPlay') {
      console.log('[Player] Ready to play');
      setPlayerError(false);
      setIsStalled(false);
      setLoadingTooLong(false);
      stallCountRef.current = 0;
      videoFinishedRef.current = false;
    } else if (playerStatus === 'loading') {
      videoFinishedRef.current = false;
    }
    /* idle dopo fine video naturale (playToEnd) → non è un vero "loading":
       ignoriamo idle se il video era appena finito per non far scattare il timer 20s */
    if (playerStatus === 'idle' && videoFinishedRef.current) return;
    setIsLoading(playerStatus === 'loading' || playerStatus === 'idle');
  }, [playerStatus]);

  useEffect(() => {
    stallCheckRef.current = setInterval(() => {
      if (!isMountedRef.current || !player || playerError || isLoading) return;
      try {
        const currentTime = (player.currentTime ?? 0) * 1000;
        if (isPlaying && currentTime > 0) {
          if (Math.abs(currentTime - lastTimeRef.current) < 100) {
            stallCountRef.current += 1;
            console.log('[Player] Stall count:', stallCountRef.current);
            if (stallCountRef.current >= 4) {
              console.log('[Player] Stream stalled, showing recovery UI');
              if (isMountedRef.current) setIsStalled(true);
            }
          } else {
            if (stallCountRef.current > 0) {
              console.log('[Player] Stall recovered naturally');
            }
            stallCountRef.current = 0;
            if (isMountedRef.current) setIsStalled(false);
          }
        }
        lastTimeRef.current = currentTime;
      } catch (e) {
        console.log('[Player] Stall check error:', e);
      }
    }, 1500);
    return () => {
      if (stallCheckRef.current) clearInterval(stallCheckRef.current);
    };
  }, [player, playerError, isLoading, isPlaying]);

  useEffect(() => {
    const handleAppState = (nextState: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;
      if (nextState === 'background' || nextState === 'inactive') {
        /* App in background/chiusa: pausa per evitare crash ExoPlayer
           quando Android distrugge la SurfaceView */
        try { player.pause(); } catch {}
      } else if (prev.match(/inactive|background/) && nextState === 'active') {
        console.log('[Player] App returned to foreground, checking player state');
        try {
          const status = player.status;
          if (status === 'error') {
            console.log('[Player] Player in error after foreground, retrying');
            player.replace(videoUrl);
            player.play();
          } else if (status === 'readyToPlay' && isPlaying) {
            const ct = player.currentTime ?? 0;
            console.log('[Player] Foreground resume, currentTime:', ct);
            if (ct <= 0) {
              console.log('[Player] Player stuck at 0, replaying');
              player.replace(videoUrl);
              player.play();
            }
          }
        } catch (e) {
          console.log('[Player] Foreground recovery error:', e);
        }
        stallCountRef.current = 0;
        if (isMountedRef.current) setIsStalled(false);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [player, videoUrl, isPlaying]);

  useEffect(() => {
    if (prevConnectedRef.current === false && isConnected === true) {
      console.log('[Player] Network reconnected');
      if (playerError || isStalled) {
        console.log('[Player] Auto-retrying after network reconnection');
        setPlayerError(false);
        setIsStalled(false);
        setLoadingTooLong(false);
        try {
          player.replace(videoUrl);
          player.play();
        } catch (e) {
          console.log('[Player] Auto-retry failed:', e);
        }
      }
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, playerError, isStalled, player, videoUrl]);

  useEffect(() => {
    if (isLoading && !playerError) {
      loadingTimerRef.current = setTimeout(() => {
        console.log('[Player] Loading too long (20s)');
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
  }, [isLoading, playerError]);

  const handleRetryPlayer = useCallback(async () => {
    console.log('[Player] Retrying video...');
    setPlayerError(false);
    setIsStalled(false);
    setLoadingTooLong(false);
    setIsLoading(true);
    stallCountRef.current = 0;
    const online = await checkNow();
    if (!online) {
      console.log('[Player] Still offline');
      return;
    }
    try {
      player.replace(videoUrl);
      player.play();
    } catch (e) {
      console.log('[Player] Retry failed:', e);
      setPlayerError(true);
    }
  }, [player, videoUrl, checkNow]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!isSeeking && player) {
        const ct = (player.currentTime ?? 0) * 1000;
        const dur = (player.duration ?? 0) * 1000;
        if (dur > 0) {
          setPositionMillis(ct);
          setDurationMillis(dur);
          setSeekPositionMillis(ct);
        }
      }
    }, 250);
    return () => clearInterval(interval);
  }, [player, isSeeking]);

  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      console.log('🎬 Video ended');
      videoFinishedRef.current = true;
      setShowControls(true);
      if (nextVideo) {
        setVideoEnded(true);
      }
    });
    return () => sub.remove();
  }, [player, nextVideo]);

  const formatDate = (dateString: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('it-IT', { 
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch {
      return '';
    }
  };

  useEffect(() => {
    if (showControls) {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000) as unknown as number;
    }
    return () => {
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
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
    const setupOrientation = async () => {
      if (Platform.OS !== 'web') {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
          console.log('[Player] Forced landscape for playback');
          if (Platform.OS === 'android' && !cancelled) {
            try { await NavigationBar.setVisibilityAsync('hidden'); } catch {}
          }
        } catch (error) {
          console.log('[Player] Landscape lock failed, trying unlock:', error);
          try {
            await ScreenOrientation.unlockAsync();
          } catch (e) {
            console.log('[Player] Unlock also failed:', e);
          }
        }
        const sub = ScreenOrientation.addOrientationChangeListener((evt) => {
          const o = evt.orientationInfo.orientation;
          console.log('[Player] Orientation changed to:', o);
          if (
            o === ScreenOrientation.Orientation.LANDSCAPE_LEFT ||
            o === ScreenOrientation.Orientation.LANDSCAPE_RIGHT
          ) {
            if (!cancelled) {
              setOrientationReady(true);
              sub.remove();
            }
          }
        });
        setTimeout(() => {
          if (!cancelled) {
            setOrientationReady(true);
            sub.remove();
          }
        }, 500);
      }
    };
    void setupOrientation();

    return () => {
      cancelled = true;
      if (Platform.OS !== 'web') {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch((error) => {
          console.log('[Player] Portrait lock on exit failed:', error);
        });
        if (Platform.OS === 'android') {
          NavigationBar.setVisibilityAsync('visible').catch(() => {});
        }
      }
    };
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      return () => {
        try {
          player.pause();
        } catch {
          console.log('Player already released, skipping pause');
        }
      };
    }, [player])
  );

  const handlePlayPause = () => {
    try {
      if (isPlaying) {
        player.pause();
      } else {
        player.play();
      }
    } catch (e) {
      console.log('Player not available:', e);
    }
  };

  const handleMuteToggle = () => {
    try {
      const newMuted = !isMuted;
      player.muted = newMuted;
      setIsMuted(newMuted);
    } catch (e) {
      console.log('Player not available:', e);
    }
  };

  const handleVideoPress = () => {
    setShowControls(!showControls);
  };

  const formatTime = useCallback((millis: number): string => {
    const totalSeconds = Math.max(0, Math.floor(millis / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const paddedSeconds = seconds < 10 ? `0${seconds}` : `${seconds}`;
    return `${minutes}:${paddedSeconds}`;
  }, []);

  const seekToMillis = useCallback((millis: number) => {
    if (!player) return;
    try {
      console.log('⏩ Seeking to', millis);
      try {
        player.currentTime = millis / 1000;
        setPositionMillis(millis);
      } catch (e) {
        console.log('Player not available for seek:', e);
      }
    } catch (error) {
      console.log('Seek error:', error);
    }
  }, [player]);

  const handleProgressBarLayout = useCallback((event: LayoutChangeEvent) => {
    setProgressBarWidth(event.nativeEvent.layout.width);
  }, []);

  const updateSeekFromX = useCallback((x: number) => {
    if (progressBarWidth <= 0 || durationMillis <= 0) return;
    const clamped = Math.min(Math.max(x, 0), progressBarWidth);
    const ratio = clamped / progressBarWidth;
    const nextMillis = Math.floor(durationMillis * ratio);
    setSeekPositionMillis(nextMillis);
  }, [progressBarWidth, durationMillis]);

  const handleClose = useCallback(async () => {
    if (isClosing) return;
    setIsClosing(true);
    try {
      player.pause();
    } catch {}
    if (Platform.OS !== 'web') {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (e) {
        console.log('[Player] Portrait lock on close failed:', e);
      }
    }
    router.back();
  }, [isClosing, player]);

  /* Tasto fisico "indietro" Android → usa handleClose per attendere
     il lock portrait prima di tornare alla schermata precedente */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      void handleClose();
      return true;
    };
    BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => BackHandler.removeEventListener('hardwareBackPress', onBack);
  }, [handleClose]);

  const handlePiP = useCallback(() => {
    try {
      void videoViewRef.current?.startPictureInPicture();
      console.log('📺 PiP started');
    } catch (e) {
      console.log('PiP not supported:', e);
    }
  }, []);

  const playNextVideo = useCallback(() => {
    if (!nextVideo) return;
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setVideoEnded(false);
    setCountdown(NEXT_VIDEO_COUNTDOWN);
    setIsLoading(true);
    setIsPlaying(true);
    progressAnim.setValue(1);
    router.replace({
      pathname: '/player' as any,
      params: {
        url: nextVideo.videoUrl,
        title: nextVideo.title,
        date: nextVideo.pubDate,
        category: videoCategory,
        videoId: nextVideo.id,
      },
    });
  }, [nextVideo, videoCategory, progressAnim]);

  const shouldNavigateRef = useRef(false);

  useEffect(() => {
    if (shouldNavigateRef.current) {
      shouldNavigateRef.current = false;
      playNextVideo();
    }
  }, [countdown, playNextVideo]);

  useEffect(() => {
    if (videoEnded && nextVideo) {
      setCountdown(NEXT_VIDEO_COUNTDOWN);
      progressAnim.setValue(1);
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: NEXT_VIDEO_COUNTDOWN * 1000,
        useNativeDriver: false,
      }).start();

      countdownRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            countdownRef.current = null;
            shouldNavigateRef.current = true;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
      };
    }
  }, [videoEnded, nextVideo, playNextVideo, progressAnim]);

  const cancelNextVideo = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    shouldNavigateRef.current = false;
    progressAnim.stopAnimation();
    setVideoEnded(false);
    setCountdown(NEXT_VIDEO_COUNTDOWN);
    router.back();
  }, [progressAnim]);

  if (!videoUrl) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>URL video non disponibile</Text>
        <TouchableOpacity style={styles.closeButton} onPress={handleClose}>
          <Text style={styles.closeButtonText}>Chiudi</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isLandscape = dimensions.width > dimensions.height;
  
  const containerStyle = isFullscreen 
    ? styles.fullscreenContainer 
    : styles.normalContainer;

  const videoContainerStyle = isFullscreen
    ? { flex: 1 } as const
    : { width: dimensions.width * 0.9, height: (dimensions.width * 0.9) * (9 / 16), backgroundColor: '#000' };

  if (!orientationReady || isClosing) {
    return (
      <View style={styles.fullscreenContainer}>
        <StatusBar hidden />
      </View>
    );
  }

  return (
    <View style={containerStyle}>
      <StatusBar hidden={isFullscreen && isLandscape} />
      
      {!isFullscreen && videoTitle ? (
        <View style={styles.headerContainer}>
          <View style={styles.titleRow}>
            <Text style={styles.titleText} numberOfLines={2}>
              {videoTitle}
            </Text>
            <TouchableOpacity 
              onPress={handleClose}
              style={styles.closeButtonTop}
              activeOpacity={0.7}
            >
              <X color={Colors.dark.text} size={24} />
            </TouchableOpacity>
          </View>
        </View>
      ) : null}
      
      <View style={videoContainerStyle}>
        <VideoView
          ref={videoViewRef}
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          allowsPictureInPicture
          startsPictureInPictureAutomatically
        />
        <Pressable style={StyleSheet.absoluteFill} onPress={handleVideoPress} />

        {(playerError || isStalled || (!isConnected && isLoading)) && (
          <View style={styles.errorOverlay}>
            {!isConnected ? (
              <WifiOff color={Colors.dark.textSecondary} size={48} />
            ) : (
              <AlertTriangle color={Colors.dark.error} size={48} />
            )}
            <Text style={styles.errorOverlayTitle}>
              {!isConnected ? 'Nessuna connessione' : isStalled ? 'Streaming temporaneamente non disponibile' : 'Errore di riproduzione'}
            </Text>
            <Text style={styles.errorOverlayDesc}>
              {!isConnected
                ? 'Controlla la tua connessione internet e riprova'
                : isStalled
                  ? 'La riproduzione si è interrotta. Riprova per continuare.'
                  : 'Impossibile riprodurre il video. Riprova.'}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetryPlayer}
              activeOpacity={0.7}
              testID="player-retry"
            >
              <RefreshIcon color={Colors.dark.text} size={18} />
              <Text style={styles.retryButtonText}>Riprova</Text>
            </TouchableOpacity>
          </View>
        )}

        {isLoading && !playerError && !isStalled && isConnected && (
          <View style={styles.loadingOverlay}>
            <LoadingState />
            {loadingTooLong && (
              <View style={styles.loadingHint}>
                <Text style={styles.loadingHintText}>Il caricamento sta richiedendo più del solito...</Text>
                <TouchableOpacity
                  style={styles.retryButtonSmall}
                  onPress={handleRetryPlayer}
                  activeOpacity={0.7}
                >
                  <RefreshIcon color={Colors.dark.accent} size={14} />
                  <Text style={styles.retryButtonSmallText}>Riprova</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {showControls && !isLoading && (
          <>
            {isFullscreen && (
              <View style={styles.topControls}>
                <TouchableOpacity 
                  onPress={handleClose}
                  style={styles.controlButton}
                  activeOpacity={0.7}
                  testID="player-close"
                >
                  <X color={Colors.dark.text} size={24} />
                </TouchableOpacity>
                <View style={styles.spacer} />
              </View>
            )}

            <View style={styles.centerControls}>
              <TouchableOpacity 
                style={styles.playButton}
                onPress={handlePlayPause}
                activeOpacity={0.7}
                testID="player-play-pause"
              >
                {isPlaying ? (
                  <Pause color={Colors.dark.text} size={40} fill={Colors.dark.text} />
                ) : (
                  <Play color={Colors.dark.text} size={40} fill={Colors.dark.text} />
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.bottomControls}>
              <View style={styles.progressRow}>
                <Text style={styles.timeText} testID="player-time-current">
                  {formatTime(isSeeking ? seekPositionMillis : positionMillis)}
                </Text>
                <View
                  style={styles.progressBarWrapper}
                  onLayout={handleProgressBarLayout}
                  testID="player-progress-bar"
                  {...PanResponder.create({
                    onStartShouldSetPanResponder: () => true,
                    onMoveShouldSetPanResponder: () => true,
                    onPanResponderGrant: (evt) => {
                      setIsSeeking(true);
                      updateSeekFromX(evt.nativeEvent.locationX);
                    },
                    onPanResponderMove: (evt) => {
                      updateSeekFromX(evt.nativeEvent.locationX);
                    },
                    onPanResponderRelease: () => {
                      const target = seekPositionMillis;
                      setIsSeeking(false);
                      seekToMillis(target);
                    },
                    onPanResponderTerminationRequest: () => false,
                    onPanResponderTerminate: () => {
                      const target = seekPositionMillis;
                      setIsSeeking(false);
                      seekToMillis(target);
                    },
                  }).panHandlers}
                >
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: durationMillis > 0
                            ? `${Math.min(100, ((isSeeking ? seekPositionMillis : positionMillis) / durationMillis) * 100)}%`
                            : '0%',
                        },
                      ]}
                    />
                    <View
                      style={[
                        styles.progressThumb,
                        {
                          left: durationMillis > 0
                            ? `${Math.min(100, ((isSeeking ? seekPositionMillis : positionMillis) / durationMillis) * 100)}%`
                            : '0%',
                        },
                      ]}
                    />
                  </View>
                </View>
                <Text style={styles.timeText} testID="player-time-duration">
                  {formatTime(durationMillis)}
                </Text>
              </View>
              <View style={styles.bottomActions}>
                <TouchableOpacity 
                  onPress={handleMuteToggle}
                  style={styles.controlButton}
                  activeOpacity={0.7}
                  testID="player-mute"
                >
                  {isMuted ? (
                    <VolumeX color={Colors.dark.text} size={24} />
                  ) : (
                    <Volume2 color={Colors.dark.text} size={24} />
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handlePiP}
                  style={styles.controlButton}
                  activeOpacity={0.7}
                  testID="player-pip"
                >
                  <PictureInPicture2 color={Colors.dark.text} size={22} />
                </TouchableOpacity>
                <View style={styles.spacer} />
                {nextVideo && !videoEnded && (
                  <TouchableOpacity 
                    onPress={playNextVideo}
                    style={styles.skipButton}
                    activeOpacity={0.7}
                    testID="player-skip-next"
                  >
                    <SkipForward color={Colors.dark.text} size={22} />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </>
        )}
      </View>

      {videoEnded && nextVideo && (
        <View style={styles.nextVideoOverlay}>
          <View style={styles.nextVideoCard}>
            <Text style={styles.nextVideoLabel}>Prossimo video tra {countdown}s</Text>
            <View style={styles.nextVideoInfo}>
              {nextVideo.thumbnail ? (
                <Image source={{ uri: nextVideo.thumbnail }} style={styles.nextVideoThumb} />
              ) : (
                <View style={[styles.nextVideoThumb, { backgroundColor: Colors.dark.surface }]} />
              )}
              <View style={styles.nextVideoText}>
                <Text style={styles.nextVideoTitle} numberOfLines={2}>{nextVideo.title}</Text>
                <Text style={styles.nextVideoCategory}>
                  {videoCategory === 'sport' ? 'Sport' : 'Cronaca'}
                </Text>
              </View>
            </View>
            <View style={styles.nextVideoProgressBg}>
              <Animated.View
                style={[
                  styles.nextVideoProgressFill,
                  {
                    width: progressAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0%', '100%'],
                    }),
                  },
                ]}
              />
            </View>
            <View style={styles.nextVideoActions}>
              <TouchableOpacity
                style={styles.nextVideoCancelBtn}
                onPress={cancelNextVideo}
                activeOpacity={0.7}
              >
                <Text style={styles.nextVideoCancelText}>Annulla</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.nextVideoPlayBtn}
                onPress={playNextVideo}
                activeOpacity={0.7}
              >
                <Play color={Colors.dark.text} size={16} fill={Colors.dark.text} />
                <Text style={styles.nextVideoPlayText}>Riproduci ora</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {!isFullscreen && videoDate ? (
        <View style={styles.dateContainer}>
          <Text style={styles.dateTextBelow}>{formatDate(videoDate)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  normalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleText: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '700' as const,
    lineHeight: 24,
  },
  closeButtonTop: {
    padding: 4,
    marginTop: -4,
  },
  dateContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  dateTextBelow: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: '500' as const,
  },
  topControls: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: 50,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  centerControls: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
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
    padding: 16,
    paddingBottom: 30,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    gap: 12,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  progressBarWrapper: {
    flex: 1,
    height: 24,
    justifyContent: 'center',
  },
  progressTrack: {
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'rgba(59, 130, 246, 0.95)',
  },
  progressThumb: {
    position: 'absolute',
    top: -5,
    width: 14,
    height: 14,
    marginLeft: -7,
    borderRadius: 7,
    backgroundColor: Colors.dark.text,
    borderWidth: 2,
    borderColor: 'rgba(59, 130, 246, 1)',
  },
  timeText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: '600' as const,
    minWidth: 40,
    textAlign: 'center',
  },
  bottomActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButton: {
    padding: 8,
  },
  spacer: {
    flex: 1,
  },
  errorContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: Colors.dark.text,
    marginBottom: 20,
    textAlign: 'center',
  },
  closeButton: {
    backgroundColor: Colors.dark.accent,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  closeButtonText: {
    color: Colors.dark.text,
    fontWeight: '600' as const,
  },
  skipButton: {
    padding: 8,
    marginLeft: 8,
  },
  nextVideoOverlay: {
    position: 'absolute',
    bottom: 60,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 100,
  },
  nextVideoCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: 'rgba(21, 27, 46, 0.95)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
  },
  nextVideoLabel: {
    color: Colors.dark.accent,
    fontSize: 13,
    fontWeight: '700' as const,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  nextVideoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  nextVideoThumb: {
    width: 80,
    height: 45,
    borderRadius: 8,
  },
  nextVideoText: {
    flex: 1,
    gap: 4,
  },
  nextVideoTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  nextVideoCategory: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: '500' as const,
  },
  nextVideoProgressBg: {
    height: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 2,
    marginBottom: 12,
    overflow: 'hidden',
  },
  nextVideoProgressFill: {
    height: '100%',
    backgroundColor: Colors.dark.accent,
    borderRadius: 2,
  },
  nextVideoActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextVideoCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  nextVideoCancelText: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  nextVideoPlayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.accent,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  nextVideoPlayText: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '700' as const,
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
});
