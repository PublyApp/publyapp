import { expect } from 'vitest';

export const INDEX_HTML_BODY = '<html><body>OK</body></html>';

export const assertNormalStaticFileResponse = async (
	response: Response | undefined,
): Promise<void> => {
	expect(response).toBeDefined();
	expect(response?.ok).toBe(true);
	const body = await response?.text();
	expect(body).toBe(INDEX_HTML_BODY);
};
