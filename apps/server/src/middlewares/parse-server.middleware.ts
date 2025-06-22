import _ from 'lodash';

import type express from 'express';

import {
	PARSE_INSTALLATION_ID_HEADER_KEY,
	PARSE_SESSION_TOKEN_HEADER_KEY,
} from '@/shared/lib/constants';
import { makePath } from '@/shared/utils/string.utils';

import { logger } from '@org/shared/lib/winston.server';
import { HttpException } from '../exceptions/HttpException';
import {
	CONFIG_ENABLE_CHECK_SESSION_IP,
	PARSE_SERVER_URL,
	USE_MASTER_KEY,
} from '../lib/constants';
import { env } from '../lib/env';
import {
	expressHandler,
	getHeader,
	getRequestIp,
	getRequestUtils,
} from '../lib/express';
import { getCurrentInstallationId } from '../lib/parse/parse.utils';

const checkIsMaster = (req: express.Request) => {
	return (
		_.get(req, 'body._MasterKey') === env.PARSE_MASTER_KEY ||
		getHeader(req, 'X-Parse-Master-Key') === env.PARSE_MASTER_KEY
	);
};

const disableRestApiForClients = async (
	req: express.Request,
	_res: express.Response,
) => {
	const _allowedPaths = [
		'/health',
		'/functions',
		'/verificationEmailRequest',
	] satisfies `/${string}`[];

	const authorizedPaths: string[] = [..._allowedPaths];
	_.forEach(_allowedPaths, (path) => {
		authorizedPaths.push(makePath(PARSE_SERVER_URL.pathname, path));
	});

	const isAllowedPath = authorizedPaths.some((path) => {
		return req.path.startsWith(path);
	});

	if (isAllowedPath) {
		return;
	}

	const installationId =
		getHeader(req, PARSE_INSTALLATION_ID_HEADER_KEY) ||
		_.get(req, 'body._InstallationId');
	const cloudInstallationId = await getCurrentInstallationId();

	if (installationId === cloudInstallationId) {
		return;
	}

	const { t } = getRequestUtils(req);

	throw new HttpException(401, t('unauthorized'));
};

const handleMatchSessionIp = async (
	req: express.Request,
	_res: express.Response,
) => {
	if (!CONFIG_ENABLE_CHECK_SESSION_IP) {
		return;
	}

	const _allowedPaths = ['/health'] satisfies `/${string}`[];

	const allowedPaths: string[] = [..._allowedPaths];
	_.forEach(_allowedPaths, (path) => {
		allowedPaths.push(makePath(PARSE_SERVER_URL.pathname, path));
	});

	const isAllowedPath = allowedPaths.some((path) => {
		return req.path.startsWith(path);
	});

	if (isAllowedPath) {
		return;
	}

	const installationId =
		getHeader(req, PARSE_INSTALLATION_ID_HEADER_KEY) ||
		_.get(req, 'body._InstallationId');
	const sessionToken =
		getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY) ||
		_.get(req, 'body._SessionToken');

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

	const { t } = getRequestUtils(req);

	if (!session) {
		logger.warn('Session token not found', { sessionToken });
		throw new HttpException(401, t('Invalid session token'));
	}

	const requestIp = getRequestIp(req);

	const sessionIp = session.get('ipAddress');

	// * no check to do if there is no ip address in the session
	// * we assume all ip are allowed for it
	if (!sessionIp) {
		return;
	}

	if (sessionIp !== requestIp) {
		logger.warn('Ip address does not match', {
			sessionToken,
			requestIp,
			sessionIp,
		});
		throw new HttpException(401, t('Invalid session token'));
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
