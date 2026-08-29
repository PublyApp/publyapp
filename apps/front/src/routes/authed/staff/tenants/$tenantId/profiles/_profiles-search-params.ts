import {
	parseTableSearchParams,
	serializeTableSearchParams,
	type TableSearchParamInput,
	type TableSearchParams,
	type TableSearchWireParams,
} from '~/lib/url-state/table-search-params';

export type StaffTenantProfileTypeFilter = 'true' | 'false';
export type StaffTenantProfilesViewMode = 'cards' | 'table';

export type StaffTenantProfilesSearchParams = TableSearchParams & {
	new?: 1;
	/** Id of the profile whose quick-edit drawer is open OVER this list (#972).
	 * It is an id rather than a boolean flag because the list is the thing that
	 * stays mounted: the id names which row the drawer is editing, and putting
	 * it in the list's own search state keeps the drawer deep-linkable and
	 * makes a browser Back close it instead of leaving the list. */
	edit?: string;
	/** Snake_case + a REAL boolean: this object IS the route search state the
	 * router serializes into the URL — a camelCase key would leak into the URL,
	 * and a 'true' STRING would be JSON-quoted (`?is_default=%22true%22`). */
	is_default?: boolean;
	view?: 'table';
};
export type StaffTenantProfilesSearchParamInput = TableSearchParamInput & {
	new?: unknown;
	edit?: unknown;
	is_default?: unknown;
	view?: unknown;
};

const normalizeUnknownString = (value: unknown): string | undefined => {
	if (typeof value !== 'string') {
		return undefined;
	}

	const trimmed = value.trim();
	if (trimmed.length > 0) {
		return trimmed;
	}
	return undefined;
};

export const toStaffTenantProfileTypeFilterString = (
	value: boolean | undefined,
): StaffTenantProfileTypeFilter | undefined => {
	if (value === undefined) {
		return undefined;
	}

	if (value) {
		return 'true';
	}
	return 'false';
};

export const parseStaffTenantProfileTypeFilter = (
	value: unknown,
): boolean | undefined => {
	if (typeof value === 'boolean') {
		return value;
	}

	const normalized = normalizeUnknownString(value)?.toLowerCase();
	if (normalized === 'true') {
		return true;
	}

	if (normalized === 'false') {
		return false;
	}
	return undefined;
};

/**
 * The `edit` param carries a profile id, so it must survive the URL as a RAW
 * string. TanStack's search serializer re-quotes any string that happens to be
 * valid JSON (`'5'` → `?edit=%225%22`) and its parser turns an unquoted numeric
 * value back into a NUMBER — so an all-digit value cannot round-trip. Profile
 * ids are UUIDs and never all-digit, so accepting strings only is both exact
 * and lossless; anything else (a number, a boolean, an empty string) is not an
 * id and is dropped at the router boundary.
 */
export const parseStaffTenantProfileEditId = (
	value: unknown,
): string | undefined => normalizeUnknownString(value);

/**
 * `?new=1` and `?edit=<id>` are both drawer-open flags on this one route, and a
 * drawer is a modal — two mounted at once is not a state this UI has a meaning
 * for (two stacked surfaces, two "Profile name" fields, one shared discard
 * prompt). Enforcing that only at the open call sites would leave
 * `?new=1&edit=<id>` — a link anyone can be sent — mounting both on first
 * paint, so the invariant is resolved HERE, at the same boundary that already
 * drops a non-string `edit`.
 *
 * **`edit` wins.** It names a specific existing row, so it is the flag that
 * carries information the URL cannot reconstruct: honouring `new` instead would
 * silently change *which* entity the recipient of the link is looking at. `new`
 * is a bare flag whose entire state is "open the empty create form", one click
 * away and identical every time. Dropping the cheap, reconstructible flag is
 * the smaller loss. (The reachable in-app flows never reach this tiebreak —
 * both open paths clear the opposite flag — so this governs hand-written,
 * stale, or shared URLs only.)
 */
export const resolveStaffTenantProfileDrawerFlags = (
	isCreateOpen: boolean,
	editProfileId: string | undefined,
) => ({
	new: isCreateOpen && editProfileId === undefined ? (1 as const) : undefined,
	edit: editProfileId,
});

export const parseStaffTenantProfilesViewMode = (
	value: unknown,
): StaffTenantProfilesViewMode =>
	normalizeUnknownString(value)?.toLowerCase() === 'table' ? 'table' : 'cards';

export const parseStaffTenantProfilesSearchParams = (
	search: StaffTenantProfilesSearchParamInput,
): StaffTenantProfilesSearchParams => {
	const base = parseTableSearchParams(search);
	/* The flag round-trips as the NUMBER 1 — a string '1' would be JSON-quoted
	 * in the URL (`?new=%221%22`) by the router's search serializer. */
	const isCreateOpen =
		search.new === 1 ||
		(typeof search.new === 'string' && search.new.trim() === '1');
	const isDefault = parseStaffTenantProfileTypeFilter(search.is_default);
	const view = parseStaffTenantProfilesViewMode(search.view);

	return {
		...base,
		...resolveStaffTenantProfileDrawerFlags(
			isCreateOpen,
			parseStaffTenantProfileEditId(search.edit),
		),
		is_default: isDefault,
		view: view === 'table' ? view : undefined,
	};
};

export type StaffTenantProfilesWireParams = {
	new?: 1;
	edit?: string;
	is_default?: boolean;
	view?: 'table';
} & TableSearchWireParams;

export const serializeStaffTenantProfilesSearchParams = (
	params: StaffTenantProfilesSearchParams,
): StaffTenantProfilesWireParams => {
	const next = serializeTableSearchParams(params);
	const isDefault = parseStaffTenantProfileTypeFilter(params.is_default);
	const view = parseStaffTenantProfilesViewMode(params.view);

	return {
		...next,
		...resolveStaffTenantProfileDrawerFlags(
			params.new === 1,
			parseStaffTenantProfileEditId(params.edit),
		),
		is_default: isDefault,
		view: view === 'table' ? view : undefined,
	};
};
