import { IconAlertTriangle, IconCheck, IconCopy } from '@tabler/icons-react';
import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from '~/components/ui/tooltip';

import { logger } from '@org/shared-ts/lib/logger/iso-logger';

const COPY_FEEDBACK_MS = 1500;

export const CopyButton = ({
	value,
	label,
	testId,
}: {
	value: string;
	label: string;
	testId?: string;
}) => {
	const { t } = useTranslation('common');
	const statusId = useId();
	const [copied, setCopied] = useState(false);
	const [failed, setFailed] = useState(false);
	const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);
	const copyRequestRef = useRef(0);

	useEffect(
		() => () => {
			clearTimeout(resetTimeoutRef.current);
		},
		[],
	);

	const handleCopy = async () => {
		setFailed(false);
		setCopied(false);
		const requestId = ++copyRequestRef.current;

		if (!navigator.clipboard?.writeText) {
			setFailed(true);
			return;
		}

		try {
			await navigator.clipboard.writeText(value);
			if (requestId !== copyRequestRef.current) {
				return;
			}
			setCopied(true);
		} catch (error) {
			if (requestId !== copyRequestRef.current) {
				return;
			}
			logger.warn('Failed to copy value to clipboard', { error });
			setFailed(true);
			return;
		}

		clearTimeout(resetTimeoutRef.current);
		resetTimeoutRef.current = setTimeout(() => {
			if (requestId !== copyRequestRef.current) {
				return;
			}
			setCopied(false);
			setFailed(false);
		}, COPY_FEEDBACK_MS);
	};

	const tooltipLabel = () => {
		if (failed) {
			return t('copy-failed');
		}
		if (copied) {
			return t('copied');
		}
		return t('copy');
	};

	const status = () => {
		if (failed) {
			return 'failed';
		}
		if (copied) {
			return 'copied';
		}
		return 'idle';
	};

	// Only the copy *result* is worth an unsolicited screen-reader
	// announcement; the idle label is already exposed via `aria-label` and
	// re-announcing it here (both on mount and again after the feedback
	// window resets) would double-announce the same text as label + status.
	const liveAnnouncement = () => {
		if (failed) {
			return t('copy-failed');
		}
		if (copied) {
			return t('copied');
		}
		return '';
	};

	const icon = () => {
		if (failed) {
			return (
				<IconAlertTriangle
					aria-hidden="true"
					className="size-3.5 text-destructive"
				/>
			);
		}
		if (copied) {
			return <IconCheck aria-hidden="true" className="size-3.5" />;
		}
		return <IconCopy aria-hidden="true" className="size-3.5" />;
	};

	return (
		<Tooltip>
			<span id={statusId} role="status" aria-live="polite" className="sr-only">
				{liveAnnouncement()}
			</span>
			<TooltipTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={label}
						data-testid={testId}
						data-state={status()}
						onClick={() => {
							void handleCopy();
						}}
					/>
				}
			>
				{icon()}
			</TooltipTrigger>
			<TooltipContent>{tooltipLabel()}</TooltipContent>
		</Tooltip>
	);
};
