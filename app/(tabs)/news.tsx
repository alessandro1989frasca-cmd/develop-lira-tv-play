import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  TouchableOpacity,
  ScrollView,
  Animated,
  Image,
  Platform,
  Modal,
  Dimensions,
  PanResponder,
  Linking,
  Alert,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Newspaper, RefreshCw, X, WifiOff, SlidersHorizontal, Play, Pause, Maximize2, Minimize2, Bell, BellOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEvent } from 'expo';
import * as ScreenOrientation from 'expo-screen-orientation';

import Colors from '@/constants/colors';
import { fetchNewsArticles, fetchActiveBreakingNews } from '@/utils/dataService';
import {
  loadNotifPreference,
  requestAndRegisterNotifications,
  disableNotifications,
  getCurrentPermissionStatus,
  type NotifStatus,
} from '@/utils/notifications';
import { NewsArticle, BreakingNewsItem } from '@/types';
import { NewsSkeleton } from '@/components/Skeleton';
import { useUserPreferences } from '@/providers/UserPreferencesProvider';

function getDateLabel(date: Date): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const articleDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (articleDay.getTime() === today.getTime()) return 'Oggi';
  if (articleDay.getTime() === yesterday.getTime()) return 'Ieri';
  return date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export default function NewsScreen() {
  const insets = useSafeAreaInsets();
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [activeFilter, setActiveFilter] = useState<string>('Tutte');
  const [notifEnabled, setNotifEnabled] = useState(false);
  const [notifStatus, setNotifStatus] = useState<NotifStatus>('unknown');
  const { preferences } = useUserPreferences();

  useEffect(() => {
    loadNotifPreference().then(enabled => setNotifEnabled(enabled));
    getCurrentPermissionStatus().then(status => setNotifStatus(status));
  }, []);

  const { data: newsArticles = [], isLoading, refetch, isRefetching, isError } = useQuery<NewsArticle[]>({
    queryKey: ['news-articles'],
    queryFn: fetchNewsArticles,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
    retryDelay: 1000,
  });

  const { data: breakingNews = null } = useQuery<BreakingNewsItem | null>({
    queryKey: ['breaking-news'],
    queryFn: fetchActiveBreakingNews,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
  });

  const handleNotifToggle = useCallback(() => {
    if (notifEnabled) {
      Alert.alert(
        'Disattiva notifiche',
        'Non riceverai più avvisi per le notizie urgenti di Lira TV.',
        [
          { text: 'Annulla', style: 'cancel' },
          {
            text: 'Disattiva',
            style: 'destructive',
            onPress: async () => {
              await disableNotifications();
              setNotifEnabled(false);
              setNotifStatus('unknown');
            },
          },
        ]
      );
    } else if (notifStatus === 'denied') {
      Alert.alert(
        'Permesso negato',
        'Hai negato le notifiche. Per attivarle vai nelle impostazioni del tuo dispositivo.',
        [
          { text: 'Annulla', style: 'cancel' },
          { text: 'Apri Impostazioni', onPress: () => Linking.openSettings() },
        ]
      );
    } else {
      Alert.alert(
        '🔔 Notifiche urgenti',
        'Consenti a Lira TV di inviarti notifiche per le notizie urgenti e i breaking news.\n\nRiceverai un avviso immediato solo per le notizie più importanti.',
        [
          { text: 'Non ora', style: 'cancel' },
          {
            text: 'Attiva',
            onPress: async () => {
              setNotifStatus('loading');
              const result = await requestAndRegisterNotifications();
              setNotifStatus(result);
              if (result === 'granted') {
                setNotifEnabled(true);
              }
            },
          },
        ]
      );
    }
  }, [notifEnabled, notifStatus]);

  const isOffline = isError && newsArticles.length > 0;

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    newsArticles.forEach(a => {
      if (a.category) cats.add(a.category);
    });
    cats.delete('News');
    cats.delete('news');
    return ['Tutte', ...Array.from(cats).sort()];
  }, [newsArticles]);

  const filteredArticles = useMemo(() => {
    let articles = newsArticles;

    if (activeFilter !== 'Tutte') {
      articles = articles.filter(a => a.category === activeFilter);
    } else if (preferences.hasSetPreferences && preferences.favoriteCategories.length > 0) {
      const favLower = preferences.favoriteCategories.map(c => c.toLowerCase());
      const preferred = articles.filter(a => favLower.includes(a.category.toLowerCase()));
      if (preferred.length > 0) {
        articles = preferred;
      }
    }

    return articles;
  }, [newsArticles, activeFilter, preferences]);

  const sections = useMemo(() => {
    const grouped = new Map<string, { label: string; data: NewsArticle[] }>();
    for (const article of filteredArticles) {
      const key = getDateKey(article.pubDate);
      if (!grouped.has(key)) {
        grouped.set(key, { label: getDateLabel(article.pubDate), data: [] });
      }
      grouped.get(key)!.data.push(article);
    }
    return Array.from(grouped.values()).map(({ label, data }) => ({ title: label, data }));
  }, [filteredArticles]);

  const handleRefresh = useCallback(() => {
    void refetch();
  }, [refetch]);

  const handleFilterPress = useCallback((category: string) => {
    setActiveFilter(category);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.headerTop}>
            <View style={styles.headerTitleContainer}>
              <Newspaper color={Colors.dark.accent} size={28} />
              <Text style={styles.headerTitle}>News</Text>
            </View>
          </View>
        </View>
        <NewsSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.headerTop}>
          <View style={styles.headerTitleContainer}>
            <Newspaper color={Colors.dark.accent} size={28} />
            <Text style={styles.headerTitle}>News</Text>
            {isOffline && (
              <View style={styles.offlineBadge}>
                <WifiOff color="#F59E0B" size={14} />
                <Text style={styles.offlineText}>Offline</Text>
              </View>
            )}
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={handleNotifToggle}
              style={styles.bellButton}
              activeOpacity={0.7}
            >
              {notifEnabled
                ? <Bell color="#22C55E" size={22} />
                : <Bell color={Colors.dark.textSecondary} size={22} />
              }
              {notifEnabled && <View style={styles.bellDot} />}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRefresh}
              style={styles.refreshButton}
              activeOpacity={0.7}
              disabled={isRefetching}
            >
              <RefreshCw
                color={Colors.dark.accent}
                size={24}
                style={isRefetching ? styles.refreshing : undefined}
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
          style={styles.filterScrollView}
        >
          {availableCategories.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.filterChip, activeFilter === cat && styles.filterChipActive]}
              onPress={() => handleFilterPress(cat)}
              activeOpacity={0.7}
            >
              {cat === 'Tutte' && preferences.hasSetPreferences && preferences.favoriteCategories.length > 0 && activeFilter === 'Tutte' && (
                <SlidersHorizontal color={Colors.dark.text} size={12} />
              )}
              <Text style={[styles.filterChipText, activeFilter === cat && styles.filterChipTextActive]}>
                {cat === 'Tutte' && preferences.hasSetPreferences && preferences.favoriteCategories.length > 0 ? 'Per Te' : cat}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <NewsItem article={item} onPress={() => setSelectedArticle(item)} />
        )}
        renderSectionHeader={({ section: { title } }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderText}>{title}</Text>
          </View>
        )}
        ListHeaderComponent={breakingNews ? <BreakingNewsBanner item={breakingNews} /> : null}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={true}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Newspaper color={Colors.dark.textSecondary} size={48} />
            <Text style={styles.emptyStateText}>Nessuna news disponibile</Text>
            <Text style={styles.emptyStateSubtext}>
              {activeFilter !== 'Tutte'
                ? `Non ci sono notizie per "${activeFilter}"`
                : 'Non ci sono notizie al momento'}
            </Text>
          </View>
        }
      />

      {selectedArticle && (
        <ArticleModal
          article={selectedArticle}
          onClose={() => setSelectedArticle(null)}
        />
      )}
    </View>
  );
}

interface NewsVideoPlayerProps {
  player: ReturnType<typeof useVideoPlayer>;
  isPlaying: boolean;
  started: boolean;
  onStarted: () => void;
  thumbnail: string;
  isFullscreen: boolean;
  onFullscreenChange: (fs: boolean) => void;
  containerStyle: StyleProp<ViewStyle>;
}

const formatTime = (ms: number): string => {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

function NewsVideoPlayer({ player, isPlaying, started, onStarted, thumbnail, isFullscreen, onFullscreenChange, containerStyle }: NewsVideoPlayerProps) {
  const insets = useSafeAreaInsets();
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [positionMillis, setPositionMillis] = useState(0);
  const [durationMillis, setDurationMillis] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekPositionMillis, setSeekPositionMillis] = useState(0);
  const progressBarWidthRef = useRef(0);

  /* Polling posizione ogni 250ms */
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isSeeking) {
        setPositionMillis((player.currentTime ?? 0) * 1000);
        setDurationMillis((player.duration ?? 0) * 1000);
      }
    }, 250);
    return () => clearInterval(interval);
  }, [player, isSeeking]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setIsSeeking(true);
        const x = Math.max(0, Math.min(e.nativeEvent.locationX, progressBarWidthRef.current));
        const ratio = progressBarWidthRef.current > 0 ? x / progressBarWidthRef.current : 0;
        setSeekPositionMillis(ratio * durationMillisRef.current);
      },
      onPanResponderMove: (e) => {
        const x = Math.max(0, Math.min(e.nativeEvent.locationX, progressBarWidthRef.current));
        const ratio = progressBarWidthRef.current > 0 ? x / progressBarWidthRef.current : 0;
        setSeekPositionMillis(ratio * durationMillisRef.current);
      },
      onPanResponderRelease: (e) => {
        const x = Math.max(0, Math.min(e.nativeEvent.locationX, progressBarWidthRef.current));
        const ratio = progressBarWidthRef.current > 0 ? x / progressBarWidthRef.current : 0;
        const newPos = ratio * durationMillisRef.current;
        player.currentTime = newPos / 1000;
        setPositionMillis(newPos);
        setIsSeeking(false);
      },
    })
  ).current;

  const durationMillisRef = useRef(0);
  useEffect(() => { durationMillisRef.current = durationMillis; }, [durationMillis]);

  /* Auto-nasconde i controlli dopo 3s quando il video va in play */
  const startHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    if (isPlaying && started) {
      startHideTimer();
    } else {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setShowControls(true);
    }
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [isPlaying, started, startHideTimer]);

  const handlePlay = useCallback(() => {
    onStarted();
    player.play();
  }, [player, onStarted]);

  const handleToggle = useCallback(() => {
    if (player.playing) player.pause();
    else player.play();
  }, [player]);

  const handleVideoPress = useCallback(() => {
    setShowControls(c => {
      if (!c && player.playing) startHideTimer();
      return !c;
    });
  }, [player, startHideTimer]);

  const progress = durationMillis > 0
    ? (isSeeking ? seekPositionMillis : positionMillis) / durationMillis
    : 0;

  const bottomInset = isFullscreen ? Math.max(8, insets.bottom + 8) : 8;

  return (
    <View style={containerStyle}>
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="contain"
        nativeControls={false}
      />

      {/* Thumbnail: solo inline e prima del play */}
      {!started && !isFullscreen && (
        <Image
          source={{ uri: thumbnail }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}

      {/* Tap area */}
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        activeOpacity={1}
        onPress={started ? handleVideoPress : handlePlay}
      />

      {/* Controls overlay */}
      {(!started || showControls) && (
        <View style={styles.videoControls}>
          <TouchableOpacity
            style={styles.videoPlayButton}
            onPress={started ? handleToggle : handlePlay}
            activeOpacity={0.8}
          >
            {isPlaying
              ? <Pause color="#fff" size={36} fill="#fff" />
              : <Play color="#fff" size={36} fill="#fff" />}
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom bar: tempo + seek bar + fullscreen — mostrata solo dopo che il video è partito */}
      {started && showControls && (
        <View style={[styles.newsBottomBar, { paddingBottom: bottomInset }]}>
          <Text style={styles.newsTimeText}>
            {formatTime(isSeeking ? seekPositionMillis : positionMillis)}
          </Text>
          <View
            style={styles.newsProgressBarWrapper}
            onLayout={(e) => { progressBarWidthRef.current = e.nativeEvent.layout.width; }}
            {...panResponder.panHandlers}
          >
            <View style={styles.newsProgressBarBg}>
              <View style={[styles.newsProgressBarFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
              <View style={[styles.newsProgressThumb, { left: `${Math.min(progress * 100, 100)}%` as `${number}%` }]} />
            </View>
          </View>
          <Text style={styles.newsTimeText}>
            {formatTime(durationMillis)}
          </Text>
          <TouchableOpacity
            style={styles.newsFullscreenBtn}
            onPress={() => onFullscreenChange(!isFullscreen)}
            activeOpacity={0.8}
          >
            {isFullscreen
              ? <Minimize2 color="#fff" size={18} />
              : <Maximize2 color="#fff" size={18} />}
          </TouchableOpacity>
        </View>
      )}

      {/* Fullscreen button solo prima che il video parta */}
      {!started && (
        <TouchableOpacity
          style={[
            styles.videoFullscreenBtn,
            isFullscreen && {
              bottom: Math.max(12, insets.bottom + 12),
              right: Math.max(12, insets.right + 12),
            },
          ]}
          onPress={() => onFullscreenChange(!isFullscreen)}
          activeOpacity={0.8}
        >
          {isFullscreen
            ? <Minimize2 color="#fff" size={20} />
            : <Maximize2 color="#fff" size={20} />}
        </TouchableOpacity>
      )}
    </View>
  );
}

interface ArticleModalProps {
  article: NewsArticle;
  onClose: () => void;
}

function ArticleModal({ article, onClose }: ArticleModalProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;
  const [modalVisible, setModalVisible] = useState(true);
  const [isVideoFullscreen, setIsVideoFullscreen] = useState(false);
  /* Su Android l'orientamento impiega ~400ms → ritardiamo il cambio di stile
     del container per evitare il flash "portrait-fullscreen". Su iOS immediato. */
  const [containerFullscreen, setContainerFullscreen] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);

  /* Posizione del video inline — misurata via onLayout */
  const screenW = Dimensions.get('window').width;
  const screenH = Dimensions.get('window').height;
  const inlineVideoHeight = screenW * (9 / 16);
  const [cardTop, setCardTop] = useState(screenH * 0.15);
  const [headerH, setHeaderH] = useState(72);
  const videoTopInline = cardTop + headerH;

  /* Player unico: persiste tra inline e fullscreen */
  const player = useVideoPlayer(article.videoUrl ?? '', (p) => { p.loop = false; });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const handleVideoStarted = useCallback(() => setVideoStarted(true), []);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleClose = useCallback(() => {
    /* Tasto fisico "indietro" in fullscreen → esci dal fullscreen,
       non chiudere il modal (SurfaceView Android resterebbe in landscape) */
    if (isVideoFullscreen) {
      setIsVideoFullscreen(false);
      setContainerFullscreen(false);
      return;
    }
    if (Platform.OS === 'android') {
      /* Android: SurfaceView ignora opacity animation → chiudi subito, niente flash */
      setModalVisible(false);
      onClose();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: true }),
      ]).start(() => {
        setModalVisible(false);
        onClose();
      });
    }
  }, [fadeAnim, slideAnim, onClose, isVideoFullscreen]);

  /* Stato cambia subito, orientamento in useEffect.
     containerFullscreen segue isVideoFullscreen in modo sincrono su tutte
     le piattaforme (nessun render intermedio). */
  const handleFullscreenChange = useCallback((fs: boolean) => {
    setIsVideoFullscreen(fs);
    setContainerFullscreen(fs);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const applyOrientation = async () => {
      if (isVideoFullscreen) {
        await ScreenOrientation.unlockAsync().catch(() => {});
        if (Platform.OS === 'ios') {
          /* iOS dentro un Modal: piccolo delay poi LANDSCAPE_LEFT esplicito */
          await new Promise(r => setTimeout(r, 80));
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_LEFT).catch(() => {});
        } else {
          await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE).catch(() => {});
        }
      } else {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      }
    };
    void applyOrientation();
    return () => {
      /* Se eravamo in fullscreen landscape, forziamo portrait al cleanup
         per evitare che lo schermo resti in landscape */
      if (isVideoFullscreen) {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
      } else {
        ScreenOrientation.unlockAsync().catch(() => {});
      }
    };
  }, [isVideoFullscreen]);


  /* containerStyle del video cambia solo lo stile, il componente resta sempre
     nello stesso posto nell'albero React → SurfaceView Android non viene distrutta */
  const videoContainerStyle: StyleProp<ViewStyle> = containerFullscreen
    ? { ...StyleSheet.absoluteFillObject, backgroundColor: '#000' }
    : { position: 'absolute', top: videoTopInline, left: 0, right: 0, height: inlineVideoHeight, backgroundColor: '#000' };

  return (
    <Modal
      visible={modalVisible}
      transparent={Platform.OS !== 'android'}
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Sfondo nero permanente: su iOS (transparent=true) copre il background
          quando articleModal va a opacity:0 in fullscreen. Su Android il Modal
          non è trasparente quindi il background di sistema copre già tutto. */}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000' }]} pointerEvents="none" />

      {/* Contenuto articolo: sempre renderizzato, nascosto in fullscreen */}
      <Animated.View
        style={[styles.articleModal, { opacity: isVideoFullscreen ? 0 : fadeAnim, zIndex: 1 }]}
        pointerEvents={isVideoFullscreen ? 'none' : 'auto'}
      >
        <Animated.View
          style={[styles.articleModalContent, { transform: [{ translateY: slideAnim }] }]}
          onLayout={(e) => setCardTop(e.nativeEvent.layout.y)}
        >
          <View
            style={styles.articleModalHeader}
            onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}
          >
            <Text style={styles.articleModalTitle} numberOfLines={2}>
              {article.title}
            </Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
              <X color={Colors.dark.text} size={24} />
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.articleModalBody} showsVerticalScrollIndicator={true}>
            {article.videoUrl ? (
              /* Placeholder che occupa lo spazio del video inline */
              <View style={{ height: inlineVideoHeight, backgroundColor: '#000' }} />
            ) : (
              <Image
                source={{ uri: article.thumbnail }}
                style={styles.articleImage}
                resizeMode="cover"
              />
            )}
            <View style={styles.articleMeta}>
              <Text style={styles.articleCategory}>{article.category}</Text>
              <Text style={styles.articleDate}>
                {article.pubDate.toLocaleDateString('it-IT', {
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric'
                })} {'\u2022'} {article.pubDate.toLocaleTimeString('it-IT', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </Text>
              <Text style={styles.articleAuthor}>di {article.author}</Text>
            </View>
            <Text style={styles.articleContent}>{article.content}</Text>
          </ScrollView>
        </Animated.View>
      </Animated.View>

      {/* Overlay nero in fullscreen: copre fisicamente il contenuto dell'articolo
          su Android (opacity:0 non basta con SurfaceView) */}
      {isVideoFullscreen && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', zIndex: 10 }]} pointerEvents="none" />
      )}

      {/* Video: SEMPRE stesso nodo nell'albero — solo containerStyle cambia.
          iOS: Animated.View con fadeAnim (sfuma con l'articolo alla chiusura).
          Android: View normale (SurfaceView ignora opacity, il modal chiude subito). */}
      {article.videoUrl && (
        Platform.OS === 'ios' ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: isVideoFullscreen ? 1 : fadeAnim, zIndex: isVideoFullscreen ? 20 : 5 }]}
            pointerEvents="box-none"
          >
            <NewsVideoPlayer
              player={player}
              isPlaying={isPlaying}
              started={videoStarted}
              onStarted={handleVideoStarted}
              thumbnail={article.thumbnail}
              isFullscreen={isVideoFullscreen}
              onFullscreenChange={handleFullscreenChange}
              containerStyle={videoContainerStyle}
            />
          </Animated.View>
        ) : (
          <View style={[StyleSheet.absoluteFill, { zIndex: isVideoFullscreen ? 20 : 5 }]} pointerEvents="box-none">
            <NewsVideoPlayer
              player={player}
              isPlaying={isPlaying}
              started={videoStarted}
              onStarted={handleVideoStarted}
              thumbnail={article.thumbnail}
              isFullscreen={isVideoFullscreen}
              onFullscreenChange={handleFullscreenChange}
              containerStyle={videoContainerStyle}
            />
          </View>
        )
      )}
    </Modal>
  );
}

function BreakingNewsBanner({ item }: { item: BreakingNewsItem }) {
  const [expanded, setExpanded] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 600, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  const hasDesc = item.descrizione && item.descrizione.trim().length > 0;
  const hasUrl = !!item.url;

  const handlePress = useCallback(() => {
    if (hasUrl) {
      Linking.openURL(item.url!).catch(() => {});
    } else if (hasDesc) {
      setExpanded(e => !e);
    }
  }, [hasUrl, hasDesc, item.url]);

  return (
    <TouchableOpacity
      style={styles.breakingBanner}
      onPress={handlePress}
      activeOpacity={hasUrl || hasDesc ? 0.85 : 1}
    >
      <View style={styles.breakingHeader}>
        <Animated.View style={[styles.breakingDot, { opacity: pulseAnim }]} />
        <Text style={styles.breakingLabel}>BREAKING</Text>
      </View>
      <Text style={styles.breakingTitle}>{item.titolo}</Text>
      {hasDesc && (
        <Text
          style={styles.breakingDesc}
          numberOfLines={expanded ? undefined : 3}
        >
          {item.descrizione}
        </Text>
      )}
      {hasDesc && !hasUrl && (
        <Text style={styles.breakingMore}>
          {expanded ? 'Mostra meno ▲' : 'Leggi di più ▼'}
        </Text>
      )}
      {hasUrl && (
        <Text style={styles.breakingLink}>Leggi l'articolo completo →</Text>
      )}
    </TouchableOpacity>
  );
}

interface NewsItemProps {
  article: NewsArticle;
  onPress: () => void;
}

function NewsItem({ article, onPress }: NewsItemProps) {
  return (
    <TouchableOpacity style={styles.newsItem} onPress={onPress} activeOpacity={0.7}>
      <Image
        source={{ uri: article.thumbnail }}
        style={styles.newsThumbnail}
        resizeMode="cover"
      />
      <View style={styles.newsItemContent}>
        <Text style={styles.newsItemTitle} numberOfLines={2}>
          {article.title}
        </Text>
        <View style={styles.newsItemMeta}>
          <Text style={styles.newsItemTime}>
            {article.pubDate.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </Text>
          <Text style={styles.newsItemCategory}>{article.category}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  breakingBanner: {
    margin: 12,
    marginBottom: 4,
    padding: 14,
    backgroundColor: '#B91C1C',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  breakingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  breakingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FCA5A5',
  },
  breakingLabel: {
    fontSize: 11,
    fontWeight: '900' as const,
    color: '#FCA5A5',
    letterSpacing: 2,
  },
  breakingTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    lineHeight: 22,
    marginBottom: 6,
  },
  breakingDesc: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: '#FECACA',
    lineHeight: 20,
    marginBottom: 6,
  },
  breakingMore: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#FCA5A5',
    marginTop: 2,
  },
  breakingLink: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#FCA5A5',
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  bellButton: {
    padding: 8,
    position: 'relative',
  },
  bellDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22C55E',
    borderWidth: 1,
    borderColor: Colors.dark.surface,
  },
  header: {
    paddingBottom: 12,
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: Colors.dark.text,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
  },
  offlineText: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: '#F59E0B',
  },
  refreshButton: {
    padding: 8,
  },
  refreshing: {
    opacity: 0.5,
  },
  filterScrollView: {
    marginTop: 12,
  },
  filterRow: {
    paddingHorizontal: 20,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  filterChipTextActive: {
    color: Colors.dark.background,
  },
  listContent: {
    paddingBottom: 12,
  },
  sectionHeader: {
    backgroundColor: Colors.dark.background,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.dark.accent,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  newsItem: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  newsThumbnail: {
    width: 100,
    height: 100,
    borderRadius: 12,
    backgroundColor: Colors.dark.surface,
  },
  newsItemContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  newsItemTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    lineHeight: 21,
  },
  newsItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  newsItemTime: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.dark.accent,
  },
  newsItemCategory: {
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.dark.textSecondary,
  },
  articleModal: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  articleModalContent: {
    backgroundColor: Colors.dark.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    width: '100%',
    height: '85%',
  },
  articleModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
    gap: 12,
  },
  articleModalTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    lineHeight: 26,
  },
  closeButton: {
    padding: 4,
  },
  articleModalBody: {
    flex: 1,
    maxHeight: '100%',
  },
  articleImage: {
    width: '100%',
    height: 200,
    backgroundColor: Colors.dark.background,
  },
  videoControls: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoPlayButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  videoFullscreenBtn: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingTop: 8,
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  newsTimeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    minWidth: 34,
    textAlign: 'center',
  },
  newsProgressBarWrapper: {
    flex: 1,
    height: 28,
    justifyContent: 'center',
  },
  newsProgressBarBg: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    overflow: 'visible',
    position: 'relative',
  },
  newsProgressBarFill: {
    height: 3,
    backgroundColor: '#E50914',
    borderRadius: 2,
  },
  newsProgressThumb: {
    position: 'absolute',
    top: -5,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: '#E50914',
    marginLeft: -6,
  },
  newsFullscreenBtn: {
    width: 32,
    height: 32,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  articleMeta: {
    padding: 20,
    paddingBottom: 12,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  articleCategory: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.dark.accent,
    textTransform: 'uppercase' as const,
  },
  articleDate: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.dark.textSecondary,
  },
  articleAuthor: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.dark.textSecondary,
    fontStyle: 'italic' as const,
  },
  articleContent: {
    padding: 20,
    fontSize: 15,
    lineHeight: 24,
    color: Colors.dark.text,
  },
});
