import { useState } from 'react';

import { Grid, Stack, Typography } from '@mui/material';
import { DesktopDatePicker } from '@mui/x-date-pickers/DesktopDatePicker';
import { type UseFormReturn } from 'react-hook-form';

import FormProvider from '@devist/ui-react/components/form/FormProvider';
import RHFMdxEditor from '@devist/ui-react/components/form/RHFMdxEditor';
import RHFSwitch from '@devist/ui-react/components/form/RHFSwitch';
import RHFTextField from '@devist/ui-react/components/form/RHFTextField';

type Props = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: UseFormReturn<any>;
	edit?: boolean;
};

const PostForm = ({ form, edit = false }: Props) => {
	const [value, setValue] = useState<Date | null>(new Date());

	return (
		<FormProvider
			form={form}
			// onSubmit={handleSavePost}
		>
			<Stack spacing={3}>
				{edit ? <RHFSwitch name="published" label="Publish" color="success" /> : null}

				<Grid display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={{ xs: 0, md: 4 }}>
					<Grid item>
						<DesktopDatePicker
							label="Publish date"
							value={value}
							minDate={new Date('2017-01-01')}
							onChange={(newValue) => {
								setValue(newValue);
							}}
							slotProps={{
								textField: {
									fullWidth: true,
									margin: 'normal',
								},
							}}
						/>
					</Grid>
					<Grid item>
						<DesktopDatePicker
							label="Update date"
							value={value}
							minDate={new Date('2017-01-01')}
							onChange={(newValue) => {
								setValue(newValue);
							}}
							slotProps={{
								textField: {
									fullWidth: true,
									margin: 'normal',
								},
							}}
						/>
					</Grid>
				</Grid>

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

				<RHFTextField name="title" label="Post Title" />
				<RHFTextField name="description" label="Description" multiline rows={3} />
				<RHFTextField name="slug" label="Slug" />

				<Stack spacing={1.5}>
					<Typography variant="subtitle2">Content</Typography>
					<RHFMdxEditor name="content" />
				</Stack>
			</Stack>
		</FormProvider>
	);
};

export default PostForm;
