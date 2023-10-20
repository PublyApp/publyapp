import { logger } from 'parse-server';

import type { RequestHandler } from 'express';

import { AuthCloudService } from '@server/cloud/services/auth.cloud.service';
import { HttpException } from '@server/exceptions/HttpException';

type Input = {
	withKey?: boolean;
	withAuth?: boolean;
};

const protectionMiddleware = ({ withKey = true, withAuth = true }: Input): RequestHandler => {
	return async (req, res, next) => {
		try {
			// should have a header key
			if (withKey) {
				const apiKey = req.get('X-Devist-Key');

				// if the key exists, go to next
				if (!apiKey) {
					next(new HttpException(400, 'Missing "X-Devist-Key" params'));
				} else if (apiKey && apiKey !== process.env.REST_API_KEY) {
					next(new HttpException(400, 'Invalid "X-Devist-Key"'));
				}
			}

			// should have a header session token
			if (withAuth) {
				const parseSession = req.get('X-Parse-Session-Token') || req.query.sessionToken;

				if (!parseSession) {
					return next(new HttpException(400, 'Missing session params'));
				}

				const Auth = new AuthCloudService(parseSession);

				const user = await Auth.getUserForSessionToken();

				// if user exists, go to next
				if (!user) {
					next(new HttpException(400, 'User not found'));
				}
			}

			return next();
		} catch (e) {
			logger.error(`[middlewares/protectionMiddleware] error: ${e /* .message */}`);
			return res.status(400).json({ error: 400, message: 'Bad request' });
		}
	};
};

export default protectionMiddleware;
