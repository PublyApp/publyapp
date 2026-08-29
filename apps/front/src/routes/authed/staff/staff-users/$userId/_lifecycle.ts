const TAB_ROUTE_SUFFIXES = ['permissions', 'activity', 'settings'] as const;
export type TabSection = 'overview' | (typeof TAB_ROUTE_SUFFIXES)[number];

export const STAFF_STATUS_ACTIVE = 'active';
export const STAFF_STATUS_SUSPENDED = 'suspended';

export const normalizeStatus = (value: string | null | undefined): string =>
	value?.trim().toLowerCase() ?? '';

export const getSuspendLabelKey = (
	status: string | null,
): 'suspend' | 'reactivate' => {
	const normalized = normalizeStatus(status);

	if (normalized === STAFF_STATUS_SUSPENDED) {
		return 'reactivate';
	}
	return 'suspend';
};

type SuspendDialogKeys = { titleKey: string; descriptionKey: string };

export const getSuspendDialogKeys = (
	status: string | null,
): SuspendDialogKeys => {
	const normalized = normalizeStatus(status);

	if (normalized === STAFF_STATUS_SUSPENDED) {
		return {
			titleKey: 'reactivate-staff-user',
			descriptionKey: 'reactivate-staff-user-confirm',
		};
	}

	return {
		titleKey: 'suspend-staff-user',
		descriptionKey: 'suspend-staff-user-confirm',
	};
};

export const getActiveSection = (pathname: string): TabSection => {
	const match = TAB_ROUTE_SUFFIXES.find((suffix) =>
		pathname.endsWith(`/${suffix}`),
	);

	return match ?? 'overview';
};
