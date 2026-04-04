import React from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import Colors from '@/constants/colors';

interface LoadingStateProps {
  size?: 'small' | 'large';
  color?: string;
}

export default function LoadingState({ size = 'large', color = Colors.dark.accent }: LoadingStateProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
  },
});
