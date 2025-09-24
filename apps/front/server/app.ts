// * https://reactrouter.com/api/other-api/adapter#react-routerexpress
import 'react-router';

import { createRequestHandler } from '@react-router/express';
import express from 'express';
import helmet from 'helmet';
import _ from 'lodash';
import { nanoid } from 'nanoid';
import { env } from '@/front/lib/env';
import { AnalyticsNode } from '@/shared/lib/analytics/analytics.server';
import type { IAnalytics } from '@/shared/lib/analytics/analytics.types';
import { AnalyticsLocal } from '@/shared/lib/analytics/analytics-local';
import {
	isPreRenderPath,
	STATIC_PRE_RENDER_PATHS_MAP_NONCE,
} from '@/shared/lib/constants';
import { getUnifiedCSPConfig } from '@/shared/lib/csp';
import { logger } from '@/shared/lib/winston.server';

declare global {
	namespace Express {
		export interface Request {
			___NONCE___?: string;
		}
	}
}

const isDevelopment = import.meta.env.DEV;

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('case sensitive routing', true);

app.use((req, res, next) => {
	const nonce = isPreRenderPath(req.path)
		? STATIC_PRE_RENDER_PATHS_MAP_NONCE
		: nanoid();

	_.set(req, '___NONCE___', nonce);

	return helmet({
		contentSecurityPolicy: getUnifiedCSPConfig({
			isDevelopment,
			reportOnly: false,
			nonce,
		}).helmetConfig,
	})(req, res, next);
});

let posthog: IAnalytics = new AnalyticsLocal();

if (!isDevelopment) {
	posthog = new AnalyticsNode(env.VITE_POSTHOG_API_KEY);
}

app.use(
	createRequestHandler({
		build: () => {
			return import('virtual:react-router/server-build');
		},
		getLoadContext: (req, _res) => {
			const nonce = _.get(req, '___NONCE___');

			if (!nonce) {
				throw new Error('Nonce has not been set');
			}

			console.log('nonce', nonce);

			if (isDevelopment) {
				return {
					logger,
					analytics: posthog,
					nonce,
				};
			}

			return {
				logger,
				analytics: posthog,
				nonce,
			};
		},
	}),
);
