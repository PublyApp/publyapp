import { expect } from 'vitest';

export const INDEX_HTML_BODY = '<html><body>OK</body></html>';

export const assertNormalStaticFileResponse = async (
	response: Response | undefined,
): Promise<void> => {
	if (response === undefined) {
		throw new Error(
			'Expected static middleware to return a response for index.html',
		);
	}

	expect(response.ok).toBe(true);
	const body = await response.text();
	expect(body).toBe(INDEX_HTML_BODY);
};
