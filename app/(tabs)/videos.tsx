import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Dimensions,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Search, X, Filter } from 'lucide-react-native';

import Colors from '@/constants/colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchRSSFeed } from '@/utils/dataService';
import { VideoContent, ProgramCategory } from '@/types';
import { VideosSkeleton } from '@/components/Skeleton';
import VideoCard from '@/components/VideoCard';
import CategoryCard from '@/components/CategoryCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 52) / 2;

type CategoryFilter = 'all' | 'edizioni_tg' | 'sport' | 'cronaca' | 'politica' | 'cultura' | 'ambiente' | 'programmi';

export default function VideosScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ category?: string }>();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>('all');
  const lastAppliedCategory = useRef<string | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      const cat = params.category;
      if (cat && cat !== lastAppliedCategory.current) {
        const validCategories: CategoryFilter[] = ['all', 'edizioni_tg', 'sport', 'cronaca', 'politica', 'cultura', 'ambiente', 'programmi'];
        if (validCategories.includes(cat as CategoryFilter)) {
          setSelectedCategory(cat as CategoryFilter);
          setSearchQuery('');
          lastAppliedCategory.current = cat;
        }
      } else if (!cat && lastAppliedCategory.current) {
        lastAppliedCategory.current = undefined;
      }
    }, [params.category])
  );

  const { data: videos = [], isLoading } = useQuery<VideoContent[]>({
    queryKey: ['videos'],
    queryFn: () => fetchRSSFeed(true),
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    retry: 2,
    retryDelay: 1000,
  });

  const filteredVideos = useMemo(() => {
    let filtered = [...videos];

    if (selectedCategory === 'edizioni_tg') {
      filtered = filtered.filter(v => v.category === 'edizioni_tg');
    } else if (selectedCategory === 'sport') {
      filtered = filtered.filter(v => v.category === 'sport');
    } else if (selectedCategory === 'cronaca') {
      filtered = filtered.filter(v => v.category === 'cronaca');
    } else if (selectedCategory === 'politica') {
      filtered = filtered.filter(v => v.category === 'politica');
    } else if (selectedCategory === 'cultura') {
      filtered = filtered.filter(v => v.category === 'cultura');
    } else if (selectedCategory === 'ambiente') {
      filtered = filtered.filter(v => v.category === 'ambiente');
    } else if (selectedCategory === 'programmi') {
      filtered = filtered.filter(v => v.category === 'programmi');
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(v => {
        const title = (v.title || '').toLowerCase();
        const description = (v.description || '').toLowerCase();
        return title.includes(query) || description.includes(query);
      });
    }

    return filtered;
  }, [videos, selectedCategory, searchQuery]);

  const programVideos = useMemo(() => {
    return videos.filter((v: VideoContent) => v.category === 'programmi');
  }, [videos]);

  const programCategories: ProgramCategory[] = useMemo(() => {
    if (selectedCategory !== 'programmi') return [];

    const categoryMap = new Map<string, VideoContent[]>();
    
    programVideos.forEach(video => {
      const catName = video.programCategory || 'Altri Programmi';
      if (!categoryMap.has(catName)) {
        categoryMap.set(catName, []);
      }
      categoryMap.get(catName)!.push(video);
    });
    
    const categories: ProgramCategory[] = [];
    categoryMap.forEach((videos, name) => {
      videos.sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
      const latestVideo = videos[0];
      
      categories.push({
        id: name,
        name,
        thumbnail: latestVideo.thumbnail,
        videoCount: videos.length,
      });
    });
    
    return categories.sort((a, b) => b.videoCount - a.videoCount);
  }, [programVideos, selectedCategory]);

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

  const handleClearSearch = () => {
    setSearchQuery('');
  };

  const handleProgramCategoryPress = (categoryName: string) => {
    router.push(`/program-category?name=${encodeURIComponent(categoryName)}` as any);
  };

  const renderCategoryFilter = () => {
    const categories: { key: CategoryFilter; label: string }[] = [
      { key: 'all', label: 'Tutti' },
      { key: 'edizioni_tg', label: 'Edizioni TG' },
      { key: 'sport', label: 'Sport' },
      { key: 'cronaca', label: 'Cronaca' },
      { key: 'politica', label: 'Politica' },
      { key: 'cultura', label: 'Cultura e Spettacolo' },
      { key: 'ambiente', label: 'Ambiente' },
      { key: 'programmi', label: 'Programmi' },
    ];

    return (
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryFilterContent}
        style={styles.categoryFilterScroll}
      >
        {categories.map(cat => (
          <TouchableOpacity
            key={cat.key}
            style={[
              styles.categoryButton,
              selectedCategory === cat.key && styles.categoryButtonActive,
            ]}
            onPress={() => {
              setSelectedCategory(cat.key);
              setSearchQuery('');
            }}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.categoryButtonText,
                selectedCategory === cat.key && styles.categoryButtonTextActive,
              ]}
            >
              {cat.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.headerTitle}>Video On Demand</Text>
        </View>
        <VideosSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.headerTitle}>Video On Demand</Text>
        
        <View style={styles.searchContainer}>
          <Search color={Colors.dark.textSecondary} size={20} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cerca video..."
            placeholderTextColor={Colors.dark.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} style={styles.clearButton}>
              <X color={Colors.dark.textSecondary} size={20} />
            </TouchableOpacity>
          )}
        </View>
        {renderCategoryFilter()}
      </View>

      {selectedCategory === 'programmi' && !searchQuery.trim() ? (
        <FlatList
          data={programCategories}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <View style={index % 2 === 0 ? styles.cardLeft : styles.cardRight}>
              <CategoryCard
                category={item}
                onPress={() => handleProgramCategoryPress(item.name)}
                width={CARD_WIDTH}
              />
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Filter color={Colors.dark.textSecondary} size={48} />
              <Text style={styles.emptyStateText}>Nessun programma trovato</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredVideos}
          numColumns={2}
          keyExtractor={(item) => item.id}
          renderItem={({ item, index }) => (
            <View style={index % 2 === 0 ? styles.cardLeft : styles.cardRight}>
              <VideoCard
                video={item}
                onPress={() => handleVideoPress(item)}
                width={CARD_WIDTH}
              />
            </View>
          )}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={true}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Filter color={Colors.dark.textSecondary} size={48} />
              <Text style={styles.emptyStateText}>Nessun video trovato</Text>
              <Text style={styles.emptyStateSubtext}>
                Prova a modificare i filtri o la ricerca
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
    backgroundColor: Colors.dark.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: Colors.dark.text,
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: Colors.dark.text,
  },
  clearButton: {
    padding: 4,
  },
  categoryFilterScroll: {
    flexGrow: 0,
  },
  categoryFilterContent: {
    flexDirection: 'row',
    gap: 10,
    paddingRight: 20,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.background,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  categoryButtonActive: {
    backgroundColor: Colors.dark.accent,
    borderColor: Colors.dark.accent,
  },
  categoryButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  categoryButtonTextActive: {
    color: Colors.dark.text,
  },
  listContent: {
    padding: 20,
    paddingTop: 16,
  },
  cardLeft: {
    marginBottom: 12,
    marginRight: 12,
  },
  cardRight: {
    marginBottom: 12,
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
  },
});
