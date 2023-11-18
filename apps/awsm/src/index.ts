/* eslint-disable no-console */
import Parse from 'parse/node';

import express from 'express';

import { className } from '@devist/shared/lib/constants';

Parse.initialize('devist', undefined, 'local-master-key');
Parse.serverURL = 'http://localhost:6180/parse';

global.Parse = Parse;

const USE_MASTER_KEY = { useMasterKey: true };
const PORT = 6183;
const RANGE = 20;
const cursor = 0;

const app = express();

app.get('/*', (_, res) => {
	// const awesomeLink = new Parse.Query(className.AWESOME_LINK).findAll(USE_MASTER_KEY);

	res.status(301).redirect('https://www.devist.xyz');
});

app.listen(PORT, () => {
	console.log('====================================');
	console.log(`app listening on port ${PORT}`);
	console.log('====================================');
});
