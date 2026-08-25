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
import { useStaffProfilesQuery } from '~/lib/query/staff-profiles';
import {
	toAssignedStaffProfiles,
	toStaffUserDetails,
	useStaffUserDetailsQuery,
	useStaffUserProfilesQuery,
} from '~/lib/query/staff-users';

import {
	buildStaffProfileOptions,
	collectSelectedProfileIds,
	rememberStaffProfileNames,
} from '../_staff-profile-options';
import { rememberPristineStaffUserEditValues } from './_edit-nav-guard';
import {
	PROFILE_PAGE_SIZE,
	getStaffUserEditSchema,
	normalizeAccountLevel,
	normalizeStatus,
	type StaffUserEditValues,
} from './_edit-schema';

// Explicit return type: TS2883 under RHF 7.85 — the inferred type referenced a
// non-exported `FormState` path that TypeScript cannot name portably. Built
// only from exported names so the declaration emit stays resolvable.
type UseEditFormDataReturn = {
	detailsQuery: ReturnType<typeof useStaffUserDetailsQuery>;
	assignedProfilesQuery: ReturnType<typeof useStaffUserProfilesQuery>;
	profilesQuery: ReturnType<typeof useStaffProfilesQuery>;
	profilePagination: ReturnType<typeof useCursorPagination>;
	user: ReturnType<typeof toStaffUserDetails>;
	methods: UseFormReturn<StaffUserEditValues>;
	formState: FormState<StaffUserEditValues>;
	errors: FieldErrors<StaffUserEditValues>;
	isSubmitting: boolean;
	profileOptions: ReturnType<typeof buildStaffProfileOptions>;
	hasNoServerProfileRows: boolean;
	isProfileSearchSettled: boolean;
	deferredProfileSearch: string;
	profileSearch: string;
	setProfileSearch: Dispatch<SetStateAction<string>>;
	hasLoadedProfiles: boolean;
};

export const useEditFormData = (userId: string): UseEditFormDataReturn => {
	const { t } = useTranslation(['staff-users', 'common']);
	const [profileSearch, setProfileSearch] = useState('');
	const deferredProfileSearch = useDeferredValue(profileSearch.trim());
	const isProfileSearchSettled = profileSearch.trim() === deferredProfileSearch;
	const knownProfileNamesRef = useRef(new Map<string, string>());

	const detailsQuery = useStaffUserDetailsQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);
	const assignedProfilesQuery = useStaffUserProfilesQuery(
		{ userId },
		{ enabled: userId.length > 0 },
	);
	const profilePagination = useCursorPagination({
		sortId: 'name',
		sortOrder: 'asc',
		size: PROFILE_PAGE_SIZE,
		scopeKey: `${userId}:${deferredProfileSearch}`,
	});
	const profilesQuery = useStaffProfilesQuery({
		limit: PROFILE_PAGE_SIZE,
		sortId: 'name',
		sortOrder: 'asc',
		q: deferredProfileSearch || undefined,
		cursor: profilePagination.cursor,
	});
	// Render-safe "catalogue has loaded" gate (#1314): plain state seeded from
	// the query's initial status and adjusted during render when the query
	// resolves — the sanctioned derived-state pattern, never a ref read
	// during render (react/refs).
	const [hasLoadedProfiles, setHasLoadedProfiles] = useState(
		profilesQuery.isSuccess,
	);
	if (profilesQuery.isSuccess && !hasLoadedProfiles) {
		setHasLoadedProfiles(true);
	}
	const hasNoServerProfileRows = profilesQuery.data?.data?.length === 0;
	const user = useMemo(
		() => toStaffUserDetails(detailsQuery.data),
		[detailsQuery.data],
	);
	const assignedProfiles = useMemo(
		() => toAssignedStaffProfiles(assignedProfilesQuery.data),
		[assignedProfilesQuery.data],
	);
	const staffUserEditSchema = useMemo(() => getStaffUserEditSchema(t), [t]);
	const methods = useForm<StaffUserEditValues>({
		resolver: zodResolver(staffUserEditSchema),
		defaultValues: {
			firstName: '',
			lastName: '',
			avatarUrl: '',
			email: '',
			accountLevel: 'User',
			status: 'Active',
			profileIds: [],
		},
	});
	const { formState, reset } = methods;
	const { errors, isSubmitting } = formState;
	const watchedProfileIds = useWatch({
		control: methods.control,
		name: 'profileIds',
	});
	const selectedProfileIds = collectSelectedProfileIds([watchedProfileIds]);
	const knownProfileNames = new Map(knownProfileNamesRef.current);
	rememberStaffProfileNames(knownProfileNames, assignedProfiles);
	rememberStaffProfileNames(knownProfileNames, profilesQuery.data?.data);
	const profileOptions = buildStaffProfileOptions({
		profiles: profilesQuery.data?.data,
		selectedProfileIds,
		knownProfileNames,
		includeDescriptions: true,
	});
	const hydratedUserIdRef = useRef<string | null>(null);

	useEffect(() => {
		rememberStaffProfileNames(
			knownProfileNamesRef.current,
			profilesQuery.data?.data,
		);
	}, [profilesQuery.data]);

	useEffect(() => {
		rememberStaffProfileNames(knownProfileNamesRef.current, assignedProfiles);
	}, [assignedProfiles]);

	useEffect(() => {
		if (
			!user ||
			!detailsQuery.isSuccess ||
			!assignedProfilesQuery.isSuccess ||
			assignedProfilesQuery.data === undefined
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
			accountLevel: normalizeAccountLevel(user.accountLevel),
			status: normalizeStatus(user.status),
			profileIds: assignedProfiles.map((profile) => profile.id),
		};
		reset(nextValues);
		hydratedUserIdRef.current = userId;
		// Pristine-truth snapshot for the nav guard, kept in lockstep with the
		// reset above. A fresh hydration also invalidates any saved snapshot
		// left over from a previous visit: the server state it described may
		// have diverged since (#1314-r1).
		rememberPristineStaffUserEditValues(userId, nextValues);
	}, [
		assignedProfiles,
		formState.isDirty,
		reset,
		user,
		userId,
		detailsQuery.isSuccess,
		assignedProfilesQuery.isSuccess,
		assignedProfilesQuery.data,
	]);

	return {
		detailsQuery,
		assignedProfilesQuery,
		profilesQuery,
		profilePagination,
		user,
		methods,
		formState,
		errors,
		isSubmitting,
		profileOptions,
		hasNoServerProfileRows,
		isProfileSearchSettled,
		deferredProfileSearch,
		profileSearch,
		setProfileSearch,
		hasLoadedProfiles,
	};
};
