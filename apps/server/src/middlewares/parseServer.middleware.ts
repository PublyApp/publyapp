import type express from 'express';
import { type Request, type RequestHandler } from 'express';
import _ from 'lodash';

import { PARSE_INSTALLATION_ID_HEADER_KEY, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

import { env } from '../lib/env';
import logger from '../lib/logger';
import { getCurrentInstallationId } from '../lib/parse/utils';
import { getHeader } from '../utils/request.utils';

const isMaster = (req: Request) => {
	return req.body._MasterKey === env.PARSE_MASTER_KEY || getHeader(req, 'X-Parse-Master-Key') === env.PARSE_MASTER_KEY;
};

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

	if (!isSessionPath) {
		return;
	}

	const installationId = getHeader(req, PARSE_INSTALLATION_ID_HEADER_KEY) || req.body._InstallationId;
	const sessionToken = getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY) || req.body._SessionToken;

	const cloudInstallationId = await getCurrentInstallationId();

	// console.log(req.path);
	// console.log(installationId);
	// console.log(cloudInstallationId);

	// * when directAccess equals to false (see ParseServer options), we need to differentiate between cloud code calls to the API and client calls
	if (installationId === cloudInstallationId) {
		return;
	}

	const session = await new Parse.Query(Parse.Session)
		.equalTo('sessionToken', sessionToken)
		.select(['ipAddress'])
		.first({ sessionToken });

	if (session) {
		const requestIp = req.ip || getHeader(req, 'x-forwarded-for');

		if (session.get('ipAddress') !== requestIp) {
			throw new Error('Invalid session token');
		}
	}
};

const parseServerMiddleware: RequestHandler = async (req, res, next) => {
	try {
		// eslint-disable-next-line @typescript-eslint/naming-convention
		const _isMaster = isMaster(req);

		if (!_isMaster) {
			await handleMatchSessionIp(req, res);
		}

		return next();
	} catch (error) {
		logger.error(error);
		// eslint-disable-next-line no-console
		console.trace(error);

		let message = 'Unknown error';

		if (error instanceof Error) {
			message = error.message;
		}

		return res.status(401).json({ message });
	}
};

export default parseServerMiddleware;
