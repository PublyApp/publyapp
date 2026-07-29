import { createContext } from 'react-router';

import type { IAnalytics } from '@org/shared-ts/lib/analytics/analytics.types';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import type { ILogger } from '@org/shared-ts/lib/logger/logger.types';

import { analytics } from '../analytics/analytics';

export const loggerContext = createContext<ILogger>(logger);
export const analyticsContext = createContext<IAnalytics>(analytics);
export const nonceContext = createContext<string | undefined>(undefined);
