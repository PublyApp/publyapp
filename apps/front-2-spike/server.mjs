import { dirname, join } from 'node:path';
// Standalone Node server entry for the front-2 spike (Task 1.5).
//
// WHY THIS EXISTS: this TanStack Start version (1.168.26) builds to
//   dist/client (static assets) + dist/server/server.js (a web `{ fetch }` handler)
// and does NOT emit a Nitro `.output/server/index.mjs` self-listening server (the
// plan grounding's assumption did not hold for this version — see the findings doc
// "Standalone Node server" section). dist/server/server.js exports only a fetch
// handler, so `node dist/server/server.js` does not listen on its own.
//
// This entry wires that fetch handler into a real listening Node HTTP server via
// `srvx` (the same runner the scaffold's `start` script referenced), serving the
// built client assets statically and falling through to SSR. Boot with:
//   node server.mjs   (the package.json `start` script)
import { fileURLToPath } from 'node:url';

import { serve } from 'srvx';
import { serveStatic } from 'srvx/static';

import handler from './dist/server/server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 3000);

const staticMiddleware = serveStatic({ dir: join(__dirname, 'dist/client') });

const server = serve({
	port,
	hostname: process.env.HOST ?? '0.0.0.0',
	// Serve built client assets first; anything not on disk falls through to SSR.
	middleware: [staticMiddleware],
	fetch: (request) => handler.fetch(request),
});

await server.ready();
// eslint-disable-next-line no-console
console.log(
	`front-2-spike standalone server listening on http://localhost:${port}`,
);
