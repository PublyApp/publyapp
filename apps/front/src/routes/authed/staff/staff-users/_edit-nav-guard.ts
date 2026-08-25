import type { StaffUserEditValues } from './_edit-schema';

/** What a successful save committed, tagged with the user it belongs to. */
type SavedStaffUserEditValues = StaffUserEditValues & { userId: string };

// #1314-r1: the nav guard must decide from values it can read LIVE at the
// moment a navigation runs. `history.block` stacks every registered closure
// and consults them ALL, so no render-frozen snapshot qualifies: a closure
// registered on an earlier render would read stale data exactly during the
// post-save redirect (the reviewed MAJOR). These module-level snapshots are
// written only outside render (hydration effect / submit handler) and read
// only inside the guard's callback, so every stacked closure sees the truth
// without any render-time ref access.
const pristineValuesByUserId = new Map<string, SavedStaffUserEditValues>();
const lastSavedValuesByUserId = new Map<string, SavedStaffUserEditValues>();

/**
 * Strict per-field equality over the edit form's values. The nav guard
 * compares the LIVE form values against the last hydrated (pristine) or the
 * last successfully saved snapshot.
 */
const staffUserEditValuesMatch = (
	left: StaffUserEditValues,
	right: StaffUserEditValues,
): boolean =>
	left.firstName === right.firstName &&
	left.lastName === right.lastName &&
	left.avatarUrl === right.avatarUrl &&
	left.email === right.email &&
	left.accountLevel === right.accountLevel &&
	left.status === right.status &&
	left.profileIds.length === right.profileIds.length &&
	left.profileIds.every(
		(profileId, index) => profileId === right.profileIds[index],
	);

/** Called by the hydration effect, outside render, right after a fresh reset. */
export const rememberPristineStaffUserEditValues = (
	userId: string,
	values: StaffUserEditValues,
): void => {
	pristineValuesByUserId.set(userId, { ...values, userId });
	lastSavedValuesByUserId.delete(userId);
};

/** Called by the submit handler, outside render, after a successful save. */
export const recordLastSavedStaffUserEditValues = (
	userId: string,
	values: StaffUserEditValues,
): void => {
	lastSavedValuesByUserId.set(userId, { ...values, userId });
};

/**
 * The nav-guard predicate: compares the LIVE form values against the last
 * saved snapshot, falling back to the pristine hydration snapshot.
 */
export const staffUserEditHasUnsavedChanges = (
	userId: string,
	currentValues: StaffUserEditValues,
): boolean => {
	const baseline =
		lastSavedValuesByUserId.get(userId) ?? pristineValuesByUserId.get(userId);
	if (!baseline) {
		return false;
	}

	return !staffUserEditValuesMatch(currentValues, baseline);
};
