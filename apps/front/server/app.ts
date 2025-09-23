// * https://reactrouter.com/api/other-api/adapter#react-routerexpress
import 'react-router';
import { createRequestHandler } from '@react-router/express';
import express from 'express';
import helmet from 'helmet';
import _ from 'lodash';
import { nanoid } from 'nanoid';
import {
	isPreRenderPath,
	STATIC_PRE_RENDER_PATHS_MAP_NONCE,
} from '@org/shared-ts/lib/constants';
import { getUnifiedCSPConfig } from '@org/shared-ts/lib/csp';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { LogLevelEnum } from '@org/shared-ts/lib/logger/logger.utils';

import { analytics } from '#app/lib/analytics/analytics.ts';

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

const silentPostHog = new SilentPostHog();

app.use(
	createRequestHandler({
		build: () => {
			return import('virtual:react-router/server-build');
		},
		getLoadContext: (req, _res) => {
			const ___NONCE___ = _.get(req, '___NONCE___');

			if (isDevelopment) {
				return {
					logger,
					postHogServer: silentPostHog,
					___NONCE___,
				};
			}

			return {
				logger,
				postHogServer: silentPostHog, // TODO: use the real posthog client in production
				___NONCE___,
			};
		},
	}),
);
