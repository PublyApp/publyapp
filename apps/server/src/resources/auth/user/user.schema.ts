import _ from 'lodash';

import { className } from '@devist/shared/lib/constants';
import type { IUserWithRelations } from '@devist/shared/types/db/user.types';

import { DEFAULT_CLP } from '@/server/lib/constants';
import SchemaManager from '@/server/lib/parse/classes/SchemaManager';

// const classLevelPermissions = _.cloneDeep(DEFAULT_CLP);
// _.set(classLevelPermissions, 'create', {});
// console.dir({ ...DEFAULT_CLP, create: {} }, { depth: null });

const UserSchema = SchemaManager.defineSchema<IUserWithRelations>(className.USER, {
	fields: {
		firstName: { type: 'String' },
		lastName: { type: 'String' },
		avatarUrl: { type: 'String' },

		// required by default by Parse
		username: { type: 'String', required: true },
		email: { type: 'String', required: true },
		password: { type: 'String', required: true },

		// relations
		avatar: { type: 'Pointer', targetClass: className.APP_FILE },
	},
	classLevelPermissions: { ...DEFAULT_CLP, create: {} },
});

export default UserSchema;
