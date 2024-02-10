// import { logger } from 'parse-server';

// import { multiTenantTrigger, parseTrigger } from '@/server/lib/parse';
// import { ParsePost } from '@/shared/lib/parse/classes/post.class';

// Parse.Cloud.beforeFind(
// 	ParsePost,
// 	// parseTrigger({
// 	// 	trigger: async ({ req, t, locale }) => {
// 	// 		logger.info('beforeFind', req);

// 	// 		// const postToSave = req.object;
// 	// 	},
// 	// }),
// 	multiTenantTrigger({
// 		trigger: async ({ locale, req, t }) => {
// 			console.log('🤢🤢🤢🤢beforeFind', req);
// 			console.log(req.user?.toJSON());
// 		},
// 	}),
// );

// Parse.Cloud.beforeSave(
// 	ParsePost,
// 	// parseTrigger({
// 	// 	trigger: async ({ req, t, locale }) => {
// 	// 		logger.info('beforeFind', req);

// 	// 		// const postToSave = req.object;
// 	// 	},
// 	// }),
// 	multiTenantTrigger({
// 		trigger: async ({ locale, req, t }) => {
// 			console.log('❤️❤️❤️❤️ beforeSave', req);
// 			console.log(req.user?.toJSON());
// 		},
// 	}),
// );
