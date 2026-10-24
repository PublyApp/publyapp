import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';

type HandoffPanelProps = {
	/** Plain-words cause from the failed attach attempt ('' while retrying). */
	cause: string;
	busy: boolean;
	onRetry: () => void;
	onDiscard: () => void;
};

/** Shown when the post was created but its image did not attach: names the
 * cause in plain words and offers the retry/discard way out. */
export const HandoffPanel = ({
	cause,
	busy,
	onRetry,
	onDiscard,
}: HandoffPanelProps) => {
	const { t } = useTranslation(['posts']);
	return (
		<div
			className="space-y-2 rounded-[var(--publy-radius-medium-control)] border-[1.5px] border-(--publy-border-strong) bg-(--publy-surface-muted) px-4 py-3"
			data-testid="tenant-posts-create-image-handoff"
		>
			<p className="text-sm font-medium">{t('posts:image-handoff-title')}</p>
			{cause ? (
				<p
					className="publy-type-helper text-[var(--publy-danger)]"
					role="alert"
				>
					{cause}
				</p>
			) : null}
			<div className="flex gap-2">
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={busy}
					onClick={onRetry}
					data-testid="tenant-posts-create-image-retry"
				>
					{busy ? t('posts:saving') : t('posts:image-retry')}
				</Button>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={busy}
					onClick={onDiscard}
					data-testid="tenant-posts-create-image-discard"
				>
					{t('posts:image-discard')}
				</Button>
			</div>
		</div>
	);
};

export const CreatePostActions = ({
	isSubmitting,
	onCancel,
}: {
	isSubmitting: boolean;
	onCancel: () => void;
}) => {
	const { t } = useTranslation(['posts', 'common']);

	return (
		<div className="flex justify-end gap-2">
			<Button type="button" variant="outline" onClick={onCancel}>
				{t('common:cancel')}
			</Button>
			<Button
				type="submit"
				variant="default"
				disabled={isSubmitting}
				data-testid="tenant-posts-create-save"
			>
				{isSubmitting ? t('posts:saving') : t('posts:save')}
			</Button>
		</div>
	);
};
