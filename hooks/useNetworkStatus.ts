import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform, AppState, AppStateStatus } from 'react-native';

interface NetworkStatus {
  isConnected: boolean;
  wasOffline: boolean;
  checkNow: () => Promise<boolean>;
}

const PING_URL = 'https://clients3.google.com/generate_204';
const CHECK_INTERVAL = 15000;

async function pingNetwork(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(PING_URL, {
      method: 'HEAD',
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok || response.status === 204;
  } catch {
    return false;
  }
}

export function useNetworkStatus(): NetworkStatus {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [wasOffline, setWasOffline] = useState<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevConnected = useRef<boolean>(true);

  const checkNow = useCallback(async (): Promise<boolean> => {
    const online = await pingNetwork();
    console.log(`[Network] Ping result: ${online ? 'online' : 'offline'}`);

    if (!online && prevConnected.current) {
      setWasOffline(true);
    }
    if (online && !prevConnected.current) {
      console.log('[Network] Connection restored');
    }

    prevConnected.current = online;
    setIsConnected(online);
    return online;
  }, []);

  useEffect(() => {
    void checkNow();

    intervalRef.current = setInterval(() => {
      void checkNow();
    }, CHECK_INTERVAL);

    const handleAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        console.log('[Network] App foregrounded, checking connectivity');
        void checkNow();
      }
    };

    const sub = AppState.addEventListener('change', handleAppState);

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const onOnline = () => {
        console.log('[Network] Browser online event');
        void checkNow();
      };
      const onOffline = () => {
        console.log('[Network] Browser offline event');
        prevConnected.current = false;
        setIsConnected(false);
        setWasOffline(true);
      };
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);

      return () => {
        if (intervalRef.current) clearInterval(intervalRef.current);
        sub.remove();
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      };
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      sub.remove();
    };
  }, [checkNow]);

  return { isConnected, wasOffline, checkNow };
}
