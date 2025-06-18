import { Field } from '@/front/components/hook-form/fields';
import { Form } from '@/front/components/hook-form/form-provider';
import { toast } from '@/front/components/snackbar';
import { useLanguageTriggerValidation } from '@/front/hooks/use-language-trigger-validation';
import { useRouter } from '@/front/hooks/use-router';
import { useTranslate } from '@/front/hooks/use-translate';
import { useCreateStaffMember } from '@/front/lib/react-query/features/staff-member/staff-member.hooks';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import { fData } from '@/front/utils/format-number';
import {
	FRONT_PATH_NAMES,
	type RoleName,
	roleEnum,
} from '@/shared/lib/constants';
import { mbToBytes } from '@/shared/utils/any.utils';
import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { getNewStaffMemberSchemaClientSide } from '@org/shared/validations/staff-member/staff-member-client.validations';
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';
import { useForm } from 'react-hook-form';
import type zod from 'zod';

type IUserItem = {
	id: string;
	firstName: string;
	lastName: string;
	role: RoleName;
	email: string;
	status: string;
	avatarUrl: string;
};

// ----------------------------------------------------------------------

type NewUserSchemaType = Prettify<
	zod.infer<ReturnType<typeof getNewStaffMemberSchemaClientSide>>
>;

// ----------------------------------------------------------------------

type Props = {
	currentUser?: IUserItem;
};

const ROLE_OPTIONS = _.chain(roleEnum)
	.pickBy((value) => {
		return _.startsWith(value.name, 'STAFF_');
	})
	.map((value) => {
		return {
			value: value.name,
			label: value.name,
		};
	})
	.value();

const defaultValues: NewUserSchemaType = {
	avatar: undefined,
	firstName: '',
	lastName: '',
	email: '',
	role: roleEnum.STAFF_CONTRIBUTOR.name,
};

export const UserNewEditForm = ({ currentUser }: Props) => {
	const { t, i18n } = useTranslate();
	const router = useRouter();
	const openDialog = useBoolean();

	const NewUserSchema = getNewStaffMemberSchemaClientSide(defaultZodClient);

	const methods = useForm<NewUserSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewUserSchema),
		defaultValues,
		values: currentUser,
	});

	const {
		reset,
		handleSubmit,
		formState: { isSubmitting },
	} = methods;

	useLanguageTriggerValidation(i18n.language, methods);

	const handleCloseDialog = openDialog.onFalse;

	const handleOpenDialog = handleSubmit(async () => {
		openDialog.onTrue();
	});

	const { mutate: createStaffMember, isPending } = useCreateStaffMember({
		onSuccess: () => {
			reset();
			toast.success(
				currentUser
					? 'Update success!'
					: _.capitalize(
							t('item-creation-success-message', { item: t('staff-member') }),
						),
			);
			router.push(FRONT_PATH_NAMES.staff.staffMembers.root);
		},
		onError: (error) => {
			toast.error(error.message);
		},
	});

	const handleConfirmDialog = handleSubmit(async (data) => {
		createStaffMember(data);
	});

	const confirmValues = _.chain(methods.getValues())
		.entries()
		.map((value) => {
			const [key, fieldValue] = value;
			let finalValue = '';
			if (_.isNil(fieldValue) || _.isEmpty(fieldValue)) {
				finalValue = 'N/A';
			} else {
				finalValue = _.isString(fieldValue)
					? fieldValue
					: JSON.stringify(fieldValue);
			}
			if (fieldValue instanceof File) {
				finalValue = fieldValue.name;
			}
			return {
				name: _.capitalize(t(_.toLower(key) as never)),
				value: finalValue,
			};
		})
		.value();

	return (
		<>
			<Form methods={methods} onSubmit={handleOpenDialog}>
				<Grid container spacing={3}>
					<Grid size={{ xs: 12, md: 4 }}>
						<Card sx={{ pt: 10, pb: 5, px: 3 }}>
							{/* {currentUser && (
							<Label
								color={
									(values.status === 'active' && 'success') ||
									(values.status === 'banned' && 'error') ||
									'warning'
								}
								sx={{ position: 'absolute', top: 24, right: 24 }}
							>
								{values.status}
							</Label>
						)} */}

							<Box sx={{ mb: 5 }}>
								<Field.UploadAvatar
									name="avatar"
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

							{/* {currentUser && (
							<FormControlLabel
								labelPlacement="start"
								control={
									<Controller
										name="status"
										control={control}
										render={({ field }) => (
											<Switch
												{...field}
												checked={field.value !== 'active'}
												onChange={(event) =>
													field.onChange(
														event.target.checked ? 'banned' : 'active',
													)
												}
											/>
										)}
									/>
								}
								label={
									<>
										<Typography variant="subtitle2" sx={{ mb: 0.5 }}>
											Banned
										</Typography>
										<Typography
											variant="body2"
											sx={{ color: 'text.secondary' }}
										>
											Apply disable account
										</Typography>
									</>
								}
								sx={{
									mx: 0,
									mb: 3,
									width: 1,
									justifyContent: 'space-between',
								}}
							/>
						)} */}

							{/*<Field.Switch*/}
							{/*	name="isVerified"*/}
							{/*	labelPlacement="start"*/}
							{/*	label={*/}
							{/*		<>*/}
							{/*			<Typography variant="subtitle2" sx={{ mb: 0.5 }}>*/}
							{/*				Email verified*/}
							{/*			</Typography>*/}
							{/*			<Typography variant="body2" sx={{ color: 'text.secondary' }}>*/}
							{/*				Disabling this will automatically send the user a*/}
							{/*				verification email*/}
							{/*			</Typography>*/}
							{/*		</>*/}
							{/*	}*/}
							{/*	sx={{ mx: 0, width: 1, justifyContent: 'space-between' }}*/}
							{/*/>*/}

							{/* {currentUser && (
							<Stack
								sx={{ mt: 3, alignItems: 'center', justifyContent: 'center' }}
							>
								<Button variant="soft" color="error">
									Delete user
								</Button>
							</Stack>
						)} */}
						</Card>
					</Grid>

					<Grid size={{ xs: 12, md: 8 }}>
						<Card sx={{ p: 3 }}>
							<Box
								sx={{
									rowGap: 3,
									columnGap: 2,
									display: 'grid',
									gridTemplateColumns: {
										xs: 'repeat(1, 1fr)',
										sm: 'repeat(2, 1fr)',
									},
								}}
							>
								<Field.Text name="lastName" label={t('lastname')} required />
								<Field.Text name="firstName" label={t('firstname')} />
								<Field.Text name="email" label={t('email-address')} required />
								<br />
								<Field.Select name="role" label={t('role')} required>
									{ROLE_OPTIONS.map((option) => (
										<MenuItem key={option.value} value={option.label}>
											{option.label}
										</MenuItem>
									))}
								</Field.Select>
								{/* <Field.Phone
								name="phoneNumber"
								label="Phone number"
								country={!currentUser ? 'DE' : undefined}
							/> */}

								{/* <Field.CountrySelect
								fullWidth
								name="country"
								label="Country"
								placeholder="Choose a country"
							/> */}

								{/* <Field.Text name="state" label="State/region" /> */}
								{/* <Field.Text name="city" label="City" /> */}
								{/* <Field.Text name="address" label="Address" /> */}
								{/* <Field.Text name="zipCode" label="Zip/code" /> */}
								{/* <Field.Text name="company" label="Company" /> */}
							</Box>

							<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
								<Button
									type="submit"
									variant="contained"
									loading={isSubmitting || isPending}
								>
									{!currentUser ? 'Create user' : 'Save changes'}
								</Button>
							</Stack>
						</Card>
					</Grid>
				</Grid>
			</Form>

			<Dialog open={openDialog.value} onClose={handleCloseDialog}>
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
