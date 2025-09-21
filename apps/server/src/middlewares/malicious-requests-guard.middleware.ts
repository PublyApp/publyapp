// * malicious bots frequently hits obvious routes
// * such as wp-login.php, etc.
// * we want to block them from hitting these routes

import { BlockList, type IPVersion, isIPv6 } from 'node:net';
import { logger } from '@org/shared/lib/winston.server';
import _ from 'lodash';
import { IP_BLOCKLIST_CONFIG_KEY } from '../lib/constants';
import { expressHandler, getRequestIp } from '../lib/express';
import { getDatabase, getGlobalConfig } from '../lib/parse/parse.utils';

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
			let ipVersion: IPVersion = 'ipv4';
			if (isIPv6(ipAddress)) {
				ipVersion = 'ipv6';
			}
			blocklist.addAddress(ipAddress, ipVersion);
		} catch (error) {
			if (_.isObject(error)) {
				_.set(error, 'ipAddress', ipAddress);
			}
			logger.error(error);
		}
	});
};

export const maliciousRequestsGuardMiddleware = expressHandler(
	async (req, res, next) => {
		const { path: _path } = req;
		const path = _.toLower(_path);

		const ipAddress = getRequestIp(req) || '';

		const isWTF =
			_.includes(path, _.toLower('test_block_ip')) ||
			_.includes(path, _.toLower('.DS_Store')) ||
			_.includes(path, _.toLower('.git')) ||
			_.includes(path, _.toLower('.vscode')) ||
			_.includes(path, _.toLower('.aws')) ||
			_.includes(path, _.toLower('.circleci')) ||
			_.includes(path, _.toLower('.env'));
		const isZip = _.endsWith(path, _.toLower('.zip'));
		const isWordPress = _.includes(path, _.toLower('/wp'));
		const phpExtensionRegex = /\.php(?:[^/]*)?(?:\/|$)/i;
		const isPHP = phpExtensionRegex.test(path);

		const suspiciousConditions = [isWTF, isZip, isWordPress, isPHP];

		const isSuspicious = _.some(suspiciousConditions, (condition) => condition);

		if (isSuspicious) {
			try {
				let ipVersion: IPVersion = 'ipv4';
				if (isIPv6(ipAddress)) {
					ipVersion = 'ipv6';
				}
				blocklist.addAddress(ipAddress, ipVersion);
				logger.debug('Blocked IP address', { ipAddress });
			} catch (error) {
				if (_.isObject(error)) {
					_.set(error, 'ipAddress', ipAddress);
				}
				logger.error('Failed to add IP address to blocklist:', error);
			}

			const updateConfigAsynchronously = async () => {
				const db = getDatabase();
				const GlobalConfigCollection = db.collection('_GlobalConfig');
				GlobalConfigCollection.updateOne(
					{
						_id: 1 as never,
					},
					{ $addToSet: { [`params.${IP_BLOCKLIST_CONFIG_KEY}`]: ipAddress } },
				);
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
