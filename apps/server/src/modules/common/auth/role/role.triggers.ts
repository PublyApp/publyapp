import { parseTriggerEnhanced } from '@/server/lib/parse/cloud/trigger';

// --------------------------------------------------------------------------------------//
//                                     BEFORE SAVE                                       //
// --------------------------------------------------------------------------------------//

const beforeSaveRole = parseTriggerEnhanced<Parse.Role>({
	trigger: async () => {
		// req.log.info('beforeSaveRole', req);
	},
});

// --------------------------------------------------------------------------------------//
//                                      AFTER SAVE                                       //
// --------------------------------------------------------------------------------------//

const afterSaveRole = parseTriggerEnhanced<Parse.Role>({
	trigger: async () => {
		// req.log.info('afterSaveRole', req);
	},
});

// --------------------------------------------------------------------------------------//
//                                     DEFINITIONS                                       //
// --------------------------------------------------------------------------------------//

Parse.Cloud.beforeSave(Parse.Role as never, beforeSaveRole);
Parse.Cloud.afterSave(Parse.Role as never, afterSaveRole);
