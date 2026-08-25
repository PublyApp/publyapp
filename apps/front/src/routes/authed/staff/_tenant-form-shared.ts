import { useMemo } from 'react';
import { type FieldSelectOption } from '~/components/field';

/** Narrow view of i18next's `t` used by the tenant form section components:
 * plain lookup plus interpolation counts. */
export type TranslateFn = (
	key: string,
	options?: Record<string, unknown>,
) => string;

/** Locale/timezone `Field.Select` options shared verbatim by the tenant create
 * and tenant edit forms. Both rebuild on `t` so labels stay localized. */
export const useTenantLocaleOptions = (
	t: (key: string) => string,
): FieldSelectOption[] =>
	useMemo(
		() => [
			{ value: '', label: t('not-set') },
			{ value: 'en', label: 'English' },
			{ value: 'fr', label: 'Français' },
		],
		[t],
	);

export const useTenantTimezoneOptions = (
	t: (key: string) => string,
): FieldSelectOption[] =>
	useMemo(() => {
		const zones =
			typeof Intl.supportedValuesOf === 'function'
				? Intl.supportedValuesOf('timeZone')
				: [];

		return [
			{ value: '', label: t('not-set') },
			...zones.map((zone) => ({ value: zone, label: zone })),
		];
	}, [t]);
