import Box from '@mui/material/Box';
import { Field, Form } from '@/front/components/hook-form';
import { useForm } from 'react-hook-form';
import { Button, Typography } from '@mui/material';
import { getTenantSchema } from '@/shared/validations/auth.validations';
import { zodResolver } from '@hookform/resolvers/zod';
import { defaultZodClient } from '@/front/lib/zod';
import { useFetcher } from 'react-router';
import type { NewTenantActionResult } from './new-tenant-page';

function TenantForm() {
	const fetcher = useFetcher<NewTenantActionResult>();

	const methods = useForm({
		resolver: zodResolver(getTenantSchema(defaultZodClient)),
		defaultValues: {
			name: '',
			maxUsers: 0,
			usersCount: 0,
			logo: undefined,
		},
	});
	const {
		formState: { isSubmitting },
	} = methods;

	const handleCreateTenant = methods.handleSubmit(async (data) => {
		const formData = new FormData();
		Object.entries(data).forEach(([key, value]) => {
			formData.append(key, value as string | Blob);
		});
		return await fetcher.submit(formData, {
			method: 'post',
			encType: 'multipart/form-data',
		});
	});

	return (
		<Form methods={methods} onSubmit={handleCreateTenant}>
			<Box
				sx={{
					display: 'flex',
					flexDirection: 'column',
					backgroundColor: 'white',
					padding: 2,
					gap: 3,
				}}
			>
				<Field.Text
					name="name"
					label="Name"
					slotProps={{ inputLabel: { shrink: true } }}
					placeholder="Enter the name"
				/>
				<Box sx={{ display: 'flex', flexDirection: 'row', gap: 2 }}>
					<Field.Text
						name="maxUsers"
						type="number"
						label="Max Users Count"
						slotProps={{ inputLabel: { shrink: true } }}
						placeholder="Enter max users count"
					/>

					<Field.Text
						name="usersCount"
						type="number"
						label="Actual users Count"
						slotProps={{ inputLabel: { shrink: true } }}
						placeholder="Enter actual users count"
					/>
				</Box>
				<Box
					sx={{
						display: 'flex',
						flexDirection: 'column',
						gap: 2,
						alignItems: 'center',
					}}
				>
					<Typography variant="subtitle2">Profil pic</Typography>

					<Field.UploadAvatar
						name="logo"
						slotProps={{
							wrapper: { sx: { mb: 0 } },
						}}
					/>
				</Box>

				<Button
					type="submit"
					variant="contained"
					color="primary"
					loading={isSubmitting}
					loadingIndicator="Creating..."
					sx={{ width: '100%', alignSelf: 'center', margin: 'auto' }}
				>
					Create
				</Button>
			</Box>
		</Form>
	);
}

export default TenantForm;
