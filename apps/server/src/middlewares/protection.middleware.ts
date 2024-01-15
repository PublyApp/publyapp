import { logger } from 'parse-server';

import type { RequestHandler } from 'express';

import { AuthCloudService } from '@/server/cloud/services/auth.cloud.service';
import { HttpException } from '@/server/exceptions/HttpException';
import { env } from '@/server/lib/env';
import {
	DEVIST_REST_API_HEADER_KEY,
	PARSE_INSTALLATION_ID_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
} from '@/shared/lib/constants';

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
				const apiKey = req.get(DEVIST_REST_API_HEADER_KEY);

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
				const sessionToken = req.get(PARSE_SESSION_TOKEN_HEADER_KEY) || req.query.sessionToken;

				if (!sessionToken) {
					return next(new HttpException(400, 'Missing session params'));
				}

				const authService = AuthCloudService.createAuthCloudService({ sessionToken });

				const user = authService.getUserForSessionToken();

				// if user exists, go to next
				if (!(await user)) {
					return next(new HttpException(400, 'User not found'));
				}

				req.user = await user;
			}

			if (withInstallation) {
				const installationId = req.get(PARSE_INSTALLATION_ID_HEADER_KEY);

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
