export const tenantRoleTypeChipClassName = (
	isSystem: boolean | undefined,
): string =>
	isSystem
		? 'publy-detail-chip publy-detail-chip--amber'
		: 'publy-detail-chip publy-detail-chip--outline';
