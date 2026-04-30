/**
 * AppConfigProvider
 *
 * Carica la configurazione remota (stream URL, banner live, ecc.) prima che
 * lo splash finisca: usa AsyncStorage per restituire il dato in cache in modo
 * sincrono, poi riconvalida in background su Supabase.
 */
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AppConfig,
  DEFAULT_APP_CONFIG,
  loadAppConfig,
  fetchFreshAppConfig,
} from '@/lib/appConfig';

interface AppConfigContextValue {
  config: AppConfig;
  isLoaded: boolean;
}

const AppConfigContext = createContext<AppConfigContextValue>({
  config: DEFAULT_APP_CONFIG,
  isLoaded: false,
});

const MATCH_POLL_MS = 60 * 1000; // 60 secondi

export function AppConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_APP_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;

    void loadAppConfig((fresh) => {
      /* Chiamato quando la riconvalida in background completa */
      if (isMountedRef.current) setConfig(fresh);
    }).then((initial) => {
      if (isMountedRef.current) {
        setConfig(initial);
        setIsLoaded(true);
      }
    });

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  /* Polling ogni 60s solo quando il widget partita è attivo */
  useEffect(() => {
    if (!config.matchWidgetEnabled) return;

    const interval = setInterval(async () => {
      try {
        const fresh = await fetchFreshAppConfig();
        if (isMountedRef.current) setConfig(fresh);
      } catch {
        /* silent — si riprova al prossimo tick */
      }
    }, MATCH_POLL_MS);

    return () => clearInterval(interval);
  }, [config.matchWidgetEnabled]);

  return (
    <AppConfigContext.Provider value={{ config, isLoaded }}>
      {children}
    </AppConfigContext.Provider>
  );
}

export function useAppConfig(): AppConfig {
  return useContext(AppConfigContext).config;
}

export function useAppConfigLoaded(): boolean {
  return useContext(AppConfigContext).isLoaded;
}
