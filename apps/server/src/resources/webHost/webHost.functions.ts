import _ from 'lodash';

import { USE_MASTER_KEY } from '@/server/lib/constants';
import { aggregate, parseFrom, reOrderObjects } from '@/server/lib/parse';
import { pageToSkip } from '@/server/utils/any.utils';
import { getListParamsSchema } from '@/server/utils/validation.utils';
import { /* className, */ className, DEFAULT_PAGE_SIZE, functionName, roleSet } from '@/shared/lib/constants';
import { defaultLocale } from '@/shared/lib/i18n/resources';
import { ParseWebHost } from '@/shared/lib/parse/classes/webHost.class';
import { getSaveWebHostInputSchema } from '@/shared/validations/webHost.validations';

// --------------------------------------------------------------------------------------//
//                     For creating an updating records of WebHost                      //
// --------------------------------------------------------------------------------------//
Parse.Cloud.define(
	functionName.saveWebHost,
	parseFrom({
		requireUser: true,
		allowedRoles: roleSet.STAFF_ADMIN_ONLY,
		action: async ({ req, t }) => {
			const reqParams = getSaveWebHostInputSchema(t).parse(req.params);

			const localeSave = reqParams.locale ?? defaultLocale;

			const webHost = new ParseWebHost({
				objectId: reqParams.objectId,
				translations: {
					[localeSave]: {
						name: reqParams.name,
						description: reqParams.description,
					},
				},
			});
			const savedWebHost = await webHost.save(null, USE_MASTER_KEY);

			return savedWebHost;
		},
	}),
);

// --------------------------------------------------------------------------------------//
//                                    Find operation                                    //
// --------------------------------------------------------------------------------------//
const getWebHostsFunctionParamsSchema = getListParamsSchema;

Parse.Cloud.define(
	functionName.findWebHost,
	parseFrom({
		requireUser: false,
		action: async ({ req /* , t  */ }) => {
			const { page, pageSize, sorting } = getWebHostsFunctionParamsSchema.parse(req.params);

			const limit = pageSize || DEFAULT_PAGE_SIZE;
			const skip = pageToSkip(page, pageSize);

			const sortingOperations: Record<string, 1 | -1> = {};

			if (sorting && !_.isEmpty(sorting)) {
				for (const element of sorting) {
					sortingOperations[element.id] = element.desc ? -1 : 1;
				}
			}

			const pipeline: Parse.PipelineStage[] = [
				{
					$match: {},
				},
				...(sorting && !_.isEmpty(sorting) ? [{ $sort: sortingOperations }] : []),
				{ $skip: skip },
				{ $limit: limit },
				{ $project: { _id: 1 } },
			];

			const documents = await aggregate(className.WEB_HOST, pipeline);

			const ids = documents.map((doc) => {
				return _.get(doc, '_id');
			});

			const [iWebHosts, totalCount] = await Promise.all([
				new Parse.Query(className.WEB_HOST).containedIn('objectId', ids).find(USE_MASTER_KEY),
				new Parse.Query(className.WEB_HOST).count(USE_MASTER_KEY),
			]);

			const orderedWebHosts = reOrderObjects(ids, iWebHosts);

			const webHosts = orderedWebHosts.map((iWebHost) => {
				return iWebHost.toJSON();
			});

			const count = iWebHosts.length;
			const lastPage = Math.ceil(totalCount / count);

			return {
				webHosts,
				meta: {
					totalCount,
					count,
					page,
					lastPage,
				},
			};
		},
	}),
);
