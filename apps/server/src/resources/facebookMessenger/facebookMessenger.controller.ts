import fs from 'fs';

import { eachOfLimit } from 'async';
import { AxiosError } from 'axios';

import { expressHandler } from '@/server/lib/express';
import logger from '@/server/lib/logger';
import { defaultHttp } from '@/shared/lib/axios';

const getCircularReplacer = () => {
	const seen = new WeakSet();

	return (_key: unknown, value: unknown) => {
		if (typeof value === 'object' && value !== null) {
			if (seen.has(value)) {
				return;
			}

			seen.add(value);
		}

		// eslint-disable-next-line consistent-return
		return value;
	};
};

const writeToFile = async (fileName: string, data: unknown) => {
	fs.writeFileSync(fileName, JSON.stringify(data, getCircularReplacer(), 2));
};

const config = {
	verifyToken: 'azerty',
	// Test with Savon Pandio
	// TODO: programmatically get a page access token
	page_token:
		'EAAK8G1BeXckBO6L1GcmFZCi8jQl4B97uX39aS38ZBdvoeBsBjcO0ZBtIlGmQ5kO4h8SWQlAquVl5eZBLCFKamjzgtJpPZAHtEi0ZBGyaBouETXcQXfOZAiiLgmCxQmKSHMjUbnjL2VYvdFZA9MZCi9mClt5meB9xB4fENU736ZCVhHLN08BoNB9GZANb3MP2hjSXZBHvzA0D8OjxnglTMTz7',
	// page_id: '100437249527801',
};

const sendMessage = async ({
	pageId,
	recipientId,
	message,
}: {
	pageId: string;
	recipientId: string;
	message: string;
}) => {
	const fbGraphAPIVersion = 'v19.0';
	const url = new URL('https://graph.facebook.com');
	url.pathname = `/${fbGraphAPIVersion}/${pageId}/messages`;
	url.searchParams.append('access_token', config.page_token);

	// url.searchParams.append('recipient', `{'id':'${recipientId}'}`);
	// url.searchParams.append('messaging_type', 'RESPONSE');
	// url.searchParams.append('message', `{'text':'${message}'}`);

	console.log('✅✅✅', url.toString());

	defaultHttp
		.post(url.toString(), {
			recipient: {
				id: recipientId,
			},
			messaging_type: 'RESPONSE',
			message: {
				text: message,
			},
		})
		.catch((error) => {
			if (error instanceof AxiosError) {
				logger.error('Error sending message:', error.response?.data);
			}

			Promise.reject(error);
		});
};

export const handleWebHook = expressHandler(async (req, res) => {
	const { body } = req;

	logger.info('Received webhook:');
	console.dir(body, { depth: null });
	writeToFile('body.json', body);
	// Send a 200 OK response if this is a page webhook

	if (body.object === 'page') {
		const entries = body.entry;
		eachOfLimit(entries, 20, async (entry: any, _index) => {
			const recipientId = entry.messaging[0].sender.id;
			const pageId = entry.id;
			await sendMessage({ message: 'quoi de neuf ?', recipientId, pageId });

			// eslint-disable-next-line no-useless-return
			return;
		});

		// Returns a '200 OK' response to all requests
		return res.status(200).send('EVENT_RECEIVED');

		// Determine which webhooks were triggered and get sender PSIDs and locale, message content and more.
		// eslint-disable-next-line no-else-return
	} else {
		// Return a '404 Not Found' if event is not from a page subscription
		return res.sendStatus(404);
	}
});

export const handleVerification = expressHandler(async (req, res) => {
	// Parse the query params
	const mode = req.query['hub.mode'];
	const token = req.query['hub.verify_token'];
	const challenge = req.query['hub.challenge'];

	// Check if a token and mode is in the query string of the request
	if (mode && token) {
		// Check the mode and token sent is correct
		if (mode === 'subscribe' && token === config.verifyToken) {
			// Respond with the challenge token from the request
			logger.info('WEBHOOK_VERIFIED');
			return res.status(200).send(challenge);
			// eslint-disable-next-line no-else-return
		} else {
			// Respond with '403 Forbidden' if verify tokens do not match
			return res.sendStatus(403);
		}
	}

	return res.sendStatus(400);
});
