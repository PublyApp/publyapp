import { fileURLToPath } from 'node:url';

import { serve } from 'srvx';
import { staticMiddleware } from 'srvx/static';

// #1758: the built server bundle is imported through the `#server-build`
// package-imports alias so the dedicated tsconfig.server.json can typecheck
// this file without dragging build output into the program. Node resolves the
// alias's `default` condition to `./dist/server/server.js` at runtime; the
// `types` condition (resolved only by tsc) points at types/server-build.d.ts.
import handler, { validateRuntimeEnv } from '#server-build';

validateRuntimeEnv();

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT ?? 3000);

const staticHandler = staticMiddleware({ dir: `${__dirname}/dist/client` });

const server = serve({
	port,
	hostname: process.env.HOST ?? '0.0.0.0',
	middleware: [staticHandler],
	fetch: (request) => handler.fetch(request),
});

await server.ready();

console.log(`front standalone server listening on http://localhost:${port}`);
