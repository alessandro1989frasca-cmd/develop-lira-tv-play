import { getDeviceId } from './deviceId';
import { trpcClient } from './trpc';

type ErrorLevel = 'error' | 'warn' | 'fatal';

interface ErrorReport {
  message: string;
  stack?: string;
  screen?: string;
  context?: string;
  level?: ErrorLevel;
}

let isReporting = false;

export async function reportError(report: ErrorReport): Promise<void> {
  if (isReporting) return;
  isReporting = true;

  try {
    const deviceId = await getDeviceId();
    console.log(`[ErrorReporter] Sending ${report.level ?? 'error'}:`, report.message);

    await trpcClient.errors.report.mutate({
      deviceId,
      message: report.message.slice(0, 2000),
      stack: report.stack?.slice(0, 5000),
      screen: report.screen?.slice(0, 200),
      context: report.context?.slice(0, 1000),
      level: report.level ?? 'error',
    });

    console.log('[ErrorReporter] Sent successfully');
  } catch (e) {
    console.log('[ErrorReporter] Failed to send:', e);
  } finally {
    isReporting = false;
  }
}

export function setupGlobalErrorHandler() {
  const originalHandler = ErrorUtils.getGlobalHandler();

  ErrorUtils.setGlobalHandler((error, isFatal) => {
    console.log('[ErrorReporter] Global error caught:', error?.message, 'fatal:', isFatal);

    void reportError({
      message: error?.message ?? 'Unknown error',
      stack: error?.stack,
      level: isFatal ? 'fatal' : 'error',
      context: 'global_handler',
    });

    if (originalHandler) {
      originalHandler(error, isFatal);
    }
  });

  console.log('[ErrorReporter] Global handler installed');
}

export function captureException(error: unknown, screen?: string, context?: string): void {
  const msg = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  void reportError({
    message: msg,
    stack,
    screen,
    context,
    level: 'error',
  });
}
