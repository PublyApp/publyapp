// * malicious bots frequently hits obvious routes
// * such as wp-login.php, etc.
// * we want to block them from hitting these routes

import _ from 'lodash';
import { expressHandler } from '../lib/express';

// https://gist.github.com/NickCraver/c9458f2e007e9df2bdf03f8a02af1d13
const tenHoursOfFun = [
	'https://www.youtube.com/watch?v=wbby9coDRCk',
	'https://www.youtube.com/watch?v=nb2evY0kmpQ',
	'https://www.youtube.com/watch?v=eh7lp9umG2I',
	'https://www.youtube.com/watch?v=z9Uz1icjwrM',
	'https://www.youtube.com/watch?v=Sagg08DrO5U',
	'https://www.youtube.com/watch?v=5XmjJvJTyx0',
	'https://www.youtube.com/watch?v=IkdmOVejUlI',
	'https://www.youtube.com/watch?v=jScuYd3_xdQ',
	'https://www.youtube.com/watch?v=S5PvBzDlZGs',
	'https://www.youtube.com/watch?v=9UZbGgXvCCA',
	'https://www.youtube.com/watch?v=O-dNDXUt1fg',
	'https://www.youtube.com/watch?v=MJ5JEhDy8nE',
	'https://www.youtube.com/watch?v=VnnWp_akOrE',
	'https://www.youtube.com/watch?v=jwGfwbsF4c4',
	'https://www.youtube.com/watch?v=8ZcmTl_1ER8',
	'https://www.youtube.com/watch?v=gLmcGkvJ-e0',
	'https://www.youtube.com/watch?v=hGlyFc79BUE',
	'https://www.youtube.com/watch?v=xA8-6X8aR3o',
	'https://www.youtube.com/watch?v=7R1nRxcICeE',
	'https://www.youtube.com/watch?v=sCNrK-n68CM',
];

const maliciousBotsRoutes = new Set([
	'/robots.txt',
	'/ads.txt',
	'/sftp-config.json',
]);

export const forbiddenRoutesMiddleware = expressHandler(
	async (req, res, next) => {
		const { path } = req;

		const isWTF =
			_.includes(path, '.git') ||
			_.includes(path, '.vscode') ||
			_.includes(path, '.env');
		const isZip = _.endsWith(path, '.zip');
		const isPHP = _.endsWith(path, '.php');
		const isWordPressXML = _.includes(path, 'wp-') && _.endsWith(path, '.xml');
		const pathMatches = maliciousBotsRoutes.has(path);

		const maliciousConditions = [
			isWTF,
			isPHP,
			isWordPressXML,
			isZip,
			pathMatches,
		];
		const isMalicious = _.some(maliciousConditions, (condition) => !!condition);

		if (isMalicious) {
			const redirectUrl = _.sample(tenHoursOfFun);
			return res.status(200).redirect(redirectUrl as never);
		}

		return next();
	},
);
