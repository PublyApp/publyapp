import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '~/components/ui/tooltip';

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

	const handleCopy = async () => {
		if (!navigator.clipboard?.writeText) {
			return;
		}

		await navigator.clipboard.writeText(value);
		setCopied(true);
		setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
	};

	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							size="icon-sm"
							aria-label={label}
							data-testid={testId}
							onClick={() => {
								void handleCopy();
							}}
						/>
					}
				>
					{copied ? (
						<IconCheck aria-hidden="true" className="size-3.5" />
					) : (
						<IconCopy aria-hidden="true" className="size-3.5" />
					)}
				</TooltipTrigger>
				<TooltipContent>{copied ? t('copied') : t('copy')}</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
};
