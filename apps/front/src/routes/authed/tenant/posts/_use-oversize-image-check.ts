import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { formatBytes } from '~/lib/format-bytes';

import { MAX_UPLOAD_BYTES } from '@org/shared-ts/lib/constants';

import type { ImageLimits } from './_use-publish-selection';

/**
 * Splits picked files into the ones within the size cap and a translated refusal
 * naming that cap, so an oversize file is refused before any request (a refused
 * body can reset the connection mid-upload; #2421). The cap is the one the help
 * text shows; while the destinations' limits are unknown it is the server's own
 * upload cap, so the check is never skipped.
 */
export const useOversizeImageCheck = (limits: ImageLimits | null) => {
	const { t, i18n } = useTranslation('common');
	const maxBytes = limits?.maxImageBytes ?? MAX_UPLOAD_BYTES;
	const language = i18n.language;

	return useCallback(
		(files: File[]) => {
			const fitting = files.filter((file) => file.size <= maxBytes);
			return {
				fitting,
				tooLarge:
					fitting.length < files.length
						? t('image-too-large', {
								size: formatBytes(maxBytes, language, 'limit'),
							})
						: '',
			};
		},
		[maxBytes, language, t],
	);
};
