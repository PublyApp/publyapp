import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import type { AnalyticsProperties } from '@org/shared-ts/lib/analytics/analytics.types';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { isProductionRuntime } from '../env';
import { getAnalytics } from './analytics-instance';

type AddressHeader =
	| 'cf-connecting-ip'
	| 'x-forwarded-for'
	| 'x-real-ip'
	| 'x-client-ip';

type BadResponseCaptureArgs = {
	request: Request;
	status: number;
	path: string;
	method: string;
	locale?: string;
};

const sanitizeIpHeaderValue = (value: string): string => {
	const firstValue = value.split(',')[0]?.trim() ?? '';
	if (!firstValue || !isIP(firstValue)) {
		return 'anonymous';
	}

	return firstValue;
};

const extractIpAddressFromHeader = (value: string): string => {
	const candidate = sanitizeIpHeaderValue(value);
	if (candidate === 'anonymous') {
		return candidate;
	}

	return createHash('sha256').update(candidate).digest('hex').slice(0, 16);
};

const getRequestAddress = (request: Request): string => {
	const headerCandidates: AddressHeader[] = [
		'cf-connecting-ip',
		'x-forwarded-for',
		'x-real-ip',
		'x-client-ip',
	];

	for (const headerKey of headerCandidates) {
		const headerValue = request.headers.get(headerKey);
		if (headerValue) {
			const extracted = extractIpAddressFromHeader(headerValue);

			if (extracted !== 'anonymous') {
				return extracted;
			}
		}
	}

	return 'anonymous';
};

const buildBadResponseProperties = ({
	path,
	method,
	status,
	locale,
}: BadResponseCaptureArgs): AnalyticsProperties => {
	const properties: AnalyticsProperties = { path, method, status };
	// PostHog properties are JSON, which has no `undefined`: an absent locale is
	// omitted rather than carried as a value JSON serialisation would drop.
	if (locale !== undefined) {
		properties.locale = locale;
	}
	return properties;
};

export type BadResponseDisposition = 'debug' | 'drop' | 'error';

export const classifyBadResponse = (status: number): BadResponseDisposition => {
	if (status === 404 || status < 400) {
		return 'drop';
	}

	if (status >= 500) {
		return 'error';
	}
	return 'debug';
};

export const captureBadRequest = async (
	input: BadResponseCaptureArgs,
): Promise<void> => {
	const disposition = classifyBadResponse(input.status);
	if (disposition === 'drop') {
		return;
	}

	if (!isProductionRuntime()) {
		return;
	}

	const client = getAnalytics();

	const properties = buildBadResponseProperties({
		...input,
	});

	const distinctId = getRequestAddress(input.request);
	if (distinctId === 'anonymous' && isProductionRuntime()) {
		logger.debug('bad-request analytics has no client IP for hashing');
	}

	const sent = await client.send({
		type: 'capture',
		distinctId: distinctId || randomUUID(),
		event: 'bad_request',
		properties,
	});

	// The service already logged the failure; never log a success line after it.
	if (!sent) {
		return;
	}

	const logContext = { path: input.path, status: input.status };
	if (disposition === 'error') {
		logger.error('bad-request analytics captured', logContext);
		return;
	}

	logger.debug('bad-request analytics captured', logContext);
};
