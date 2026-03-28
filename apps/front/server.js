// * https://reactrouter.com/api/other-api/adapter#react-routerexpress
// * https://github.com/remix-run/react-router-templates/blob/main/node-custom-server/server.js

// @ts-check
import compression from 'compression';
import express from 'express';
import morgan from 'morgan';

const MODE = process.env.MODE;
const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
const PORT = process.env.PORT ? Number.parseInt(process.env.PORT, 10) : 5050;

const app = express();

app.use(compression());
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.set('case sensitive routing', true);

if (IS_DEVELOPMENT) {
	console.log('Starting development server');

	const viteDevServer = await import('vite').then((vite) => {
		return vite.createServer({
			server: { middlewareMode: true },
			mode: MODE,
		});
	});

	app.use(viteDevServer.middlewares);

	app.use(async (req, res, next) => {
		try {
			const source = await viteDevServer.ssrLoadModule('./server/app.ts');
			return await source.app(req, res, next);
		} catch (error) {
			if (typeof error === 'object' && error instanceof Error) {
				viteDevServer.ssrFixStacktrace(error);
			}

			next(error);
		}
	});
} else {
	console.log('Starting production server');

	app.use(
		'/assets',
		express.static('build/client/assets', { immutable: true, maxAge: '1y' }),
	);

	app.use(morgan('tiny'));
	app.use(express.static('build/client', { maxAge: '1h' }));
	// @ts-expect-error Built by the production frontend build before runtime startup.
	app.use(await import('./build/server/index.js').then((mod) => mod.app));
}

const SEPARATOR = '='.repeat(60);

app.listen(PORT, () => {
	console.log(`\n${SEPARATOR}`);
	console.log(
		`🚀  Server is running at: \x1b[32mhttp://localhost:${PORT}\x1b[0m`,
	);
	console.log(`${SEPARATOR}\n`);
});
