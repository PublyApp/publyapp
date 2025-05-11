import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type zod from 'zod';
import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import { useRouter } from '@/front/hooks/use-router';
import { toast } from '@/front/components/snackbar';
import { FRONT_PATH_NAMES } from '@/shared/lib/constants';
import { Form } from '@/front/components/hook-form/form-provider';
import { Field } from '@/front/components/hook-form/fields';
import { fData } from '@/front/utils/format-number';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import { getNewStaffMemberSchemaClientSide } from '@org/shared/validations/staff-member/staff-member-client.validations';

export type IUserItem = {
	id: string;
	firstName: string;
	lastName: string;
	role: string;
	email: string;
	status: string;
	avatarUrl: string;
	// city: string;
	// state: string;
	// address: string;
	// country: string;
	// zipCode: string;
	// company: string;
	// phoneNumber: string;
	// isVerified: boolean;
};

// import { paths } from 'src/routes/paths';
// import { useRouter } from 'src/routes/hooks';

// import { fData } from 'src/utils/format-number';

// import { Label } from 'src/components/label';
// import { toast } from 'src/components/snackbar';
// import { Form, Field, schemaHelper } from 'src/components/hook-form';

// ----------------------------------------------------------------------

export type NewUserSchemaType = zod.infer<
	ReturnType<typeof getNewStaffMemberSchemaClientSide>
>;

// zod.object({
// 	avatarUrl: schemaHelper.file({ message: 'Avatar is required!' }),
// 	firstName: zod.string().min(1, { message: 'Name is required!' }),
// 	lastName: zod.string().min(1, { message: 'Name is required!' }),
// 	email: zod
// 		.string()
// 		.min(1, { message: 'Email is required!' })
// 		.email({ message: 'Email must be a valid email address!' }),
// 	role: zod.string().min(1, { message: 'Role is required!' }),
// });

// ----------------------------------------------------------------------

type Props = {
	currentUser?: IUserItem;
};

export const UserNewEditForm = ({ currentUser }: Props) => {
	const router = useRouter();

	const NewUserSchema = getNewStaffMemberSchemaClientSide(defaultZodClient);

	const defaultValues: NewUserSchemaType = {
		avatar: undefined,
		firstName: '',
		lastName: '',
		email: '',
		role: '',
		// status: '',
		// avatarUrl: undefined,
		// isVerified: true,
		// phoneNumber: '',
		// country: '',
		// state: '',
		// city: '',
		// address: '',
		// zipCode: '',
		// company: '',
	};

	const methods = useForm<NewUserSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(NewUserSchema),
		defaultValues,
		values: currentUser,
	});

	const {
		reset,
		// watch,
		// control,
		handleSubmit,
		formState: { isSubmitting },
	} = methods;

	// const values = watch();

	const onSubmit = handleSubmit(async (data) => {
		try {
			await new Promise((resolve) => setTimeout(resolve, 500));
			reset();
			toast.success(currentUser ? 'Update success!' : 'Create success!');
			router.push(FRONT_PATH_NAMES.staff.staffMembers.root);
			console.info('DATA', data);
		} catch (error) {
			console.error(error);
		}
	});

	return (
		<Form methods={methods} onSubmit={onSubmit}>
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
								name="avatarUrl"
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
										<br /> max size of {fData(3145728)}
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

						<Field.Switch
							name="isVerified"
							labelPlacement="start"
							label={
								<>
									<Typography variant="subtitle2" sx={{ mb: 0.5 }}>
										Email verified
									</Typography>
									<Typography variant="body2" sx={{ color: 'text.secondary' }}>
										Disabling this will automatically send the user a
										verification email
									</Typography>
								</>
							}
							sx={{ mx: 0, width: 1, justifyContent: 'space-between' }}
						/>

						{currentUser && (
							<Stack
								sx={{ mt: 3, alignItems: 'center', justifyContent: 'center' }}
							>
								<Button variant="soft" color="error">
									Delete user
								</Button>
							</Stack>
						)}
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
							<Field.Text name="name" label="Full name" />
							<Field.Text name="email" label="Email address" />
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
							<Field.Text name="role" label="Role" />
						</Box>

						<Stack sx={{ mt: 3, alignItems: 'flex-end' }}>
							<Button type="submit" variant="contained" loading={isSubmitting}>
								{!currentUser ? 'Create user' : 'Save changes'}
							</Button>
						</Stack>
					</Card>
				</Grid>
			</Grid>
		</Form>
	);
};
