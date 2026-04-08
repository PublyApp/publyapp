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
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
	useFieldArray,
	useForm,
	type FieldArrayWithId,
	type UseFieldArrayRemove,
	type UseFormSetValue,
} from 'react-hook-form';
import type zod from 'zod';

import {
	ACCOUNT_LEVEL_ENUM,
	type AccountLevel,
	DEFAULT_MAX_USER_PER_TENANT,
	FRONT_PATH_NAMES,
} from '@org/shared-ts/lib/constants';
import { mbToBytes } from '@org/shared-ts/utils/any.utils';
import { getNewTenantSchemaClientSide } from '@org/shared-ts/validations/tenant/tenant-client.validations';

import { FieldContainer } from '#app/components/form-extras.tsx';
import { Field } from '#app/components/hook-form/fields.tsx';
import { Form } from '#app/components/hook-form/form-provider.tsx';
import { HelperText } from '#app/components/hook-form/help-text.tsx';
import { Iconify } from '#app/components/iconify/iconify.tsx';
import { toast } from '#app/components/snackbar/index.ts';
import { useRouter } from '#app/hooks/use-router.ts';
import { useSyncFormToLang } from '#app/hooks/use-sync-form-to-lang.ts';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { getFailureMessage, toApiFailure } from '#app/lib/api-failure/index.ts';
import { useCreateTenant } from '#app/lib/react-query/features/staff/staff-tenant.hooks.ts';
import { interZodClient } from '#app/lib/zod/zod.client.ts';
import { useMainStore } from '#app/lib/zustand/store.ts';
import { fData } from '#app/utils/format-number.ts';

// ----------------------------------------------------------------------

type NewTenantSchemaType = zod.infer<
	ReturnType<typeof getNewTenantSchemaClientSide>
>;

// ----------------------------------------------------------------------

const ACCOUNT_LEVEL_OPTIONS = _.chain(ACCOUNT_LEVEL_ENUM)
	.entries()
	.map((value) => {
		const [, accountLevel] = value;
		return accountLevel;
	})
	.value();

const initialUser = {
	email: '',
	accountLevel: ACCOUNT_LEVEL_ENUM.ADMIN,
};

const defaultValues = {
	name: '',
	maxUsers: DEFAULT_MAX_USER_PER_TENANT,
	logo: undefined,
	initialUsers: [initialUser],
} satisfies NewTenantSchemaType;

type ITenantItem = {
	id?: string | null;
	tenantId?: string | null;
	name?: string | null;
	maxUsers?: number | null;
	logo?: string | null;
};

type TenantCreateOrEditFormProps = {
	currentTenant?: ITenantItem;
};

type AlertMessage =
	| string
	| { key: string; params: Record<string, string> | undefined };

export const TenantCreateOrEditForm = ({
	currentTenant,
}: TenantCreateOrEditFormProps) => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const openDialog = useBoolean();

	let NewTenantSchema = getNewTenantSchemaClientSide(interZodClient, {
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
					name: currentTenant.name ?? '',
					maxUsers: currentTenant.maxUsers ?? DEFAULT_MAX_USER_PER_TENANT,
					logo: currentTenant.logo ?? undefined,
					initialUsers: [],
				}
			: undefined,
		disabled: disabledFormOnSuccess,
	});

	const {
		reset,
		handleSubmit,
		setValue,
		watch,
		formState: { isSubmitting, errors },
		control,
	} = methods;

	useSyncFormToLang(i18n.language, methods);

	const { fields, append, remove } = useFieldArray({
		control,
		name: 'initialUsers',
	});
	const initialUsers = watch('initialUsers');

	const [alertMessage, setAlertMessage] = useState<AlertMessage>();

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
			const failure = toApiFailure(error);
			setAlertMessage(getFailureMessage(failure));
			handleCloseDialog();
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
								<Typography
									key={`${value.email}_${value.accountLevel}`}
									sx={{ mb: 1 }}
								>
									&nbsp;&nbsp;&nbsp;&nbsp;- {value.email} / {value.accountLevel}
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
			accountLevel: ACCOUNT_LEVEL_ENUM.USER,
			// role: _.isEmpty(fields)
			// 	? tenantSubRoleEnum.ADMIN
			// 	: tenantSubRoleEnum.CONTRIBUTOR,
		});
	};

	return (
		<>
			<TenantFormAlert
				alertMessage={alertMessage}
				onClose={() => {
					setAlertMessage(undefined);
				}}
			/>

			<Form methods={methods} onSubmit={handleOpenDialog}>
				<Grid container spacing={3}>
					<Grid size={{ xs: 12, md: 4 }}>
						<TenantLogoCard />
					</Grid>

					<Grid size={{ xs: 12, md: 8 }}>
						<TenantFieldsCard
							editMode={editMode}
							isSubmitting={isSubmitting || isPending}
							onOpenDialog={handleOpenDialog}
						/>

						<InitialUsersCard
							editMode={editMode}
							fields={fields}
							remove={remove}
							setValue={setValue}
							initialUsers={initialUsers}
							rootErrorMessage={errors.initialUsers?.root?.message}
							hasRowError={(index) => !!errors.initialUsers?.[index]}
							maxUsers={values.maxUsers}
							onAddUser={handleAddUserToForm}
						/>
					</Grid>
				</Grid>
			</Form>

			<TenantConfirmDialog
				open={openDialog.value}
				confirmValues={renderConfirmValues}
				isSubmitting={isSubmitting || isPending}
				onClose={handleCloseDialog}
				onConfirm={handleConfirmDialog}
			/>
		</>
	);
};

type TenantFormAlertProps = {
	alertMessage: AlertMessage | undefined;
	onClose: () => void;
};

const TenantFormAlert = ({ alertMessage, onClose }: TenantFormAlertProps) => {
	const { t } = useTranslate();

	if (!alertMessage) {
		return null;
	}

	return (
		<Alert severity="error" onClose={onClose} sx={{ mb: 3 }}>
			{_.isString(alertMessage)
				? alertMessage
				: (t(
						alertMessage.key as never,
						alertMessage.params as never,
					) as unknown as string)}
		</Alert>
	);
};

const TenantLogoCard = () => {
	return (
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
	);
};

type TenantFieldsCardProps = {
	editMode: boolean;
	isSubmitting: boolean;
	onOpenDialog: (e?: React.BaseSyntheticEvent) => Promise<void>;
};

const TenantFieldsCard = ({
	editMode,
	isSubmitting,
	onOpenDialog,
}: TenantFieldsCardProps) => {
	const { t } = useTranslate();

	return (
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
						loading={isSubmitting}
						onClick={onOpenDialog}
					>
						{t('save-changes')}
					</Button>
				</Stack>
			)}
		</Card>
	);
};

type InitialUsersCardProps = {
	editMode: boolean;
	fields: FieldArrayWithId<NewTenantSchemaType, 'initialUsers'>[];
	remove: UseFieldArrayRemove;
	setValue: UseFormSetValue<NewTenantSchemaType>;
	initialUsers: UserRowType[];
	rootErrorMessage: string | undefined;
	hasRowError: (index: number) => boolean;
	maxUsers: number;
	onAddUser: () => void;
};

const InitialUsersCard = ({
	editMode,
	fields,
	remove,
	setValue,
	initialUsers,
	rootErrorMessage,
	hasRowError,
	maxUsers,
	onAddUser,
}: InitialUsersCardProps) => {
	const { t } = useTranslate();

	if (editMode) {
		return null;
	}

	return (
		<Box>
			{rootErrorMessage ? (
				<HelperText error errorMessage={rootErrorMessage} sx={{ mb: 1 }} />
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
					['--shadow-card' as string]: rootErrorMessage
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
								setValue={setValue}
								index={index}
								initialUsers={initialUsers}
								hasError={hasRowError(index)}
							/>
						);
					})}
				</Box>

				<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
					<Tooltip
						title={t('max-users-reached')}
						disableHoverListener={!(fields.length >= maxUsers)}
						placement="top"
					>
						<span>
							<Button
								variant="contained"
								onClick={onAddUser}
								disabled={fields.length >= maxUsers}
							>
								{_.capitalize(t('add-a-user'))}
							</Button>
						</span>
					</Tooltip>
				</Stack>
			</Card>
		</Box>
	);
};

type TenantConfirmDialogProps = {
	open: boolean;
	confirmValues: React.ReactNode;
	isSubmitting: boolean;
	onClose: () => void;
	onConfirm: (e?: React.BaseSyntheticEvent) => Promise<void>;
};

const TenantConfirmDialog = ({
	open,
	confirmValues,
	isSubmitting,
	onClose,
	onConfirm,
}: TenantConfirmDialogProps) => {
	const { t } = useTranslate();

	return (
		<Dialog open={open} onClose={onClose}>
			<DialogTitle>
				{_.capitalize(t('save-item-confirmation-title', { item: t('tenant') }))}
			</DialogTitle>

			<DialogContent sx={{ color: 'text.secondary' }}>
				<Typography sx={{ mb: 2 }}>
					{_.capitalize(
						t('save-item-confirmation-message', { item: t('tenant') }),
					)}
				</Typography>
				{confirmValues}
			</DialogContent>

			<DialogActions>
				<Button variant="outlined" onClick={onClose} disabled={isSubmitting}>
					{t('cancel')}
				</Button>
				<Button
					variant="contained"
					onClick={onConfirm}
					autoFocus
					loading={isSubmitting}
				>
					{t('confirm')}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

type UserRowType = { email: string; accountLevel: AccountLevel };

type UserRowProps = {
	index: number;
	remove: UseFieldArrayRemove;
	setValue: UseFormSetValue<NewTenantSchemaType>;
	initialUsers: UserRowType[];
	hasError: boolean;
};

const UserRow = ({
	index,
	remove,
	initialUsers,
	hasError,
	setValue,
}: UserRowProps) => {
	const { t } = useTranslate();

	const handleRemoveUserRow = () => {
		remove(index);
	};

	const handleChangeRole = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			const value = e.target.value as AccountLevel;
			setValue(`initialUsers.${index}.accountLevel`, value, {
				shouldDirty: true,
				shouldTouch: true,
				shouldValidate: true,
			});
		},
		[index, setValue],
	);

	const isAdmin =
		_.get(initialUsers, `${index}.accountLevel`) === ACCOUNT_LEVEL_ENUM.ADMIN;
	const adminsList = _.filter(initialUsers, (field) => {
		return field.accountLevel === ACCOUNT_LEVEL_ENUM.ADMIN;
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
						name={`initialUsers.${index}.accountLevel`}
						label={t('level')}
						required
						onChange={handleChangeRole}
						disabled={isTheOnlyAdmin}
					>
						{ACCOUNT_LEVEL_OPTIONS.map((option) => (
							<MenuItem key={option} value={option}>
								{option}
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
