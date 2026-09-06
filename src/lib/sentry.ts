import * as Sentry from '@sentry/nextjs';
import { sentryEnvironment } from './sentryEnvironment';


export function initSentry() {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
    environment: sentryEnvironment(),
    enabled: process.env.NODE_ENV === 'production',
  });
}

export function captureException(error: unknown, context?: Record<string, unknown>) {
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info') {
  Sentry.captureMessage(message, level);
}
