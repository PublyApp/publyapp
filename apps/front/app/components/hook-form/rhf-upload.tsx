import Box, { type BoxProps } from '@mui/material/Box';
import { Controller, useFormContext } from 'react-hook-form';

import { Upload, UploadAvatar, UploadBox, type UploadProps } from '../upload';

import { HelperText } from './help-text';

// ----------------------------------------------------------------------

export type RHFUploadProps = UploadProps & {
	name: string;
	slotProps?: {
		wrapper?: BoxProps;
	};
};

export const RHFUploadAvatar = ({ name, slotProps, ...other }: RHFUploadProps) => {
	const { control, setValue } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const onDrop = (acceptedFiles: File[]) => {
					const value = acceptedFiles[0];

					setValue(name, value, { shouldValidate: true });
				};

				return (
					<Box {...slotProps?.wrapper}>
						<UploadAvatar value={field.value} error={!!error} onDrop={onDrop} {...other} />

						<HelperText errorMessage={error?.message} sx={{ textAlign: 'center' }} />
					</Box>
				);
			}}
		/>
	);
};

// ----------------------------------------------------------------------

export const RHFUploadBox = ({ name, ...other }: RHFUploadProps) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return <UploadBox value={field.value} error={!!error} {...other} />;
			}}
		/>
	);
};

// ----------------------------------------------------------------------

export const RHFUpload = ({ name, multiple, helperText, ...other }: RHFUploadProps) => {
	const { control, setValue } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				const uploadProps = {
					multiple,
					accept: { 'image/*': [] },
					error: !!error,
					helperText: error?.message ?? helperText,
				};

				const onDrop = (acceptedFiles: File[]) => {
					const value = multiple ? [...field.value, ...acceptedFiles] : acceptedFiles[0];

					setValue(name, value, { shouldValidate: true });
				};

				return <Upload {...uploadProps} value={field.value} onDrop={onDrop} {...other} />;
			}}
		/>
	);
};
