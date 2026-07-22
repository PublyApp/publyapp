import { createHash, randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

import { IsoAnalytics } from '@org/shared-ts/lib/analytics/iso-analytics';
import { logger } from '@org/shared-ts/lib/logger/iso-logger';

import { getPosthogProjectToken, isProductionRuntime } from './env';

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
}: BadResponseCaptureArgs): {
	path: string;
	method: string;
	status: number;
	locale?: string;
} => ({
	path,
	method,
	status,
	locale,
});

const isBadStatus = (status: number): boolean => status < 200 || status >= 300;

const analyticsClient = new IsoAnalytics(getPosthogProjectToken() ?? '');
let analyticsInit: Promise<void> | undefined;

const initializeAnalytics = async (): Promise<void> => {
	if (!getPosthogProjectToken()) {
		analyticsClient.logOnly = true;
		return;
	}

	analyticsInit ??= analyticsClient.init();
	await analyticsInit;
};

export const captureBadRequest = async (
	input: BadResponseCaptureArgs,
): Promise<void> => {
	if (!isBadStatus(input.status)) {
		return;
	}

	if (!isProductionRuntime()) {
		return;
	}

	await initializeAnalytics();

	const properties = buildBadResponseProperties({
		...input,
	});

	const distinctId = getRequestAddress(input.request);
	if (distinctId === 'anonymous' && isProductionRuntime()) {
		logger.debug('bad-request analytics has no client IP for hashing');
	}

	analyticsClient.capture({
		distinctId: distinctId || randomUUID(),
		event: 'bad_request',
		properties,
	});

	logger.debug('bad-request analytics captured', {
		path: input.path,
		status: input.status,
	});
};
