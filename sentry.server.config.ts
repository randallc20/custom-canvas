import * as Sentry from '@sentry/nextjs';
import { sentryEnvironment } from '@/lib/sentryEnvironment';


Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 1.0,
  environment: sentryEnvironment(),
  enabled: process.env.NODE_ENV === 'production',
});
