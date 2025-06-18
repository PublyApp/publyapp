import { HttpException } from '@/server/exceptions/HttpException';
import { logger } from '@/server/lib/winston';
import type { ErrorRequestHandler } from 'express';
import _ from 'lodash';
import { serializeError } from 'serialize-error';
import { ZodError } from 'zod';
import { getRequestUtils } from '../lib/express';
import { isCloudHttpException } from '../lib/parse/cloud/core';
import { postHogServer } from '../lib/posthog';

// ! this is the only middleware that we should not wrap into expressHandler wrapper function
export const errorMiddleware: ErrorRequestHandler = async (
	error,
	req,
	res,
	next,
) => {
	try {
		const { t } = getRequestUtils(req);
		let xcode: string | undefined;
		let errorBody: Record<string, unknown> | undefined;
		let httpStatusCode = 500;
		let message: string = t('unknown-error');
		let parseErrorCode: typeof Parse.Error.prototype.code | undefined;

		if (_.isString(error)) {
			message = error;
		}

		if (error instanceof Error) {
			message = error.message;
		}

		if (error instanceof HttpException) {
			httpStatusCode = error.status;
			xcode = error.xcode;
			errorBody = error.body;
		}

		// get zod errors message
		if (error instanceof ZodError) {
			message = error.issues[0].message;
			httpStatusCode = 400;
		}

		if (error instanceof Parse.Error) {
			parseErrorCode = error.code;

			if (isCloudHttpException(error)) {
				httpStatusCode = error.status;
				xcode = error.xcode;
				errorBody = error.body;
			} else {
				// [switch] copied from Parse Server source code
				// TODO: fill out this mapping
				switch (error.code) {
					case Parse.Error.INTERNAL_SERVER_ERROR:
						httpStatusCode = 500;
						break;
					case Parse.Error.OBJECT_NOT_FOUND:
						httpStatusCode = 404;
						break;
					default:
						httpStatusCode = 400;
				}
				// [switch] end of copy
			}
		}

		if (!_.get(req, 'config.headers.___do_not_use_altered_logger_marker___')) {
			let hasMessage: boolean;

			if (!error.message) {
				hasMessage = false;
				message = !String(error.message) ? message : String(error.message);
			} else {
				hasMessage = true;
				message = error.message;
			}

			message = t(message as never);
			logger.error(
				`[${req.method}] ${req.path} >> StatusCode:: ${httpStatusCode}, Message:: ${hasMessage ? '' : message}`,
				error,
			);
		}

		// capture only critical errors
		if (httpStatusCode >= 500) {
			postHogServer.captureException(error, req.user?.id, {
				ip: req.ip,
				path: req.path,
				method: req.method,
			});
		}

		message = String(t(message as never));
		res
			.status(httpStatusCode)
			.json({ error: message, code: parseErrorCode, xcode, data: errorBody }); // conform to Parse Server error response
	} catch (_error) {
		// capture only critical errors
		postHogServer.captureException(error, req.user?.id, {
			ip: req.ip,
			path: req.path,
			method: req.method,
			error_1: serializeError(error),
		});

		next(_error);
	}
};
