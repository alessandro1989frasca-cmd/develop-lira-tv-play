import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Play } from 'lucide-react-native';
import { VideoContent } from '@/types';
import Colors from '@/constants/colors';

interface VideoCardProps {
  video: VideoContent;
  onPress: () => void;
  width?: number;
  progress?: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const DEFAULT_CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

function VideoCardInner({ video, onPress, width = DEFAULT_CARD_WIDTH, progress }: VideoCardProps) {
  const showProgress = typeof progress === 'number' && progress > 0.02 && progress < 0.92;
  return (
    <TouchableOpacity onPress={onPress} style={[styles.container, { width }]} activeOpacity={0.7}>
      <View style={styles.thumbnailContainer}>
        {video.thumbnail ? (
          <Image
            source={{ uri: video.thumbnail }}
            style={styles.thumbnail}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.thumbnail, styles.placeholderThumbnail]}>
            <Play color={Colors.dark.textSecondary} size={40} />
          </View>
        )}
        <View style={styles.overlay}>
          <View style={styles.playButton}>
            <Play color={Colors.dark.text} size={20} fill={Colors.dark.text} />
          </View>
        </View>
        {!!video.category && video.category !== 'all' && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>
              {video.category === 'edizioni_tg' ? 'Edizioni TG' : 
               video.category === 'sport' ? 'Sport' :
               video.category === 'cronaca' ? 'Cronaca' :
               video.category === 'politica' ? 'Politica' :
               video.category === 'cultura' ? 'Cultura' :
               video.category === 'ambiente' ? 'Ambiente' : 'Programmi'}
            </Text>
          </View>
        )}
        {showProgress && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress! * 100)}%` }]} />
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={2}>{video.title}</Text>
        <View style={styles.metaRow}>
          {!!video.pubDate && (
            <Text style={styles.date} numberOfLines={1}>
              {new Date(video.pubDate).toLocaleDateString('it-IT', { 
                day: 'numeric', 
                month: 'short', 
                year: 'numeric' 
              })}
            </Text>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
}

const VideoCard = React.memo(VideoCardInner);
export default VideoCard;

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  thumbnailContainer: {
    position: 'relative',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.dark.surface,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
  },
  placeholderThumbnail: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(30, 58, 138, 0.9)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  categoryText: {
    color: Colors.dark.text,
    fontSize: 10,
    fontWeight: '600' as const,
    textTransform: 'uppercase',
  },
  progressTrack: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: {
    height: 3,
    backgroundColor: '#3b82f6',
  },
  info: {
    marginTop: 8,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  date: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
});
