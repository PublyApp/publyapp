import zodEn from 'zod-i18n-map/locales/en/zod.json' assert { type: 'json' };

import common from './common';

const resourceEN = {
	common,
	zod: zodEn,
} as const;

export type Resource = typeof resourceEN;
export type LooseResource = ToPrimitive<Resource>;

export default resourceEN;
