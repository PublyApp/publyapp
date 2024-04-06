import zodFr from 'zod-i18n-map/locales/fr/zod.json';

import type { LooseResource } from '../en';

import common from './common';

const resourceFR = {
	common,
	zod: zodFr,
} as const satisfies LooseResource;

export default resourceFR;
