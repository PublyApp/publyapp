import compression from 'compression';
import express from 'express';

export function createApp() {
	const app = express();

	app.use(compression());

	// Disable x-powered-by header
	app.disable('x-powered-by');

	return app;
}
