export type InviteUserSearchState = {
	invite?: 1;
};

export type InviteUserSearchStateInput = {
	invite?: unknown;
};

const normalizeInviteFlag = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) return trimmed;
	return undefined;
};

const parseInviteUserSearchFlag = (value: unknown): 1 | undefined =>
	value === 1 || normalizeInviteFlag(value) === '1' ? 1 : undefined;

export const parseInviteUserSearchParams = (
	search: InviteUserSearchStateInput,
): InviteUserSearchState => ({
	invite: parseInviteUserSearchFlag(search?.invite),
});

export const serializeInviteUserSearchParams = (
	params: InviteUserSearchState,
) => ({
	invite: parseInviteUserSearchFlag(params.invite),
});
