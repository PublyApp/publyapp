import { AUTHED_READONLY_CLP } from '@/server/lib/constants';
import SchemaManager from '@/server/lib/parse/classes/SchemaManager';
import { className } from '@/shared/lib/constants';

const SessionSchema = SchemaManager.defineSchema(className.SESSION, {
	fields: {
		ipAddress: { type: 'String' },
	},
	classLevelPermissions: AUTHED_READONLY_CLP,
});

export default SessionSchema;
