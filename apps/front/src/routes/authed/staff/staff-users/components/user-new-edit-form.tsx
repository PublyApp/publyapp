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
import _ from 'lodash';
import { useBoolean } from 'minimal-shared/hooks';
import type { UseFormReturn } from 'react-hook-form';

import { ACCOUNT_LEVEL_ENUM } from '@org/shared-ts/lib/constants';
import { mbToBytes } from '@org/shared-ts/utils/any.utils';
import { Field } from '#app/components/hook-form/fields.tsx';
import { Form } from '#app/components/hook-form/form-provider.tsx';
import { useTranslate } from '#app/hooks/use-translate.ts';
import { fData } from '#app/utils/format-number.ts';

// ----------------------------------------------------------------------

type Props<T extends Record<string, unknown>> = {
	form: UseFormReturn<T>;
	onMutate: (data: T) => void;
	isMutating: boolean;
	isEdit?: boolean;
};

const ACCOUNT_LEVEL_OPTIONS = _.values(ACCOUNT_LEVEL_ENUM);

export const UserNewEditForm = <T extends Record<string, unknown>>({
	onMutate,
	isMutating,
	form,
	isEdit,
}: Props<T>) => {
	const { t } = useTranslate();
	const openDialog = useBoolean();

	const handleCloseDialog = openDialog.onFalse;

	const handleOpenDialog = form.handleSubmit(async () => {
		openDialog.onTrue();
	});

	const handleConfirmDialog = form.handleSubmit(async (data) => {
		onMutate?.(data);
	});

	const confirmValues = _.chain(form.getValues())
		.entries()
		.map((value) => {
			const [key, fieldValue] = value;
			let finalValue = '';
			if (_.isNil(fieldValue) || _.isEmpty(fieldValue)) {
				finalValue = 'N/A';
			} else {
				if (_.isObject(fieldValue)) {
					finalValue = JSON.stringify(fieldValue);
				} else {
					finalValue = _.toString(fieldValue);
				}
			}
			if (_.isBoolean(fieldValue)) {
				finalValue = fieldValue ? t('yes') : t('no');
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

	const isSubmitting = form.formState.isSubmitting;

	return (
		<>
			<Form methods={form} onSubmit={handleOpenDialog}>
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
								}}
							>
								<Field.Text name="lastName" label={t('lastname')} required />
								<Field.Text name="firstName" label={t('firstname')} />
								<Stack direction="row" spacing={2}>
									<Field.Text
										name="email"
										label={t('email-address')}
										required
									/>
									{!isEdit ? (
										<Field.Switch
											name="sendNotification"
											label={t('send-notification')}
											slotProps={{
												wrapper: { sx: { whiteSpace: 'nowrap' } },
											}}
										/>
									) : null}
								</Stack>
								<Field.Select name="accountLevel" label={t('level')} required>
									{ACCOUNT_LEVEL_OPTIONS.map((option) => (
										<MenuItem key={option} value={option}>
											{option}
										</MenuItem>
									))}
								</Field.Select>

								{/* <Field.Select name="role" label={t('role')} required>
									{ROLE_OPTIONS.map((option) => (
										<MenuItem key={option.value} value={option.label}>
											{option.label}
										</MenuItem>
									))}
								</Field.Select> */}
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
									loading={isSubmitting || isMutating}
								>
									{!isEdit ? t('create-user') : t('save-changes')}
								</Button>
							</Stack>
						</Card>
					</Grid>
				</Grid>
			</Form>

			<Dialog open={openDialog.value} onClose={handleCloseDialog}>
				<DialogTitle>
					{_.capitalize(
						t('save-item-confirmation-title', { item: t('staff-user') }),
					)}
				</DialogTitle>

				<DialogContent sx={{ color: 'text.secondary' }}>
					<Typography sx={{ mb: 2 }}>
						{_.capitalize(
							t('save-item-confirmation-message', { item: t('staff-user') }),
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
						disabled={isSubmitting || isMutating}
					>
						{t('cancel')}
					</Button>
					<Button
						variant="contained"
						onClick={handleConfirmDialog}
						autoFocus
						loading={isSubmitting || isMutating}
					>
						{t('confirm')}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};
