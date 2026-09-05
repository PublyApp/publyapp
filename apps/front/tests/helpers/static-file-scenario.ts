import { join } from 'node:path';

import type { ServerMiddleware } from 'srvx';

interface StaticFileScenarioOptions {
	directory: string;
	handler: ServerMiddleware;
}

export const executeStaticFileScenario = async ({
	directory,
	handler,
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

	return response;
};
