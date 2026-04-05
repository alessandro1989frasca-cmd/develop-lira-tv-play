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
  ScrollView,
  Modal,
  Animated,
  AppState,
  AppStateStatus,
  BackHandler,
} from 'react-native';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useQuery } from '@tanstack/react-query';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import {
  Play, Pause, Volume2, VolumeX, Maximize2, Minimize2,
  X, Clock, Bell, BellOff, Calendar, RefreshCw, CheckCircle, PictureInPicture2,
} from 'lucide-react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Notifications from 'expo-notifications';
import { useKeepAwake } from 'expo-keep-awake';
import * as NavigationBar from 'expo-navigation-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { captureException } from '@/lib/errorReporter';

import Colors from '@/constants/colors';
import { useAppConfig } from '@/providers/AppConfigProvider';
import { fetchSchedule, getCurrentProgram, fetchCachedPrograms, findMatchingVod } from '@/utils/dataService';
import { ProgramSchedule, VideoContent } from '@/types';
import LoadingState from '@/components/LoadingState';
import LiveIndicator from '@/components/LiveIndicator';
import { getDeviceId } from '@/lib/deviceId';
import { registerDevice, trackSessionDirect } from '@/utils/dataService';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { configureAudioSession } from '@/lib/audioSession';
import { WifiOff, RefreshCw as RefreshIcon, AlertTriangle } from 'lucide-react-native';

const SINGLE_NOTIF_KEY = 'notif_single_v1';
const RECURRING_NOTIF_KEY = 'notif_recurring_v1';
const NOTIF_MINUTES_BEFORE = 5;

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

async function requestNotifPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

async function scheduleNotifForProgram(program: ProgramSchedule): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  const now = new Date();
  if (program.startTime <= now) return null;
  const notifTime = new Date(program.startTime.getTime() - NOTIF_MINUTES_BEFORE * 60 * 1000);
  const secondsUntil = Math.max(3, Math.floor((notifTime.getTime() - now.getTime()) / 1000));
  const isImmediate = notifTime <= now;
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📺 Sta per iniziare!',
        body: isImmediate
          ? `${program.title} sta per iniziare!`
          : `${program.title} inizia tra ${NOTIF_MINUTES_BEFORE} minuti`,
        sound: true,
      },
      trigger: isImmediate ? null : { type: 'timeInterval', seconds: secondsUntil, repeats: false } as Notifications.NotificationTriggerInput,
    });
    return id;
  } catch (e) {
    console.log('Failed to schedule notification:', e);
    return null;
  }
}

async function cancelNotif(notifId: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
  } catch (e) {
    console.log('Failed to cancel notification:', e);
  }
}

export default function LiveScreen() {
  useKeepAwake();
  const navigation = useNavigation();
  const router = useRouter();
  const videoViewRef = useRef<VideoView>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState(Dimensions.get('window'));
  const controlsTimeoutRef = useRef<number | null>(null);
  const contentScrollRef = useRef<ScrollView>(null);
  const scheduleSectionY = useRef(0);
  const scheduleTimelineY = useRef(0);
  const liveItemY = useRef(0);
  const [hasScrolledToLive, setHasScrolledToLive] = useState(false);

  const [streamError, setStreamError] = useState<boolean>(false);
  const [loadingTooLong, setLoadingTooLong] = useState<boolean>(false);
  const [isStalled, setIsStalled] = useState<boolean>(false);
  const loadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stallCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastTimeRef = useRef<number>(0);
  const stallCountRef = useRef<number>(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const isMountedRef = useRef(true);
  const isFullscreenRef = useRef(false);
  const prevConnectedRef = useRef<boolean | null>(null);
  const { isConnected, checkNow } = useNetworkStatus();
  const appConfig = useAppConfig();

  const [selectedProgram, setSelectedProgram] = useState<ProgramSchedule | null>(null);
  const [showNotifModal, setShowNotifModal] = useState(false);
  const [singleNotifs, setSingleNotifs] = useState<Record<string, string>>({});
  const [recurringTitles, setRecurringTitles] = useState<string[]>([]);
  const [notifSuccess, setNotifSuccess] = useState(false);
  const [isLiveBehind, setIsLiveBehind] = useState(false);
  const leftTabAtRef = useRef<number | null>(null);

  const slideAnim = useRef(new Animated.Value(600)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const bellAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  useEffect(() => {
    isFullscreenRef.current = isFullscreen;
  }, [isFullscreen]);

  useEffect(() => {
    void configureAudioSession();
  }, []);

  const player = useVideoPlayer(appConfig.liveStreamUrl, (p) => {
    p.loop = false;
    p.staysActiveInBackground = true;
    p.play();
  });

  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status: playerStatus } = useEvent(player, 'statusChange', { status: player.status });
  const isLoading = playerStatus === 'loading' || playerStatus === 'idle';

  useEffect(() => {
    if (playerStatus === 'error') {
      const errMsg = (player as unknown as { error?: { message?: string } })?.error?.message ?? 'Player error';
      console.log('[Live] Player error detected:', errMsg);
      captureException(new Error(errMsg), 'live', 'player_status_error');
      setStreamError(true);
      setIsStalled(false);
    } else if (playerStatus === 'readyToPlay') {
      console.log('[Live] Ready to play');
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
            console.log('[Live] Stall count:', stallCountRef.current);
            if (stallCountRef.current >= 4) {
              console.log('[Live] Stream stalled, showing recovery UI');
              if (isMountedRef.current) setIsStalled(true);
            }
          } else {
            if (stallCountRef.current > 0) {
              console.log('[Live] Stall recovered naturally');
            }
            stallCountRef.current = 0;
            if (isMountedRef.current) setIsStalled(false);
          }
        }
        lastTimeRef.current = currentTime;
      } catch (e) {
        console.log('[Live] Stall check error:', e);
      }
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
        /* App in background/chiusa: pausa player per evitare crash ExoPlayer
           quando Android distrugge la SurfaceView mentre il player è attivo */
        try { player.pause(); } catch {}
      } else if (prev.match(/inactive|background/) && nextState === 'active') {
        console.log('[Live] App returned to foreground, checking player state');
        try {
          const status = player.status;
          if (status === 'error') {
            console.log('[Live] Player in error after foreground, retrying');
            player.replace(appConfig.liveStreamUrl);
            player.play();
          } else if (status === 'readyToPlay' && isPlaying) {
            const ct = player.currentTime ?? 0;
            console.log('[Live] Foreground resume, currentTime:', ct);
          }
        } catch (e) {
          console.log('[Live] Foreground recovery error:', e);
        }
        stallCountRef.current = 0;
        if (isMountedRef.current) setIsStalled(false);
      }
    };
    const sub = AppState.addEventListener('change', handleAppState);
    return () => sub.remove();
  }, [player, isPlaying]);

  useEffect(() => {
    if (prevConnectedRef.current === false && isConnected === true) {
      console.log('[Live] Network reconnected');
      if (streamError || isStalled) {
        console.log('[Live] Auto-retrying after network reconnection');
        setStreamError(false);
        setIsStalled(false);
        setLoadingTooLong(false);
        try {
          player.replace(appConfig.liveStreamUrl);
          player.play();
        } catch (e) {
          console.log('[Live] Auto-retry failed:', e);
        }
      }
    }
    prevConnectedRef.current = isConnected;
  }, [isConnected, streamError, isStalled, player]);

  useEffect(() => {
    if (isLoading && !streamError) {
      loadingTimerRef.current = setTimeout(() => {
        console.log('[Live] Loading too long (20s)');
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
    console.log('[Live] Retrying stream...');
    setStreamError(false);
    setIsStalled(false);
    setLoadingTooLong(false);
    stallCountRef.current = 0;
    const online = await checkNow();
    if (!online) {
      console.log('[Live] Still offline, cannot retry');
      return;
    }
    try {
      player.replace(appConfig.liveStreamUrl);
      player.play();
    } catch (e) {
      console.log('[Live] Retry failed:', e);
      setStreamError(true);
    }
  }, [player, checkNow, appConfig.liveStreamUrl]);

  const deviceRegisteredRef = useRef(false);
  const sessionStartRef = useRef<number>(Date.now());
  const deviceIdRef = useRef<string>('');

  useEffect(() => {
    getDeviceId().then((id) => {
      deviceIdRef.current = id;
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!deviceRegisteredRef.current) {
      deviceRegisteredRef.current = true;
      void getDeviceId().then((deviceId) => {
        console.log('[Live] Registering device');
        registerDevice(deviceId, Platform.OS, String(Platform.Version)).catch(() => console.log('[Live] Register device error'));
      }).catch(() => console.log('[Live] Register device error'));
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      sessionStartRef.current = Date.now();
      console.log('[Live] Session started (focus)');
      return () => {
        const durationSec = Math.round((Date.now() - sessionStartRef.current) / 1000);
        if (durationSec >= 3 && deviceIdRef.current) {
          console.log('[Live] Tracking session via direct fetch:', durationSec, 'sec');
          trackSessionDirect(deviceIdRef.current, 'live', 'live_stream', durationSec).catch(() => {});
        }
      };
    }, [])
  );

  const { data: schedule = [] } = useQuery({
    queryKey: ['schedule'],
    queryFn: fetchSchedule,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
    retry: 3,
    retryDelay: 2000,
  });

  const { data: vodList = [] } = useQuery({
    queryKey: ['cached-programs-vod'],
    queryFn: fetchCachedPrograms,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const currentProgram = getCurrentProgram(schedule);

  const todaySchedule = React.useMemo(() => {
    const today = new Date();
    return schedule
      .filter(program => {
        const programDate = program.startTime.toDateString();
        const todayDate = today.toDateString();
        return programDate === todayDate;
      })
      .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
  }, [schedule]);

  const vodMatches = React.useMemo(() => {
    const now = new Date();
    const map = new Map<string, VideoContent>();
    for (const program of todaySchedule) {
      if (program.endTime < now && vodList.length > 0) {
        const match = findMatchingVod(program.title, program.endTime, vodList);
        if (match) map.set(program.id, match);
      }
    }
    return map;
  }, [todaySchedule, vodList]);

  useEffect(() => {
    const loadStoredNotifs = async () => {
      try {
        const [singleRaw, recurringRaw] = await Promise.all([
          AsyncStorage.getItem(SINGLE_NOTIF_KEY),
          AsyncStorage.getItem(RECURRING_NOTIF_KEY),
        ]);
        if (singleRaw) setSingleNotifs(JSON.parse(singleRaw));
        if (recurringRaw) setRecurringTitles(JSON.parse(recurringRaw));
        console.log('Loaded notification preferences');
      } catch (e) {
        console.log('Failed to load notification prefs:', e);
      }
    };
    void loadStoredNotifs();
  }, []);

  useEffect(() => {
    if (recurringTitles.length === 0 || todaySchedule.length === 0) return;
    const now = new Date();
    const scheduleRecurringNotifs = async () => {
      const updatedSingle = { ...singleNotifs };
      let changed = false;
      for (const program of todaySchedule) {
        if (
          recurringTitles.includes(program.title) &&
          program.startTime > now &&
          !updatedSingle[program.id]
        ) {
          const id = await scheduleNotifForProgram(program);
          if (id) {
            updatedSingle[program.id] = id;
            changed = true;
            console.log(`Scheduled recurring notification for: ${program.title}`);
          }
        }
      }
      if (changed) {
        setSingleNotifs(updatedSingle);
        await AsyncStorage.setItem(SINGLE_NOTIF_KEY, JSON.stringify(updatedSingle));
      }
    };
    void scheduleRecurringNotifs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringTitles, todaySchedule]);

  useEffect(() => {
    if (hasScrolledToLive || todaySchedule.length === 0 || isFullscreen) return;
    const hasLive = todaySchedule.some(p => p.isLive);
    if (!hasLive) { setHasScrolledToLive(true); return; }
    const timer = setTimeout(() => {
      if (contentScrollRef.current && liveItemY.current > 0) {
        contentScrollRef.current.scrollTo({
          y: Math.max(0, scheduleSectionY.current + scheduleTimelineY.current + liveItemY.current - 40),
          animated: true,
        });
        setHasScrolledToLive(true);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [todaySchedule, hasScrolledToLive, isFullscreen]);

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
    const setupOrientation = async () => {
      if (Platform.OS !== 'web') {
        try {
          if (isFullscreen) {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            console.log('[Live] Forced landscape for fullscreen');
            if (Platform.OS === 'android' && !cancelled) {
              try {
                await NavigationBar.setVisibilityAsync('hidden');
              } catch (e) {
                console.log('[Live] NavBar hide failed:', e);
              }
            }
          } else {
            // Force portrait first so the screen doesn't stay in landscape
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            console.log('[Live] Forced portrait on fullscreen exit');
            if (Platform.OS === 'android' && !cancelled) {
              try {
                await NavigationBar.setVisibilityAsync('visible');
              } catch (e) {
                console.log('[Live] NavBar restore failed:', e);
              }
            }
          }
        } catch (error) {
          console.log('[Live] Screen orientation not supported:', error);
        }
      }
    };
    void setupOrientation();
    return () => {
      cancelled = true;
      if (Platform.OS !== 'web') {
        /* Se eravamo in fullscreen landscape, forziamo portrait al cleanup
           (unmount o cambio isFullscreen). unlockAsync() da solo lascerebbe
           lo schermo libero di restare in landscape. */
        if (isFullscreen) {
          ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
          if (Platform.OS === 'android') {
            NavigationBar.setVisibilityAsync('visible').catch(() => {});
          }
        } else {
          ScreenOrientation.unlockAsync().catch(() => {});
        }
      }
    };
  }, [isFullscreen]);


  /* Tasto fisico "indietro" Android in fullscreen → esci dal fullscreen
     invece di lasciare lo schermo in landscape */
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const onBack = () => {
      if (isFullscreenRef.current) {
        setIsFullscreen(false);
        return true;
      }
      return false;
    };
    const backSub = BackHandler.addEventListener('hardwareBackPress', onBack);
    return () => backSub.remove();
  }, []);

  useEffect(() => {
    navigation.setOptions({
      tabBarStyle: isFullscreen ? { display: 'none' } : undefined,
    });
  }, [isFullscreen, navigation]);

  const openNotifModal = useCallback((program: ProgramSchedule) => {
    const now = new Date();
    if (program.startTime <= now) return;
    setSelectedProgram(program);
    setNotifSuccess(false);
    setShowNotifModal(true);
    Animated.parallel([
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: Platform.OS !== 'web', tension: 65, friction: 11 }),
      Animated.timing(overlayAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
    ]).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(bellAnim, { toValue: 1.2, duration: 400, useNativeDriver: true }),
        Animated.timing(bellAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      ]),
      { iterations: 3 }
    ).start();
  }, [slideAnim, overlayAnim, bellAnim]);

  const closeNotifModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: 600, duration: 280, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      setShowNotifModal(false);
      setSelectedProgram(null);
    });
  }, [slideAnim, overlayAnim]);

  const getProgramNotifStatus = useCallback((program: ProgramSchedule): 'none' | 'once' | 'recurring' => {
    if (recurringTitles.includes(program.title)) return 'recurring';
    if (singleNotifs[program.id]) return 'once';
    return 'none';
  }, [singleNotifs, recurringTitles]);

  const handleSubscribeOnce = useCallback(async () => {
    if (!selectedProgram) return;
    const granted = await requestNotifPermission();
    if (!granted) {
      console.log('Notification permission denied');
      return;
    }
    if (singleNotifs[selectedProgram.id]) {
      await cancelNotif(singleNotifs[selectedProgram.id]);
    }
    const id = await scheduleNotifForProgram(selectedProgram);
    if (id) {
      const updated = { ...singleNotifs, [selectedProgram.id]: id };
      setSingleNotifs(updated);
      await AsyncStorage.setItem(SINGLE_NOTIF_KEY, JSON.stringify(updated));
      console.log(`Scheduled once notification for: ${selectedProgram.title}`);
    }
    setNotifSuccess(true);
    setTimeout(() => closeNotifModal(), 1200);
  }, [selectedProgram, singleNotifs, closeNotifModal]);

  const handleSubscribeRecurring = useCallback(async () => {
    if (!selectedProgram) return;
    const granted = await requestNotifPermission();
    if (!granted) {
      console.log('Notification permission denied');
      return;
    }
    if (!recurringTitles.includes(selectedProgram.title)) {
      const updated = [...recurringTitles, selectedProgram.title];
      setRecurringTitles(updated);
      await AsyncStorage.setItem(RECURRING_NOTIF_KEY, JSON.stringify(updated));
    }
    if (!singleNotifs[selectedProgram.id]) {
      const id = await scheduleNotifForProgram(selectedProgram);
      if (id) {
        const updatedSingle = { ...singleNotifs, [selectedProgram.id]: id };
        setSingleNotifs(updatedSingle);
        await AsyncStorage.setItem(SINGLE_NOTIF_KEY, JSON.stringify(updatedSingle));
      }
    }
    console.log(`Subscribed recurring to: ${selectedProgram.title}`);
    setNotifSuccess(true);
    setTimeout(() => closeNotifModal(), 1200);
  }, [selectedProgram, singleNotifs, recurringTitles, closeNotifModal]);

  const handleUnsubscribe = useCallback(async () => {
    if (!selectedProgram) return;
    if (singleNotifs[selectedProgram.id]) {
      await cancelNotif(singleNotifs[selectedProgram.id]);
      const updated = { ...singleNotifs };
      delete updated[selectedProgram.id];
      setSingleNotifs(updated);
      await AsyncStorage.setItem(SINGLE_NOTIF_KEY, JSON.stringify(updated));
    }
    if (recurringTitles.includes(selectedProgram.title)) {
      const updated = recurringTitles.filter(t => t !== selectedProgram.title);
      setRecurringTitles(updated);
      await AsyncStorage.setItem(RECURRING_NOTIF_KEY, JSON.stringify(updated));
    }
    console.log(`Unsubscribed from: ${selectedProgram.title}`);
    closeNotifModal();
  }, [selectedProgram, singleNotifs, recurringTitles, closeNotifModal]);

  const handlePlayPause = () => {
    if (isPlaying) {
      player.pause();
    } else {
      player.play();
    }
  };

  const handleMuteToggle = () => {
    const newMuted = !isMuted;
    player.muted = newMuted;
    setIsMuted(newMuted);
  };

  const handleVideoPress = () => {
    setShowControls(!showControls);
  };

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  const handleClose = useCallback(async () => {
    if (isFullscreen) {
      if (Platform.OS !== 'web') {
        try {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        } catch (e) {
          console.log('[Live] Portrait lock on close failed:', e);
        }
      }
      setIsFullscreen(false);
    }
  }, [isFullscreen]);

  const handlePiP = useCallback(() => {
    try {
      void videoViewRef.current?.startPictureInPicture();
      console.log('📺 PiP started');
    } catch (e) {
      console.log('PiP not supported:', e);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      player.play();
      if (leftTabAtRef.current !== null && Date.now() - leftTabAtRef.current > 5000) {
        setIsLiveBehind(true);
      }
      leftTabAtRef.current = null;
      return () => {
        player.pause();
        leftTabAtRef.current = Date.now();
      };
    }, [player])
  );

  const isLandscape = dimensions.width > dimensions.height;
  const containerStyle = isFullscreen ? styles.fullscreenContainer : styles.container;
  const videoContainerStyle = isFullscreen
    ? { flex: 1, backgroundColor: '#000' } as const
    : { width: dimensions.width * 0.9, height: (dimensions.width * 0.9) * (9 / 16), backgroundColor: '#000', alignSelf: 'center' as const };

  const notifStatus = selectedProgram ? getProgramNotifStatus(selectedProgram) : 'none';
  const isAlreadySubscribed = notifStatus !== 'none';

  return (
    <View style={containerStyle}>
      <StatusBar hidden={isFullscreen && isLandscape} />

      {!isFullscreen && (
        <View style={styles.headerContainer}>
          <View style={styles.headerContent}>
            <LiveIndicator size="small" />
            {currentProgram && (
              <Text style={styles.headerTitle} numberOfLines={1}>
                {currentProgram.title}
              </Text>
            )}
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
          onPictureInPictureStart={() => {
            console.log('[Live] PiP started');
          }}
          onPictureInPictureStop={() => {
            console.log('[Live] PiP stopped');
            if (appStateRef.current !== 'active') {
              console.log('[Live] PiP dismissed in background, pausing player');
              try { player.pause(); } catch (e) { console.log('[Live] Pause after PiP stop failed:', e); }
            }
          }}
        />

        {/* Tap area esplicito sopra la VideoView (SurfaceView su Android intercetta
            i tocchi prima che arrivino al wrapper esterno — Pressable qui sopra
            li cattura nel layer React Native prima della SurfaceView nativa) */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleVideoPress}
        />

        {(streamError || isStalled || (!isConnected && isLoading)) && (
          <View style={styles.errorOverlay}>
            {!isConnected ? (
              <WifiOff color={Colors.dark.textSecondary} size={48} />
            ) : (
              <AlertTriangle color={Colors.dark.error} size={48} />
            )}
            <Text style={styles.errorOverlayTitle}>
              {!isConnected ? 'Nessuna connessione' : isStalled ? 'Streaming temporaneamente non disponibile' : 'Stream non disponibile'}
            </Text>
            <Text style={styles.errorOverlayDesc}>
              {!isConnected
                ? 'Controlla la tua connessione internet e riprova'
                : isStalled
                  ? 'La riproduzione si è interrotta. Riprova per continuare.'
                  : 'Lo stream potrebbe essere temporaneamente offline'}
            </Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={handleRetryStream}
              activeOpacity={0.7}
              testID="live-retry"
            >
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
                <TouchableOpacity
                  style={styles.retryButtonSmall}
                  onPress={handleRetryStream}
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
                <TouchableOpacity onPress={handleClose} style={styles.controlButton} activeOpacity={0.7}>
                  <X color={Colors.dark.text} size={24} />
                </TouchableOpacity>
                <LiveIndicator size="large" />
                {currentProgram && (
                  <View style={styles.programInfo}>
                    <Text style={styles.programTitle} numberOfLines={1}>{currentProgram.title}</Text>
                  </View>
                )}
                <View style={styles.spacer} />
              </View>
            )}
            <View style={styles.centerControls}>
              <TouchableOpacity style={styles.playButton} onPress={handlePlayPause} activeOpacity={0.7}>
                {isPlaying
                  ? <Pause color={Colors.dark.text} size={40} fill={Colors.dark.text} />
                  : <Play color={Colors.dark.text} size={40} fill={Colors.dark.text} />}
              </TouchableOpacity>
            </View>
            <View style={styles.bottomControls}>
              <TouchableOpacity onPress={handleMuteToggle} style={styles.controlButton} activeOpacity={0.7}>
                {isMuted
                  ? <VolumeX color={Colors.dark.text} size={24} />
                  : <Volume2 color={Colors.dark.text} size={24} />}
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePiP} style={styles.controlButton} activeOpacity={0.7} testID="live-pip">
                <PictureInPicture2 color={Colors.dark.text} size={22} />
              </TouchableOpacity>
              <View style={styles.spacer} />
              <TouchableOpacity onPress={toggleFullscreen} style={styles.controlButton} activeOpacity={0.7}>
                {isFullscreen
                  ? <Minimize2 color={Colors.dark.text} size={24} />
                  : <Maximize2 color={Colors.dark.text} size={24} />}
              </TouchableOpacity>
            </View>
          </>
        )}

        {isLiveBehind && !streamError && !isStalled && (
          <TouchableOpacity
            style={styles.backToLiveButton}
            onPress={() => {
              player.replaceAsync(appConfig.liveStreamUrl).catch(() => {});
              setIsLiveBehind(false);
            }}
            activeOpacity={0.8}
          >
            <View style={styles.backToLiveDot} />
            <Text style={styles.backToLiveText}>Torna al Live</Text>
          </TouchableOpacity>
        )}
      </View>

      {!isFullscreen && (
        <>
          <View style={styles.scheduleTitleContainer}>
            <Calendar color={Colors.dark.accent} size={16} />
            <Text style={styles.scheduleTitle}>Palinsesto</Text>
            <Text style={styles.scheduleDateLabel}>Oggi</Text>
          </View>
          <ScrollView ref={contentScrollRef} style={styles.contentSection} showsVerticalScrollIndicator={false}>
            <View
              style={styles.scheduleSection}
              onLayout={(e) => { scheduleSectionY.current = e.nativeEvent.layout.y; }}
            >
              {todaySchedule.length === 0 ? (
                <View style={styles.scheduleEmptyContainer}>
                  <Clock color={Colors.dark.textSecondary} size={28} />
                  <Text style={styles.scheduleEmptyText}>Palinsesto in aggiornamento</Text>
                </View>
              ) : (
                <View
                  style={styles.scheduleTimeline}
                  onLayout={(e) => { scheduleTimelineY.current = e.nativeEvent.layout.y; }}
                >
                  {todaySchedule.map((item, index) => (
                    <ScheduleItem
                      key={item.id}
                      program={item}
                      isLast={index === todaySchedule.length - 1}
                      hasNotification={getProgramNotifStatus(item) !== 'none'}
                      notifType={getProgramNotifStatus(item)}
                      onPress={() => openNotifModal(item)}
                      matchedVod={vodMatches.get(item.id)}
                      onPressVod={(vod) => router.push({
                        pathname: '/player' as any,
                        params: { url: vod.videoUrl, title: vod.title, date: vod.pubDate, category: vod.category, videoId: vod.id },
                      })}
                      onLiveLayout={item.isLive ? (y) => { liveItemY.current = y; } : undefined}
                    />
                  ))}
                </View>
              )}
            </View>
          </ScrollView>
        </>
      )}

      <Modal
        visible={showNotifModal}
        transparent
        animationType="none"
        onRequestClose={closeNotifModal}
        statusBarTranslucent
      >
        <Animated.View style={[styles.modalOverlay, { opacity: overlayAnim }]}>
          <TouchableOpacity style={StyleSheet.absoluteFillObject} onPress={closeNotifModal} activeOpacity={1} />
          <Animated.View
            style={[styles.bottomSheet, { transform: [{ translateY: slideAnim }] }]}
          >
            <View style={styles.sheetHandle} />

            {notifSuccess ? (
              <View style={styles.successContainer}>
                <CheckCircle color={Colors.dark.success} size={52} />
                <Text style={styles.successText}>Notifica impostata!</Text>
              </View>
            ) : (
              <>
                <View style={styles.sheetHeader}>
                  <Animated.View style={[styles.bellContainer, { transform: [{ scale: bellAnim }] }]}>
                    <Bell color={Colors.dark.accent} size={30} fill="rgba(96,165,250,0.15)" />
                  </Animated.View>
                  <View style={styles.sheetHeaderText}>
                    <Text style={styles.sheetTitle} numberOfLines={2}>
                      {selectedProgram?.title}
                    </Text>
                    <Text style={styles.sheetTime}>
                      {selectedProgram?.startTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}
                      {' – '}
                      {selectedProgram?.endTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' })}
                    </Text>
                  </View>
                </View>

                {isAlreadySubscribed ? (
                  <View style={styles.currentNotifBanner}>
                    <CheckCircle color={Colors.dark.success} size={16} />
                    <Text style={styles.currentNotifText}>
                      {notifStatus === 'recurring'
                        ? 'Notifiche attive per tutti i futuri eventi'
                        : 'Notifica attiva per il prossimo evento'}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.sheetSubtitle}>
                  {isAlreadySubscribed
                    ? 'Modifica o rimuovi la notifica'
                    : `Ricevi una notifica ${NOTIF_MINUTES_BEFORE} minuti prima dell'inizio`}
                </Text>

                <View style={styles.optionsContainer}>
                  <TouchableOpacity
                    style={[styles.optionCard, notifStatus === 'once' && styles.optionCardActive]}
                    onPress={handleSubscribeOnce}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.optionIcon, notifStatus === 'once' && styles.optionIconActive]}>
                      <Calendar color={notifStatus === 'once' ? '#fff' : Colors.dark.accent} size={22} />
                    </View>
                    <View style={styles.optionText}>
                      <Text style={styles.optionTitle}>Solo questo evento</Text>
                      <Text style={styles.optionDesc}>Notifica una sola volta per questo episodio</Text>
                    </View>
                    {notifStatus === 'once' && <View style={styles.activeDot} />}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.optionCard, notifStatus === 'recurring' && styles.optionCardActive]}
                    onPress={handleSubscribeRecurring}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.optionIcon, notifStatus === 'recurring' && styles.optionIconActive]}>
                      <RefreshCw color={notifStatus === 'recurring' ? '#fff' : Colors.dark.accent} size={22} />
                    </View>
                    <View style={styles.optionText}>
                      <Text style={styles.optionTitle}>Tutti i futuri eventi</Text>
                      <Text style={styles.optionDesc}>Notificami ogni volta che va in onda</Text>
                    </View>
                    {notifStatus === 'recurring' && <View style={styles.activeDot} />}
                  </TouchableOpacity>
                </View>

                {isAlreadySubscribed && (
                  <TouchableOpacity style={styles.removeButton} onPress={handleUnsubscribe} activeOpacity={0.7}>
                    <BellOff color={Colors.dark.error} size={17} />
                    <Text style={styles.removeButtonText}>Rimuovi notifica</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity style={styles.cancelButton} onPress={closeNotifModal} activeOpacity={0.7}>
                  <Text style={styles.cancelButtonText}>Annulla</Text>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        </Animated.View>
      </Modal>
    </View>
  );
}

interface ScheduleItemProps {
  program: ProgramSchedule;
  isLast?: boolean;
  hasNotification?: boolean;
  notifType?: 'none' | 'once' | 'recurring';
  onPress?: () => void;
  matchedVod?: VideoContent;
  onPressVod?: (vod: VideoContent) => void;
  onLiveLayout?: (y: number) => void;
}

function ScheduleItem({ program, isLast, hasNotification, notifType, onPress, matchedVod, onPressVod, onLiveLayout }: ScheduleItemProps) {
  const [expanded, setExpanded] = React.useState(false);
  const now = new Date();
  const isPast = program.endTime < now;
  const isFuture = program.startTime > now;
  const isLive = program.isLive;

  const liveProgress = isLive
    ? Math.min(1, Math.max(0, (now.getTime() - program.startTime.getTime()) / (program.endTime.getTime() - program.startTime.getTime())))
    : 0;

  const minutesRemaining = isLive
    ? Math.max(0, Math.round((program.endTime.getTime() - now.getTime()) / 60000))
    : 0;

  const startStr = program.startTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });
  const endStr = program.endTime.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Rome' });

  return (
    <TouchableOpacity
      onPress={() => setExpanded(e => !e)}
      activeOpacity={0.75}
      style={styles.timelineRow}
      onLayout={onLiveLayout ? (e) => onLiveLayout(e.nativeEvent.layout.y) : undefined}
    >
      <View style={styles.timelineLeft}>
        <Text style={[styles.timelineTime, isPast && styles.timelineTimePast, isLive && styles.timelineTimeLive]}>
          {startStr}
        </Text>
        <View style={[styles.timelineDot, isLive && styles.timelineDotLive, isPast && styles.timelineDotPast]} />
        {!isLast && <View style={[styles.timelineLine, isPast && styles.timelineLinePast]} />}
      </View>

      <View style={[styles.timelineCard, isLive && styles.timelineCardLive, isPast && styles.timelineCardPast]}>
        {isLive && (
          <View style={styles.livePillRow}>
            <View style={styles.livePill}>
              <View style={styles.livePillDot} />
              <Text style={styles.livePillText}>IN ONDA ORA</Text>
            </View>
          </View>
        )}

        <View style={styles.timelineCardHeader}>
          <Text style={[styles.timelineTitle, isPast && styles.timelineTitlePast]} numberOfLines={isLive || expanded ? 0 : 2}>
            {program.title}
          </Text>
          {isFuture && (
            <TouchableOpacity
              style={styles.timelineBellArea}
              onPress={onPress}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              {hasNotification
                ? notifType === 'recurring'
                  ? <RefreshCw color={Colors.dark.accent} size={16} />
                  : <Bell color={Colors.dark.accent} size={16} fill={Colors.dark.accent} />
                : <Bell color={Colors.dark.textSecondary} size={15} />}
            </TouchableOpacity>
          )}
          {isPast && matchedVod && onPressVod && (
            <TouchableOpacity
              style={styles.vodBadge}
              onPress={() => onPressVod(matchedVod)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Play color="#fff" size={9} fill="#fff" />
              <Text style={styles.vodBadgeText}>Guarda</Text>
            </TouchableOpacity>
          )}
        </View>

        {expanded && !isLive && (
          <>
            {!!program.description && (
              <Text style={styles.timelineDesc}>{program.description}</Text>
            )}
            <Text style={styles.timelineEndTime}>
              {isPast ? 'Andato in onda' : 'In onda'} dalle {startStr} alle {endStr}
            </Text>
          </>
        )}

        {isLive && !!program.description && (
          <Text style={styles.timelineDesc} numberOfLines={2}>{program.description}</Text>
        )}

        {isLive && (
          <View style={styles.progressContainer}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(liveProgress * 100)}%` as any }]} />
            </View>
            <Text style={styles.progressLabel}>
              {minutesRemaining > 0 ? `${minutesRemaining} min rimasti` : 'In chiusura'}
            </Text>
          </View>
        )}

        {isLive && (
          <Text style={styles.timelineEndTime}>
            Fino alle {endStr}
          </Text>
        )}
      </View>
    </TouchableOpacity>
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
  headerTitle: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '700' as const,
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
    padding: 16,
    paddingTop: 50,
    gap: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
  contentSection: {
    flex: 1,
  },
  scheduleSection: {
    paddingBottom: 12,
  },
  scheduleTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.dark.background,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  scheduleTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  scheduleDateLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.accent,
    marginLeft: 'auto' as any,
  },
  scheduleTimeline: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    minHeight: 40,
  },
  timelineLeft: {
    width: 52,
    alignItems: 'center',
    paddingTop: 14,
  },
  timelineTime: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.dark.textSecondary,
    marginBottom: 6,
  },
  timelineTimeLive: {
    color: Colors.dark.accent,
  },
  timelineTimePast: {
    opacity: 0.4,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.dark.background,
    borderWidth: 2,
    borderColor: Colors.dark.border || '#333',
  },
  timelineDotLive: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  timelineDotPast: {
    borderColor: '#444',
    backgroundColor: '#444',
  },
  timelineLine: {
    width: 2,
    flex: 1,
    backgroundColor: Colors.dark.border || '#333',
    minHeight: 16,
  },
  timelineLinePast: {
    backgroundColor: '#333',
  },
  timelineCard: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    padding: 14,
    marginLeft: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  timelineCardLive: {
    borderColor: Colors.dark.accent,
    backgroundColor: 'rgba(59,130,246,0.07)',
  },
  timelineCardPast: {
    opacity: 0.55,
  },
  livePillRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(239,68,68,0.15)',
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  livePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#ef4444',
  },
  livePillText: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: '#ef4444',
    letterSpacing: 0.5,
  },
  timelineCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  timelineTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  timelineTitlePast: {
    color: Colors.dark.textSecondary,
  },
  timelineBellArea: {
    paddingTop: 2,
    paddingLeft: 4,
  },
  timelineDesc: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.dark.textSecondary,
    marginTop: 6,
  },
  timelineEndTime: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
    marginTop: 4,
  },
  progressContainer: {
    marginTop: 10,
    gap: 5,
  },
  progressTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.1)',
    overflow: 'hidden',
  },
  progressFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: Colors.dark.accent,
  },
  progressLabel: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  vodBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.accent,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    marginTop: 1,
  },
  vodBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600' as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  bottomSheet: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 12,
    borderTopWidth: 1,
    borderColor: Colors.dark.border,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.dark.border,
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  bellContainer: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(96,165,250,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(96,165,250,0.25)',
  },
  sheetHeaderText: {
    flex: 1,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    lineHeight: 24,
  },
  sheetTime: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.accent,
    marginTop: 2,
  },
  currentNotifBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(16,185,129,0.1)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.2)',
    marginBottom: 12,
  },
  currentNotifText: {
    fontSize: 13,
    color: Colors.dark.success,
    fontWeight: '500' as const,
    flex: 1,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  optionsContainer: {
    gap: 12,
    marginBottom: 20,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
  },
  optionCardActive: {
    borderColor: Colors.dark.accent,
    backgroundColor: 'rgba(59,130,246,0.08)',
  },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(96,165,250,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionIconActive: {
    backgroundColor: Colors.dark.secondary,
  },
  optionText: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  optionDesc: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    lineHeight: 17,
  },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.accent,
  },
  removeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    marginBottom: 8,
  },
  removeButtonText: {
    fontSize: 15,
    color: Colors.dark.error,
    fontWeight: '600' as const,
  },
  cancelButton: {
    backgroundColor: Colors.dark.background,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cancelButtonText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    fontWeight: '600' as const,
  },
  successContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 14,
  },
  successText: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark.text,
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
  scheduleEmptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  scheduleEmptyText: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    fontWeight: '500' as const,
  },
  backToLiveButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(239,68,68,0.92)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    zIndex: 10,
  },
  backToLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  backToLiveText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700' as const,
    letterSpacing: 0.2,
  },
});
