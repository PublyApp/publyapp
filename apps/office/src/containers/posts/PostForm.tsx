import { useCallback } from 'react';

import { Chip, Grid, Stack, Typography } from '@mui/material';
import { type UseFormReturn } from 'react-hook-form';

import FormProvider from '@devist/ui-react/components/form/FormProvider';
import RHFAutocomplete from '@devist/ui-react/components/form/RHFAutoComplete';
import RHFDesktopDatePicker from '@devist/ui-react/components/form/RHFDesktopDatePicker';
import RHFMdxEditor from '@devist/ui-react/components/form/RHFMdxEditor';
import RHFSwitch from '@devist/ui-react/components/form/RHFSwitch';
import RHFTextField from '@devist/ui-react/components/form/RHFTextField';

import { RHFUpload } from '@/ui-react/components/form/RHFUpload';

type Props = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: UseFormReturn<any>;
	edit?: boolean;
	tags?: string[];
};

const PostForm = ({ form, edit = false, tags: _tags = [] }: Props) => {
	const { setValue } = form;

	const handleDrop = useCallback(
		(acceptedFiles: File[]) => {
			const file = acceptedFiles[0];

			const newFile = Object.assign(file, {
				preview: URL.createObjectURL(file),
			});

			if (file) {
				setValue('coverFile', newFile, { shouldValidate: true });
			}
		},
		[setValue],
	);

	const handleRemoveFile = useCallback(() => {
		setValue('coverFile', null);
	}, [setValue]);

	return (
		<FormProvider
			form={form}
			// onSubmit={handleSavePost}
		>
			<RHFUpload name="coverFile" multiple={false} maxSize={3145728} onDrop={handleDrop} onDelete={handleRemoveFile} />

			<Stack spacing={3}>
				{edit ? <RHFSwitch name="published" label="Publish" color="success" /> : null}

				<RHFTextField name="title" label="Post Title" />
				<RHFTextField name="description" label="Description" multiline rows={3} />

				<RHFAutocomplete
					name="tags"
					label="Tags"
					placeholder="+ Tags"
					multiple
					freeSolo
					options={_tags.map((option) => {
						return option;
					})}
					getOptionLabel={(option) => {
						return option;
					}}
					renderOption={(props, option) => {
						return (
							<li {...props} key={option}>
								{option}
							</li>
						);
					}}
					renderTags={(selected, getTagProps) => {
						return selected.map((option, index) => {
							return (
								<Chip
									{...getTagProps({ index })}
									key={option}
									label={option}
									size="small"
									color="info"
									variant="soft"
								/>
							);
						});
					}}
				/>

				<Stack spacing={1.5}>
					<Typography variant="subtitle2">Content</Typography>
					<RHFMdxEditor name="content" />
				</Stack>

				<Grid display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={{ xs: 0, md: 4 }}>
					<Grid item>
						<RHFDesktopDatePicker name="publishDate" label="Publish date" />
					</Grid>
					<Grid item>
						<RHFDesktopDatePicker name="updateDate" label="Update date" />
					</Grid>
				</Grid>

				<RHFTextField name="slug" label="Slug" />
			</Stack>
		</FormProvider>
	);
};

export default PostForm;
