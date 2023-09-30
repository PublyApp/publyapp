import _ from 'lodash';
import type { PipelineStage } from 'mongoose';

import { pageToSkip } from '@server/utils/any.utils';
import { USE_MASTER_KEY } from '@server/utils/constants';
import { aggregate, parseFrom, reOrderObjects } from '@server/utils/parse.utils';
import { getListParamsSchema } from '@server/utils/validation.utils';
import { defaultLocale } from '@shared/i18n/resources';
import { ParseWebHost } from '@shared/parse/classes/webHost.class';
import { /* className, */ className, DEFAULT_PAGE_SIZE, functionName, RolesEnum } from '@shared/utils/constants';
import { getSaveWebHostInputSchema } from '@shared/validations/webHost.validations';

// Parse.Cloud.define(
// 	functionName.createWebHost,
// 	parseFrom({
// 		requireUser: true,
// 		allowedRoles: [RolesEnum.ADMIN],
// 		action: async ({ req, t }) => {
// 			const reqParams = getCreateWebHostInputSchema(t).parse(req.params);

// 			// const newWebHost = new Parse.Object(className.WEB_HOST, reqParams);
// 			const newWebHost = new ParseWebHost({
// 				translations: {
// 					en: {
// 						name: reqParams.name,
// 						description: reqParams.description,
// 					},
// 				},
// 			});
// 			const savedWebHost = await newWebHost.save(null, USE_MASTER_KEY);

// 			return savedWebHost;
// 		},
// 	}),
// );

// --------------------------------------------------------------------------------------//
//                     For creating an updating records of WebHost                      //
// --------------------------------------------------------------------------------------//
Parse.Cloud.define(
	functionName.saveWebHost,
	parseFrom({
		requireUser: true,
		allowedRoles: [RolesEnum.ADMIN],
		action: async ({ req, t }) => {
			const reqParams = getSaveWebHostInputSchema(t).parse(req.params);

			const localeSave = reqParams.locale ?? defaultLocale;

			// const webHost = new Parse.Object(className.WEB_HOST, reqParams);
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
	functionName.getWebHosts,
	parseFrom({
		requireUser: false,
		action: async ({ req /* , t  */ }) => {
			const { page, pageSize, sorting } = getWebHostsFunctionParamsSchema.parse(req.params);

			const limit = pageSize || DEFAULT_PAGE_SIZE;
			const skip = pageToSkip(page, pageSize);

			const sortingOperations: Record<string, 1 | -1> = {};

			if (sorting && !_.isEmpty(sorting)) {
				// eslint-disable-next-line no-restricted-syntax
				for (const element of sorting) {
					sortingOperations[element.id] = element.desc ? -1 : 1;
				}
			}

			const pipeline: PipelineStage[] = [
				{
					$match: {},
				},
				...(sorting && !_.isEmpty(sorting) ? [{ $sort: sortingOperations }] : []),
				{ $skip: skip },
				{ $limit: limit },
				{ $project: { _id: 1 } },
			];

			// eslint-disable-next-line @typescript-eslint/no-use-before-define
			const documents: { _id: string }[] = await aggregate(className.WEB_HOST, pipeline);

			const ids = documents.map((doc) => {
				// eslint-disable-next-line no-underscore-dangle
				return doc._id;
			});

			const [iWebHosts, totalCount] = await Promise.all([
				new Parse.Query(className.WEB_HOST).containedIn('objectId', ids).find(),
				new Parse.Query(className.WEB_HOST).count(USE_MASTER_KEY),
			]);

			const orderedWebHosts = reOrderObjects(ids, iWebHosts);

			const webHosts = orderedWebHosts.map((iWebHost) => {
				return iWebHost.toJSON();
			});

			const count = iWebHosts.length;
			const lastPage = Math.floor(totalCount / count);

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
