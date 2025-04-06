import _ from 'lodash';

import type express from 'express';

import { PARSE_INSTALLATION_ID_HEADER_KEY, PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import { HttpException } from '../exceptions/HttpException';
import { PARSE_SERVER_URL, USE_MASTER_KEY } from '../lib/constants';
import { env } from '../lib/env';
import { expressHandler, getHeader, getRequestIp } from '../lib/express';
import { getCurrentInstallationId } from '../lib/parse/parse.utils';
import { logger } from '../lib/winston';

const checkIsMaster = (req: express.Request) => {
	return (
		_.get(req, 'body._MasterKey') === env.PARSE_MASTER_KEY ||
		getHeader(req, 'X-Parse-Master-Key') === env.PARSE_MASTER_KEY
	);
};

const disableRestApiForClients = async (req: express.Request, _res: express.Response) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _allowedPaths = ['/health', '/functions'] satisfies `/${string}`[];

	const authorizedPaths: string[] = [..._allowedPaths];
	_allowedPaths.forEach((path) => {
		authorizedPaths.push(makePath(PARSE_SERVER_URL.pathname, path));
	});

	const isAllowedPath = authorizedPaths.some((path) => {
		return req.path.startsWith(path);
	});

	if (isAllowedPath) {
		return;
	}

	const installationId = getHeader(req, PARSE_INSTALLATION_ID_HEADER_KEY) || _.get(req, 'body._InstallationId');
	const cloudInstallationId = await getCurrentInstallationId();

	if (installationId === cloudInstallationId) {
		return;
	}

	throw new HttpException(401, 'unauthorized');
};

const handleMatchSessionIp = async (req: express.Request, _res: express.Response) => {
	// eslint-disable-next-line @typescript-eslint/naming-convention
	const _allowedPaths = ['/health'] satisfies `/${string}`[];

	const allowedPaths: string[] = [..._allowedPaths];
	_allowedPaths.forEach((path) => {
		allowedPaths.push(makePath(PARSE_SERVER_URL.pathname, path));
	});

	const isAllowedPath = allowedPaths.some((path) => {
		return req.path.startsWith(path);
	});

	if (isAllowedPath) {
		return;
	}

	const installationId = getHeader(req, PARSE_INSTALLATION_ID_HEADER_KEY) || _.get(req, 'body._InstallationId');
	const sessionToken = getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY) || _.get(req, 'body._SessionToken');

	const cloudInstallationId = await getCurrentInstallationId();

	// * when directAccess equals to false (see ParseServer options),
	// * we need to differentiate between cloud code calls to the API and client calls
	if (installationId === cloudInstallationId) {
		return;
	}

	// * no check to do if there is no session token
	if (!sessionToken) {
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

	if (!session) {
		logger.warn('Session token not found', { sessionToken });
		throw new HttpException(401, 'Invalid session token');
	}

	const requestIp = getRequestIp(req);

	const sessionIp = session.get('ipAddress');

	// * no check to do if there is no ip address in the session
	// * we assume all ip are allowed for it
	if (!sessionIp) {
		return;
	}

	if (sessionIp !== requestIp) {
		logger.warn('Ip address does not match', { sessionToken, requestIp, sessionIp });
		throw new HttpException(401, 'Invalid session token');
	}
};

const parseServerMiddleware = expressHandler(async (req, res, next) => {
	const isMaster = checkIsMaster(req);

	if (isMaster) {
		return next();
	}

	await disableRestApiForClients(req, res);
	await handleMatchSessionIp(req, res);

	return next();
});

export default parseServerMiddleware;
