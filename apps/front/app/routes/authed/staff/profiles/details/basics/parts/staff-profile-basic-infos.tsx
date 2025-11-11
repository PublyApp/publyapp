import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Link from '@mui/material/Link';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import { useTranslate } from '@/front/hooks/use-translate';

const StaffProfileBasicInfos = () => {
	const { t } = useTranslate();

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
				<Box
					sx={{
						rowGap: 3,
						columnGap: 2,
						display: 'grid',
					}}
				>
					{/* <Field.Text name="firstName" label={t('firstname')} /> */}
					{/* <Field.Text name="email" label={t('email-address')} required /> */}
					<TextField name="name" label={t('name')} required />
					<TextField
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
						// loading={isSubmitting || isMutating}
					>
						{t('save-changes')}
					</Button>
				</Stack>
			</CardContent>
		</Card>
	);
};

export default StaffProfileBasicInfos;
