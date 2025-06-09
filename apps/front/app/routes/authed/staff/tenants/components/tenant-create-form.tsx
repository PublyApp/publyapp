import { zodResolver } from '@hookform/resolvers/zod';
import { useFieldArray, useForm } from 'react-hook-form';
import type zod from 'zod';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Typography from '@mui/material/Typography';
import Tooltip from '@mui/material/Tooltip';
import { Form } from '@/front/components/hook-form/form-provider';
import { Field } from '@/front/components/hook-form/fields';
import { fData } from '@/front/utils/format-number';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import { getNewTenantSchemaClientSide } from '@org/shared/validations/tenant/tenant-client.validations';
import { useTranslate } from '@/front/hooks/use-translate';
import { useCallback, useEffect, useMemo } from 'react';
import { useMainStore } from '@/front/lib/zustand/store';
import { mbToBytes } from '@/shared/utils/any.utils';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import _ from 'lodash';
import {
	DEFAULT_MAX_USER_PER_TENANT,
	FRONT_PATH_NAMES,
	tenantSubRoleEnum,
	type TenantSubRole,
} from '@/shared/lib/constants';
import { Iconify } from '@/front/components/iconify/iconify';
import { FieldContainer } from '@/front/components/form-extras';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import { HelperText } from '@/front/components/hook-form/help-text';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import { useRouter } from '@/front/hooks/use-router';
import { useBoolean } from 'minimal-shared/hooks';
import { nanoid } from 'nanoid';
import { useCreateTenant } from '@/front/lib/react-query/features/tenant/tenant.hooks';
import { toast } from '@/front/components/snackbar';

// ----------------------------------------------------------------------

type NewTenantSchemaType = zod.infer<
	ReturnType<typeof getNewTenantSchemaClientSide>
>;

// ----------------------------------------------------------------------

const ROLE_OPTIONS = _.chain(tenantSubRoleEnum)
	.map((value) => {
		return {
			value: value,
			label: value,
		};
	})
	.value();

const initialUserValue = {
	email: '',
	role: tenantSubRoleEnum.ADMIN,
};

const defaultValues = {
	name: '',
	maxUsers: DEFAULT_MAX_USER_PER_TENANT,
	logo: undefined,
	initialUsers: [initialUserValue],
} satisfies NewTenantSchemaType;

export const TenantCreateForm = () => {
	const { t } = useTranslate();
	const router = useRouter();
	const openDialog = useBoolean();

	const NewTenantSchema = getNewTenantSchemaClientSide(defaultZodClient);

	const methods = useForm<NewTenantSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewTenantSchema),
		defaultValues,
	});

	const {
		reset,
		handleSubmit,
		formState: { isSubmitting, errors },
		control,
	} = methods;

	const { fields, append, remove, update } = useFieldArray({
		control,
		name: 'initialUsers',
	});

	const { mutate: createTenant } = useCreateTenant({
		onSuccess: () => {
			reset();
			toast.success(
				_.capitalize(t('item-creation-success-message', { item: t('tenant') })),
			);
			router.push(FRONT_PATH_NAMES.staff.tenants.root);
		},
		onError: (error) => {
			console.error('❌❌❌❌❌❌❌❌❌❌❌❌❌❌❌', error);
			toast.error(error.message);
		},
	});

	const handleConfirmDialog = useCallback(
		(e?: React.BaseSyntheticEvent) => {
			const handler = handleSubmit(async (data) => {
				createTenant(data);
			});

			return handler(e);
		},
		[handleSubmit, createTenant],
	);

	const handleOpenDialog = useCallback(
		(e?: React.BaseSyntheticEvent) => {
			const handler = handleSubmit(async () => {
				openDialog.onTrue();
			});

			return handler(e);
		},
		[handleSubmit, openDialog.onTrue],
	);

	useEffect(() => {
		useMainStore.setState((root) => {
			root.tenantsSlice.createTenantForm.submit =
				/* submitNewTenant */ handleOpenDialog;
			root.tenantsSlice.createTenantForm.isSubmitting = isSubmitting;
		});

		return () => {
			const defaultSliceValues =
				useMainStore.getInitialState().tenantsSlice.createTenantForm;
			useMainStore.setState((root) => {
				root.tenantsSlice.createTenantForm.submit = defaultSliceValues.submit;
				root.tenantsSlice.createTenantForm.isSubmitting =
					defaultSliceValues.isSubmitting;
			});
		};
	}, [isSubmitting, handleOpenDialog]);

	const handleCloseDialog = openDialog.onFalse;

	const values = methods.getValues();

	const renderConfirmValues = useMemo(() => {
		return _.chain(values)
			.entries()
			.map((value) => {
				const [key, fieldValue] = value;

				if (key === 'initialUsers') {
					let values = null;
					if (_.isArray(fieldValue)) {
						values = _.map(fieldValue, (value) => {
							return (
								<Typography key={`${value.email}_${value.role}`} sx={{ mb: 1 }}>
									&nbsp;&nbsp;&nbsp;&nbsp;- {value.email} / {value.role}
								</Typography>
							);
						});
					}
					return (
						<Box key={key} sx={{ mb: 1 }}>
							<Typography fontWeight="bold">{t('initial-users')}</Typography>
							{values}
						</Box>
					);
				}

				if (key === 'logo') {
					let value = 'N/A';
					if (fieldValue instanceof File) {
						value = fieldValue.name;
					}
					return (
						<Typography key={key} sx={{ mb: 1 }}>
							<Box component="span" sx={{ fontWeight: 'bold' }}>
								{t('logo')}
							</Box>
							: {value}
						</Typography>
					);
				}

				if (key === 'maxUsers') {
					let value = 'N/A';
					if (!_.isNil(fieldValue)) {
						value = _.toString(fieldValue);
					}
					return (
						<Typography key={key} sx={{ mb: 1 }}>
							<Box component="span" sx={{ fontWeight: 'bold' }}>
								{t('max-users')}
							</Box>
							: {value}
						</Typography>
					);
				}

				if (key === 'name') {
					let value = 'N/A';
					if (!_.isNil(fieldValue)) {
						value = _.toString(fieldValue);
					}
					return (
						<Typography key={key} sx={{ mb: 1 }}>
							<Box component="span" sx={{ fontWeight: 'bold' }}>
								{t('name')}
							</Box>
							: {value}
						</Typography>
					);
				}

				return (
					<Typography key={nanoid()} sx={{ mb: 1 }}>
						<Box component="span" sx={{ fontWeight: 'bold' }}>
							unhandled
						</Box>
						: unhandled
					</Typography>
				);
			})
			.value();
	}, [values, t]);

	const handleAddUserToForm = () => {
		append({
			email: '',
			role: _.isEmpty(fields)
				? tenantSubRoleEnum.ADMIN
				: tenantSubRoleEnum.CONTRIBUTOR,
		});
	};

	return (
		<>
			<Form methods={methods} onSubmit={handleOpenDialog}>
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

						<Box>
							{errors.initialUsers?.root?.message ? (
								<HelperText
									error
									errorMessage={errors.initialUsers?.root?.message}
									sx={{ mb: 1 }}
								/>
							) : null}

							<Card
								sx={(theme) => {
									return {
										p: 3,
										'--error': theme.vars.customShadows.cardErrorOutline,
										'--normal': theme.vars.customShadows.card,
										boxShadow: 'var(--shadow-card)',
									};
								}}
								style={{
									['--shadow-card' as string]: errors.initialUsers?.root
										? 'var(--error)'
										: 'var(--normal)',
								}}
							>
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
									{_.map(fields, (field, index) => {
										return (
											<UserRow
												key={field.id}
												remove={remove}
												update={update}
												index={index}
												fields={fields}
												hasError={!!errors.initialUsers?.[index]}
											/>
										);
									})}
								</Box>

								<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
									<Tooltip
										title={t('max-users-reached')}
										disableHoverListener={!(fields.length >= values.maxUsers)}
										placement="top"
									>
										<span>
											<Button
												variant="contained"
												onClick={handleAddUserToForm}
												disabled={fields.length >= values.maxUsers}
											>
												{_.capitalize(t('add-a-user'))}
											</Button>
										</span>
									</Tooltip>
								</Stack>
							</Card>
						</Box>
					</Grid>
				</Grid>
			</Form>

			<Dialog open={openDialog.value} onClose={handleCloseDialog}>
				<DialogTitle>
					{_.capitalize(
						t('save-item-confirmation-title', { item: t('tenant') }),
					)}
				</DialogTitle>

				<DialogContent sx={{ color: 'text.secondary' }}>
					<Typography sx={{ mb: 2 }}>
						{_.capitalize(
							t('save-item-confirmation-message', { item: t('tenant') }),
						)}
					</Typography>
					{renderConfirmValues}
					{/* {confirmValues.map((value) => {
						return (
							<Typography key={value.name} sx={{ mb: 1 }}>
								<Box component="span" sx={{ fontWeight: 'bold' }}>
									{value.name}
								</Box>
								: {value.value}
							</Typography>
						);
					})} */}
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
			</Dialog>
		</>
	);
};

type UserRowProps = {
	index: number;
	remove: (index: number) => void;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	update: (index: number, value: any) => void;
	fields: { email: string; role: TenantSubRole }[];
	hasError: boolean;
};

const UserRow = ({ index, remove, fields, hasError, update }: UserRowProps) => {
	const { t } = useTranslate();

	const handleRemoveUserRow = () => {
		remove(index);
	};

	const handleChangeRole = useCallback(
		(e: React.ChangeEvent<{ value: unknown }>) => {
			const value = e.target.value;
			update(index, {
				...fields[index],
				role: value as TenantSubRole,
			});
		},
		[fields, index, update],
	);

	const isAdmin = _.get(fields, `${index}.role`) === tenantSubRoleEnum.ADMIN;
	const adminsList = _.filter(fields, (field) => {
		return field.role === tenantSubRoleEnum.ADMIN;
	});
	const isTheOnlyAdmin = isAdmin && adminsList.length === 1;

	return (
		<>
			<Field.Text
				name={`initialUsers.${index}.email`}
				label={t('email-address')}
				required
			/>

			<Tooltip
				title={t('tenant-should-have-at-least-one-admin')}
				placement="top"
				disableHoverListener={!isTheOnlyAdmin}
			>
				<span>
					<Field.Select
						name={`initialUsers.${index}.role`}
						label={t('role')}
						required
						onChange={handleChangeRole}
						disabled={isTheOnlyAdmin}
					>
						{ROLE_OPTIONS.map((option) => (
							<MenuItem key={option.value} value={option.label}>
								{option.label}
							</MenuItem>
						))}
					</Field.Select>
				</span>
			</Tooltip>

			{/* <Box
				sx={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					marginTop: 'var(--var-margin-top)',
				}}
				style={{
					['--var-margin-top' as string]: hasError ? '-50%' : 0,
				}}
			>
				<IconButton size="medium">
					<Iconify icon="eva:done-all-fill" />
					<Iconify icon="eva:checkmark-fill" />
				</IconButton>
			</Box> */}

			<Box
				sx={{
					display: 'flex',
					flexDirection: 'column',
					alignItems: 'center',
					justifyContent: 'center',
					marginTop: 'var(--var-margin-top)',
				}}
				style={{
					['--var-margin-top' as string]: hasError ? '-50%' : 0,
				}}
			>
				<Tooltip
					title={t('tenant-should-have-at-least-one-admin')}
					placement="top"
					disableHoverListener={!isTheOnlyAdmin}
				>
					<span>
						<IconButton
							size="medium"
							color="error"
							onClick={handleRemoveUserRow}
							disabled={isTheOnlyAdmin}
						>
							<Iconify icon="solar:trash-bin-trash-bold" />
						</IconButton>
					</span>
				</Tooltip>
			</Box>
		</>
	);
};
