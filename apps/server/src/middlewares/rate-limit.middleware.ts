import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { getHeader } from '../lib/express';
import { PARSE_SESSION_TOKEN_HEADER_KEY } from '@/shared/lib/constants';
import duration from '@/shared/utils/duration.utils';

const getRateLimitKey = (req: Request) => {
	// Retrieve the session token: 'x-parse-session-token' is used for Postman,
	// '_SessionToken' is used for the application
	const sessionToken =
		getHeader(req, PARSE_SESSION_TOKEN_HEADER_KEY) || req.body._SessionToken;

	// use the IP address if no session token is provided
	if (!sessionToken) {
		return req.ip;
	}

	return sessionToken;
};

// ---------------------------------------------- //
// ----------- rate limit config ---------------- //
// ---------------------------------------------- //
const rateLimitConfig = [
	{
		// allow 200 requests max in 1 minute
		path: /(.*)/,
		middleware: rateLimit({
			windowMs: duration.toMilliseconds('1m'),
			max: 200,
			message: 'Too many requests, please try again later',
			keyGenerator: getRateLimitKey,
		}),
	},
];

// -------------------------------------------- //
// ----------- rate limit function ------------ //
// -------------------------------------------- //
const shouldApplyRateLimit = (url: string) => {
	for (const rule of rateLimitConfig) {
		if (url.match(rule.path)) {
			return rule;
		}
	}

	return null;
};

export const rateLimiterMiddleware = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	const rule = shouldApplyRateLimit(req.url);

	if (rule) {
		const middleware = rule.middleware;
		middleware(req, res, next);
	} else {
		next();
	}
};
