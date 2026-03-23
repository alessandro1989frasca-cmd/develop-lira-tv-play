import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { ProgramCategory } from '@/types';
import Colors from '@/constants/colors';

interface CategoryCardProps {
  category: ProgramCategory;
  onPress: () => void;
  width: number;
}

export default function CategoryCard({ category, onPress, width }: CategoryCardProps) {
  return (
    <TouchableOpacity 
      style={[styles.container, { width }]} 
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Image 
        source={{ uri: category.thumbnail }}
        style={styles.thumbnail}
        resizeMode="cover"
      />
      <View style={styles.overlay} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>
          {category.name}
        </Text>
        <Text style={styles.count}>
          {category.videoCount} {category.videoCount === 1 ? 'video' : 'video'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 140,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: Colors.dark.surface,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-end',
  },
  title: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  count: {
    fontSize: 13,
    fontWeight: '500' as const,
    color: Colors.dark.textSecondary,
  },
});
