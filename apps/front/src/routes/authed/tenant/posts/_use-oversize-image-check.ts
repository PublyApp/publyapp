import { useTranslation } from 'react-i18next';
import { formatBytes } from '~/lib/format-bytes';

import type { ImageLimits } from './_use-publish-selection';

/**
 * Splits picked files into the ones within the advertised size cap (the same
 * value the help text shows) and a translated refusal naming that cap, so an
 * oversize file is refused before any request (a refused body can reset the
 * connection mid-upload; #2421). No limits yet = nothing to check against.
 */
export const useOversizeImageCheck = (limits: ImageLimits | null) => {
	const { t, i18n } = useTranslation('common');

	return (files: File[]) => {
		const maxBytes = limits?.maxImageBytes;
		if (maxBytes === undefined) {
			return { fitting: files, tooLarge: '' };
		}

		const fitting = files.filter((file) => file.size <= maxBytes);
		return {
			fitting,
			tooLarge:
				fitting.length < files.length
					? t('image-too-large', {
							size: formatBytes(maxBytes, i18n.language, 'limit'),
						})
					: '',
		};
	};
};
