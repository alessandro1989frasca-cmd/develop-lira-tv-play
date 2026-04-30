/**
 * MatchWidget.tsx
 *
 * Widget risultati Salernitana — punteggio live con marcatori.
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { Image } from 'expo-image';
import { MatchData, GoalEvent } from '@/lib/appConfig';

interface Props {
  matchData: MatchData;
}

const LIVE_STATUSES = ['1H', '2H', 'HT', 'ET', 'P', 'BT', 'LIVE'];

function formatStatus(status: string): string {
  if (status === 'NS')   return 'NON INIZIATA';
  if (status === 'HT')   return 'INTERVALLO';
  if (status === 'FT')   return 'FINE';
  if (status === 'AET')  return 'D.T.S.';
  if (status === 'PEN')  return 'DOPO I RIGORI';
  if (status === 'PST')  return 'RINVIATA';
  if (status === 'CANC') return 'CANCELLATA';
  return status;
}

function goalLabel(g: GoalEvent): string {
  const suffix = g.isOwnGoal ? ' (aut.)' : g.isPenalty ? ' (rig.)' : '';
  return `${g.minute}' ${g.playerName}${suffix}`;
}

export default function MatchWidget({ matchData }: Props) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const isLive    = LIVE_STATUSES.includes(matchData.status);
  const scorers   = matchData.scorers ?? [];

  const homeScorers = scorers.filter(g => g.isOwnGoal ? g.team === 'away' : g.team === 'home');
  const awayScorers = scorers.filter(g => g.isOwnGoal ? g.team === 'home' : g.team === 'away');

  useEffect(() => {
    if (!isLive) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.4, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [isLive, pulseAnim]);

  const homeGoals  = matchData.homeGoals ?? '-';
  const awayGoals  = matchData.awayGoals ?? '-';
  const statusText = formatStatus(matchData.status);
  const hasGoals   = scorers.length > 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        {isLive ? (
          <View style={styles.liveRow}>
            <Animated.View style={[styles.liveDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.liveText}>LIVE</Text>
            {matchData.elapsed != null && (
              <Text style={styles.elapsedInHeader}>{matchData.elapsed}'</Text>
            )}
          </View>
        ) : (
          <Text style={styles.statusText}>{statusText}</Text>
        )}
        <Text style={styles.roundText} numberOfLines={1}>
          {matchData.league} · {matchData.round}
        </Text>
      </View>

      {/* Score row */}
      <View style={styles.scoreRow}>
        <View style={styles.teamBlock}>
          <Image
            source={{ uri: matchData.homeLogo }}
            style={styles.teamLogo}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
          <Text style={styles.teamName} numberOfLines={2}>
            {matchData.homeTeam}
          </Text>
        </View>

        <View style={styles.scoreBlock}>
          <Text style={styles.score}>{homeGoals} - {awayGoals}</Text>
          {!isLive && matchData.status !== 'NS' && (
            <Text style={styles.ftBadge}>{statusText}</Text>
          )}
        </View>

        <View style={styles.teamBlock}>
          <Image
            source={{ uri: matchData.awayLogo }}
            style={styles.teamLogo}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
          <Text style={styles.teamName} numberOfLines={2}>
            {matchData.awayTeam}
          </Text>
        </View>
      </View>

      {/* Marcatori */}
      {hasGoals && (
        <View style={styles.scorersRow}>
          <View style={styles.scorersCol}>
            {homeScorers.map((g, i) => (
              <Text key={i} style={styles.scorerText} numberOfLines={1}>
                ⚽ {goalLabel(g)}
              </Text>
            ))}
          </View>
          <View style={styles.scorersDivider} />
          <View style={[styles.scorersCol, styles.scorersColRight]}>
            {awayScorers.map((g, i) => (
              <Text key={i} style={[styles.scorerText, styles.scorerTextRight]} numberOfLines={1}>
                {goalLabel(g)} ⚽
              </Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const GRANATA      = '#8B1A1A';
const GRANATA_DARK = '#5A0E0E';

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: GRANATA_DARK,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: GRANATA,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: GRANATA,
  },
  liveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#fff',
  },
  liveText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  elapsedInHeader: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '600',
  },
  statusText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  roundText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 10,
    flex: 1,
    textAlign: 'right',
    marginLeft: 8,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 16,
    paddingBottom: 12,
  },
  teamBlock: {
    flex: 1,
    alignItems: 'center',
    gap: 8,
  },
  teamLogo: {
    width: 52,
    height: 52,
  },
  teamName: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  scoreBlock: {
    alignItems: 'center',
    paddingHorizontal: 12,
    minWidth: 90,
    gap: 2,
  },
  score: {
    color: '#fff',
    fontSize: 36,
    fontWeight: '800',
    letterSpacing: 2,
  },
  ftBadge: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 2,
  },
  scorersRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  scorersCol: {
    flex: 1,
    gap: 4,
  },
  scorersColRight: {
    alignItems: 'flex-end',
  },
  scorersDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  scorerText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '500',
  },
  scorerTextRight: {
    textAlign: 'right',
  },
});
