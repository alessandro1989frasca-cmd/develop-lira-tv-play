import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';

export type ResumeMap = Record<string, number>;

export function useResumePositions(): ResumeMap {
  const [map, setMap] = useState<ResumeMap>({});

  const load = useCallback(() => {
    AsyncStorage.getAllKeys()
      .then(keys => {
        const resumeKeys = keys.filter(k => k.startsWith('video_resume_'));
        if (resumeKeys.length === 0) { setMap({}); return; }
        AsyncStorage.multiGet(resumeKeys)
          .then(pairs => {
            const next: ResumeMap = {};
            pairs.forEach(([key, raw]) => {
              if (!raw) return;
              try {
                const { position, duration } = JSON.parse(raw) as {
                  position: number;
                  duration?: number;
                  savedAt: number;
                };
                if (!duration || duration <= 0) return;
                const pct = position / duration;
                if (pct > 0.02 && pct < 0.92) {
                  const videoId = key.replace('video_resume_', '');
                  next[videoId] = pct;
                }
              } catch {}
            });
            setMap(next);
          })
          .catch(() => {});
      })
      .catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return map;
}
