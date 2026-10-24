import { IconAdjustmentsHorizontal } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/button';
import { Checkbox } from '~/components/ui/checkbox';
import {
	POSTS_PUBLISH,
	SOCIAL_ACCOUNTS_PUBLISH,
	useTenantPermissions,
} from '~/lib/query/tenant-permissions';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';

import type { DestinationOverridesState } from './_use-destination-overrides';
import type { PublishSelection } from './_use-publish-selection';

/** One chip per connected account of the project (Epic C rule), shown only
 * with BOTH `tenant.posts.publish` AND `tenant.socialaccounts.publish` (the
 * publish surface requires both). A selected chip offers "Customize", which
 * opens that destination's tab; a dot marks a customized destination. All
 * selected destinations still share ONE editor: customizing only overrides
 * fields for that destination. */
export const DestinationChips = ({
	selection,
	overrides,
}: {
	selection: PublishSelection;
	overrides: DestinationOverridesState;
}) => {
	const { t } = useTranslation(['posts']);
	const tenantId = useResolvedWorkspaceTenantId();
	const { hasPermission } = useTenantPermissions(tenantId);
	const { targets, selectedIds, toggle } = selection;
	const selectedIdSet = new Set(selectedIds);

	// The front promises only what the back will honor: hide the chips unless
	// the member holds both verbs.
	if (
		!hasPermission(POSTS_PUBLISH) ||
		!hasPermission(SOCIAL_ACCOUNTS_PUBLISH)
	) {
		return null;
	}

	return (
		<section className="space-y-2" data-testid="tenant-posts-destination-chips">
			<p className="text-[13px] font-medium text-foreground">
				{t('posts:publish-on-heading')}
			</p>
			{targets.length === 0 ? (
				<p className="text-muted-foreground text-xs">
					{t('posts:publish-on-empty')}
				</p>
			) : (
				<div role="group" className="flex flex-wrap gap-2">
					{targets.map((target) => {
						const isChecked = selectedIdSet.has(target.id);
						const isCustomized = target.id in overrides.overrides;
						const label = target.label ?? target.provider;

						return (
							<div key={target.id} className="inline-flex items-center gap-1">
								<label
									className="publy-choice-chip"
									data-selected={isChecked ? 'true' : undefined}
								>
									<Checkbox
										className="sr-only"
										name="publishTargets"
										data-testid={`tenant-posts-publish-target-${target.id}`}
										checked={isChecked}
										onCheckedChange={(checked) => {
											toggle(target.id, Boolean(checked));
										}}
									/>
									<span>{target.label}</span>
									{isCustomized ? (
										<span
											role="img"
											aria-label={t('posts:destination-customized')}
											title={t('posts:destination-customized')}
											className="size-1.5 rounded-[var(--publy-radius-chip)] bg-[var(--publy-primary)]"
											data-testid={`tenant-posts-destination-dot-${target.id}`}
										/>
									) : null}
								</label>
								{isChecked ? (
									<Button
										type="button"
										variant="ghost"
										size="xs"
										aria-label={t('posts:destination-customize-aria', {
											destination: label,
										})}
										aria-pressed={overrides.activeId === target.id}
										data-testid={`tenant-posts-destination-customize-${target.id}`}
										onClick={() => overrides.open(target.id)}
									>
										<IconAdjustmentsHorizontal
											aria-hidden="true"
											className="size-3.5"
										/>
										{t('posts:destination-customize')}
									</Button>
								) : null}
							</div>
						);
					})}
				</div>
			)}
		</section>
	);
};
