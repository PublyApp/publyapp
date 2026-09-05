import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ServerMiddleware } from 'srvx';

export type StaticFileResponseVariant = (
	body: string,
	response: Response,
) => Response;

interface StaticFileScenarioOptions {
	directory: string;
	handler: ServerMiddleware;
	variant?: StaticFileResponseVariant;
}

const identityResponseVariant: StaticFileResponseVariant = (_body, response) =>
	response;

export const executeStaticFileScenario = async ({
	directory,
	handler,
	variant = identityResponseVariant,
}: StaticFileScenarioOptions): Promise<Response> => {
	const request = new Request('http://localhost:3000/index.html');
	const response: Response | undefined = await handler(
		request,
		() => new Response('not found', { status: 404 }),
	);

	if (response === undefined) {
		throw new Error(
			`MESURE IMPOSSIBLE: staticMiddleware did not return a response for ` +
				`the fixture file ${join(directory, 'index.html')}.`,
		);
	}

	const body = await response.clone().text();
	if (
		!response.ok ||
		body !== readFileSync(join(directory, 'index.html'), 'utf8')
	) {
		throw new Error(
			`MESURE IMPOSSIBLE: staticMiddleware did not serve the known-good ` +
				`fixture before applying the broken-response mutation.`,
		);
	}

	return variant(body, response);
};
