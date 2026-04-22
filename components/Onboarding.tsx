import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Animated,
  TouchableOpacity,
  FlatList,
  ViewToken,
  Image,
  Platform,
} from 'react-native';
import { Radio, Video, Bell } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { LOCAL_LOGO } from '@/constants/config';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OnboardingProps {
  onComplete: () => void;
}

interface SlideData {
  id: string;
  icon: 'live' | 'video' | 'notify';
  title: string;
  description: string;
  accent: string;
}

const SLIDES: SlideData[] = [
  {
    id: '1',
    icon: 'live',
    title: 'Diretta Streaming',
    description: 'Guarda Lira TV in diretta ovunque ti trovi. Non perdere mai i tuoi programmi preferiti.',
    accent: '#3B82F6',
  },
  {
    id: '2',
    icon: 'video',
    title: 'Video On Demand',
    description: 'Rivedi TG, sport, cronaca e tutti i programmi quando vuoi, sempre disponibili per te.',
    accent: '#10B981',
  },
  {
    id: '3',
    icon: 'notify',
    title: 'Non Perderti Nulla',
    description: 'Attiva le notifiche per i programmi del palinsesto e ricevi un avviso prima che inizino.',
    accent: '#F59E0B',
  },
];

function SlideIcon({ type, accent, animValue }: { type: string; accent: string; animValue: Animated.Value }) {
  const scale = animValue.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.8, 1.1, 1],
  });

  const iconMap: Record<string, React.ReactNode> = {
    live: <Radio color="#fff" size={44} />,
    video: <Video color="#fff" size={44} />,
    notify: <Bell color="#fff" size={44} />,
  };

  return (
    <Animated.View
      style={[
        styles.iconContainer,
        { backgroundColor: accent, transform: [{ scale }] },
      ]}
    >
      {iconMap[type]}
    </Animated.View>
  );
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const iconAnim = useRef(new Animated.Value(0)).current;

  const animateIcon = useCallback(() => {
    iconAnim.setValue(0);
    Animated.spring(iconAnim, {
      toValue: 1,
      tension: 50,
      friction: 6,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [iconAnim]);

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems.length > 0 && viewableItems[0].index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }).current;

  React.useEffect(() => {
    animateIcon();
  }, [currentIndex, animateIcon]);

  const viewabilityConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    onComplete();
  };

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const renderSlide = ({ item }: { item: SlideData }) => {
    return (
      <View style={[styles.slide, { width: SCREEN_WIDTH }]}>
        <View style={styles.slideTop}>
          <View style={[styles.glowBg, { backgroundColor: item.accent + '15' }]} />
          <SlideIcon type={item.icon} accent={item.accent} animValue={iconAnim} />
        </View>
        <View style={styles.slideBottom}>
          <Text style={styles.slideTitle}>{item.title}</Text>
          <Text style={styles.slideDescription}>{item.description}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Image
          source={LOCAL_LOGO}
          style={styles.headerLogo}
          resizeMode="contain"
        />
        {!isLastSlide && (
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton} activeOpacity={0.7}>
            <Text style={styles.skipText}>Salta</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false }
        )}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        scrollEventThrottle={16}
      />

      <View style={[styles.footer, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.pagination}>
          {SLIDES.map((_, index) => {
            const inputRange = [
              (index - 1) * SCREEN_WIDTH,
              index * SCREEN_WIDTH,
              (index + 1) * SCREEN_WIDTH,
            ];

            const dotWidth = scrollX.interpolate({
              inputRange,
              outputRange: [8, 28, 8],
              extrapolate: 'clamp',
            });

            const dotOpacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.3, 1, 0.3],
              extrapolate: 'clamp',
            });

            return (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    width: dotWidth,
                    opacity: dotOpacity,
                    backgroundColor: SLIDES[currentIndex].accent,
                  },
                ]}
              />
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.nextButton, { backgroundColor: SLIDES[currentIndex].accent }]}
          onPress={handleNext}
          activeOpacity={0.8}
        >
          <Text style={styles.nextButtonText}>
            {isLastSlide ? 'Inizia' : 'Avanti'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  headerLogo: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  skipButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  skipText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  slide: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  slideTop: {
    alignItems: 'center',
    justifyContent: 'center',
    height: SCREEN_HEIGHT * 0.35,
    position: 'relative',
  },
  glowBg: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
  },
  iconContainer: {
    width: 110,
    height: 110,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    boxShadow: '0px 8px 16px rgba(0, 0, 0, 0.3)',
    elevation: 10,
  },
  slideBottom: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 8,
  },
  slideTitle: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.dark.text,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  slideDescription: {
    fontSize: 16,
    lineHeight: 24,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    maxWidth: 300,
  },
  footer: {
    paddingHorizontal: 24,
    gap: 24,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  nextButton: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.25)',
    elevation: 6,
  },
  nextButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#fff',
    letterSpacing: 0.5,
  },
});
