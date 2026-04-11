import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import Box from '@mui/material/Box';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { useParams } from 'react-router';

import { useTranslate } from '#app/hooks/use-translate.ts';
import { Field, Form } from '#app/components/hook-form/index.ts';
import { withFormValidation } from '#app/lib/api-failure/with-form-validation.ts';
import {
	useGetStaffProfileById,
	useUpdateStaffProfile,
} from '#app/lib/react-query/features/staff/staff-profile.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';
import { getUpdateStaffProfileSchema } from '@org/shared-ts/validations/staff-profile.validations';

const StaffProfileBasicInfos = () => {
	const { t } = useTranslate();
	const queryClient = useQueryClient();
	const { profileId } = useParams();

	const profileIdStr = profileId ?? '';

	const getProfileQuery = useGetStaffProfileById({
		variables: { profileId: profileIdStr },
		enabled: !!profileIdStr,
	});

	const schema = getUpdateStaffProfileSchema(interZodClient);

	const methods = useForm({
		mode: 'onSubmit',
		resolver: zodResolver(schema),
		// We drive the form from the query result so the UI stays in sync after mutations/refetches.
		// (React Hook Form will keep user edits while dirty; values refresh after save/reset.)
		values: {
			name: getProfileQuery.data?.profile?.name ?? '',
			description: getProfileQuery.data?.profile?.description ?? '',
		},
	});

	const { mutate: updateProfile, isPending: isUpdating } =
		useUpdateStaffProfile(
			withFormValidation(methods.setError, {
				meta: { successMessage: 'staff-profile-updated-successfully' },
				onSuccess: () => {
					if (!profileIdStr) {
						return;
					}

					queryClient.invalidateQueries({
						queryKey: useGetStaffProfileById.getKey({
							profileId: profileIdStr,
						}),
					});
				},
			}),
		);

	const onSubmit = methods.handleSubmit((data) => {
		if (!profileIdStr) {
			return;
		}

		const payload: {
			profileId: string;
			name?: string;
			description?: string | null;
		} = {
			profileId: profileIdStr,
		};

		if (methods.formState.dirtyFields.name) {
			payload.name = data.name;
		}

		if (methods.formState.dirtyFields.description) {
			// `getUpdateStaffProfileSchema` maps empty string => null to clear the description via PATCH.
			payload.description = data.description as string | null | undefined;
		}

		updateProfile(payload);
	});

	return (
		<Card>
			<CardHeader
				title={t('basic-infos')}
				slotProps={{
					title: {
						component: Link,
						href: '#basic-infos',
						color: 'inherit',
						sx: {
							display: 'inline-flex',
							'&:hover': { opacity: 0.8 },
						},
					},
				}}
			/>
			<CardContent>
				<Form methods={methods} onSubmit={onSubmit}>
					<Box sx={{ rowGap: 3, columnGap: 2, display: 'grid' }}>
						<Field.Text name="name" label={t('name')} required />
						<Field.Text
							name="description"
							label={t('description')}
							multiline
							rows={4}
						/>
					</Box>

					<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
						<Button
							type="submit"
							variant="contained"
							disabled={!methods.formState.isDirty || isUpdating}
							loading={isUpdating}
						>
							{t('save-changes')}
						</Button>
					</Stack>
				</Form>
			</CardContent>
		</Card>
	);
};

export default StaffProfileBasicInfos;
