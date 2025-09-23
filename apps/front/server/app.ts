import 'react-router'; // * https://reactrouter.com/api/other-api/adapter#react-routerexpress

import { createRequestHandler } from '@react-router/express';
import express from 'express';
import helmet from 'helmet';
import _ from 'lodash';
import { nanoid } from 'nanoid';
import {
	isPreRenderPath,
	STATIC_PRE_RENDER_PATHS_MAP_NONCE,
} from '@/shared/lib/constants';
import { getUnifiedCSPConfig } from '@/shared/lib/csp';
import { SilentPostHog } from '@/shared/lib/posthog/silent-posthog';
import { logger } from '@/shared/lib/winston.server';

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
			const nonce = _.get(req, '___NONCE___') as unknown as string;

			if (isDevelopment) {
				return {
					logger,
					postHogServer: silentPostHog,
					nonce,
				};
			}

			return {
				logger,
				postHogServer: silentPostHog, // TODO: use the real posthog client in production
				nonce,
			};
		},
	}),
);
