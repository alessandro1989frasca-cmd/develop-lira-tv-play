import { Platform } from 'react-native';

const getBaseUrl = () => {
  return process.env.EXPO_PUBLIC_API_BASE_URL || '';
};

export function trackAnalyticsDirect(path: string, input: Record<string, unknown>): void {
  try {
    const url = `${getBaseUrl()}/api/trpc/${path}`;
    const body = JSON.stringify({ json: input });
    console.log(`[Analytics Direct] POST ${path}`, JSON.stringify(input));

    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      const sent = navigator.sendBeacon(url, blob);
      console.log('[Analytics Direct] sendBeacon result:', sent);
      return;
    }

    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).then(res => {
      console.log('[Analytics Direct] Response:', res.status);
    }).catch(err => {
      console.log('[Analytics Direct] Error:', err);
    });
  } catch (e) {
    console.log('[Analytics Direct] Error:', e);
  }
}
