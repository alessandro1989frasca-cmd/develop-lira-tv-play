import React from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Radio } from 'lucide-react-native';
import Colors from '@/constants/colors';

interface LiveIndicatorProps {
  size?: 'small' | 'large';
}

export default function LiveIndicator({ size = 'large' }: LiveIndicatorProps) {
  const pulseAnim = React.useRef(new Animated.Value(1)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [pulseAnim]);

  const isSmall = size === 'small';

  return (
    <View style={[styles.container, isSmall && styles.containerSmall]}>
      <Animated.View style={[styles.dot, isSmall && styles.dotSmall, { transform: [{ scale: pulseAnim }] }]} />
      <Radio color={Colors.dark.text} size={isSmall ? 12 : 16} style={styles.icon} />
      <Text style={[styles.text, isSmall && styles.textSmall]}>LIVE</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.liveIndicator,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  containerSmall: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.dark.text,
  },
  dotSmall: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  icon: {
    marginRight: 2,
  },
  text: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: '700' as const,
    letterSpacing: 0.5,
  },
  textSmall: {
    fontSize: 11,
  },
});
