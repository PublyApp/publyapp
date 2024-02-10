import '@/server/resources/user/user.triggers';
import '@/server/resources/awesomeLink/awesomeLink.triggers';
import '@/server/resources/post/post.triggers';

// import { parseTrigger } from '@/server/lib/parse';

// import './appFile.functions';

// import { RolesEnum } from '@devist/shared/utils/constants';

// import { parseFrom } from '../../utils/parse.utils';

// Parse.Cloud.define(
// 	'hello',
// 	parseFrom({
// 		requireUser: true,
// 		allowedRoles: [RolesEnum.ADMIN, RolesEnum.MODERATOR, RolesEnum.AUTHOR, RolesEnum.READER],
// 		// allowedRoles: [],
// 		action: async ({ t }) => {
// 			return t('common:hello');
// 		},
// 	}),
// );

// Parse.Cloud.beforeLogin(
// 	parseTrigger({
// 		trigger: async ({ req, t }) => {
// 			req.master = true;
// 		},
// 	}),
// );
