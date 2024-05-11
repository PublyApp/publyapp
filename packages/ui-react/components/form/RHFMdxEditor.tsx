import { forwardRef, type ReactNode } from 'react';

import type { MDXEditorMethods } from '@mdxeditor/editor';
import { FormHelperText } from '@mui/material';
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

const RHFMdxEditor = forwardRef<MDXEditorMethods, Props>(({ name, helperText, ...other }: Props, ref) => {
	const form = useFormContext();

	const {
		control,
		// watch,
		// setValue,
		// formState: { isSubmitSuccessful },
	} = form;

	// const values = watch();

	// useEffect(() => {
	// 	if (values[name] === '<p><br></p>') {
	// 		setValue(name, '', {
	// 			shouldValidate: !isSubmitSuccessful,
	// 		});
	// 	}
	// }, [isSubmitSuccessful, name, setValue, values]);

	// const handleChange = () => {};
	// const ref = useRef<MDXEditorMethods>(null);

	// useEffect(() => {
	// 	ref.current
	// }, [])

	return (
		<Controller
			name={name}
			control={control}
			render={({ field, fieldState: { error } }) => {
				return (
					<MdxEditor
						ref={ref}
						id={name}
						markdown={field.value}
						onChange={(markdown) => {
							// ref.current?.setMarkdown(markdown);
							field.onChange(markdown);
						}}
						error={!!error}
						disabled={field.disabled}
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
});

export default RHFMdxEditor;
