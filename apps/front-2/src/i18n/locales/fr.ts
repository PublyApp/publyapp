import sharedFr from '@org/shared-ts/lib/i18n/locales/fr';

import type { LooseResource } from './en';
import auth from './fr/auth.json';
import common from './fr/common.json';

const resourceFR = {
	common,
	zod: sharedFr.zod,
	'response-message': sharedFr['response-message'],
	auth,
} as const satisfies LooseResource;

export default resourceFR;
