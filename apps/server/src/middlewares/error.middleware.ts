import type { ErrorRequestHandler } from 'express';
import _ from 'lodash';
import { ZodError } from 'zod';

import { HttpException } from '@/server/exceptions/HttpException';

import logger from '../lib/logger';
import { getRequestUtils } from '../utils/request.utils';

// ! this is only middleware that we should not wrap into expressHandler wrapper function
const errorMiddleware: ErrorRequestHandler = async (error, req, res, next) => {
	try {
		const { t } = getRequestUtils(req);
		let status = /* res.statusCode || */ 500;
		let message: string = t('unknown-error');
		let parseErrorCode: typeof Parse.Error.prototype.code | undefined;

		if (_.isString(error)) {
			message = error;
		}

		if (error instanceof Error) {
			message = error.message;
		}

		if (error instanceof HttpException) {
			status = error.status;
		}

		// get zod errors message
		if (error instanceof ZodError) {
			message = error.issues[0].message;
			status = /* res.statusCode || */ 400;
		}

		if (error instanceof Parse.Error) {
			parseErrorCode = error.code;

			if (parseErrorCode === Parse.Error.INVALID_SESSION_TOKEN) {
				// TODO: invalidate session token cache (we are gonna implement a custom permission system: to limit requests to the server we need a cache)
			}
			// status = /* res.statusCode || */ 400;
		}

		logger.error(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message:: ${message}`, error);
		res.status(status).json({ message, code: parseErrorCode });
	} catch (_error) {
		next(_error);
	}
};

export default errorMiddleware;
