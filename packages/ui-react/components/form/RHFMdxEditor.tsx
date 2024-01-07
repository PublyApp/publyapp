import { type ReactNode } from 'react';

// @mui
import FormHelperText from '@mui/material/FormHelperText';
import { Controller, useFormContext } from 'react-hook-form';

import MdxEditor, { type MdxEditorProps } from '../MdxEditor';

//
// import Editor, { type EditorProps } from '../editor';

// ----------------------------------------------------------------------

type Props = Omit<MdxEditorProps, 'id' | 'markdown'> & {
	name: string;
	helperText?: ReactNode;
	markdown?: string;
};

const RHFMdxEditor = ({ name, helperText, ...other }: Props) => {
	const {
		control,
		// watch,
		// setValue,
		// formState: { isSubmitSuccessful },
	} = useFormContext();

	// const values = watch();

	// useEffect(() => {
	// 	if (values[name] === '<p><br></p>') {
	// 		setValue(name, '', {
	// 			shouldValidate: !isSubmitSuccessful,
	// 		});
	// 	}
	// }, [isSubmitSuccessful, name, setValue, values]);

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<MdxEditor
						id={name}
						markdown={field.value}
						onChange={field.onChange}
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

export default RHFMdxEditor;
