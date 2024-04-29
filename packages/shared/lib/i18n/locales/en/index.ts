import _ from 'lodash';
import zodEn from 'zod-i18n-map/locales/en/zod.json' assert { type: 'json' };

import common from './common';

const resourceEN = {
	common,
	// zod: _.merge(zodEn, {
	// 	errors: {
	// 		invalid_type: 'Expected {{expected}}, received {{received}}',
	// 		invalid_type_received_undefined: 'Expected {{expected}}, received {{received}}',
	// 		invalid_type_received_null: 'Expected {{expected}}, received {{received}}',
	// 	},
	// }),
	zod: zodEn,
} as const;

export type Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Resource>;

export default resourceEN;
