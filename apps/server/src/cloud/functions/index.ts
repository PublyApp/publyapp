import { parseFunction } from '../../utils/parse.utils';

Parse.Cloud.define(
	'hello',
	parseFunction(async (req: any) => {
		console.log('====================================');
		console.log(req);
		console.log('====================================');
		console.log('hello');

		return req;
	}),
);
