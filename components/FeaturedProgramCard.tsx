import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { Play, Star } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';

interface FeaturedProgram {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  videoUrl: string;
  category: string;
  sortOrder: number;
}

interface FeaturedProgramCardProps {
  program: FeaturedProgram;
  onPress: () => void;
  index: number;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;

function FeaturedProgramCardInner({ program, onPress, index }: FeaturedProgramCardProps) {
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        delay: index * 120,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 400,
        delay: index * 120,
        useNativeDriver: true,
      }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [scaleAnim, opacityAnim, shimmerAnim, index]);

  const borderOpacity = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.9],
  });

  return (
    <Animated.View
      style={[
        styles.cardOuter,
        {
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={styles.card}
      >
        <View style={styles.imageWrapper}>
          {program.thumbnail ? (
            <Image
              source={{ uri: program.thumbnail }}
              style={styles.image}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <View style={[styles.image, styles.placeholderImage]}>
              <Play color={Colors.dark.textSecondary} size={48} />
            </View>
          )}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.3)', 'rgba(0,0,0,0.85)']}
            locations={[0.2, 0.5, 1]}
            style={styles.imageGradient}
          />
          <View style={styles.playOverlay}>
            <View style={styles.playCircle}>
              <Play color="#fff" size={22} fill="#fff" />
            </View>
          </View>
          <Animated.View style={[styles.featuredBadge, { opacity: borderOpacity }]}>
            <Star color="#FFD700" size={12} fill="#FFD700" />
            <Text style={styles.featuredBadgeText}>IN EVIDENZA</Text>
          </Animated.View>
        </View>

        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {program.title}
          </Text>
          {!!program.description && (
            <Text style={styles.description} numberOfLines={2}>
              {program.description}
            </Text>
          )}
          {!!program.category && (
            <View style={styles.categoryTag}>
              <Text style={styles.categoryTagText}>{program.category}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}

const FeaturedProgramCard = React.memo(FeaturedProgramCardInner);
export default FeaturedProgramCard;

const styles = StyleSheet.create({
  cardOuter: {
    width: CARD_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.25)',
    backgroundColor: Colors.dark.surface,
    boxShadow: '0px 8px 24px rgba(255, 215, 0, 0.08)',
    elevation: 6,
  },
  card: {
    width: '100%',
  },
  imageWrapper: {
    width: '100%',
    aspectRatio: 16 / 9,
    position: 'relative' as const,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  placeholderImage: {
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 215, 0, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 4px 16px rgba(255, 215, 0, 0.4)',
    elevation: 4,
  },
  featuredBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.5)',
  },
  featuredBadgeText: {
    color: '#FFD700',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 1,
  },
  content: {
    padding: 14,
    gap: 6,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: '700' as const,
    lineHeight: 22,
  },
  description: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  categoryTag: {
    alignSelf: 'flex-start',
    marginTop: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryTagText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: '600' as const,
  },
});
