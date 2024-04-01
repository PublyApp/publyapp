import type { NextFunction, Request, Response } from 'express';
import _ from 'lodash';

import { HttpException } from '@/server/exceptions/HttpException';

import logger from '../lib/logger';
import { getRequestUtils } from '../utils/request.utils';

const errorMiddleware = (error: unknown, req: Request, res: Response, next: NextFunction) => {
	try {
		const { t } = getRequestUtils(req);
		let status = 500;
		let message = t('Something went wrong');

		if (_.isString(error)) {
			message = error;
		}

		if (error instanceof Error) {
			if (error instanceof HttpException) {
				status = error.status;
			}

			message = error.message;
		}

		logger.error(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message:: ${message}`);
		res.status(status).json({ message });
		// eslint-disable-next-line @typescript-eslint/no-shadow
	} catch (error) {
		next(error);
	}
};

export default errorMiddleware;
