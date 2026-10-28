import sharedFr from '@org/shared-ts/lib/i18n/locales/fr';

import type { LooseResource } from './en';

// `satisfies` keeps the EN/FR type-parity assertion this barrel has always carried, even though
// neither side is authored here any more: a namespace (or a key) added on one side and not the
// other still fails typecheck.
const resourceFR = sharedFr satisfies LooseResource;

export default resourceFR;
