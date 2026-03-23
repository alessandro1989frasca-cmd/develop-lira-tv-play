import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Dimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import Colors from '@/constants/colors';
import { fetchRSSFeed } from '@/utils/dataService';
import { VideoContent } from '@/types';
import VideoCard from '@/components/VideoCard';
import LoadingState from '@/components/LoadingState';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function ProgramCategoryScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();

  const { data: allVideos = [], isLoading } = useQuery<VideoContent[]>({
    queryKey: ['videos'],
    queryFn: () => fetchRSSFeed(true),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });

  const categoryVideos = React.useMemo(() => {
    return allVideos
      .filter(v => v.category === 'programmi' && v.programCategory === name)
      .sort((a, b) => new Date(b.pubDate).getTime() - new Date(a.pubDate).getTime());
  }, [allVideos, name]);

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

  if (isLoading) {
    return (
      <>
        <Stack.Screen options={{ title: name || 'Categoria' }} />
        <LoadingState />
      </>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen 
        options={{ 
          title: name || 'Categoria',
          headerStyle: {
            backgroundColor: Colors.dark.background,
          },
          headerTintColor: Colors.dark.text,
        }} 
      />
      
      <FlatList
        data={categoryVideos}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <VideoCard
            video={item}
            onPress={() => handleVideoPress(item)}
            width={SCREEN_WIDTH - 40}
          />
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Nessun video disponibile</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  listContent: {
    padding: 20,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
});
