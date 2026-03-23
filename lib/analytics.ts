import { trackSessionDirect } from '@/utils/dataService';

export function trackAnalyticsDirect(path: string, input: Record<string, unknown>): void {
  try {
    console.log(`[Analytics Direct] ${path}`, JSON.stringify(input));

    const deviceId = (input.deviceId as string) || '';
    const type = (input.type as 'live' | 'video') || 'video';
    const contentId = (input.contentId as string) || '';
    const durationSec = (input.durationSec as number) || 0;

    trackSessionDirect(deviceId, type, contentId, durationSec).catch(err => {
      console.log('[Analytics Direct] Error:', err);
    });
  } catch (e) {
    console.log('[Analytics Direct] Error:', e);
  }
}
