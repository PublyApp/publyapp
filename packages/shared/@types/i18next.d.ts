import { type Resource } from '../lib/i18n/locales/en';
import { type DefaultNS } from '../lib/i18n/resources';

declare module 'i18next' {
	interface CustomTypeOptions {
		defaultNS: DefaultNS;
		resources: Resource;
	}
}
