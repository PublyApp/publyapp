import { parseTrigger } from '../../utils/parse.utils';

Parse.Cloud.afterLogin(
	parseTrigger({
		trigger: async ({ req }) => {
			console.log('====================================');
			console.log(req.headers);
			console.log('====================================');
		},
	}),
);
