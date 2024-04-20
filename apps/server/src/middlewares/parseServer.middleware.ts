import type express from 'express';
import { type RequestHandler } from 'express';
import _ from 'lodash';

import { PARSE_INSTALLATION_ID_HEADER_KEY, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';

import { env } from '../lib/env';
import { getCurrentInstallationId } from '../lib/parse/utils';
import { getHeader, getRequestIp } from '../utils/request.utils';

const checkIsMaster = (req: express.Request) => {
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
		const requestIp = getRequestIp(req);

		if (session.get('ipAddress') !== requestIp) {
			throw new Error('Invalid session token');
		}
	}
};

const parseServerMiddleware: RequestHandler = async (req, res, next) => {
	try {
		const isMaster = checkIsMaster(req);

		if (!isMaster) {
			await handleMatchSessionIp(req, res);
		}

		return next();
	} catch (_error) {
		return next(_error);
	}
};

export default parseServerMiddleware;
