import React, { useState, useEffect, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import createContextHook from '@nkzw/create-context-hook';

const PREFS_KEY = 'user_preferences_v1';
const CACHED_NEWS_KEY = 'cached_news_articles_v1';

export type NewsCategory = 'Cronaca' | 'Sport' | 'Politica' | 'Cultura e Spettacolo' | 'Ambiente';

export const ALL_NEWS_CATEGORIES: NewsCategory[] = [
  'Cronaca', 'Sport', 'Politica', 'Cultura e Spettacolo', 'Ambiente',
];

interface UserPreferences {
  favoriteCategories: string[];
  hasSetPreferences: boolean;
}

const DEFAULT_PREFS: UserPreferences = {
  favoriteCategories: [],
  hasSetPreferences: false,
};

export const [UserPreferencesProvider, useUserPreferences] = createContextHook(() => {
  const queryClient = useQueryClient();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFS);
  const prefsQuery = useQuery({
    queryKey: ['user-preferences'],
    queryFn: async () => {
      const stored = await AsyncStorage.getItem(PREFS_KEY);
      return stored ? JSON.parse(stored) as UserPreferences : DEFAULT_PREFS;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    if (prefsQuery.data) {
      setPreferences(prefsQuery.data);
    }
  }, [prefsQuery.data]);

  const savePrefsMutation = useMutation({
    mutationFn: async (newPrefs: UserPreferences) => {
      await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(newPrefs));
      return newPrefs;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['user-preferences'], data);
    },
  });

  const toggleCategory = useCallback((category: string) => {
    setPreferences(prev => {
      const exists = prev.favoriteCategories.includes(category);
      const updated: UserPreferences = {
        ...prev,
        hasSetPreferences: true,
        favoriteCategories: exists
          ? prev.favoriteCategories.filter(c => c !== category)
          : [...prev.favoriteCategories, category],
      };
      savePrefsMutation.mutate(updated);
      return updated;
    });
  }, [savePrefsMutation]);

  const setCategories = useCallback((categories: string[]) => {
    const updated: UserPreferences = {
      hasSetPreferences: true,
      favoriteCategories: categories,
    };
    setPreferences(updated);
    savePrefsMutation.mutate(updated);
  }, [savePrefsMutation]);

  const isLoading = prefsQuery.isLoading;

  return useMemo(() => ({
    preferences,
    isLoading,
    toggleCategory,
    setCategories,
  }), [preferences, isLoading, toggleCategory, setCategories]);
});

export const CACHED_NEWS_KEY_EXPORT = CACHED_NEWS_KEY;
