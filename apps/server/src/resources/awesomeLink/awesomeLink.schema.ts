import { className } from '@devist/shared/lib/constants';

import { defineSchema } from '@/server/lib/parse';

const AwesomeLinkSchema = defineSchema(className.AWESOME_LINK, {
	fields: {
		url: { type: 'String', required: true },
		deleted: { type: 'Boolean' },
		meta: { type: 'Object' },
	},
});

export default AwesomeLinkSchema;
