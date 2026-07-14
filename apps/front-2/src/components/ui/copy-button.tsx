import { IconAlertTriangle, IconCheck, IconCopy } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
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
	const [copied, setCopied] = useState(false);
	const [failed, setFailed] = useState(false);
	const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);

	useEffect(
		() => () => {
			clearTimeout(resetTimeoutRef.current);
		},
		[],
	);

	const handleCopy = async () => {
		setFailed(false);

		if (!navigator.clipboard?.writeText) {
			setFailed(true);
			return;
		}

		try {
			await navigator.clipboard.writeText(value);
			setCopied(true);
		} catch (error) {
			logger.warn('Failed to copy value to clipboard', { error });
			setFailed(true);
			return;
		}

		clearTimeout(resetTimeoutRef.current);
		resetTimeoutRef.current = setTimeout(() => {
			setCopied(false);
		}, COPY_FEEDBACK_MS);
	};

	const tooltipLabel = () => {
		if (failed) {
			return t('copy-failed');
		}
		return copied ? t('copied') : t('copy');
	};

	const status = () => {
		if (failed) {
			return 'failed';
		}
		return copied ? 'copied' : 'idle';
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
			<TooltipTrigger
				render={
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						aria-label={label}
						data-testid={testId}
						data-state={status()}
						aria-live="polite"
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
