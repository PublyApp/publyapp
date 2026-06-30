import { nanoid } from 'nanoid';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';
import { IsoAnalytics } from '@org/shared-ts/lib/analytics/iso-analytics';

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
	userAgent: string | null;
	locale?: string;
};

const sanitizeIpHeaderValue = (value: string): string =>
	value.trim() || 'anonymous';

const extractIpAddressFromHeader = (value: string): string => {
	const firstValue = value.split(',')[0]?.trim() ?? '';
	return sanitizeIpHeaderValue(firstValue);
};

const getPosthogApiKey = (): string | undefined => {
	const explicit = process.env.POSTHOG_API_KEY;
	if (explicit?.trim()) {
		return explicit.trim();
	}

	return process.env.PUBLIC_POSTHOG_API_KEY?.trim();
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
			return extractIpAddressFromHeader(headerValue);
		}
	}

	return 'anonymous';
};

const buildBadResponseProperties = ({
	path,
	method,
	status,
	userAgent,
	locale,
	request,
}: BadResponseCaptureArgs & { request: Request }) => ({
	path,
	method,
	status,
	userAgent,
	locale,
	host: request.headers.get('host'),
	protocol: request.url.startsWith('https:') ? 'https' : 'http',
	});

const isBadStatus = (status: number): boolean => status < 200 || status >= 300;

const analyticsClient = new IsoAnalytics(getPosthogApiKey() ?? '');
let analyticsInit: Promise<void> | undefined;

const initializeAnalytics = async (): Promise<void> => {
	if (!getPosthogApiKey()) {
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

	if (process.env.NODE_ENV !== 'production') {
		return;
	}

	await initializeAnalytics();

	const properties = buildBadResponseProperties({
		...input,
		request: input.request,
	});

	analyticsClient.capture({
		distinctId: getRequestAddress(input.request) || nanoid(),
		event: 'bad_request',
		properties,
	});

	logger.debug('bad-request analytics captured', {
		path: input.path,
		status: input.status,
	});
};
