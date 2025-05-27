import {
	PARSE_APPLICATION_ID_HEADER_KEY,
	PARSE_CONTEXT_HEADER_KEY,
} from '@/shared/lib/constants';
import { expressHandler, getHeader, getRequestUtils } from '../lib/express';
import _ from 'lodash';
import { HttpException } from '../exceptions/HttpException';

/**
 * Check the headers to match Parse Server requirements
 * use this when mocking a Parse Server endpoint
 * for example, when creating a custom handler for a Parse Server endpoint
 * i.e. under parse base url like : /functions/hello, etc
 */
export const checkParseHeaders = expressHandler(async (req, _res, next) => {
	const { t } = getRequestUtils(req);

	// check appId
	const appId =
		getHeader(req, PARSE_APPLICATION_ID_HEADER_KEY) ||
		_.get(req, 'body._ApplicationId');
	if (!appId) {
		throw new HttpException(401, t('unauthorized'));
	}

	let contextHeader = getHeader(req, PARSE_CONTEXT_HEADER_KEY);

	if (!_.isNil(contextHeader)) {
		try {
			contextHeader = JSON.parse(contextHeader);
		} catch (e) {
			throw new HttpException(400, t('Invalid object for context.'));
		}
		if (!_.isObject(contextHeader)) {
			throw new HttpException(400, t('Invalid object for context.'));
		}
	}

	// check context, context is optional but if it is present, it must be an object
	const contextBody = _.get(req, 'body._context');

	if (!_.isNil(contextBody) && !_.isObject(contextBody)) {
		throw new HttpException(400, t('Invalid object for context.'));
	}

	next();
});
