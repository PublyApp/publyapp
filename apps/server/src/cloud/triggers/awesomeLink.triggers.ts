import { ACTIVE_AWESOME_LINKS_POOL_SIZE, className } from '@devist/shared/lib/constants';

import { USE_MASTER_KEY } from '@server/lib/constants';

import { parseTrigger } from '../../lib/parse';

Parse.Cloud.afterSave(
	className.AWESOME_LINK,
	parseTrigger({
		trigger: async (/* { req: _req, t: _t } */) => {
			// const link = req.object;

			// from active links find the first document and deactivate it
			// if the total exceed the allowed pool size
			const query = Parse.Query.or(
				new Parse.Query(className.AWESOME_LINK).doesNotExist('deleted'),
				new Parse.Query(className.AWESOME_LINK).equalTo('deleted', false),
			);

			const activeLinksTotalCount = await query.count(USE_MASTER_KEY);

			if (activeLinksTotalCount > ACTIVE_AWESOME_LINKS_POOL_SIZE) {
				const firstActiveLink = await query.first(USE_MASTER_KEY);
				firstActiveLink?.set('deleted', true);
				await firstActiveLink?.save(null, USE_MASTER_KEY);
			}
		},
	}),
);
