import { zodResolver } from '@hookform/resolvers/zod';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import IconButton from '@mui/material/IconButton';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { getNewTenantSchemaClientSide } from '@org/shared/validations/tenant/tenant-client.validations';
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import type zod from 'zod';
// import ParseRestError from 'packages/parse-rest-client/ParseRestError';
import { FieldContainer } from '@/front/components/form-extras';
import { Field } from '@/front/components/hook-form/fields';
import { Form } from '@/front/components/hook-form/form-provider';
import { HelperText } from '@/front/components/hook-form/help-text';
import { Iconify } from '@/front/components/iconify/iconify';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { useCreateTenant } from '@/front/lib/react-query/features/tenant/tenant.hooks';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import { useMainStore } from '@/front/lib/zustand/store';
import { fData } from '@/front/utils/format-number';
import {
	DEFAULT_MAX_USER_PER_TENANT,
	FRONT_PATH_NAMES,
} from '@/shared/lib/constants';
import { mbToBytes } from '@/shared/utils/any.utils';

// ----------------------------------------------------------------------

type NewTenantSchemaType = zod.infer<
	ReturnType<typeof getNewTenantSchemaClientSide>
>;

// ----------------------------------------------------------------------

const ROLE_OPTIONS = _.chain(/* tenantSubRoleEnum */ [])
	.map((value) => {
		return {
			value: value,
			label: value,
		};
	})
	.value();

const initialUserValue = {
	email: '',
	role: /* tenantSubRoleEnum.ADMIN */ '',
};

const defaultValues = {
	name: '',
	maxUsers: DEFAULT_MAX_USER_PER_TENANT,
	logo: undefined,
	initialUsers: [initialUserValue],
} satisfies NewTenantSchemaType;

type ITenantItem = {
	id: string;
	name: string;
	maxUsers: number;
	logo: string;
};

type TenantCreateOrEditFormProps = {
	currentTenant?: ITenantItem;
};

export const TenantCreateOrEditForm = ({
	currentTenant,
}: TenantCreateOrEditFormProps) => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const openDialog = useBoolean();

	let NewTenantSchema = getNewTenantSchemaClientSide(defaultZodClient, {
		maxUsers: DEFAULT_MAX_USER_PER_TENANT,
	});

	const editMode = !!currentTenant;

	if (editMode) {
		NewTenantSchema = NewTenantSchema.omit({
			initialUsers: true,
		}) as never;
	}

	const [disabledFormOnSuccess, setDisabledFormOnSuccess] = useState(false);

	const methods = useForm<NewTenantSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewTenantSchema),
		defaultValues,
		values: currentTenant
			? {
					...currentTenant,
					initialUsers: [],
				}
			: undefined,
		disabled: disabledFormOnSuccess,
	});

	const {
		reset,
		handleSubmit,
		formState: { isSubmitting, errors },
		control,
	} = methods;

	useSyncFormToLang(i18n.language, methods);

	const { fields, append, remove, update } = useFieldArray({
		control,
		name: 'initialUsers',
	});

	const [alertMessage, setAlertMessage] = useState<
		string | { key: string; params: Record<string, string> | undefined }
	>();

	const { mutate: createTenant, isPending } = useCreateTenant({
		onSuccess: () => {
			reset();
			setDisabledFormOnSuccess(true);
			toast.success(
				_.capitalize(t('item-creation-success-message', { item: t('tenant') })),
			);
			router.push(FRONT_PATH_NAMES.staff.tenants.root);
		},
		onError: (error) => {
			// if (error instanceof ParseRestError) {
			// 	if (error.code === X_CODE.NO_STAFF_MEMBERS_ALLOWED_IN_TENANT) {
			// 		const notAllowedEmailsStr = _.map(
			// 			_.get(error.data, 'staff-member-emails', []) as string[],
			// 			(email) => {
			// 				return `'${email}'`;
			// 			},
			// 		).join(', ');
			// 		setAlertMessage({
			// 			key: X_CODE.NO_STAFF_MEMBERS_ALLOWED_IN_TENANT,
			// 			params: {
			// 				emails: notAllowedEmailsStr,
			// 			},
			// 		});
			// 	} else {
			// 		setAlertMessage(error.message);
			// 	}
			// } else {
			// 	setAlertMessage(error.message);
			// }
			setAlertMessage(error.message);
			handleCloseDialog();
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
			root.tenantsSlice.createTenantForm.submit = handleOpenDialog;
			root.tenantsSlice.createTenantForm.isSubmitting =
				isSubmitting || isPending;
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
	}, [isSubmitting, isPending, handleOpenDialog]);

	const handleCloseDialog = openDialog.onFalse;

	const values = methods.getValues();

	const renderConfirmValues = useMemo(() => {
		return _.chain(values)
			.entries()
			.map((value) => {
				const [key, fieldValue] = value;

				if (key === 'initialUsers') {
					if (editMode) {
						return null;
					}

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
	}, [values, t, editMode]);

	const handleAddUserToForm = () => {
		append({
			email: '',
			role: '',
			// role: _.isEmpty(fields)
			// 	? tenantSubRoleEnum.ADMIN
			// 	: tenantSubRoleEnum.CONTRIBUTOR,
		});
	};

	return (
		<>
			{alertMessage ? (
				<Alert
					severity="error"
					onClose={() => {
						setAlertMessage(undefined);
					}}
					sx={{ mb: 3 }}
				>
					{_.isString(alertMessage)
						? alertMessage
						: (t(
								alertMessage.key as never,
								alertMessage.params as never,
							) as unknown as string)}
				</Alert>
			) : null}

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
							{!editMode ? null : (
								<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
									<Button
										type="submit"
										variant="contained"
										loading={isSubmitting || isPending}
										onClick={handleOpenDialog}
									>
										{!editMode ? t('create-the-tenant') : t('save-changes')}
									</Button>
								</Stack>
							)}
						</Card>

						<Box>
							{errors.initialUsers?.root?.message ? (
								<HelperText
									error
									errorMessage={errors.initialUsers?.root?.message}
									sx={{ mb: 1 }}
								/>
							) : null}

							{editMode ? null : (
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
							)}
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
					<Button
						variant="outlined"
						onClick={handleCloseDialog}
						disabled={isSubmitting || isPending}
					>
						{t('cancel')}
					</Button>
					<Button
						variant="contained"
						onClick={handleConfirmDialog}
						autoFocus
						loading={isSubmitting || isPending}
					>
						{t('confirm')}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};

type UserRowType = { email: string; role: /* TenantSubRole */ any };

type UserRowProps = {
	index: number;
	remove: (index: number) => void;
	update: (index: number, value: UserRowType) => void;
	fields: UserRowType[];
	hasError: boolean;
};

const UserRow = ({ index, remove, fields, hasError, update }: UserRowProps) => {
	const { t } = useTranslate();

	const handleRemoveUserRow = () => {
		remove(index);
	};

	const handleChangeRole = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value as TenantSubRole;
			update(index, {
				...fields[index],
				role: value,
			});
		},
		[fields, index, update],
	);

	const isAdmin =
		_.get(fields, `${index}.role`) === /* tenantSubRoleEnum.ADMIN */ '';
	const adminsList = _.filter(fields, (field) => {
		return field.role === /* tenantSubRoleEnum.ADMIN */ '';
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
