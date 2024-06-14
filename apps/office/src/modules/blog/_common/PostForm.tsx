import { useCallback, useEffect, useRef } from 'react';

import type { MDXEditorMethods } from '@mdxeditor/editor';
import { Box, Button, Chip, Grid, Stack, Typography } from '@mui/material';
import { type UseFormReturn } from 'react-hook-form';

import FormProvider from '@devist/ui-react/components/form/FormProvider';
import RHFAutocomplete from '@devist/ui-react/components/form/RHFAutoComplete';
import RHFDesktopDatePicker from '@devist/ui-react/components/form/RHFDesktopDatePicker';
import RHFMdxEditor from '@devist/ui-react/components/form/RHFMdxEditor';
import RHFSwitch from '@devist/ui-react/components/form/RHFSwitch';
import RHFTextField from '@devist/ui-react/components/form/RHFTextField';

import { selectSetIsOpenSlugDrawer } from '@/office/lib/zustand/features/blogPost.slice';
import { useMainStore } from '@/office/lib/zustand/store';
import { RHFUpload } from '@/ui-react/components/form/RHFUpload';
import useTranslate from '@/ui-react/hooks/useTranslate';

import EditPostSlugDrawer from './EditPostSlugDrawer';

type Props = {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	form: UseFormReturn<any>;
	edit?: boolean;
	tags?: string[];
	localeContent?: string;
	disabled?: boolean;
};

const PostForm = ({ form, edit = false, tags: _tags = [], localeContent = '', disabled }: Props) => {
	const { t, locale } = useTranslate();
	const { setValue } = form;
	const setIsOpenSlugDrawer = useMainStore(selectSetIsOpenSlugDrawer);

	const handleOpenSlugDrawer = () => {
		setIsOpenSlugDrawer(true);
	};

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

	const editorRef = useRef<MDXEditorMethods>(null);

	useEffect(() => {
		// console.log(localeContent);
		editorRef.current?.setMarkdown(localeContent);
	}, [locale, localeContent]);

	return (
		<FormProvider
			form={form}
			// onSubmit={handleSavePost}
		>
			<RHFUpload
				name="coverFile"
				multiple={false}
				maxSize={3145728}
				onDrop={handleDrop}
				onDelete={handleRemoveFile}
				sx={{ mb: 3 }}
				disabled={disabled}
			/>

			<Stack spacing={3}>
				{edit ? <RHFSwitch name="published" label="Publish" color="success" /> : null}

				<RHFTextField name="title" label={t('title')} placeholder={t('your-title')} />
				<RHFTextField name="description" label="Description" multiline rows={3} placeholder={t('your-description')} />

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
					<Typography variant="subtitle2">{t('content')}</Typography>
					<RHFMdxEditor ref={editorRef} name="content" placeholder={t('your-content')} />
				</Stack>

				<Grid display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={{ xs: 0, md: 4 }}>
					<Grid item>
						<RHFDesktopDatePicker name="publishDate" label={t('publish-date')} />
					</Grid>
					<Grid item>
						<RHFDesktopDatePicker name="updateDate" label={t('update-date')} />
					</Grid>
				</Grid>

				{edit ? (
					<Stack direction="row" gap={2.1}>
						<Box sx={{ cursor: 'pointer', flexGrow: 1 }}>
							<RHFTextField name="slug" label="Slug" disabled />
						</Box>
						<Button onClick={handleOpenSlugDrawer} variant="contained" disabled={disabled}>
							Edit slug
						</Button>
					</Stack>
				) : (
					<RHFTextField name="slug" label="Slug" />
				)}
			</Stack>

			<EditPostSlugDrawer />
		</FormProvider>
	);
};

export default PostForm;
