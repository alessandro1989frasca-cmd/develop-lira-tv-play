import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing, Dimensions, ViewStyle, Platform } from 'react-native';
import Colors from '@/constants/colors';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function ShimmerBlock({ style }: { style?: ViewStyle }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: Platform.OS !== 'web',
      })
    ).start();
  }, [shimmer]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.3, 0.7, 0.3],
  });

  return (
    <Animated.View
      style={[
        styles.block,
        style,
        { opacity },
      ]}
    />
  );
}

export function VideoCardSkeleton({ width }: { width?: number }) {
  const cardWidth = width ?? SCREEN_WIDTH * 0.45;
  return (
    <View style={[styles.videoCard, { width: cardWidth }]}>
      <ShimmerBlock style={{ width: cardWidth, height: cardWidth * 0.6, borderRadius: 12 }} />
      <View style={styles.videoCardText}>
        <ShimmerBlock style={{ width: '90%', height: 12, borderRadius: 6 }} />
        <ShimmerBlock style={{ width: '60%', height: 10, borderRadius: 5, marginTop: 6 }} />
      </View>
    </View>
  );
}

export function NewsItemSkeleton() {
  return (
    <View style={styles.newsItem}>
      <ShimmerBlock style={{ width: 100, height: 100, borderRadius: 12 }} />
      <View style={styles.newsItemContent}>
        <ShimmerBlock style={{ width: '95%', height: 14, borderRadius: 7 }} />
        <ShimmerBlock style={{ width: '70%', height: 14, borderRadius: 7, marginTop: 6 }} />
        <View style={styles.newsItemMeta}>
          <ShimmerBlock style={{ width: 50, height: 10, borderRadius: 5 }} />
          <ShimmerBlock style={{ width: 70, height: 10, borderRadius: 5 }} />
        </View>
      </View>
    </View>
  );
}

export function HeroSkeleton() {
  return (
    <View style={styles.hero}>
      <ShimmerBlock style={{ width: '100%', height: '100%', borderRadius: 0 }} />
      <View style={styles.heroOverlay}>
        <ShimmerBlock style={{ width: 120, height: 36, borderRadius: 8, alignSelf: 'center' }} />
        <ShimmerBlock style={{ width: 200, height: 16, borderRadius: 8, marginTop: 20, alignSelf: 'center' }} />
        <ShimmerBlock style={{ width: 180, height: 48, borderRadius: 30, marginTop: 20, alignSelf: 'center' }} />
      </View>
    </View>
  );
}

export function SectionSkeleton() {
  const cardWidth = SCREEN_WIDTH * 0.45;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <ShimmerBlock style={{ width: 140, height: 20, borderRadius: 10 }} />
        <ShimmerBlock style={{ width: 80, height: 14, borderRadius: 7 }} />
      </View>
      <View style={styles.sectionCards}>
        <VideoCardSkeleton width={cardWidth} />
        <View style={{ width: 12 }} />
        <VideoCardSkeleton width={cardWidth} />
      </View>
    </View>
  );
}

export function HomeSkeleton() {
  return (
    <View style={styles.container}>
      <HeroSkeleton />
      <SectionSkeleton />
      <SectionSkeleton />
    </View>
  );
}

export function NewsSkeleton() {
  return (
    <View style={styles.container}>
      <View style={styles.newsSectionHeader}>
        <ShimmerBlock style={{ width: 100, height: 12, borderRadius: 6 }} />
      </View>
      {Array.from({ length: 5 }).map((_, i) => (
        <NewsItemSkeleton key={i} />
      ))}
    </View>
  );
}

export function VideosSkeleton() {
  const cardWidth = (SCREEN_WIDTH - 52) / 2;
  return (
    <View style={styles.videosGrid}>
      {Array.from({ length: 6 }).map((_, i) => (
        <VideoCardSkeleton key={i} width={cardWidth} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: Colors.dark.surface,
  },
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  videoCard: {
    gap: 8,
  },
  videoCardText: {
    paddingHorizontal: 4,
    gap: 2,
  },
  newsItem: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  newsItemContent: {
    flex: 1,
    justifyContent: 'center',
  },
  newsItemMeta: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  hero: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 1.2,
    position: 'relative',
  },
  heroOverlay: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
  },
  section: {
    marginTop: 32,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionCards: {
    flexDirection: 'row',
  },
  newsSectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  videosGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 20,
    gap: 12,
  },
});
