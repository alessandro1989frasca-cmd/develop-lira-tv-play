import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  FlatList,
  Animated,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Play, ChevronRight, Radio, VideoOff } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { fetchRSSFeed, fetchSchedule, getCurrentProgram, fetchFeaturedPrograms, fetchActivePolls, submitPollVote, fetchViewCounts, FeaturedProgram, PollData } from '@/utils/dataService';
import { VideoContent, ProgramCategory } from '@/types';
import LogoSplash from '@/components/LogoSplash';
import Onboarding from '@/components/Onboarding';
import VideoCard from '@/components/VideoCard';
import CategoryCard from '@/components/CategoryCard';
import PollCard from '@/components/PollCard';
import { HomeSkeleton } from '@/components/Skeleton';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useUserPreferences } from '@/providers/UserPreferencesProvider';
import { useSplash } from '@/providers/SplashProvider';
import { useAppConfig } from '@/providers/AppConfigProvider';
import { getDeviceId } from '@/lib/deviceId';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ONBOARDING_KEY = 'onboarding_completed_v1';

export default function HomeScreen() {
  const router = useRouter();
  const [showSplash, setShowSplash] = useState(Platform.OS !== 'web');
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);
  const [videoFinished, setVideoFinished] = useState(Platform.OS === 'web');
  const { preferences } = useUserPreferences();
  const { setIsSplashVisible } = useSplash();
  const appConfig = useAppConfig();
  const [deviceId, setDeviceId] = useState<string>('');

  const livePulseAnim = React.useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(livePulseAnim, {
          toValue: 1.3,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(livePulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [livePulseAnim]);

  useEffect(() => {
    getDeviceId().then(setDeviceId).catch(() => {});
  }, []);

  const { data: videos = [], isLoading: videosLoading } = useQuery<VideoContent[]>({
    queryKey: ['videos'],
    queryFn: () => fetchRSSFeed(true),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 2000,
  });

  const { data: schedule = [] } = useQuery({
    queryKey: ['schedule'],
    queryFn: fetchSchedule,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 1,
    retryDelay: 2000,
  });

  const currentProgram = getCurrentProgram(schedule);

  const allVideoIds = useMemo(() => videos.map(v => v.id), [videos]);

  const { data: viewCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['viewCounts', allVideoIds],
    queryFn: () => fetchViewCounts(allVideoIds),
    enabled: allVideoIds.length > 0,
    staleTime: 60 * 1000,
  });

  const { data: polls = [] } = useQuery<PollData[]>({
    queryKey: ['polls', deviceId],
    queryFn: () => fetchActivePolls(deviceId),
    enabled: !!deviceId,
    staleTime: 30 * 1000,
  });

  const { data: featuredPrograms = [] } = useQuery<FeaturedProgram[]>({
    queryKey: ['featured'],
    queryFn: fetchFeaturedPrograms,
    staleTime: 60 * 1000,
  });

  const queryClient = useQueryClient();
  const voteMutation = useMutation({
    mutationFn: ({ pollId, optionIndex }: { pollId: string; optionIndex: number }) =>
      submitPollVote(pollId, optionIndex, deviceId),
    onSuccess: () => {
      console.log('[Polls] Vote success, refetching...');
      void queryClient.invalidateQueries({ queryKey: ['polls'] });
    },
  });

  const handlePollVote = useCallback((pollId: string, optionIndex: number) => {
    if (!deviceId) return;
    voteMutation.mutate({ pollId, optionIndex });
  }, [deviceId, voteMutation]);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const completed = await AsyncStorage.getItem(ONBOARDING_KEY);
        setShowOnboarding(completed !== 'true');
        console.log('Onboarding status:', completed !== 'true' ? 'show' : 'skip');
      } catch {
        setShowOnboarding(false);
      }
    };
    void checkOnboarding();
  }, []);

  const handleSplashFinish = useCallback(() => {
    console.log('[Home] Splash finished');
    setVideoFinished(true);
  }, []);

  const hasFavorites = preferences.hasSetPreferences && preferences.favoriteCategories.length > 0;
  const favLower = hasFavorites ? preferences.favoriteCategories.map(c => c.toLowerCase()) : [];

  const showSport = !hasFavorites || favLower.some(c => c.includes('sport'));
  const showCronaca = !hasFavorites || favLower.some(c => c.includes('cronaca'));
  const showPolitica = hasFavorites && favLower.some(c => c.includes('politica'));
  const showCultura = hasFavorites && favLower.some(c => c.includes('cultura'));
  const showAmbiente = hasFavorites && favLower.some(c => c.includes('ambiente'));

  const userSelectedNonDefaultOnly = hasFavorites && !showSport && !showCronaca;
  const politicaVideos = videos.filter((v: VideoContent) => v.category === 'politica').slice(0, 6);
  const culturaVideos = videos.filter((v: VideoContent) => v.category === 'cultura').slice(0, 6);
  const ambienteVideos = videos.filter((v: VideoContent) => v.category === 'ambiente').slice(0, 6);
  const hasNoVideosForSelection = userSelectedNonDefaultOnly && 
    favLower.every(c => {
      let catKey = c;
      if (c.includes('cultura')) catKey = 'cultura';
      if (c.includes('politica')) catKey = 'politica';
      if (c.includes('ambiente')) catKey = 'ambiente';
      const matchingVideos = videos.filter((v: VideoContent) => v.category === catKey || v.category === 'all');
      return matchingVideos.length === 0;
    });

  const edizioniTgVideos = videos.filter((v: VideoContent) => v.category === 'edizioni_tg').slice(0, 6);
  const sportVideos = videos.filter((v: VideoContent) => v.category === 'sport').slice(0, 6);
  const cronacaVideos = videos.filter((v: VideoContent) => v.category === 'cronaca').slice(0, 6);
  
  const programVideos = videos.filter((v: VideoContent) => v.category === 'programmi');
  const programCategories: ProgramCategory[] = React.useMemo(() => {
    const categoryMap = new Map<string, VideoContent[]>();
    
    programVideos.forEach(video => {
      const catName = video.programCategory || 'Altri Programmi';
      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, []);
      }
      categoryMap.get(catName)!.push(video);
    });
    
    const categories: ProgramCategory[] = [];
    categoryMap.forEach((vids, name) => {
      vids.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      const latestVideo = vids[0];
      
      categories.push({
        id: name,
        name,
        thumbnail: latestVideo.thumbnail,
        videoCount: vids.length,
      });
    });
    
    return categories.sort((a, b) => b.videoCount - a.videoCount);
  }, [programVideos]);

  const heroProgram = featuredPrograms.length > 0 ? featuredPrograms[0] : null;

  const handleWatchLive = () => {
    router.push('/live' as any);
  };

  const handleHeroPress = () => {
    if (heroProgram?.videoUrl) {
      router.push({
        pathname: '/player' as any,
        params: {
          url: heroProgram.videoUrl,
          title: heroProgram.title,
          category: heroProgram.category,
        },
      });
    }
  };

  const handleVideoPress = (video: VideoContent) => {
    if (video.videoUrl) {
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
    }
  };

  const handleSeeAll = (category: string) => {
    router.push(`/videos?category=${category}` as any);
  };
  
  const handleProgramCategoryPress = (categoryName: string) => {
    router.push(`/program-category?name=${encodeURIComponent(categoryName)}` as any);
  };

  const handleOnboardingComplete = useCallback(async () => {
    try {
      await AsyncStorage.setItem(ONBOARDING_KEY, 'true');
      console.log('Onboarding completed and saved');
    } catch (e) {
      console.log('Failed to save onboarding status:', e);
    }
    setShowOnboarding(false);
  }, []);

  useEffect(() => {
    if (!videosLoading && videoFinished) {
      setShowSplash(false);
      setIsSplashVisible(false);
    }
  }, [videosLoading, videoFinished, setIsSplashVisible]);

  if (showSplash) {
    return (
      <View style={styles.splashContainer}>
        <LogoSplash onFinish={handleSplashFinish} />
      </View>
    );
  }

  if (showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  if (videosLoading) {
    return <HomeSkeleton />;
  }

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {heroProgram ? (
          <TouchableOpacity
            activeOpacity={heroProgram.bottone ? 0.9 : 1}
            onPress={heroProgram.bottone ? handleHeroPress : undefined}
            style={styles.hero}
          >
            <Image
              source={{ uri: heroProgram.thumbnail }}
              style={styles.heroImage}
              contentFit="contain"
              transition={300}
              cachePolicy="memory-disk"
              priority="high"
            />
            <LinearGradient
              colors={['transparent', 'rgba(10,14,26,0.3)', Colors.dark.background]}
              locations={[0, 0.7, 1]}
              style={styles.heroGradientBottom}
            />
            <View style={styles.heroInner}>
              <View style={styles.heroContent}>
                <Text style={styles.heroTitle} numberOfLines={2}>
                  {heroProgram.title}
                </Text>
                {!!heroProgram.description && (
                  <Text style={styles.heroDescription} numberOfLines={2}>
                    {heroProgram.description}
                  </Text>
                )}
                {heroProgram.bottone && (
                  <TouchableOpacity 
                    style={styles.heroButton}
                    onPress={handleHeroPress}
                    activeOpacity={0.8}
                  >
                    <Play color="#0A0E1A" size={20} fill="#0A0E1A" />
                    <Text style={styles.heroButtonText}>{heroProgram.message.toUpperCase()}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.hero}>
            <Image
              source={require('@/assets/images/imagehome.png')}
              style={styles.heroImage}
              contentFit="contain"
              transition={0}
              cachePolicy="memory-disk"
              priority="high"
            />
            <LinearGradient
              colors={['transparent', 'rgba(10,14,26,0.3)', Colors.dark.background]}
              locations={[0, 0.7, 1]}
              style={styles.heroGradientBottom}
            />
            <View style={styles.heroInner}>
              <View style={styles.heroContent}>
                <TouchableOpacity 
                  style={styles.heroButton}
                  onPress={handleWatchLive}
                  activeOpacity={0.8}
                >
                  <Play color="#0A0E1A" size={20} fill="#0A0E1A" />
                  <Text style={styles.heroButtonText}>GUARDA ORA</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {appConfig.liveBannerEnabled && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={handleWatchLive}
          style={styles.liveSection}
        >
          <View style={styles.liveSectionHeader}>
            <Animated.View style={[styles.liveDot, { transform: [{ scale: livePulseAnim }] }]} />
            <Radio color={Colors.dark.text} size={16} />
            <Text style={styles.liveSectionTitle}>{appConfig.liveBannerLabel}</Text>
          </View>
          <View style={styles.liveBannerWrapper}>
            <Image
              source={
                appConfig.liveBannerImageUrl
                  ? { uri: appConfig.liveBannerImageUrl }
                  : require('@/assets/images/live-banner.jpg')
              }
              style={styles.liveBannerImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
            <LinearGradient
              colors={['rgba(10,14,26,0.15)', 'rgba(10,14,26,0.6)', 'rgba(10,14,26,0.9)']}
              locations={[0, 0.5, 1]}
              style={styles.liveBannerOverlay}
            />
            {currentProgram && (
              <View style={styles.liveBannerContent}>
                <View style={styles.liveNowBadge}>
                  <View style={styles.liveNowDot} />
                  <Text style={styles.liveNowText}>IN ONDA</Text>
                </View>
                <Text style={styles.liveProgramTitle} numberOfLines={1}>
                  {currentProgram.title}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
        )}

        {hasFavorites && (
          <View style={styles.perTeBanner}>
            <View style={styles.perTeDot} />
            <Text style={styles.perTeText}>Contenuti personalizzati in base ai tuoi interessi</Text>
          </View>
        )}

        {edizioniTgVideos.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Edizioni TG</Text>
              <TouchableOpacity 
                onPress={() => handleSeeAll('edizioni_tg')}
                style={styles.seeAllButton}
              >
                <Text style={styles.seeAllText}>Vedi tutto</Text>
                <ChevronRight color={Colors.dark.accent} size={16} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={edizioniTgVideos}
              horizontal
              showsHorizontalScrollIndicator={true}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <VideoCard
                  video={item}
                  onPress={() => handleVideoPress(item)}
                  width={SCREEN_WIDTH * 0.45}
                  viewCount={viewCounts[item.id]}
                />
              )}
              contentContainerStyle={styles.videoList}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              snapToInterval={SCREEN_WIDTH * 0.45 + 12}
              decelerationRate="fast"
            />
          </View>
        )}

        {sportVideos.length > 0 && showSport && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Sport</Text>
              <TouchableOpacity 
                onPress={() => handleSeeAll('sport')}
                style={styles.seeAllButton}
              >
                <Text style={styles.seeAllText}>Vedi tutto</Text>
                <ChevronRight color={Colors.dark.accent} size={16} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={sportVideos}
              horizontal
              showsHorizontalScrollIndicator={true}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <VideoCard
                  video={item}
                  onPress={() => handleVideoPress(item)}
                  width={SCREEN_WIDTH * 0.45}
                  viewCount={viewCounts[item.id]}
                />
              )}
              contentContainerStyle={styles.videoList}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              snapToInterval={SCREEN_WIDTH * 0.45 + 12}
              decelerationRate="fast"
            />
          </View>
        )}

        {cronacaVideos.length > 0 && showCronaca && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Cronaca</Text>
              <TouchableOpacity 
                onPress={() => handleSeeAll('cronaca')}
                style={styles.seeAllButton}
              >
                <Text style={styles.seeAllText}>Vedi tutto</Text>
                <ChevronRight color={Colors.dark.accent} size={16} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={cronacaVideos}
              horizontal
              showsHorizontalScrollIndicator={true}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <VideoCard
                  video={item}
                  onPress={() => handleVideoPress(item)}
                  width={SCREEN_WIDTH * 0.45}
                  viewCount={viewCounts[item.id]}
                />
              )}
              contentContainerStyle={styles.videoList}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              snapToInterval={SCREEN_WIDTH * 0.45 + 12}
              decelerationRate="fast"
            />
          </View>
        )}

        {politicaVideos.length > 0 && showPolitica && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Politica</Text>
              <TouchableOpacity 
                onPress={() => handleSeeAll('politica')}
                style={styles.seeAllButton}
              >
                <Text style={styles.seeAllText}>Vedi tutto</Text>
                <ChevronRight color={Colors.dark.accent} size={16} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={politicaVideos}
              horizontal
              showsHorizontalScrollIndicator={true}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <VideoCard
                  video={item}
                  onPress={() => handleVideoPress(item)}
                  width={SCREEN_WIDTH * 0.45}
                  viewCount={viewCounts[item.id]}
                />
              )}
              contentContainerStyle={styles.videoList}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              snapToInterval={SCREEN_WIDTH * 0.45 + 12}
              decelerationRate="fast"
            />
          </View>
        )}

        {culturaVideos.length > 0 && showCultura && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Cultura e Spettacolo</Text>
              <TouchableOpacity 
                onPress={() => handleSeeAll('cultura')}
                style={styles.seeAllButton}
              >
                <Text style={styles.seeAllText}>Vedi tutto</Text>
                <ChevronRight color={Colors.dark.accent} size={16} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={culturaVideos}
              horizontal
              showsHorizontalScrollIndicator={true}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <VideoCard
                  video={item}
                  onPress={() => handleVideoPress(item)}
                  width={SCREEN_WIDTH * 0.45}
                  viewCount={viewCounts[item.id]}
                />
              )}
              contentContainerStyle={styles.videoList}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              snapToInterval={SCREEN_WIDTH * 0.45 + 12}
              decelerationRate="fast"
            />
          </View>
        )}

        {ambienteVideos.length > 0 && showAmbiente && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Ambiente</Text>
              <TouchableOpacity 
                onPress={() => handleSeeAll('ambiente')}
                style={styles.seeAllButton}
              >
                <Text style={styles.seeAllText}>Vedi tutto</Text>
                <ChevronRight color={Colors.dark.accent} size={16} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={ambienteVideos}
              horizontal
              showsHorizontalScrollIndicator={true}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <VideoCard
                  video={item}
                  onPress={() => handleVideoPress(item)}
                  width={SCREEN_WIDTH * 0.45}
                  viewCount={viewCounts[item.id]}
                />
              )}
              contentContainerStyle={styles.videoList}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              snapToInterval={SCREEN_WIDTH * 0.45 + 12}
              decelerationRate="fast"
            />
          </View>
        )}

        {hasNoVideosForSelection && (
          <View style={styles.emptyFavoritesContainer}>
            <VideoOff color={Colors.dark.textSecondary} size={40} />
            <Text style={styles.emptyFavoritesTitle}>Nessun video disponibile</Text>
            <Text style={styles.emptyFavoritesText}>
              Al momento non ci sono video per le sezioni che ti interessano
            </Text>
          </View>
        )}

        {polls.length > 0 && (
          <View style={styles.section}>
            {polls.map((poll) => (
              <PollCard
                key={poll.id}
                poll={poll}
                onVote={handlePollVote}
                isVoting={voteMutation.isPending}
              />
            ))}
          </View>
        )}

        {programCategories.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Programmi</Text>
              <TouchableOpacity 
                onPress={() => handleSeeAll('programmi')}
                style={styles.seeAllButton}
              >
                <Text style={styles.seeAllText}>Vedi tutto</Text>
                <ChevronRight color={Colors.dark.accent} size={16} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={programCategories}
              horizontal
              showsHorizontalScrollIndicator={true}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <CategoryCard
                  category={item}
                  onPress={() => handleProgramCategoryPress(item.name)}
                  width={SCREEN_WIDTH * 0.6}
                />
              )}
              contentContainerStyle={styles.videoList}
              ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
              snapToInterval={SCREEN_WIDTH * 0.6 + 12}
              decelerationRate="fast"
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  splashContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  hero: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.85,
    position: 'relative' as const,
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  heroGradientBottom: {
    position: 'absolute' as const,
    left: 0,
    right: 0,
    bottom: 0,
    height: '40%',
  },
  heroInner: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingBottom: 24,
    paddingHorizontal: 20,
  },
  heroContent: {
    gap: 12,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.dark.text,
    lineHeight: 34,
  },
  heroDescription: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  heroButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#F5C518',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 8,
    gap: 8,
    marginTop: 4,
  },
  heroButtonText: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: '#0A0E1A',
    letterSpacing: 0.8,
  },
  liveSection: {
    marginTop: 28,
    paddingHorizontal: 20,
  },
  liveSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.liveIndicator,
  },
  liveSectionTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.dark.text,
    letterSpacing: 1,
  },
  liveBannerWrapper: {
    width: '100%',
    aspectRatio: 2.4,
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  liveBannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  liveBannerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  liveBannerContent: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
    gap: 8,
  },
  liveNowBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: Colors.dark.liveIndicator,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    gap: 6,
  },
  liveNowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  liveNowText: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  liveProgramTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  section: {
    marginTop: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.accent,
  },
  videoList: {
    paddingHorizontal: 20,
  },
  perTeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(96, 165, 250, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(96, 165, 250, 0.2)',
  },
  perTeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.dark.accent,
  },
  perTeText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '500' as const,
    color: Colors.dark.accent,
  },
  emptyFavoritesContainer: {
    marginTop: 40,
    marginHorizontal: 20,
    paddingVertical: 40,
    paddingHorizontal: 24,
    alignItems: 'center' as const,
    gap: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyFavoritesTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  emptyFavoritesText: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.dark.textSecondary,
    textAlign: 'center' as const,
    lineHeight: 20,
  },
});
