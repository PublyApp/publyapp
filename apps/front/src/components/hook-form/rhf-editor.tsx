import { Controller, useFormContext } from 'react-hook-form';

import { Editor, type EditorProps } from '../editor';

// ----------------------------------------------------------------------

export type RHFEditorProps = EditorProps & {
	name: string;
};

export const RHFEditor = ({ name, helperText, ...other }: RHFEditorProps) => {
	const {
		control,
		formState: { isSubmitSuccessful },
	} = useFormContext();

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<Editor
						{...field}
						error={!!error}
						helperText={error?.message ?? helperText}
						resetValue={isSubmitSuccessful}
						{...other}
					/>
				);
			}}
		/>
	);
};
