import { parseFunction } from '../utils/parse.utils';

Parse.Cloud.define(
	'hello',
	parseFunction(async () => {
		console.log('hello');
	}),
);
