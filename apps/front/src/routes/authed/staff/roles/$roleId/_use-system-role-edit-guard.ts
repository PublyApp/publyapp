import { useEffect } from 'react';

type EditSearch = { edit?: 1 };

type CanonicalizeEditNavigate = (options: {
	search: (previous: EditSearch) => EditSearch;
	replace: boolean;
}) => void;

/** The seeded full-access system role has no editable state, so a `?edit=1`
 * deep link is an impossible state. Drop the flag at the router boundary —
 * the way `validateSearch` drops a malformed search value — instead of
 * leaving a URL that advertises a drawer which cannot open. `replace` keeps
 * Back from bouncing through the canonicalized entry. */
export const useSystemRoleEditGuard = ({
	edit,
	isFullAccess,
	navigate,
}: {
	edit: 1 | undefined;
	isFullAccess: boolean;
	navigate: CanonicalizeEditNavigate;
}): void => {
	useEffect(() => {
		if (!isFullAccess || edit !== 1) {
			return;
		}
		navigate({
			search: (previous: EditSearch): EditSearch => ({
				...previous,
				edit: undefined,
			}),
			replace: true,
		});
	}, [edit, isFullAccess, navigate]);
};
