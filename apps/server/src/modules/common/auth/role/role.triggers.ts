import { parseTriggerEnhanced } from '@/server/lib/parse/cloud/trigger';

// --------------------------------------------------------------------------------------//
//                                     BEFORE SAVE                                       //
// --------------------------------------------------------------------------------------//

const beforeSaveRole = parseTriggerEnhanced<Parse.Role>({
	trigger: async ({ req, log }) => {
		log.debug('🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯🎯', req.object.toJSON());
		log.debug('😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂😂', req.original?.toJSON());
	},
});

// --------------------------------------------------------------------------------------//
//                                      AFTER SAVE                                       //
// --------------------------------------------------------------------------------------//

const afterSaveRole = parseTriggerEnhanced<Parse.Role>({
	trigger: async () => {
		// ====
	},
});

// --------------------------------------------------------------------------------------//
//                                     DEFINITIONS                                       //
// --------------------------------------------------------------------------------------//

Parse.Cloud.beforeSave(Parse.Role as never, beforeSaveRole);
Parse.Cloud.afterSave(Parse.Role as never, afterSaveRole);
