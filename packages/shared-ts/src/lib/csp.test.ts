import { expect, test } from 'vitest';

import { createCSPHeader, getUnifiedCSPConfig } from './csp';

test('adds configured API origins to connect-src', () => {
	const apiOrigin = 'http://api.front.localhost:5000';

	const header = createCSPHeader({
		nonce: 'test-nonce',
		additionalConnectSrc: [apiOrigin],
	});
	const helmetDirectives = getUnifiedCSPConfig({
		nonce: 'test-nonce',
		reportOnly: false,
		additionalConnectSrc: [apiOrigin],
	}).helmetConfig.directives;

	expect(header).toContain(`connect-src 'self'`);
	expect(header).toContain(apiOrigin);
	expect(Array.from(helmetDirectives['connect-src'] ?? [])).toContain(
		apiOrigin,
	);
});

test('does not duplicate configured API origins in connect-src', () => {
	const apiOrigin = 'http://localhost:5000';

	const connectSrc = Array.from(
		createCSPHeader({
			isDevelopment: true,
			nonce: 'test-nonce',
			additionalConnectSrc: [apiOrigin],
		})
			.split('; ')
			.find((directive) => directive.startsWith('connect-src '))
			?.split(' ') ?? [],
	);
	const matches = connectSrc.filter((value) => value === apiOrigin);

	expect(matches).toHaveLength(1);
});
