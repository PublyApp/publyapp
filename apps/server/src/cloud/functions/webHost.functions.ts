import { USE_MASTER_KEY } from '@server/utils/constants';
import { parseFrom } from '@server/utils/parse.utils';
import { ParseWebHost } from '@shared/parse/classes/webHost.class';
import { /* className, */ functionName, RolesEnum } from '@shared/utils/constants';
import { getCreateWebHostInputSchema } from '@shared/validations/webHost.validations';

Parse.Cloud.define(
	functionName.createWebHost,
	parseFrom({
		requireUser: true,
		allowedRoles: [RolesEnum.ADMIN],
		action: async ({ req, t }) => {
			const reqParams = getCreateWebHostInputSchema(t).parse(req.params);

			// const newWebHost = new Parse.Object(className.WEB_HOST, reqParams);
			const newWebHost = new ParseWebHost({
				translations: {
					en: {
						name: reqParams.name,
						description: reqParams.description,
					},
				},
			});
			const savedWebHost = await newWebHost.save(null, USE_MASTER_KEY);

			return savedWebHost;
		},
	}),
);
