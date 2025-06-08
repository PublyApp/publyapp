import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type zod from 'zod';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import { Form } from '@/front/components/hook-form/form-provider';
import { Field } from '@/front/components/hook-form/fields';
import { fData } from '@/front/utils/format-number';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import { getNewTenantSchemaClientSide } from '@org/shared/validations/tenant/tenant-client.validations';
import { useTranslate } from '@/front/hooks/use-translate';
import { useCallback, useEffect } from 'react';
import { useMainStore } from '@/front/lib/zustand/store';
import { mbToBytes, sleep } from '@/shared/utils/any.utils';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import _ from 'lodash';
import {
	DEFAULT_MAX_USER_PER_TENANT,
	tenantSubRoleEnum,
} from '@/shared/lib/constants';
import { Iconify } from '@/front/components/iconify/iconify';
import { FieldContainer } from '@/front/components/form-extras';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';

// ----------------------------------------------------------------------

type NewTenantSchemaType = zod.infer<
	ReturnType<typeof getNewTenantSchemaClientSide>
>;

// ----------------------------------------------------------------------

const ROLE_OPTIONS = _.chain(tenantSubRoleEnum)
	// .pickBy((value) => {
	// 	return _.startsWith(value.name, 'STAFF_');
	// })
	.map((value) => {
		return {
			value: value,
			label: value,
		};
	})
	.value();

const defaultValues = {
	logo: undefined,
	name: '',
	initialUsers: [
		{
			email: '',
			role: tenantSubRoleEnum.CONTRIBUTOR,
		},
	],
	maxUsers: DEFAULT_MAX_USER_PER_TENANT,
} satisfies NewTenantSchemaType;

export const TenantCreateForm = () => {
	const { t } = useTranslate();
	// const router = useRouter();
	// const openDialog = useBoolean();

	const NewTenantSchema = getNewTenantSchemaClientSide(defaultZodClient);

	const methods = useForm<NewTenantSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewTenantSchema),
		defaultValues,
	});

	const {
		// reset,
		handleSubmit,
		formState: { isSubmitting, errors },
	} = methods;

	const /* handleConfirmDialog */ submitNewTenant = useCallback(
			(e?: React.BaseSyntheticEvent) => {
				const handler = handleSubmit(
					async (data) => {
						console.log('🎯🎯🎯🎯', data);
						await sleep(3000);
						// try {
						// 	// const formData = new FormData();
						// 	// _.entries(data).forEach((value) => {
						// 	// 	const [key, fieldValue] = value;
						// 	// 	formData.append(key, fieldValue);
						// 	// });
						// 	// // console.log('***********', defaultApiClient.parseRestClient.getSessionToken());
						// 	// await defaultApiClient.parseRestClient.cloudRun(
						// 	// 	functionName.staff.staffMember.create,
						// 	// 	{
						// 	// 		params: formData,
						// 	// 		headers: {
						// 	// 			'Content-Type': 'multipart/form-data',
						// 	// 			// 'Authorization': `Bearer ${defaultApiClient.parseRestClient.getSessionToken()}`,
						// 	// 		},
						// 	// 	},
						// 	// );

						// 	// reset();
						// 	// toast.success(currentUser ? 'Update success!' : 'Create success!');
						// 	// router.push(FRONT_PATH_NAMES.staff.tenants.root);
						// } catch (error) {
						// 	// console.error(error);
						// }
					},
					(error) => {
						console.error('❌❌❌❌❌', error);
					},
				);

				return handler(e);
			},
			[handleSubmit /* , reset, router */],
		);

	// ***********************************
	useEffect(() => {
		useMainStore.setState((root) => {
			root.tenantsSlice.createTenantForm.submit = submitNewTenant;
			root.tenantsSlice.createTenantForm.isSubmitting = isSubmitting;
		});

		// return () => {
		// 	const defaultSliceValues =
		// 		useMainStore.getInitialState().tenantsSlice.createTenantForm;
		// 	useMainStore.setState((root) => {
		// 		root.tenantsSlice.createTenantForm.submit = defaultSliceValues.submit;
		// 		root.tenantsSlice.createTenantForm.isSubmitting =
		// 			defaultSliceValues.isSubmitting;
		// 	});
		// };
	}, [isSubmitting, submitNewTenant]);

	useEffect(() => {
		return () => {
			const defaultSliceValues =
				useMainStore.getInitialState().tenantsSlice.createTenantForm;
			useMainStore.setState((root) => {
				root.tenantsSlice.createTenantForm.submit = defaultSliceValues.submit;
				root.tenantsSlice.createTenantForm.isSubmitting =
					defaultSliceValues.isSubmitting;
			});
		};
	}, []);
	// ***********************************

	// const handleCloseDialog = openDialog.onFalse;

	// const handleOpenDialog = handleSubmit(async () => {
	// 	try {
	// 		openDialog.onTrue();
	// 	} catch (error) {
	// 		console.error(error);
	// 	}
	// });

	// const confirmValues = _.chain(methods.getValues())
	// 	.entries()
	// 	.map((value) => {
	// 		const [key, fieldValue] = value;
	// 		let finalValue = '';
	// 		if (_.isNil(fieldValue) || _.isEmpty(fieldValue)) {
	// 			finalValue = 'N/A';
	// 		} else {
	// 			finalValue = _.isString(fieldValue)
	// 				? fieldValue
	// 				: JSON.stringify(fieldValue);
	// 		}
	// 		if (fieldValue instanceof File) {
	// 			finalValue = fieldValue.name;
	// 		}
	// 		return {
	// 			name: _.capitalize(t(_.toLower(key) as never)),
	// 			value: finalValue,
	// 		};
	// 	})
	// 	.value();

	return (
		<>
			<Form methods={methods} onSubmit={submitNewTenant}>
				<Grid container spacing={3}>
					<Grid size={{ xs: 12, md: 4 }}>
						<Card sx={{ pt: 10, pb: 5, px: 3 }}>
							<Box sx={{ mb: 5 }}>
								<Field.UploadAvatar
									name="logo"
									maxSize={3145728}
									helperText={
										<Typography
											variant="caption"
											sx={{
												mt: 3,
												mx: 'auto',
												display: 'block',
												textAlign: 'center',
												color: 'text.disabled',
											}}
										>
											Allowed *.jpeg, *.jpg, *.png, *.gif
											<br /> max size of {fData(mbToBytes(3))}
										</Typography>
									}
								/>
							</Box>
						</Card>
					</Grid>

					<Grid size={{ xs: 12, md: 8 }}>
						<Card sx={{ p: 3, mb: 5 }}>
							<Box
								sx={{
									rowGap: 3,
									columnGap: 2,
									display: 'grid',
									gridTemplateColumns: {
										xs: 'repeat(1, 1fr)',
										sm: 'repeat(1, 2.5fr 1.5fr)',
									},
									alignItems: 'flex-start',
								}}
							>
								<Field.Text name="name" label={t('workspace-name')} required />

								<FieldContainer
									label={t('max-users')}
									sx={{ alignItems: 'flex-start' }}
								>
									<Field.NumberInput
										name="maxUsers"
										disabled
										sx={{
											maxWidth: 120,
										}}
									/>
								</FieldContainer>
							</Box>
						</Card>

						<Card sx={{ p: 3 }}>
							<Box
								sx={{
									rowGap: 3,
									columnGap: 2,
									display: 'grid',
									gridTemplateColumns: {
										xs: 'repeat(1, 4fr 1.5fr 0.25fr)',
									},
								}}
							>
								<Field.Text
									name="initialUsers.0.email"
									label={t('email-address')}
									required
								/>

								<Field.Select
									name="initialUsers.0.role"
									label={t('role')}
									required
									// defaultValue={tenantSubRoleEnum.CONTRIBUTOR}
								>
									{ROLE_OPTIONS.map((option) => (
										<MenuItem key={option.value} value={option.label}>
											{option.label}
										</MenuItem>
									))}
								</Field.Select>

								<Box
									sx={{
										display: 'flex',
										alignItems: 'start',
										justifyContent: 'center',
									}}
								>
									<IconButton size="large">
										{/* <Iconify icon="eva:done-all-fill" /> */}
										<Iconify icon="eva:checkmark-fill" />
									</IconButton>
								</Box>
							</Box>

							<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
								<Button type="submit" variant="contained">
									{_.capitalize(t('add-a-user'))}
								</Button>
							</Stack>
						</Card>
					</Grid>
				</Grid>
			</Form>

			{/* <Dialog open={openDialog.value} onClose={handleCloseDialog}>
				<DialogTitle>
					{_.capitalize(
						t('save-item-confirmation-title', { item: t('staff-member') }),
					)}
				</DialogTitle>

				<DialogContent sx={{ color: 'text.secondary' }}>
					<Typography sx={{ mb: 2 }}>
						{_.capitalize(
							t('save-item-confirmation-message', { item: t('staff-member') }),
						)}
					</Typography>
					{confirmValues.map((value) => {
						return (
							<Typography key={value.name} sx={{ mb: 1 }}>
								<Box component="span" sx={{ fontWeight: 'bold' }}>
									{value.name}
								</Box>
								: {value.value}
							</Typography>
						);
					})}
				</DialogContent>

				<DialogActions>
					<Button variant="outlined" onClick={handleCloseDialog}>
						{t('cancel')}
					</Button>
					<Button
						variant="contained"
						onClick={handleConfirmDialog}
						autoFocus
						loading={isSubmitting}
					>
						{t('confirm')}
					</Button>
				</DialogActions>
			</Dialog> */}
		</>
	);
};
