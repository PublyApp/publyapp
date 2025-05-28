// * malicious bots frequently hits obvious routes
// * such as wp-login.php, etc.
// * we want to block them from hitting these routes

import _ from 'lodash';
import { expressHandler, getHeader } from '../lib/express';
import { BlockList } from 'node:net';
import { getGlobalConfig } from '../lib/parse/parse.utils';
import { CLOUDFLARE_CONNECTING_IP_HEADER_KEY } from '@/shared/lib/constants';

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

export const blocklist = new BlockList();

export const populateBlocklist = async () => {
	const config = await getGlobalConfig();
	const ipAddresses: string[] = config.get('ipBlockList');
	_.forEach(ipAddresses, (ipAddress) => {
		try {
			blocklist.addAddress(ipAddress);
		} catch (error) {
			console.error(error);
		}
	});
};

export const maliciousRequestsGuardMiddleware = expressHandler(
	async (req, res, next) => {
		const { path } = req;

		const ipAddress = getHeader(req, CLOUDFLARE_CONNECTING_IP_HEADER_KEY); // getRequestIp(req);
		const isBlockedIp = ipAddress ? blocklist.check(ipAddress) : false;
		const isWTF =
			_.includes(path, '.git') ||
			_.includes(path, '.vscode') ||
			_.includes(path, '.aws') ||
			_.includes(path, '.circleci') ||
			_.includes(path, '.env');
		const isZip = _.endsWith(path, '.zip');
		const isPHP = _.endsWith(path, '.php');
		const isWordPress = _.includes(path, 'wp');
		const pathMatches = maliciousBotsRoutes.has(path);

		const maliciousConditions = [
			isBlockedIp,
			isWTF,
			isPHP,
			isWordPress,
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
