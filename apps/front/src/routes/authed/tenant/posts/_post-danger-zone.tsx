import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Card } from '~/components/ui/card';

/** The edit page's danger zone: moving the post to the bin. */
export const PostDangerZone = ({
	onMoveToBin,
}: {
	onMoveToBin: () => void;
}) => {
	const { t } = useTranslation(['posts']);

	return (
		<Card className="mt-8 border-[var(--publy-danger)]">
			<div className="p-4">
				<p className="text-xs font-semibold tracking-widest text-muted-foreground">
					{t('posts:danger-zone-title')}
				</p>
				<p className="mt-1 text-sm text-muted-foreground">
					{t('posts:danger-zone-description')}
				</p>
				<Button
					variant="destructive"
					className="mt-3"
					data-testid="tenant-post-edit-move-to-bin"
					onClick={onMoveToBin}
				>
					{t('posts:move-to-bin')}
				</Button>
			</div>
		</Card>
	);
};
