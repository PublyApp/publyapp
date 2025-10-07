import { AnalyticsNode } from '@/shared/lib/analytics/analytics.server';
import { AnalyticsLocal } from '@/shared/lib/analytics/analytics-local';
import { env } from '../env';

const isDevelopment = import.meta.env.DEV;

export const analyticsServer = isDevelopment
	? new AnalyticsLocal()
	: new AnalyticsNode(env.VITE_POSTHOG_API_KEY);
