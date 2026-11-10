import { zodResolver } from '@hookform/resolvers/zod';
import {
	useDeferredValue,
	useEffect,
	useMemo,
	useRef,
	useState,
	type Dispatch,
	type SetStateAction,
} from 'react';
import {
	useForm,
	useWatch,
	type FieldErrors,
	type FormState,
	type UseFormReturn,
} from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { useCursorPagination } from '~/components/table/use-cursor-pagination';
import { useStaffRolesQuery } from '~/lib/query/staff-roles';
import {
	toAssignedStaffRoles,
	toStaffUserDetails,
	useStaffUserDetailsQuery,
	useStaffUserRolesQuery,
} from '~/lib/query/staff-users';

import {
	buildStaffRoleOptions,
	collectSelectedRoleIds,
	rememberStaffRoleNames,
} from '../_staff-role-options';
import { rememberPristineStaffUserEditValues } from './_edit-nav-guard';
import { staffUserEditQueries } from './_edit-queries';
import {
	ROLE_PAGE_SIZE,
	getStaffUserEditSchema,
	normalizeStatus,
	type StaffUserEditValues,
} from './_edit-schema';

// Explicit return type: TS2883 under RHF 7.85 — the inferred type referenced a
// non-exported `FormState` path that TypeScript cannot name portably. Built
// only from exported names so the declaration emit stays resolvable.
type UseEditFormDataReturn = {
	detailsQuery: ReturnType<typeof useStaffUserDetailsQuery>;
	assignedRolesQuery: ReturnType<typeof useStaffUserRolesQuery>;
	rolesQuery: ReturnType<typeof useStaffRolesQuery>;
	rolePagination: ReturnType<typeof useCursorPagination>;
	user: ReturnType<typeof toStaffUserDetails>;
	methods: UseFormReturn<StaffUserEditValues>;
	formState: FormState<StaffUserEditValues>;
	errors: FieldErrors<StaffUserEditValues>;
	isSubmitting: boolean;
	roleOptions: ReturnType<typeof buildStaffRoleOptions>;
	hasNoServerRoleRows: boolean;
	isRoleSearchSettled: boolean;
	deferredRoleSearch: string;
	roleSearch: string;
	setRoleSearch: Dispatch<SetStateAction<string>>;
	hasLoadedRoles: boolean;
};

export const useEditFormData = (userId: string): UseEditFormDataReturn => {
	const { t } = useTranslation(['staff-users', 'common']);
	const [roleSearch, setRoleSearch] = useState('');
	const deferredRoleSearch = useDeferredValue(roleSearch.trim());
	const isRoleSearchSettled = roleSearch.trim() === deferredRoleSearch;
	const knownRoleNamesRef = useRef(new Map<string, string>());

	const queries = staffUserEditQueries({ userId });
	const detailsQuery = useStaffUserDetailsQuery(queries.details.variables, {
		enabled: userId.length > 0,
	});
	const assignedRolesQuery = useStaffUserRolesQuery(
		queries.userRoles.variables,
		{ enabled: userId.length > 0 },
	);
	const rolePagination = useCursorPagination({
		sortId: 'name',
		sortOrder: 'asc',
		size: ROLE_PAGE_SIZE,
		scopeKey: `${userId}:${deferredRoleSearch}`,
	});
	const rolesQuery = useStaffRolesQuery({
		...queries.roles.variables,
		// The role search and cursor live in React state: the loader warms the
		// first, unfiltered page.
		q: deferredRoleSearch || undefined,
		cursor: rolePagination.cursor,
	});
	// Render-safe "catalogue has loaded" gate (#1314): plain state seeded from
	// the query's initial status and adjusted during render when the query
	// resolves — the sanctioned derived-state pattern, never a ref read
	// during render (react/refs).
	const [hasLoadedRoles, setHasLoadedRoles] = useState(rolesQuery.isSuccess);
	if (rolesQuery.isSuccess && !hasLoadedRoles) {
		setHasLoadedRoles(true);
	}
	const hasNoServerRoleRows = rolesQuery.data?.data?.length === 0;
	const user = useMemo(
		() => toStaffUserDetails(detailsQuery.data),
		[detailsQuery.data],
	);
	const assignedRoles = useMemo(
		() => toAssignedStaffRoles(assignedRolesQuery.data),
		[assignedRolesQuery.data],
	);
	const staffUserEditSchema = useMemo(() => getStaffUserEditSchema(t), [t]);
	const methods = useForm<StaffUserEditValues>({
		resolver: zodResolver(staffUserEditSchema),
		defaultValues: {
			firstName: '',
			lastName: '',
			avatarUrl: '',
			email: '',
			status: 'Active',
			roleIds: [],
		},
	});
	const { formState, reset } = methods;
	const { errors, isSubmitting } = formState;
	const watchedRoleIds = useWatch({
		control: methods.control,
		name: 'roleIds',
	});
	const selectedRoleIds = collectSelectedRoleIds([watchedRoleIds]);
	const knownRoleNames = new Map(knownRoleNamesRef.current);
	rememberStaffRoleNames(knownRoleNames, assignedRoles);
	rememberStaffRoleNames(knownRoleNames, rolesQuery.data?.data);
	const roleOptions = buildStaffRoleOptions({
		roles: rolesQuery.data?.data,
		selectedRoleIds,
		knownRoleNames,
		includeDescriptions: true,
	});
	const hydratedUserIdRef = useRef<string | null>(null);

	useEffect(() => {
		rememberStaffRoleNames(knownRoleNamesRef.current, rolesQuery.data?.data);
	}, [rolesQuery.data]);

	useEffect(() => {
		rememberStaffRoleNames(knownRoleNamesRef.current, assignedRoles);
	}, [assignedRoles]);

	useEffect(() => {
		if (
			!user ||
			!detailsQuery.isSuccess ||
			!assignedRolesQuery.isSuccess ||
			assignedRolesQuery.data === undefined
		) {
			return;
		}

		const isHydratedForCurrentUser = hydratedUserIdRef.current === userId;
		if (isHydratedForCurrentUser && formState.isDirty) {
			return;
		}

		const nextValues = {
			firstName: user.firstName ?? '',
			lastName: user.lastName ?? '',
			avatarUrl: user.avatarUrl ?? '',
			email: user.email,
			status: normalizeStatus(user.status),
			roleIds: assignedRoles.map((role) => role.id),
		};
		reset(nextValues);
		hydratedUserIdRef.current = userId;
		// Pristine-truth snapshot for the nav guard, kept in lockstep with the
		// reset above. A fresh hydration also invalidates any saved snapshot
		// left over from a previous visit: the server state it described may
		// have diverged since (#1314-r1).
		rememberPristineStaffUserEditValues(userId, nextValues);
	}, [
		assignedRoles,
		formState.isDirty,
		reset,
		user,
		userId,
		detailsQuery.isSuccess,
		assignedRolesQuery.isSuccess,
		assignedRolesQuery.data,
	]);

	return {
		detailsQuery,
		assignedRolesQuery,
		rolesQuery,
		rolePagination,
		user,
		methods,
		formState,
		errors,
		isSubmitting,
		roleOptions,
		hasNoServerRoleRows,
		isRoleSearchSettled,
		deferredRoleSearch,
		roleSearch,
		setRoleSearch,
		hasLoadedRoles,
	};
};
