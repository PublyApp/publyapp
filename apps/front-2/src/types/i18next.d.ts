import type { DefaultNamespace, Namespace } from 'i18next';
import type { TransLegacy } from 'react-i18next/TransWithoutContext';

import type { Front2Resource } from '../i18n/locales/en';

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: 'common';
		enableSelector: 'optimize';
		resources: Front2Resource;
	}

	interface TFunction<
		Ns extends Namespace = DefaultNamespace,
		KPrefix = undefined,
	> {
		// TODO(#907 phase 4): remove this legacy-string overload — it is the completion gate; until removed, string calls stay unchecked
		(key: string, options?: Record<string, unknown>): string;
	}
}

declare module 'react-i18next/TransWithoutContext' {
	interface TransSelector extends TransLegacy {
		// Remove with the legacy-string TFunction overload at the #907 phase 4 gate.
	}
}
