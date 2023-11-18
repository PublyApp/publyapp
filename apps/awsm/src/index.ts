/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable no-console */
import { EventEmitter } from 'events';

import Parse from 'parse/node';

import express from 'express';
import _ from 'lodash';

import { className } from '@devist/shared/lib/constants';

Parse.initialize('devist', undefined, 'local-master-key');
Parse.serverURL = 'http://localhost:6180/parse';

global.Parse = Parse;

const PORT = 6183;
const USE_MASTER_KEY = { useMasterKey: true };

let cursor = 0;

const linkServiceEmitter = new EventEmitter();

linkServiceEmitter.on('saveLinkMeta', async ({ link: linkJson }: { link: object }) => {
	try {
		const link = Parse.Object.fromJSON({ ...linkJson, className: className.AWESOME_LINK });

		const oldCount = _.get(linkJson, 'meta.visitCount') || 0;
		link.set('meta.visitCount', oldCount + 1);

		await link.save(null, USE_MASTER_KEY);
	} catch (error) {
		console.error(error);
	}
});

const app = express();

app.get('/*', async (_req, res) => {
	try {
		const query = Parse.Query.or(
			new Parse.Query(className.AWESOME_LINK).doesNotExist('deleted'),
			new Parse.Query(className.AWESOME_LINK).equalTo('deleted', false),
		);

		const totalCount = await query.count(USE_MASTER_KEY);

		if (cursor > totalCount - 1) {
			cursor = 0;
		}

		const links = await query.skip(cursor).limit(1).find(USE_MASTER_KEY);

		const link = links[0];

		cursor += 1;

		linkServiceEmitter.emit('saveLinkMeta', { link: link.toJSON() });

		// res.send({
		// 	link,
		// 	totalCount,
		// });
		res.status(301).redirect(link.get('url'));
	} catch (error) {
		console.error(error);
	}
});

app.listen(PORT, () => {
	console.log('====================================');
	console.log(`app listening on port ${PORT}`);
	console.log('====================================');
});
