import { sleep } from '@/shared/utils/any.utils';

Parse.Cloud.job('testPostJob', async (req) => {
	try {
		console.log(req);
		await sleep(5000);
		req.message('ok');
	} catch (error) {
		console.log(error);
	}
});
