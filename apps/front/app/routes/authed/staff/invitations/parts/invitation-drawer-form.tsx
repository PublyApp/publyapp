import DrawerAnchor from '@/front/components/drawer-anchor';
import { Field, Form } from '@/front/components/hook-form';
import { Iconify } from '@/front/components/iconify/iconify';
import { useSyncFormToLang } from '@/front/hooks/use-sync-form-to-lang';
import { useTranslate } from '@/front/hooks/use-translate';
import { defaultZodClient } from '@/front/lib/zod/zod.client';
import { logger } from '@/shared/lib/logger/iso-logger';
import { getCreateInvitationSchema } from '@/shared/validations/invitation.validations';
import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Checkbox from '@mui/material/Checkbox';
import Chip from '@mui/material/Chip';
import DialogTitle from '@mui/material/DialogTitle';
import Drawer from '@mui/material/Drawer';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import _ from 'lodash';
import { useForm } from 'react-hook-form';
import { v7 as uuidv7 } from 'uuid';
import type z from 'zod';

type ProfileOption = {
	value: string;
	label: string;
};

type Props = {
	open: boolean;
	onClose: () => void;
};

type CreateInvitationForm = z.infer<
	ReturnType<typeof getCreateInvitationSchema>
>;

const InvitationDrawerForm = ({ open, onClose }: Props) => {
	const createInvitationSchema = getCreateInvitationSchema(defaultZodClient);

	const { t, i18n } = useTranslate();
	const form = useForm<CreateInvitationForm>({
		resolver: zodResolver(createInvitationSchema),
		defaultValues: {
			email: '',
			profileIds: [],
		},
	});
	useSyncFormToLang(i18n.language, form);

	return (
		<Drawer
			open={open}
			onClose={onClose}
			anchor="right"
			sx={(theme) => {
				return {
					zIndex: theme.zIndex.modal + 1,
				};
			}}
			slotProps={{
				paper: {
					sx: {
						width: 720,
						overflow: 'unset',
					},
				},
			}}
		>
			<DrawerAnchor onClick={onClose}>
				<Iconify icon="mingcute:close-line" />
			</DrawerAnchor>
			<Box sx={{ p: 2 }}>
				{/* Form Head */}
				<Box>
					<DialogTitle>{t('staff-invite-staff-member')}</DialogTitle>
					<Typography
						variant="body2"
						color="text.secondary"
						sx={{ px: 3, pb: 6 }}
					>
						{t('staff-invite-staff-description')}
					</Typography>
				</Box>

				{/* Form Body */}
				<Form
					methods={form}
					slotProps={{
						form: {
							sx: { px: 3, gap: 3, display: 'flex', flexDirection: 'column' },
						},
					}}
				>
					<Field.Text name="email" label={t('email-address')} fullWidth />

					<Field.Autocomplete<ProfileOption>
						name="profileIds"
						fullWidth
						multiple
						options={profilesOptions}
						getOptionLabel={(option) => {
							// Handle both object and string (ID) values
							if (typeof option === 'string') {
								const found = profilesOptions.find((p) => p.value === option);
								return found?.label || option;
							}
							return option.label;
						}}
						isOptionEqualToValue={(option, value) => {
							const optionId =
								typeof option === 'string' ? option : option.value;
							const valueId = typeof value === 'string' ? value : value.value;
							return optionId === valueId;
						}}
						value={
							// Convert stored IDs back to ProfileOption objects for display
							(_.chain(form.watch('profileIds'))
								.map(
									(id: string) =>
										profilesOptions.find(
											(p) => p.value === id,
										) as ProfileOption,
								)
								.filter(Boolean)
								.value() as ProfileOption[]) || []
						}
						onChange={(_event, newValue) => {
							// Store only IDs, not full objects
							const ids = (newValue as ProfileOption[]).map((option) =>
								typeof option === 'string' ? option : option.value,
							);
							form.setValue('profileIds', ids, { shouldValidate: true });
						}}
						slotProps={{
							popper: {
								sx: (theme) => ({
									zIndex: theme.zIndex.modal + 2,
								}),
							},
						}}
						renderInput={(params) => {
							return (
								<TextField
									{...params}
									error={!!form.formState.errors.profileIds}
									helperText={form.formState.errors.profileIds?.message}
									label={t('profiles')}
									placeholder={t('select-profiles')}
								/>
							);
						}}
						renderOption={(props, option, { selected }) => {
							return (
								<li {...props} key={option.value}>
									<Checkbox
										key={option.value}
										size="small"
										disableRipple
										checked={selected}
										slotProps={{
											input: {
												id: `${option.label}-checkbox`,
												'aria-label': `${option.label} checkbox`,
											},
										}}
									/>
									{option.label}
								</li>
							);
						}}
						renderValue={(value, getItemProps) => {
							return _.map(
								value as ProfileOption[],
								(option, index: number) => (
									<Chip
										{...getItemProps({ index })}
										key={option.value}
										label={option.label}
										size="small"
										variant="soft"
									/>
								),
							);
						}}
					/>

					<Button
						onClick={form.handleSubmit(onSubmit, () => {
							logger.debug('onSubmit error', { errors: form.formState.errors });
						})}
						disabled={form.formState.isSubmitting}
						loading={form.formState.isSubmitting}
						variant="contained"
						type="submit"
						fullWidth
						size="large"
					>
						{t('send-invitation')}
					</Button>
				</Form>
			</Box>
		</Drawer>
	);
};

export default InvitationDrawerForm;

const profilesOptions: ProfileOption[] = Array.from(
	{ length: 20 },
	(_, index) => ({
		value: uuidv7(),
		label: `Profile ${index + 1}`,
	}),
);

const onSubmit = (data: CreateInvitationForm) => {
	logger.debug('onSubmit', { data });
};
