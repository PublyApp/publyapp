import type express from 'express';
import _ from 'lodash';

import { PARSE_INSTALLATION_ID_HEADER_KEY, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import { PARSE_SERVER_URL, USE_MASTER_KEY } from '../lib/constants';
import { env } from '../lib/env';
import { expressHandler } from '../lib/express';
import { getCurrentInstallationId } from '../lib/parse/parse.utils';
import { getHeader, getRequestIp } from '../utils/request.utils';

const checkIsMaster = (req: express.Request) => {
	return req.body._MasterKey === env.PARSE_MASTER_KEY || getHeader(req, 'X-Parse-Master-Key') === env.PARSE_MASTER_KEY;
};

const disableRestApiForClients = async (req: express.Request, _res: express.Response) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _authorizedPaths = ['/health', '/functions'] satisfies `/${string}`[];

	const authorizedPaths: string[] = [..._authorizedPaths];
	_authorizedPaths.forEach((path) => {
		authorizedPaths.push(makePath(PARSE_SERVER_URL.pathname, path));
	});

	const isAuthorizedPath = authorizedPaths.some((path) => {
		return req.path.startsWith(path);
	});

	if (isAuthorizedPath) {
		return;
	}

	const installationId = getHeader(req, PARSE_INSTALLATION_ID_HEADER_KEY) || req.body._InstallationId;
	const cloudInstallationId = await getCurrentInstallationId();

	if (installationId === cloudInstallationId) {
		return;
	}

	throw new Error('unauthorized');
};

const handleMatchSessionIp = async (req: express.Request, _res: express.Response) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _sessionPaths = ['/classes/_Session', '/sessions'] satisfies `/${string}`[];

	const sessionPaths: string[] = [..._sessionPaths];
	_sessionPaths.forEach((path) => {
		sessionPaths.push(makePath(PARSE_SERVER_URL.pathname, path));
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

	// logger.info(req.path);
	// logger.info(installationId);
	// logger.info(cloudInstallationId);

	// * when directAccess equals to false (see ParseServer options),
	// * we need to differentiate between cloud code calls to the API and client calls
	if (installationId === cloudInstallationId) {
		return;
	}

	const session = await new Parse.Query(Parse.Session)
		.equalTo('sessionToken', sessionToken)
		.select(['ipAddress'])
		// .first({ sessionToken }); // ! do not use sessionToken here because:
		// ! imagine if we have many instances of our application behind a load balancer
		// ! it will cause an infinite loop !!!!
		// ! directly use the master key instead
		.first(USE_MASTER_KEY);

	if (session) {
		const requestIp = getRequestIp(req);

		if (session.get('ipAddress') !== requestIp) {
			throw new Error('Invalid session token');
		}
	}
};

const parseServerMiddleware = expressHandler(async (req, res, next) => {
	const isMaster = checkIsMaster(req);

	if (!isMaster) {
		await disableRestApiForClients(req, res);
		await handleMatchSessionIp(req, res);
	}

	return next();
});

export default parseServerMiddleware;
