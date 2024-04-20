import type { RequestHandler } from 'express';

import { HttpException } from '@/server/exceptions/HttpException';
import { env } from '@/server/lib/env';
import { AuthCloudService } from '@/server/resources/auth/auth.cloud.service';
import {
	DEVIST_REST_API_HEADER_KEY,
	PARSE_INSTALLATION_ID_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
} from '@/shared/lib/constants';

import { expressHandler } from '../lib/express';
import { getHeader } from '../utils/request.utils';

type Input = {
	withKey?: boolean;
	withAuth?: boolean;
	withInstallation?: boolean;
};

const protectionMiddleware = ({ withKey = true, withAuth = true, withInstallation = false }: Input): RequestHandler => {
	return expressHandler(async (req, _res, next) => {
		// should have a header key
		if (withKey) {
			const apiKey = getHeader(req, DEVIST_REST_API_HEADER_KEY);

			// if the key exists, go to next
			if (!apiKey) {
				return next(new HttpException(400, `Missing ${DEVIST_REST_API_HEADER_KEY} param`));
			}

			if (apiKey && apiKey !== env.REST_API_KEY) {
				return next(new HttpException(400, `Invalid ${DEVIST_REST_API_HEADER_KEY} param`));
			}
		}

		// should have a header session token
		if (withAuth) {
			const sessionToken = getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY);

			if (!sessionToken) {
				return next(new HttpException(400, `Missing ${PARSE_SESSION_TOKEN_HEADER_KEY} param`));
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
				return next(new HttpException(400, `Missing ${PARSE_INSTALLATION_ID_HEADER_KEY} param`));
			}

			req.installationId = installationId;
		}

		return next();
	});
};

export default protectionMiddleware;
