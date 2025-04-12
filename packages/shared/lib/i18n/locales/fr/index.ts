import zodFr from 'zod-i18n-map/locales/fr/zod.json' with { type: 'json' };

import type { LooseResource } from '../en';

import common from './common';

const resourceFR = {
	common,
	zod: {
		...zodFr,
		errors: {
			...zodFr.errors,
			invalid_type_with_path:
				'{{path}} est attendu {{expected}}, reçu {{received}}',
		},
	},
} as const satisfies LooseResource;

export default resourceFR;
