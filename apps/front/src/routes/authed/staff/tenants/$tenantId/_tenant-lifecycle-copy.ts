type LifecycleCopyArgs = {
	isActive: boolean;
	isSuspended: boolean;
	t: (key: string, options?: Record<string, unknown>) => string;
};

export const resolveLifecycleTitle = ({
	isActive,
	isSuspended,
	t,
}: LifecycleCopyArgs): string => {
	if (isActive) {
		return t('suspend-tenant');
	}
	if (isSuspended) {
		return t('reactivate-tenant');
	}
	return t('lifecycle-unavailable-title');
};

export const resolveLifecycleDescription = ({
	isActive,
	isSuspended,
	tenantName,
	t,
}: LifecycleCopyArgs & { tenantName: string }): string => {
	if (isActive) {
		return t('suspend-tenant-confirm', { name: tenantName });
	}
	if (isSuspended) {
		return t('reactivate-tenant-confirm', { name: tenantName });
	}
	return t('lifecycle-unavailable-until-tenant-activates');
};
