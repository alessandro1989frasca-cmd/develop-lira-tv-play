import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Share,
  StatusBar,
  Dimensions,
  Platform,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft, Play, Share2, Heart } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { fetchRSSFeed } from '@/utils/dataService';
import { VideoContent } from '@/types';
import { useResumePositions } from '@/hooks/useResumePositions';
import LoadingState from '@/components/LoadingState';
import { supabase } from '@/lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 280;
const GOLD = '#F5C518';
const GOLD_DIM = 'rgba(245,197,24,0.15)';

function formatDate(pubDate: string): string {
  try {
    const d = new Date(pubDate);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return pubDate;
  }
}

function toWpSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function isRecent(pubDate: string): boolean {
  try {
    return Date.now() - new Date(pubDate).getTime() < 36 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

async function fetchFromWpAndCache(slug: string): Promise<string> {
  try {
    const res = await fetch(
      `https://www.liratv.it/wp-json/wp/v2/categories?slug=${slug}`,
      { headers: { Accept: 'application/json' } }
    );
    const data: any[] = await res.json();
    const raw = Array.isArray(data) && data.length > 0 ? (data[0].description ?? '') : '';
    const clean = raw.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    supabase.from('program_descriptions').upsert(
      { slug, description: clean, fetched_at: new Date().toISOString() },
      { onConflict: 'slug' }
    ).then(() => {}).catch(() => {});
    return clean;
  } catch {
    return '';
  }
}

/* ---------- Skeleton ---------- */
function DescSkeleton() {
  const anim = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 0.7, duration: 750, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(anim, { toValue: 0.35, duration: 750, useNativeDriver: Platform.OS !== 'web' }),
      ])
    ).start();
  }, [anim]);
  return (
    <Animated.View style={{ opacity: anim, marginBottom: 24 }}>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, { width: '85%', marginTop: 8 }]} />
      <View style={[styles.skeletonLine, { width: '60%', marginTop: 8 }]} />
    </Animated.View>
  );
}

/* ---------- Description with fade-in ---------- */
interface DescSectionProps {
  descData: { description: string } | undefined;
  isDescLoading: boolean;
}
function DescSection({ descData, isDescLoading }: DescSectionProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const prevDesc = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (descData !== undefined && descData.description !== prevDesc.current) {
      prevDesc.current = descData.description;
      if (descData.description.length > 0) {
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 350,
          useNativeDriver: Platform.OS !== 'web',
        }).start();
      }
    }
  }, [descData, fadeAnim]);

  if (isDescLoading) {
    return <DescSkeleton />;
  }
  if (!descData?.description) {
    return null;
  }
  return (
    <Animated.Text style={[styles.description, { opacity: fadeAnim }]}>
      {descData.description}
    </Animated.Text>
  );
}

/* ---------- Episode row ---------- */
interface EpisodeRowProps {
  video: VideoContent;
  index: number;
  isLast: boolean;
  progress?: number;
  onPress: () => void;
}
function EpisodeRow({ video, index, isLast, progress, onPress }: EpisodeRowProps) {
  const recent = isRecent(video.pubDate);
  const showProgress = typeof progress === 'number' && progress > 0.02 && progress < 0.92;
  return (
    <TouchableOpacity
      style={[styles.episodeRow, !isLast && styles.episodeRowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.episodeNumber}>{index + 1}</Text>

      <View style={styles.episodeThumbnailWrap}>
        <Image source={{ uri: video.thumbnail }} style={styles.episodeThumbnail} contentFit="cover" />
        <View style={styles.episodePlayOverlay}>
          <View style={styles.episodePlayCircle}>
            <Play size={11} color={GOLD} fill={GOLD} />
          </View>
        </View>
        {showProgress && (
          <View style={styles.epProgressTrack}>
            <View style={[styles.epProgressFill, { width: `${Math.round(progress! * 100)}%` as any }]} />
          </View>
        )}
      </View>

      <View style={styles.episodeInfo}>
        <Text style={styles.episodeTitle} numberOfLines={2}>{video.title}</Text>
        <View style={styles.episodeMeta}>
          <Text style={styles.episodeMetaText}>{formatDate(video.pubDate)}</Text>
          {video.duration ? (
            <>
              <Text style={styles.episodeMetaDot}>·</Text>
              <Text style={styles.episodeMetaText}>{video.duration}</Text>
            </>
          ) : null}
          {showProgress && (
            <View style={styles.riprendiBadge}>
              <Text style={styles.riprendiText}>RIPRENDI</Text>
            </View>
          )}
          {!showProgress && recent && (
            <View style={styles.nuovoBadge}>
              <Text style={styles.nuovoText}>NUOVO</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

/* ---------- Header component (needs hooks) ---------- */
interface ProgramHeaderProps {
  name: string;
  heroImage: string | null;
  episodes: VideoContent[];
  descData: { description: string } | undefined;
  isDescLoading: boolean;
  insetTop: number;
  isFav: boolean;
  onBack: () => void;
  onPlay: () => void;
  onShare: () => void;
  onToggleFav: () => void;
}
function ProgramHeader({
  name, heroImage, episodes, descData, isDescLoading,
  insetTop, isFav, onBack, onPlay, onShare, onToggleFav,
}: ProgramHeaderProps) {
  return (
    <View>
      {/* Hero */}
      <View style={styles.hero}>
        {heroImage ? (
          <Image source={{ uri: heroImage }} style={styles.heroImage} contentFit="cover" />
        ) : (
          <View style={[styles.heroImage, { backgroundColor: Colors.dark.surface }]} />
        )}
        <LinearGradient
          colors={['rgba(10,14,26,0.35)', 'rgba(10,14,26,0)', 'rgba(10,14,26,0.88)', Colors.dark.background]}
          locations={[0, 0.25, 0.72, 1]}
          style={StyleSheet.absoluteFillObject}
        />

        <TouchableOpacity
          style={[styles.backBtn, { top: insetTop + 12 }]}
          onPress={onBack}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <ChevronLeft size={22} color="#fff" />
        </TouchableOpacity>

        <View style={styles.heroBottom}>
          <View style={styles.programLabel}>
            <View style={styles.goldBar} />
            <Text style={styles.programLabelText}>Programma</Text>
          </View>
          <Text style={styles.heroTitle} numberOfLines={2}>{name}</Text>
        </View>
      </View>

      {/* Body */}
      <View style={styles.body}>
        {episodes.length > 0 && (
          <TouchableOpacity style={styles.playBtn} onPress={onPlay} activeOpacity={0.85}>
            <View style={styles.playIconCircle}>
              <Play size={15} color={Colors.dark.background} fill={Colors.dark.background} />
            </View>
            <Text style={styles.playBtnText}>Ultima puntata</Text>
          </TouchableOpacity>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={onShare} activeOpacity={0.7}>
            <Share2 size={19} color={GOLD} />
            <Text style={styles.actionBtnText}>Condividi</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={onToggleFav} activeOpacity={0.7}>
            <Heart size={19} color={GOLD} fill={isFav ? GOLD : 'transparent'} />
            <Text style={styles.actionBtnText}>Preferiti</Text>
          </TouchableOpacity>
        </View>

        <DescSection descData={descData} isDescLoading={isDescLoading} />

        <View style={styles.sectionHeader}>
          <View style={styles.sectionActiveTab}>
            <Text style={styles.sectionActiveTabText}>Puntate</Text>
          </View>
          <Text style={styles.sectionCount}>
            {episodes.length} {episodes.length === 1 ? 'episodio' : 'episodi'}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ---------- Main screen ---------- */
export default function ProgramCategoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { name } = useLocalSearchParams<{ name: string }>();
  const resumePositions = useResumePositions();
  const [isFav, setIsFav] = useState(false);

  const { data: allVideos = [], isLoading } = useQuery<VideoContent[]>({
    queryKey: ['videos'],
    queryFn: () => fetchRSSFeed(true),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });

  const { data: descData, isLoading: isDescLoading } = useQuery<{ description: string }>({
    queryKey: ['program-description', name],
    queryFn: async () => {
      const slug = toWpSlug(name ?? '');

      // 1. Prova Supabase — risposta immediata
      try {
        const { data: cached } = await supabase
          .from('program_descriptions')
          .select('description, fetched_at')
          .eq('slug', slug)
          .single();

        if (cached) {
          const stale = Date.now() - new Date(cached.fetched_at).getTime() > SEVEN_DAYS;
          if (stale) {
            // Aggiorna in background senza bloccare l'utente
            fetchFromWpAndCache(slug).catch(() => {});
          }
          return { description: cached.description };
        }
      } catch {}

      // 2. Non in cache → fetch WP e salva su Supabase
      const description = await fetchFromWpAndCache(slug);
      return { description };
    },
    staleTime: SEVEN_DAYS,
    gcTime: SEVEN_DAYS,
    enabled: !!name,
  });

  const episodes = useMemo(() => {
    return allVideos
      .filter(v => v.category === 'programmi' && v.programCategory === name)
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  }, [allVideos, name]);

  const handlePlay = useCallback((video: VideoContent) => {
    if (!video.videoUrl) return;
    router.push({
      pathname: '/player' as any,
      params: {
        url: video.videoUrl,
        title: video.title,
        date: video.pubDate,
        category: video.category,
        videoId: video.id,
      },
    });
  }, [router]);

  const handleShare = useCallback(async () => {
    const slug = toWpSlug(name ?? '');
    const programUrl = `https://www.liratv.it/programmi/${slug}/`;
    try {
      await Share.share(
        Platform.OS === 'ios'
          ? { message: `Guarda "${name}" su Lira TV`, url: programUrl, title: name ?? 'Lira TV' }
          : { message: `Guarda "${name}" su Lira TV\n${programUrl}`, title: name ?? 'Lira TV' }
      );
    } catch {}
  }, [name]);

  const heroImage = episodes[0]?.thumbnail ?? null;

  const header = useMemo(() => (
    <ProgramHeader
      name={name ?? ''}
      heroImage={heroImage}
      episodes={episodes}
      descData={descData}
      isDescLoading={isDescLoading}
      insetTop={insets.top}
      isFav={isFav}
      onBack={() => router.back()}
      onPlay={() => episodes[0] && handlePlay(episodes[0])}
      onShare={handleShare}
      onToggleFav={() => setIsFav(f => !f)}
    />
  ), [name, heroImage, episodes, descData, isDescLoading, insets.top, isFav, handlePlay, handleShare, router]);

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />
        <LoadingState />
      </>
    );
  }

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      <FlatList<VideoContent>
        style={styles.container}
        data={episodes}
        keyExtractor={item => item.id}
        ListHeaderComponent={header}
        renderItem={({ item, index }) => (
          <View style={styles.episodeListWrap}>
            <EpisodeRow
              video={item}
              index={index}
              isLast={index === episodes.length - 1}
              progress={resumePositions[item.id]}
              onPress={() => handlePlay(item)}
            />
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nessun episodio disponibile</Text>
          </View>
        }
        ListFooterComponent={<View style={{ height: insets.bottom + 24 }} />}
        showsVerticalScrollIndicator={false}
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },

  /* Skeleton */
  skeletonLine: {
    height: 13,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    width: '100%',
  },

  /* Hero */
  hero: {
    width: SCREEN_WIDTH,
    height: HERO_HEIGHT,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  heroBottom: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
  },
  programLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 5,
  },
  goldBar: {
    width: 3,
    height: 14,
    backgroundColor: GOLD,
    borderRadius: 2,
  },
  programLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
    lineHeight: 30,
    letterSpacing: -0.3,
  },

  /* Body */
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  /* Play button */
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    backgroundColor: Colors.dark.primary,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.3)',
    borderRadius: 10,
    paddingVertical: 14,
    marginBottom: 14,
  },
  playIconCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },

  /* Actions */
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    backgroundColor: GOLD_DIM,
    borderWidth: 1,
    borderColor: 'rgba(245,197,24,0.3)',
    borderRadius: 10,
  },
  actionBtnText: {
    color: GOLD,
    fontSize: 11.5,
    fontWeight: '600',
  },

  /* Description */
  description: {
    fontSize: 13.5,
    color: Colors.dark.textSecondary,
    lineHeight: 21,
    marginBottom: 24,
  },

  /* Section header */
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.07)',
  },
  sectionActiveTab: {
    paddingBottom: 10,
    borderBottomWidth: 2,
    borderBottomColor: GOLD,
    marginBottom: -1,
  },
  sectionActiveTabText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  sectionCount: {
    fontSize: 12.5,
    color: Colors.dark.textSecondary,
    marginLeft: 12,
    paddingBottom: 10,
    marginBottom: -1,
  },

  /* Episode list */
  episodeListWrap: {
    paddingHorizontal: 16,
  },
  episodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  episodeRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  episodeNumber: {
    width: 20,
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.2)',
    textAlign: 'center',
  },
  episodeThumbnailWrap: {
    position: 'relative',
    flexShrink: 0,
  },
  episodeThumbnail: {
    width: 108,
    height: 61,
    borderRadius: 6,
  },
  episodePlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  episodePlayCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1.5,
    borderColor: 'rgba(245,197,24,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  episodeInfo: {
    flex: 1,
    minWidth: 0,
  },
  episodeTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 4,
    lineHeight: 17,
  },
  episodeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  episodeMetaText: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  episodeMetaDot: {
    fontSize: 11,
    color: Colors.dark.textSecondary,
  },
  nuovoBadge: {
    backgroundColor: GOLD_DIM,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  nuovoText: {
    fontSize: 10,
    fontWeight: '700',
    color: GOLD,
    letterSpacing: 0.4,
  },
  riprendiBadge: {
    backgroundColor: 'rgba(96,165,250,0.15)',
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  riprendiText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#60A5FA',
    letterSpacing: 0.4,
  },
  epProgressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderBottomLeftRadius: 6,
    borderBottomRightRadius: 6,
  },
  epProgressFill: {
    height: 3,
    backgroundColor: '#60A5FA',
    borderBottomLeftRadius: 6,
  },

  /* Empty */
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
  },
});
