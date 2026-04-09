import { Platform } from 'react-native';
import { getDeviceId } from './deviceId';

type ErrorLevel = 'error' | 'warn' | 'fatal';

interface ErrorReport {
  message: string;
  stack?: string;
  screen?: string;
  context?: string;
  level?: ErrorLevel;
}

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

let _deviceId = 'unknown';
let _isSettingUp = false;

void getDeviceId().then(id => { _deviceId = id; }).catch(() => {});

export function reportError(report: ErrorReport): void {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;

  const payload = {
    device_id: _deviceId,
    message: report.message.slice(0, 2000),
    stack: report.stack?.slice(0, 5000) ?? null,
    screen: report.screen?.slice(0, 200) ?? null,
    context: (report.context ?? Platform.OS + ' / ' + Platform.Version).slice(0, 1000),
    level: report.level ?? 'error',
  };

  console.log(`[ErrorReporter] ${payload.level}:`, payload.message);

  try {
    void fetch(`${SUPABASE_URL}/rest/v1/error_logs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch (e) {
    console.log('[ErrorReporter] Failed to send:', e);
  }
}

export function captureException(error: unknown, screen?: string, context?: string): void {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;
  reportError({ message: msg, stack, screen, context, level: 'error' });
}

export function setupGlobalErrorHandler(): void {
  if (_isSettingUp) return;
  _isSettingUp = true;

  const originalHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.log('[ErrorReporter] Global error:', error?.message, 'fatal:', isFatal);
    reportError({
      message: error?.message ?? 'Unknown error',
      stack: error?.stack,
      level: isFatal ? 'fatal' : 'error',
      context: 'global_handler',
    });
    if (originalHandler) originalHandler(error, isFatal);
  });

  const globalObj = global as unknown as Record<string, unknown>;
  if (typeof globalObj['HermesInternal'] !== 'undefined' || Platform.OS === 'android') {
    const origPromiseHandler = globalObj['onunhandledrejection'];
    globalObj['onunhandledrejection'] = (event: { reason?: unknown }) => {
      const reason = event?.reason;
      const msg = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection');
      const stack = reason instanceof Error ? reason.stack : undefined;
      console.log('[ErrorReporter] Unhandled promise rejection:', msg);
      reportError({ message: msg, stack, level: 'error', context: 'unhandled_rejection' });
      if (typeof origPromiseHandler === 'function') origPromiseHandler(event);
    };
  }

  console.log('[ErrorReporter] Global handler installed');
}
