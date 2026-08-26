import { useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useCallback, useRef, useState } from 'react';
import type { SupportedLanguage } from '~/lib/i18n.shared';
import { switchLocale } from '~/lib/i18n/locale-switch';
import { setLocale } from '~/server/i18n-locale';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

export const useSwitchLocale = () => {
	const router = useRouter();
	const setLocaleFn = useServerFn(setLocale);
	const [isSwitching, setIsSwitching] = useState(false);
	const [hasFailed, setHasFailed] = useState(false);
	const isInFlightRef = useRef(false);

	const doSwitchLocale = useCallback(
		(locale: SupportedLanguage) => {
			if (isInFlightRef.current) {
				return;
			}

			isInFlightRef.current = true;
			setIsSwitching(true);
			setHasFailed(false);

			switchLocale(locale, router, setLocaleFn)
				.catch((error: unknown) => {
					logger.error('switchLocale: failed to switch locale', error);
					setHasFailed(true);
				})
				.finally(() => {
					isInFlightRef.current = false;
					setIsSwitching(false);
				});
		},
		[router, setLocaleFn],
	);

	return { switchLocale: doSwitchLocale, isSwitching, hasFailed };
};
