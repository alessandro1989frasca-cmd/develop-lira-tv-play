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
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Newspaper, RefreshCw, X, WifiOff, SlidersHorizontal } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Colors from '@/constants/colors';
import { fetchNewsArticles } from '@/utils/dataService';
import { NewsArticle } from '@/types';
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
  const { preferences } = useUserPreferences();

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

interface ArticleModalProps {
  article: NewsArticle;
  onClose: () => void;
}

function ArticleModal({ article, onClose }: ArticleModalProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(300)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: Platform.OS !== 'web' }),
      Animated.spring(slideAnim, { toValue: 0, tension: 65, friction: 11, useNativeDriver: Platform.OS !== 'web' }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  const handleClose = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(slideAnim, { toValue: 300, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() => onClose());
  }, [fadeAnim, slideAnim, onClose]);

  return (
    <Animated.View style={[styles.articleModal, { opacity: fadeAnim }]}>
      <Animated.View style={[styles.articleModalContent, { transform: [{ translateY: slideAnim }] }]}>
        <View style={styles.articleModalHeader}>
          <Text style={styles.articleModalTitle} numberOfLines={2}>
            {article.title}
          </Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <X color={Colors.dark.text} size={24} />
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.articleModalBody} showsVerticalScrollIndicator={true}>
          <Image
            source={{ uri: article.thumbnail }}
            style={styles.articleImage}
            resizeMode="cover"
          />
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
