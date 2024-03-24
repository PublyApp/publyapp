import type { RequestHandler } from 'express';

import { HttpException } from '@/server/exceptions/HttpException';
import { env } from '@/server/lib/env';
import { AuthCloudService } from '@/server/resources/auth/auth.cloud.service';
import {
	DEVIST_REST_API_HEADER_KEY,
	PARSE_INSTALLATION_ID_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
} from '@/shared/lib/constants';

import logger from '../lib/logger';
import { getHeader } from '../utils/request.utils';

type Input = {
	withKey?: boolean;
	withAuth?: boolean;
	withInstallation?: boolean;
};

const protectionMiddleware = ({ withKey = true, withAuth = true, withInstallation = false }: Input): RequestHandler => {
	return async (req, res, next) => {
		try {
			// should have a header key
			if (withKey) {
				const apiKey = getHeader(req, DEVIST_REST_API_HEADER_KEY);

				// if the key exists, go to next
				if (!apiKey) {
					return next(new HttpException(400, `Missing ${DEVIST_REST_API_HEADER_KEY} params`));
				}

				if (apiKey && apiKey !== env.REST_API_KEY) {
					return next(new HttpException(400, `Invalid ${DEVIST_REST_API_HEADER_KEY}`));
				}
			}

			// should have a header session token
			if (withAuth) {
				const sessionToken = getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY) || req.query.sessionToken;

				if (!sessionToken) {
					return next(new HttpException(400, 'Missing session params'));
				}

				const authService = await AuthCloudService.createAuthCloudService({ sessionToken });

				const user = authService.getUserForSessionToken();

				// if user exists, go to next
				if (!(await user)) {
					return next(new HttpException(400, 'User not found'));
				}

				req.user = await user;
			}

			if (withInstallation) {
				const installationId = getHeader(req, PARSE_INSTALLATION_ID_HEADER_KEY);

				if (!installationId) {
					return next(new HttpException(400, 'Missing installationId header'));
				}

				req.installationId = installationId;
			}

			return next();
		} catch (e) {
			logger.error(`[middlewares/protectionMiddleware] error: ${e /* .message */}`);
			return res.status(400).json({ error: 400, message: 'Bad request' });
		}
	};
};

export default protectionMiddleware;
