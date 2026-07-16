export type ProfileDetailsTab = 'members' | 'overview' | 'permissions';

export type ProfileDetailsSearchParams = {
	edit?: 1;
	tab?: ProfileDetailsTab;
};

export type ProfileDetailsSearchParamInput = {
	edit?: unknown;
	tab?: unknown;
};

/** The flag round-trips as the NUMBER 1. A string value would be JSON-quoted
 * by the router's search serializer. Malformed values return an explicit
 * undefined edit key because validated search merges over raw parsed search. */
export const parseProfileDetailsSearchParams = (
	search: ProfileDetailsSearchParamInput,
): ProfileDetailsSearchParams => {
	const isEditOpen =
		search.edit === 1 ||
		(typeof search.edit === 'string' && search.edit.trim() === '1');
	const tab =
		search.tab === 'permissions' || search.tab === 'members'
			? search.tab
			: undefined;

	return { edit: isEditOpen ? 1 : undefined, tab };
};
