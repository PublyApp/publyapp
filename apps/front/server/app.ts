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

if (isDevelopment) {
	logger.logLevel = LogLevelEnum.DEBUG;
} else {
	logger.logLevel = LogLevelEnum.WARN;
}

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

const reactRouterHandler = createRequestHandler({
	build: async () => {
		return import('virtual:react-router/server-build');
	},
	getLoadContext: (req, _res) => {
		const nonce = _.get(req, '___NONCE___');

		if (!nonce) {
			throw new Error('Nonce has not been set');
		}

		return {
			logger: logger,
			analytics: analytics,
			nonce,
		};
	},
});

// Handle Chrome DevTools workspace mapping request
app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => {
	res.status(404).json({
		error: 'Chrome DevTools workspace mapping not configured',
	});
});

app.use(reactRouterHandler);
