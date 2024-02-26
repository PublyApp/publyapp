import type express from 'express';
import { type RequestHandler } from 'express';
import _ from 'lodash';

import { PARSE_INSTALLATION_ID_HEADER_KEY, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

import { env } from '../lib/env';
import logger from '../lib/logger';
import { getCurrentInstallationId } from '../lib/parse';

const parseServerMiddleware: RequestHandler = async (req, res, next) => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-use-before-define
		await handleMatchSessionIp(req, res);

		return next();
	} catch (error) {
		logger.error(error);
		// eslint-disable-next-line no-console
		console.trace(error);

		return res.status(401).json({ message: (error as any).message });
	}
};

export default parseServerMiddleware;

const handleMatchSessionIp = async (req: express.Request, _res: express.Response) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _sessionPaths = ['/classes/_Session', '/sessions'];

	const sessionPaths = [..._sessionPaths];
	_sessionPaths.forEach((path) => {
		sessionPaths.push(env.PARSE_PATH + path);
	});

	const isSessionPath = sessionPaths.some((path) => {
		return req.path.startsWith(path);
	});

	if (isSessionPath) {
		const installationId = req.get(_.toLower(PARSE_INSTALLATION_ID_HEADER_KEY)) || req.body._InstallationId;
		const sessionToken = req.get(_.toLower(PARSE_SESSION_TOKEN_HEADER_KEY)) || req.body._SessionToken;

		const cloudInstallationId = await getCurrentInstallationId();

		// console.log(req.path);
		// console.log(installationId);
		// console.log(cloudInstallationId);

		// * if directAccess equals to false (see ParseServer options), we need to differentiate between cloud code calls to the API and client calls
		if (installationId !== cloudInstallationId) {
			const session = await new Parse.Query(Parse.Session)
				.equalTo('sessionToken', sessionToken)
				.select(['ipAddress'])
				.first({ sessionToken });

			if (session) {
				if (session.get('ipAddress') !== req.ip) {
					throw new Error('Invalid session token');
				}
			}
		}
	}
};
