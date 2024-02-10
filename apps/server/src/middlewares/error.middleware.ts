import type { NextFunction, Request, Response } from 'express';

import type { HttpException } from '@/server/exceptions/HttpException';

import logger from '../lib/logger';

const errorMiddleware = (error: HttpException, req: Request, res: Response, next: NextFunction) => {
	try {
		const status: number = error.status || 500;
		const message: string = error.message || 'Something went wrong';

		logger.error(`[${req.method}] ${req.path} >> StatusCode:: ${status}, Message:: ${message}`);
		res.status(status).json({ message });
		// eslint-disable-next-line @typescript-eslint/no-shadow
	} catch (error) {
		next(error);
	}
};

export default errorMiddleware;
