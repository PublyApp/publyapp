import { Router } from 'express';

import { expressHandler } from '../lib/express';

// Simulating a URL database for short links
const urlDatabase: Record<string, string> = {
	abc123: 'https://www.long-url-example.com',
	xyz789: 'https://www.another-long-url.com',
};

const shortURLRouter = Router();
export default shortURLRouter;

shortURLRouter.get(
	'/:hash',
	expressHandler(async (req, res) => {
		const { hash } = req.params;
		const originalUrl = urlDatabase[hash];

		if (originalUrl) {
			res.redirect(originalUrl);
		} else {
			res.status(404).send('URL not found');
		}
	}),
);

shortURLRouter.get(
	'/*',
	expressHandler(async (_req, res) => {
		res.redirect(global.LOCAL ? 'http://front.devist.test' : 'https://www.devist.xyz');
	}),
);
