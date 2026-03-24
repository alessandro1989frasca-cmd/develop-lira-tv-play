import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Clock } from 'lucide-react-native';
import { ProgramSchedule } from '@/types';
import Colors from '@/constants/colors';
import LiveIndicator from './LiveIndicator';

interface ProgramCardProps {
  program: ProgramSchedule;
  onPress?: () => void;
}

export default function ProgramCard({ program, onPress }: ProgramCardProps) {
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };

  if (onPress) {
    return (
      <TouchableOpacity 
        onPress={onPress} 
        style={[styles.container, program.isLive && styles.liveContainer]}
        activeOpacity={0.7}
      >
        <View style={styles.timeContainer}>
          <Clock color={program.isLive ? Colors.dark.accent : Colors.dark.textSecondary} size={16} />
          <Text style={[styles.time, program.isLive && styles.liveTime]}>
            {formatTime(program.startTime)} - {formatTime(program.endTime)}
          </Text>
        </View>
        <View style={styles.content}>
          <View style={styles.header}>
            <Text style={[styles.title, program.isLive && styles.liveTitle]} numberOfLines={2}>
              {program.title}
            </Text>
            {program.isLive && <LiveIndicator size="small" />}
          </View>
          {!!program.description && (
            <Text style={styles.description} numberOfLines={3}>
              {program.description}
            </Text>
          )}
          {!!program.category && (
            <Text style={styles.category}>{program.category}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View 
      style={[styles.container, program.isLive && styles.liveContainer]}
    >
      <View style={styles.timeContainer}>
        <Clock color={program.isLive ? Colors.dark.accent : Colors.dark.textSecondary} size={16} />
        <Text style={[styles.time, program.isLive && styles.liveTime]}>
          {formatTime(program.startTime)} - {formatTime(program.endTime)}
        </Text>
      </View>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={[styles.title, program.isLive && styles.liveTitle]} numberOfLines={2}>
            {program.title}
          </Text>
          {program.isLive && <LiveIndicator size="small" />}
        </View>
        {!!program.description && (
          <Text style={styles.description} numberOfLines={3}>
            {program.description}
          </Text>
        )}
        {!!program.category && (
          <Text style={styles.category}>{program.category}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.border,
  },
  liveContainer: {
    borderLeftColor: Colors.dark.liveIndicator,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  time: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  liveTime: {
    color: Colors.dark.accent,
  },
  content: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '600' as const,
    lineHeight: 22,
  },
  liveTitle: {
    color: Colors.dark.accent,
  },
  description: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  category: {
    color: Colors.dark.accent,
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'uppercase',
  },
});
