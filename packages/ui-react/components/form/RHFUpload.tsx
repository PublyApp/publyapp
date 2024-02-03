import { FormHelperText } from '@mui/material';
import { Controller, useFormContext } from 'react-hook-form';

import Upload from '../upload/i-Uploads';
import type { UploadProps } from '../upload/types';
import UploadAvatar from '../upload/UploadAvatar';
import UploadBox from '../upload/UploadBox';

// ----------------------------------------------------------------------

interface Props extends Omit<UploadProps, 'file'> {
	name: string;
	multiple?: boolean;
}

// ----------------------------------------------------------------------

export const RHFUploadAvatar = ({ name, ...other }: Props) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<div>
						<UploadAvatar error={!!error} file={field.value} {...other} />

						{!!error && (
							<FormHelperText error sx={{ px: 2, textAlign: 'center' }}>
								{error.message}
							</FormHelperText>
						)}
					</div>
				);
			}}
		/>
	);
};

// ----------------------------------------------------------------------

export const RHFUploadBox = ({ name, ...other }: Props) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return <UploadBox files={field.value} error={!!error} {...other} />;
			}}
		/>
	);
};

// ----------------------------------------------------------------------

export const RHFUpload = ({ name, multiple, helperText, ...other }: Props) => {
	const { control } = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return multiple ? (
					<Upload
						multiple
						accept={{ 'image/*': [] }}
						files={field.value}
						error={!!error}
						helperText={
							(!!error || helperText) && (
								<FormHelperText error={!!error} sx={{ px: 2 }}>
									{error ? error?.message : helperText}
								</FormHelperText>
							)
						}
						{...other}
					/>
				) : (
					<Upload
						accept={{ 'image/*': [] }}
						file={field.value}
						error={!!error}
						helperText={
							(!!error || helperText) && (
								<FormHelperText error={!!error} sx={{ px: 2 }}>
									{error ? error?.message : helperText}
								</FormHelperText>
							)
						}
						{...other}
					/>
				);
			}}
		/>
	);
};
