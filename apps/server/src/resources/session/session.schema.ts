import { AUTHED_READONLY_CLP } from '@/server/lib/constants';
import { defineSchema } from '@/server/lib/parse/utils';
import { className } from '@/shared/lib/constants';

const SessionSchema = defineSchema(className.SESSION, {
	fields: {
		ipAddress: { type: 'String' },
	},
	classLevelPermissions: AUTHED_READONLY_CLP,
});

export default SessionSchema;
