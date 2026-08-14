import { IconCalendarEvent } from '@tabler/icons-react';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { StateSurface } from '~/components/ui/state-surface';

import { WorkspacePageHeader } from './_workspace-page-parts';

export const Route = createFileRoute('/_authed-layout/tenant/posts')({
	staticData: {
		crumbs: () => [{ kind: 'label', labelKey: 'posts' }],
	},
	component: TenantPostsStubPage,
});

/**
 * Honest stub: the posts workspace (calendar, queue, drafts, history)
 * ships in a later tranche — no fake CRUD against a nonexistent backend.
 */
function TenantPostsStubPage() {
	const { t } = useTranslation('common');

	return (
		<div className="space-y-5" data-testid="tenant-posts-page">
			<WorkspacePageHeader titleKey="posts" />
			<StateSurface
				icon={IconCalendarEvent}
				title={t('posts')}
				description={t('stub-posts-description')}
				testId="tenant-posts-stub"
			/>
		</div>
	);
}
