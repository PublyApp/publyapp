import { createRequestHandler } from '@react-router/express';
import express from 'express';

const app = express();

app.disable('x-powered-by');

const viteDevServer = await import('vite').then((vite) =>
	vite.createServer({
		server: { middlewareMode: true },
	}),
);

app.use(viteDevServer.middlewares);

// Handle Chrome DevTools workspace mapping request
app.get('/.well-known/appspecific/com.chrome.devtools.json', (_req, res) => {
	res.status(204).end();
});

// Handle missing favicon
// app.get("/favicon.ico", (_req, res) => {
// 	res.status(204).end();
// });

app.use(
	createRequestHandler({
		build: () =>
			viteDevServer.ssrLoadModule('virtual:react-router/server-build'),
	}),
);

const port = process.env.PORT || 5051;

app.listen(port, () => {
	console.log(`\n${'='.repeat(60)}`);
	console.log(
		`🚀  Server is running at: \x1b[32mhttp://localhost:${port}\x1b[0m`,
	);
	console.log(`${'='.repeat(60)}\n`);
});
