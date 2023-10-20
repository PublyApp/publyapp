// import React from 'react'
import { useMemo } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import LoadingButton from '@mui/lab/LoadingButton';
// import Box from '@mui/material/Box';
import Card from '@mui/material/Card';
import CardHeader from '@mui/material/CardHeader';
// import Chip from '@mui/material/Chip';
// import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
// import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Typography from '@mui/material/Typography';
import Grid from '@mui/material/Unstable_Grid2';
import { useSnackbar } from 'notistack';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import FormProvider from '@devist/ui-react/components/form/FormProvider';
import RHFTextField from '@devist/ui-react/components/form/RHFTextField';
import { RHFUpload } from '@devist/ui-react/components/form/RHFUpload';

import type { WebHost } from '@shared/types/webHost.types';
import { getSaveWebHostInputSchema } from '@shared/validations/webHost.validations';
import useResponsive from '@ui-react/hooks/useResponsive';

type Props = {
	currentWebHost?: WebHost;
};

const WebHostForm = ({ currentWebHost }: Props) => {
	const mdUp = useResponsive('up', 'md');
	const { enqueueSnackbar } = useSnackbar();

	const defaultValues = useMemo(() => {
		return {
			name: currentWebHost?.translations.en.name || '',
			description: currentWebHost?.translations.en.description || '',
			images: currentWebHost?.images || [],
		};
	}, [currentWebHost]);

	const { t } = useTranslation();
	const saveWebHostInputSchema = getSaveWebHostInputSchema(t);

	const form = useForm({
		resolver: zodResolver(saveWebHostInputSchema),
		// defaultValues,
	});

	const {
		reset,
		watch,
		setValue,
		handleSubmit,
		formState: { isSubmitting },
	} = form;

	const renderDetails = (
		<>
			{mdUp && (
				<Grid md={4}>
					<Typography variant="h6" sx={{ mb: 0.5 }}>
						Details
					</Typography>
					<Typography variant="body2" sx={{ color: 'text.secondary' }}>
						Title, short description, image...
					</Typography>
				</Grid>
			)}

			<Grid xs={12} md={8}>
				<Card>
					{!mdUp && <CardHeader title="Details" />}

					<Stack spacing={3} sx={{ p: 3 }}>
						<RHFTextField name="name" label="Product Name" />

						<RHFTextField name="subDescription" label="Sub Description" multiline rows={4} />

						{/* <Stack spacing={1.5}>
							<Typography variant="subtitle2">Content</Typography>
							<RHFEditor simple name="description" />
						</Stack> */}

						<Stack spacing={1.5}>
							<Typography variant="subtitle2">Images</Typography>
							<RHFUpload
								multiple
								thumbnail
								name="images"
								maxSize={3145728}
								onDrop={handleDrop}
								onRemove={handleRemoveFile}
								onRemoveAll={handleRemoveAllFiles}
								onUpload={() => {
									return console.info('ON UPLOAD');
								}}
							/>
						</Stack>
					</Stack>
				</Card>
			</Grid>
		</>
	);

	const renderActions = (
		<>
			{mdUp && <Grid md={4} />}
			<Grid xs={12} md={8} sx={{ display: 'flex', alignItems: 'center' }}>
				<FormControlLabel control={<Switch defaultChecked />} label="Publish" sx={{ flexGrow: 1, pl: 3 }} />

				<LoadingButton type="submit" variant="contained" size="large" loading={isSubmitting}>
					{!currentWebHost ? 'Create Product' : 'Save Changes'}
				</LoadingButton>
			</Grid>
		</>
	);

	return (
		<FormProvider form={form} onSubmit={onSubmit}>
			<Grid container spacing={3}>
				{renderDetails}

				{/* {renderProperties} */}

				{/* {renderPricing} */}

				{renderActions}
			</Grid>
		</FormProvider>
	);
};

export default WebHostForm;
