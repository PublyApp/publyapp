import { useMemo, useState } from 'react';
import type { TenantPublishTarget } from '~/lib/query/tenant-publish-targets';
import {
	toAttachLimits,
	toTenantPublishTargets,
	useTenantPublishTargetsQuery,
} from '~/lib/query/tenant-publish-targets';
import { useResolvedWorkspaceTenantId } from '~/lib/query/tenants-for-picker';
import type {
	DestinationLimits,
	LimitedDestination,
} from '~/lib/text-counter/text-counter';

/** What every selected destination accepts: the strictest image cap and size,
 * and only the types they all take. */
export type ImageLimits = Pick<
	DestinationLimits,
	'maxImages' | 'maxImageBytes' | 'acceptedImageContentTypes'
>;

const toImageLimits = (
	limits: readonly DestinationLimits[],
): ImageLimits | null => {
	const [first, ...rest] = limits;
	if (!first) {
		return null;
	}

	const common: ImageLimits = {
		maxImages: first.maxImages,
		maxImageBytes: first.maxImageBytes,
		acceptedImageContentTypes: first.acceptedImageContentTypes,
	};
	for (const next of rest) {
		common.maxImages = Math.min(common.maxImages, next.maxImages);
		common.maxImageBytes = Math.min(common.maxImageBytes, next.maxImageBytes);
		common.acceptedImageContentTypes = common.acceptedImageContentTypes.filter(
			(type) => next.acceptedImageContentTypes.includes(type),
		);
	}
	return common;
};

/** A selected destination: its account id (the key of its overrides), its
 * label and the limits the server advertised for it. */
export type SelectedDestination = LimitedDestination & { id: string };

export type PublishSelection = {
	targets: TenantPublishTarget[];
	selectedIds: string[];
	toggle: (id: string, checked: boolean) => void;
	/** The SELECTED destinations with their limits: what every live counter
	 * (body, thread segments) measures against. */
	destinations: SelectedDestination[];
	/** Image caps shared by the selected destinations, else the server's
	 * attach-time caps; null only before the targets have loaded. */
	imageLimits: ImageLimits | null;
};

/** Owns which publish targets are checked (default: all visible) so the body,
 * the thread segments, the image picker and the Publish button all agree on
 * the same destinations and the limits the server advertised for them. */
export const usePublishSelection = (
	projectId: string | null,
): PublishSelection => {
	const tenantId = useResolvedWorkspaceTenantId();
	const targetsQuery = useTenantPublishTargetsQuery({
		tenantId: tenantId ?? '',
		projectId,
	});
	const targets = useMemo(
		() => toTenantPublishTargets(targetsQuery.data),
		[targetsQuery.data],
	);
	const [checkedIds, setCheckedIds] = useState<string[] | null>(null);

	// Default = every visible target checked; null until targets resolve.
	const selectedIds = useMemo(
		() => checkedIds ?? targets.map((target) => target.id),
		[checkedIds, targets],
	);

	const toggle = (id: string, checked: boolean) => {
		setCheckedIds((previous) => {
			const base = previous ?? targets.map((target) => target.id);
			return checked ? [...base, id] : base.filter((value) => value !== id);
		});
	};

	const destinations = useMemo(() => {
		const selected = new Set(selectedIds);
		return targets.flatMap((target) =>
			selected.has(target.id) && target.limits
				? [
						{
							id: target.id,
							label: target.label ?? target.provider,
							limits: target.limits,
						},
					]
				: [],
		);
	}, [targets, selectedIds]);
	const attachLimits = useMemo(
		() => toAttachLimits(targetsQuery.data),
		[targetsQuery.data],
	);
	const imageLimits = useMemo(
		() =>
			toImageLimits(destinations.map((destination) => destination.limits)) ??
			attachLimits,
		[destinations, attachLimits],
	);

	return { targets, selectedIds, toggle, destinations, imageLimits };
};
