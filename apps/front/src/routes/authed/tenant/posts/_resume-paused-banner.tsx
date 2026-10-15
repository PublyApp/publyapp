import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import {
	useResumePausedPublicationsMutation,
	type TenantPublicationRow,
} from '~/lib/query/tenant-publications';

/** After a reconnect, the account's paused posts resume in one click (#647).
 * Counts only paused rows whose account no longer needs reconnecting. */
export const ResumePausedBanner = ({
	rows,
	tenantId,
}: {
	rows: TenantPublicationRow[];
	tenantId: string;
}) => {
	const { t } = useTranslation(['posts']);
	const resume = useResumePausedPublicationsMutation();
	const resumable = rows.filter(
		(row) => row.status === 'paused' && !row.accountNeedsReconnect,
	);
	if (resumable.length === 0) {
		return null;
	}

	return (
		<div
			className="flex items-center justify-between gap-3"
			data-testid="tenant-posts-resume-paused"
		>
			<p className="text-sm text-muted-foreground">
				{t('posts:publication-resume-paused-hint')}
			</p>
			<Button
				variant="default"
				size="sm"
				disabled={resume.isPending}
				onClick={() =>
					resume.mutate({
						tenantId,
						publicationIds: resumable.map((row) => row.id),
					})
				}
			>
				{t('posts:publication-resume-paused', { count: resumable.length })}
			</Button>
		</div>
	);
};
