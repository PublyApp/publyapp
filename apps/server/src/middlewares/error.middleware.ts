import type { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { HttpException } from '@/server/exceptions/HttpException';

import logger from '../lib/logger';
import { getRequestUtils } from '../utils/request.utils';

const errorMiddleware = (error: unknown, req: Request, res: Response, next: NextFunction) => {
	try {
		const { t } = getRequestUtils(req);
		let status = 500;
		let message: string = t('unknown-error');
		let parseErrorCode: typeof Parse.Error.prototype.code | undefined;

		if (_.isString(error)) {
			message = error;
		}

		if (error instanceof HttpException) {
			status = error.status;
		}

		if (error instanceof Parse.Error) {
			parseErrorCode = error.code;
			status = 400;
		}

		if (error instanceof Error) {
			message = error.message;
		}

		logger.error(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message:: ${message}`);
		res.status(status).json({ message, code: parseErrorCode });
	} catch (_error) {
		next(_error);
	}
};

export default errorMiddleware;
