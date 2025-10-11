// * https://reactrouter.com/api/other-api/adapter#react-routerexpress
import 'react-router';

import { createRequestHandler } from '@react-router/express';
import express from 'express';
import helmet from 'helmet';
import _ from 'lodash';
import { nanoid } from 'nanoid';
import { analyticsServer } from '@/front/lib/analytics/analytics.server';
import {
	isPreRenderPath,
	STATIC_PRE_RENDER_PATHS_MAP_NONCE,
} from '@/shared/lib/constants';
import { getUnifiedCSPConfig } from '@/shared/lib/csp';
import { serverLogger } from '@/shared/lib/logger/logger.server';
import { LogLevelEnum } from '@/shared/lib/logger/logger.utils';

declare global {
	namespace Express {
		export interface Request {
			___NONCE___?: string;
		}
	}
}

const isDevelopment = import.meta.env.DEV;

if (isDevelopment) {
	serverLogger.logLevel = LogLevelEnum.DEBUG;
} else {
	serverLogger.logLevel = LogLevelEnum.WARN;
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
	build: () => {
		return import('virtual:react-router/server-build');
	},
	getLoadContext: (req, _res) => {
		const nonce = _.get(req, '___NONCE___');

		if (!nonce) {
			throw new Error('Nonce has not been set');
		}

		return {
			logger: serverLogger,
			analytics: analyticsServer,
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
