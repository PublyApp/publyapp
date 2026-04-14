import Autocomplete, {
	type AutocompleteRenderGetTagProps,
} from '@mui/material/Autocomplete';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Tooltip from '@mui/material/Tooltip';
import { useQueryClient } from '@tanstack/react-query';
import capitalize from 'lodash/capitalize';
import toLower from 'lodash/toLower';
import toStr from 'lodash/toString';
import uniqBy from 'lodash/uniqBy';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';

import QueryDisplay from '#app/components/query-display.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { useFindStaffProfiles } from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import {
	useGetStaffUserProfiles,
	useUpdateStaffUserProfiles,
} from '#app/lib/react-query/features/staff/staff-user.hooks.ts';

import StaffUserProfilePreviewDrawer, {
	type StaffUserProfileOption,
} from './staff-user-profile-preview-drawer';

const StaffUserProfilesSection = ({ userId }: { userId: string }) => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();

	const [search, setSearch] = useState('');
	const [previewedProfile, setPreviewedProfile] =
		useState<StaffUserProfileOption | null>(null);
	const deferredSearch = useDeferredValue(search);

	const profilesQuery = useGetStaffUserProfiles({
		variables: { userId },
		enabled: !!userId,
	});

	const findProfilesQuery = useFindStaffProfiles({
		variables: {
			limit: 20,
			sort: { id: 'name', order: 'asc' },
			// Server-side filtering: keep client-side filtering disabled to avoid surprises.
			q: deferredSearch || undefined,
		},
		enabled: !!userId,
	});

	const { mutate: updateProfiles, isPending: isUpdating } =
		useUpdateStaffUserProfiles({
			onSuccess: () => {
				queryClient.invalidateQueries({
					queryKey: useGetStaffUserProfiles.getKey({ userId }),
				});
				toast.success(
					capitalize(t('item-update-success-message', { item: t('profiles') })),
				);
			},
			// Error toasts handled by global handler automatically
		});

	// MUI Autocomplete is sensitive to referential churn for `value`/`options`.
	// Without memoization, typing in a controlled `inputValue` can be "reset" on each
	// render because `value` changes identity even when it represents the same items.
	const assignedProfiles = useMemo<StaffUserProfileOption[]>(() => {
		return (profilesQuery.data?.assignedProfiles ?? []).map((p) => {
			return {
				id: toStr(p.id),
				name: p.name ?? '',
				description: p.description ?? null,
			};
		});
	}, [profilesQuery.data?.assignedProfiles]);

	const maxProfilesPerUser = profilesQuery.data?.maxProfilesPerUser ?? 0;

	const searchProfiles = useMemo<StaffUserProfileOption[]>(() => {
		return (findProfilesQuery.data?.data ?? []).map((p) => {
			return {
				id: toStr(p.id),
				name: p.name ?? '',
				description: p.description ?? null,
			};
		});
	}, [findProfilesQuery.data?.data]);

	const options = useMemo(() => {
		return uniqBy(
			[...assignedProfiles, ...searchProfiles].filter((p) => !!p.id),
			'id',
		);
	}, [assignedProfiles, searchProfiles]);

	const renderTags = useCallback(
		(
			value: StaffUserProfileOption[],
			getTagProps: AutocompleteRenderGetTagProps,
		) => {
			return value.map((option, index) => {
				const { key, ...tagProps } = getTagProps({ index });

				return (
					<Tooltip
						key={
							typeof key === 'string' || typeof key === 'number'
								? key
								: option.id
						}
						title={option.name}
						placement="top"
					>
						<Chip
							{...tagProps}
							label={option.name}
							onClickCapture={(event) => {
								if (
									event.target instanceof Element &&
									event.target.closest('.MuiChip-deleteIcon')
								) {
									return;
								}

								event.stopPropagation();
								setPreviewedProfile(option);
							}}
							sx={{
								maxWidth: '100%',
								minWidth: 0,
								justifyContent: 'flex-start',
								cursor: 'pointer',
								'& .MuiChip-label': {
									display: 'block',
									overflow: 'hidden',
									textOverflow: 'ellipsis',
									whiteSpace: 'nowrap',
									textAlign: 'left',
								},
							}}
						/>
					</Tooltip>
				);
			});
		},
		[],
	);

	return (
		<>
			<Card>
				<CardHeader
					title={capitalize(t('profiles'))}
					subheader={t('select-up-to-n-items', {
						count: maxProfilesPerUser,
						items: toLower(t('profiles')),
					})}
				/>
				<CardContent>
					<QueryDisplay
						query={profilesQuery}
						LoadingSlot={
							<Stack spacing={1.5} sx={{ py: 0.5 }}>
								<Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
									<Skeleton variant="rounded" width={86} height={24} />
									<Skeleton variant="rounded" width={72} height={24} />
									<Skeleton variant="rounded" width={94} height={24} />
								</Box>
								<Skeleton variant="rounded" height={56} />
							</Stack>
						}
					>
						{() => {
							return (
								<Autocomplete
									multiple
									options={options}
									value={assignedProfiles}
									renderTags={renderTags}
									loading={findProfilesQuery.isFetching}
									disabled={isUpdating}
									// Keep the search text stable when the input loses focus.
									// MUI otherwise fires `onInputChange(..., reason="reset")` on blur, which would
									// clear a controlled `inputValue` if we naively mirror it into state.
									clearOnBlur={false}
									isOptionEqualToValue={(o, v) => o.id === v.id}
									getOptionLabel={(o) => o.name || o.id}
									// Disable client-side filtering; results are already filtered by the API.
									filterOptions={(x) => x}
									onChange={(_event, newValue) => {
										if (newValue.length > maxProfilesPerUser) {
											toast.error(
												t('cannot-select-more-than-n-items', {
													count: maxProfilesPerUser,
													items: toLower(t('profiles')),
												}),
											);
											return;
										}

										// Replace-set semantics: the API endpoint expects the full desired set.
										updateProfiles({
											userId,
											profileIds: newValue.map((p) => p.id),
										});
									}}
									inputValue={search}
									onInputChange={(_event, value, reason) => {
										// Only user typing (or explicit clear) should mutate the search state.
										// Ignore "reset" (commonly emitted on blur/selection) to avoid clearing.
										if (reason === 'input' || reason === 'clear') {
											setSearch(value);
										}
									}}
									slotProps={{
										paper: {
											sx: {
												maxWidth: '100%',
											},
										},
									}}
									sx={{
										minWidth: 0,
										'& .MuiAutocomplete-inputRoot': {
											alignItems: 'flex-start',
										},
										'& .MuiAutocomplete-tag': {
											maxWidth: '100%',
										},
									}}
									renderInput={(params) => {
										return (
											<TextField
												{...params}
												label={capitalize(t('profiles'))}
												placeholder={t('search')}
												sx={{
													minWidth: 0,
													'& .MuiInputBase-root': {
														maxHeight: 160,
														overflowY: 'auto',
														overflowX: 'hidden',
													},
												}}
												InputProps={{
													...params.InputProps,
													endAdornment: (
														<>
															{findProfilesQuery.isFetching ? (
																<CircularProgress size={18} />
															) : null}
															{params.InputProps.endAdornment}
														</>
													),
												}}
											/>
										);
									}}
								/>
							);
						}}
					</QueryDisplay>
				</CardContent>
			</Card>

			<StaffUserProfilePreviewDrawer
				open={previewedProfile != null}
				onClose={() => setPreviewedProfile(null)}
				profile={previewedProfile}
			/>
		</>
	);
};

export default StaffUserProfilesSection;
