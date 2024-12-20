import _ from 'lodash';
import zodEn from 'zod-i18n-map/locales/en/zod.json' with { type: 'json' };

import common from './common';

const resourceEN = {
	common,
	zod: {
		...zodEn,
		errors: {
			...zodEn.errors,
			invalid_type_with_path: '{{path}} is expected {{expected}}, received {{received}}',
		},
	},
} as const;

export type Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Resource>;

export default resourceEN;
