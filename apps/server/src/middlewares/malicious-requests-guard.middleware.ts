// * malicious bots frequently hits obvious routes
// * such as wp-login.php, etc.
// * we want to block them from hitting these routes

import _ from 'lodash';
import { expressHandler, getRequestIp } from '../lib/express';
import { BlockList } from 'node:net';
import { getGlobalConfig, setGlobalConfig } from '../lib/parse/parse.utils';
import { logger } from '../lib/winston';
import { IP_BLOCKLIST_CONFIG_KEY } from '../lib/constants';

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
	const ipAddresses: string[] = config.get(IP_BLOCKLIST_CONFIG_KEY);
	_.forEach(ipAddresses, (ipAddress) => {
		try {
			blocklist.addAddress(ipAddress);
		} catch (error) {
			logger.error(error);
		}
	});
};

export const maliciousRequestsGuardMiddleware = expressHandler(
	async (req, res, next) => {
		const { path } = req;

		const ipAddress = getRequestIp(req);

		const isWTF =
			_.includes(path, 'test_block_ip') ||
			_.includes(_.toLower(path), _.toLower('.DS_Store')) ||
			_.includes(path, '.git') ||
			_.includes(path, '.vscode') ||
			_.includes(path, '.aws') ||
			_.includes(path, '.circleci') ||
			_.includes(path, '.env');
		const isZip = _.endsWith(path, '.zip');
		const isWordPress = _.includes(path, '/wp');
		const phpExtensionRegex = /\.php(?:[^/]*)?(?:\/|$)/i;
		const isPHP = phpExtensionRegex.test(path);

		const suspiciousConditions = [isWTF, isZip, isWordPress, isPHP];

		const isSuspicious = _.some(suspiciousConditions, (condition) => condition);

		if (isSuspicious) {
			try {
				blocklist.addAddress(ipAddress || '');
			} catch (error) {
				logger.error('Failed to add IP address to blocklist:', error, {
					ipAddress,
				});
			}

			const updateConfigAsynchronously = async () => {
				const globalConfig = await getGlobalConfig();

				const updatedIpAddresses = _.uniq([
					...(globalConfig.get(IP_BLOCKLIST_CONFIG_KEY) || []),
					ipAddress,
				]);

				await setGlobalConfig({
					[IP_BLOCKLIST_CONFIG_KEY]: {
						value: updatedIpAddresses,
					},
				});
			};

			updateConfigAsynchronously().catch((error) => {
				logger.error(error);
			});
		}

		const pathMatches = maliciousBotsRoutes.has(path);

		const isBlockedIp = ipAddress ? blocklist.check(ipAddress) : false;

		const maliciousConditions = [isSuspicious, pathMatches, isBlockedIp];

		const isMalicious = _.some(maliciousConditions, (condition) => condition);

		if (isMalicious) {
			const redirectUrl = _.sample(tenHoursOfFun);
			return res.status(200).redirect(redirectUrl as never);
		}

		return next();
	},
);
