import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { BarChart3, Check } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

interface PollData {
  id: string;
  question: string;
  options: string[];
  voteCounts: number[];
  totalVotes: number;
  myVote: number | null;
  label?: string;
}

interface PollCardProps {
  poll: PollData;
  onVote: (pollId: string, optionIndex: number) => void;
  isVoting?: boolean;
}

function PollCardInner({ poll, onVote, isVoting }: PollCardProps) {
  const [selectedOption, setSelectedOption] = useState<number | null>(poll.myVote);
  const hasVoted = poll.myVote !== null || selectedOption !== null;
  const animValues = useRef(poll.options.map(() => new Animated.Value(0))).current;

  const handleVote = useCallback((optionIndex: number) => {
    if (hasVoted || isVoting) return;
    setSelectedOption(optionIndex);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

    Animated.stagger(60, animValues.map((anim) =>
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: false,
        tension: 50,
        friction: 7,
      })
    )).start();

    onVote(poll.id, optionIndex);
  }, [hasVoted, isVoting, poll.id, onVote, animValues]);

  const activeVote = poll.myVote ?? selectedOption;

  const optimisticVoteCounts = poll.voteCounts.map((count, i) => {
    if (selectedOption !== null && poll.myVote === null && i === selectedOption) {
      return count + 1;
    }
    return count;
  });
  const optimisticTotal = selectedOption !== null && poll.myVote === null
    ? poll.totalVotes + 1
    : poll.totalVotes;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <BarChart3 color={Colors.dark.accent} size={18} />
        <Text style={styles.label}>{(poll.label ?? 'SONDAGGIO').toUpperCase()}</Text>
      </View>

      <Text style={styles.question}>{poll.question}</Text>

      <View style={styles.optionsContainer}>
        {poll.options.map((option, index) => {
          const percentage = optimisticTotal > 0
            ? Math.round((optimisticVoteCounts[index] / optimisticTotal) * 100)
            : 0;
          const isSelected = activeVote === index;

          const barWidth = hasVoted
            ? animValues[index].interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', `${percentage}%`],
              })
            : '0%';

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.optionButton,
                isSelected && styles.optionButtonSelected,
              ]}
              onPress={() => handleVote(index)}
              disabled={hasVoted || isVoting}
              activeOpacity={0.7}
              testID={`poll-option-${index}`}
            >
              {hasVoted && (
                <Animated.View
                  style={[
                    styles.progressBar,
                    isSelected ? styles.progressBarSelected : styles.progressBarDefault,
                    { width: barWidth },
                  ]}
                />
              )}

              <View style={styles.optionContent}>
                <View style={styles.optionLeft}>
                  {isSelected && (
                    <View style={styles.checkIcon}>
                      <Check color={Colors.dark.accent} size={14} />
                    </View>
                  )}
                  <Text style={[
                    styles.optionText,
                    isSelected && styles.optionTextSelected,
                  ]}>
                    {option}
                  </Text>
                </View>
                {hasVoted && (
                  <Text style={[
                    styles.percentageText,
                    isSelected && styles.percentageTextSelected,
                  ]}>
                    {percentage}%
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.totalVotes}>
        {optimisticTotal} vot{optimisticTotal === 1 ? 'o' : 'i'}
      </Text>
    </View>
  );
}

const PollCard = React.memo(PollCardInner);
export default PollCard;

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  label: {
    fontSize: 11,
    fontWeight: '700' as const,
    color: Colors.dark.accent,
    letterSpacing: 1,
  },
  question: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    lineHeight: 24,
    marginBottom: 16,
  },
  optionsContainer: {
    gap: 10,
  },
  optionButton: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
    minHeight: 48,
    justifyContent: 'center',
  },
  optionButtonSelected: {
    borderColor: Colors.dark.accent,
  },
  progressBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 11,
  },
  progressBarSelected: {
    backgroundColor: 'rgba(96, 165, 250, 0.2)',
  },
  progressBarDefault: {
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    zIndex: 1,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  checkIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: Colors.dark.textSecondary,
    flex: 1,
  },
  optionTextSelected: {
    color: Colors.dark.text,
    fontWeight: '600' as const,
  },
  percentageText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
    marginLeft: 8,
  },
  percentageTextSelected: {
    color: Colors.dark.accent,
    fontWeight: '700' as const,
  },
  totalVotes: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginTop: 12,
    fontWeight: '500' as const,
  },
});
