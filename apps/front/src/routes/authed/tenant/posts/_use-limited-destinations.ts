import { useMemo } from 'react';
import {
	toTenantPublishTargets,
	useTenantPublishTargetsQuery,
} from '~/lib/query/tenant-publish-targets';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';
import type { LimitedDestination } from '~/lib/text-counter/text-counter';

/** Every destination the post can reach (project visibility applied) with its
 * text limits: what a thread segment's live counter measures against. */
export const useLimitedDestinations = (
	projectId: string | null,
): LimitedDestination[] => {
	const tenantId = useResolvedWorkspaceTenantId();
	const targetsQuery = useTenantPublishTargetsQuery({
		tenantId: tenantId ?? '',
		projectId,
	});
	const targets = toTenantPublishTargets(targetsQuery.data);

	return useMemo(
		() =>
			targets.flatMap((target) =>
				target.limits
					? [{ label: target.label ?? target.provider, limits: target.limits }]
					: [],
			),
		[targets],
	);
};
