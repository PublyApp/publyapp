import { zodResolver } from '@hookform/resolvers/zod';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import CardHeader from '@mui/material/CardHeader';
import Divider from '@mui/material/Divider';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { TFunction } from 'i18next';
import i18next from 'i18next';
import _ from 'lodash';
import { useCallback, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useParams } from 'react-router';
import type { z } from 'zod';

import { CustomBreadcrumbs } from '@/front/components/custom-breadcrumbs/custom-breadcrumbs';
import { Field } from '@/front/components/hook-form/fields';
import { Form } from '@/front/components/hook-form/form-provider';
import { Iconify } from '@/front/components/iconify/iconify';
import { toast } from '@/front/components/snackbar';
import { useRouter } from '@/front/hooks/use-router';
import { useTranslate } from '@/front/hooks/use-translate';
import { DashboardContent } from '@/front/layouts/dashboard/content';
import { interZodClient } from '@/front/lib/zod/zod.client';
import { APP_NAME, FRONT_PATH_NAMES, isServer } from '@/shared/lib/constants';

import type { Route } from './+types/post-create-edit-page';

// ----------------------------------------------------------------------

const SOCIAL_PLATFORMS = [
	{ value: 'facebook', label: 'Facebook', icon: 'socials:facebook' },
	{ value: 'twitter', label: 'Twitter/X', icon: 'socials:twitter' },
	{ value: 'instagram', label: 'Instagram', icon: 'socials:instagram' },
	{ value: 'linkedin', label: 'LinkedIn', icon: 'socials:linkedin' },
] as const;

const SCHEDULE_OPTIONS = {
	NOW: 'now',
	LATER: 'later',
} as const;

const MAX_CONTENT_LENGTH = 2000;

// ----------------------------------------------------------------------

const getPostCreateEditSchema = (z: typeof interZodClient) => {
	return z.object({
		content: z.string().min(1).max(MAX_CONTENT_LENGTH),
		platforms: z.array(z.string()).min(1),
		scheduleType: z.enum([SCHEDULE_OPTIONS.NOW, SCHEDULE_OPTIONS.LATER]),
		scheduledDate: z.string().optional(),
	});
};

type PostCreateEditSchemaType = z.infer<
	ReturnType<typeof getPostCreateEditSchema>
>;

const defaultValues: PostCreateEditSchemaType = {
	content: '',
	platforms: [],
	scheduleType: SCHEDULE_OPTIONS.NOW,
	scheduledDate: undefined,
};

// ----------------------------------------------------------------------

const getPageTitle = (t: TFunction, isEdit: boolean, seo?: boolean) => {
	const title = isEdit ? t('edit-post') : t('create-post');
	let str: string = _.capitalize(title as string);

	if (seo) {
		str = `${str} | Tenant Dashboard - ${APP_NAME}`;
	}

	return str;
};

export const meta = (args: Route.MetaArgs) => {
	if (isServer) {
		return _.get(args.params, 'meta', []);
	}

	const t: TFunction = i18next.t;
	const isEdit = !!args.params.postId;

	return [
		{
			title: getPageTitle(t, isEdit, true),
		},
	];
};

// ----------------------------------------------------------------------

const PostCreateEditPage = () => {
	const { t } = useTranslate();
	const router = useRouter();
	const { tenantId, postId } = useParams();

	const isEdit = !!postId;

	const PostCreateEditSchema = useMemo(() => {
		return getPostCreateEditSchema(interZodClient);
	}, []);

	const methods = useForm<PostCreateEditSchemaType>({
		mode: 'onSubmit',
		resolver: zodResolver(PostCreateEditSchema),
		defaultValues,
	});

	const {
		handleSubmit,
		watch,
		control,
		formState: { isSubmitting },
	} = methods;

	const watchedContent = watch('content');
	const watchedScheduleType = watch('scheduleType');
	const watchedPlatforms = watch('platforms');

	const characterCount = watchedContent.length;
	const remainingCharacters = MAX_CONTENT_LENGTH - characterCount;

	const handleSaveDraft = useCallback(() => {
		// Placeholder: Save as draft logic
		toast.info(t('draft-saved'));
	}, [t]);

	const onSubmit = handleSubmit(async (_data) => {
		try {
			// Placeholder: Submit logic
			await new Promise((resolve) => setTimeout(resolve, 500));

			toast.success(
				isEdit
					? t('post-updated-successfully')
					: t('post-created-successfully'),
			);

			router.push(FRONT_PATH_NAMES.tenant(tenantId).root);
		} catch (_error) {
			toast.error(t('something-went-wrong'));
		}
	});

	const handlePlatformToggle = useCallback(
		(platformValue: string) => {
			const currentPlatforms = watchedPlatforms;
			const isSelected = currentPlatforms.includes(platformValue);

			if (isSelected) {
				return currentPlatforms.filter((p) => p !== platformValue);
			}
			return [...currentPlatforms, platformValue];
		},
		[watchedPlatforms],
	);

	const renderContentSection = () => (
		<Card>
			<CardHeader
				title={t('content')}
				subheader={t('write-your-post-content')}
			/>
			<Divider />
			<CardContent>
				<Stack spacing={3}>
					{/* Rich text editor placeholder - using multiline TextField for now */}
					<Field.Text
						name="content"
						label={t('post-content')}
						multiline
						rows={10}
						placeholder={t('write-your-post-here')}
					/>

					{/* Character count indicator */}
					<Box
						sx={{
							display: 'flex',
							justifyContent: 'flex-end',
						}}
					>
						<Typography
							variant="caption"
							sx={{
								color:
									remainingCharacters < 0
										? 'error.main'
										: remainingCharacters < 100
											? 'warning.main'
											: 'text.secondary',
							}}
						>
							{characterCount} / {MAX_CONTENT_LENGTH} {t('characters')}
						</Typography>
					</Box>

					{/* Media attachment area placeholder */}
					<Box
						sx={{
							border: '2px dashed',
							borderColor: 'divider',
							borderRadius: 2,
							p: 4,
							textAlign: 'center',
							bgcolor: 'background.neutral',
						}}
					>
						<Iconify
							icon="eva:cloud-upload-fill"
							width={48}
							sx={{ color: 'text.secondary', mb: 1 }}
						/>
						<Typography variant="body2" color="text.secondary">
							{t('drag-and-drop-media-here')}
						</Typography>
						<Typography variant="caption" color="text.disabled">
							{t('supports-images-and-videos')}
						</Typography>
					</Box>
				</Stack>
			</CardContent>
		</Card>
	);

	const renderSettingsSection = () => (
		<Stack spacing={3}>
			{/* Social Platforms Selection */}
			<Card>
				<CardHeader
					title={t('platforms')}
					subheader={t('select-platforms-to-post')}
				/>
				<Divider />
				<CardContent>
					<Controller
						name="platforms"
						control={control}
						render={({ field, fieldState: { error } }) => (
							<Stack spacing={1}>
								{SOCIAL_PLATFORMS.map((platform) => {
									const isSelected = field.value.includes(platform.value);
									return (
										<Box
											key={platform.value}
											onClick={() => {
												field.onChange(handlePlatformToggle(platform.value));
											}}
											sx={{
												display: 'flex',
												alignItems: 'center',
												gap: 2,
												p: 1.5,
												borderRadius: 1,
												cursor: 'pointer',
												border: '1px solid',
												borderColor: isSelected ? 'primary.main' : 'divider',
												bgcolor: isSelected
													? 'primary.lighter'
													: 'background.paper',
												'&:hover': {
													bgcolor: isSelected
														? 'primary.lighter'
														: 'action.hover',
												},
											}}
										>
											<Iconify
												icon={platform.icon}
												width={24}
												sx={{
													color: isSelected ? 'primary.main' : 'text.secondary',
												}}
											/>
											<Typography
												variant="body2"
												sx={{
													fontWeight: isSelected ? 600 : 400,
													color: isSelected ? 'primary.main' : 'text.primary',
												}}
											>
												{platform.label}
											</Typography>
											{isSelected && (
												<Iconify
													icon="eva:checkmark-fill"
													width={20}
													sx={{ ml: 'auto', color: 'primary.main' }}
												/>
											)}
										</Box>
									);
								})}
								{error && (
									<Typography variant="caption" color="error">
										{error.message}
									</Typography>
								)}
							</Stack>
						)}
					/>
				</CardContent>
			</Card>

			{/* Schedule Options */}
			<Card>
				<CardHeader title={t('schedule')} subheader={t('when-to-publish')} />
				<Divider />
				<CardContent>
					<Controller
						name="scheduleType"
						control={control}
						render={({ field }) => (
							<RadioGroup {...field}>
								<FormControlLabel
									value={SCHEDULE_OPTIONS.NOW}
									control={<Radio />}
									label={t('post-now')}
								/>
								<FormControlLabel
									value={SCHEDULE_OPTIONS.LATER}
									control={<Radio />}
									label={t('schedule-for-later')}
								/>
							</RadioGroup>
						)}
					/>

					{watchedScheduleType === SCHEDULE_OPTIONS.LATER && (
						<Box sx={{ mt: 2 }}>
							<Field.MobileDateTimePicker
								name="scheduledDate"
								label={t('scheduled-date-and-time')}
							/>
						</Box>
					)}
				</CardContent>
			</Card>

			{/* Action Buttons */}
			<Stack spacing={2}>
				<Button
					variant="outlined"
					color="inherit"
					size="large"
					onClick={handleSaveDraft}
					startIcon={<Iconify icon="eva:star-outline" />}
				>
					{t('save-as-draft')}
				</Button>

				<Button
					type="submit"
					variant="contained"
					size="large"
					loading={isSubmitting}
					startIcon={
						<Iconify
							icon={
								watchedScheduleType === SCHEDULE_OPTIONS.NOW
									? 'custom:send-fill'
									: 'solar:clock-circle-bold'
							}
						/>
					}
				>
					{watchedScheduleType === SCHEDULE_OPTIONS.NOW
						? t('publish-now')
						: t('schedule-post')}
				</Button>
			</Stack>
		</Stack>
	);

	return (
		<DashboardContent
			sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}
			compact
			maxWidth="xl"
		>
			<CustomBreadcrumbs
				heading={getPageTitle(t as never, isEdit)}
				links={[
					{
						name: t('dashboard'),
						href: FRONT_PATH_NAMES.tenant(tenantId).root,
					},
					{
						name: t('posts'),
						href: FRONT_PATH_NAMES.tenant(tenantId).posts.root,
					},
					{ name: isEdit ? t('edit') : t('new') },
				]}
				sx={{ mb: { xs: 3, md: 5 } }}
			/>

			<Form methods={methods} onSubmit={onSubmit}>
				<Grid container spacing={3}>
					{/* Content Section - Left side (8 cols) */}
					<Grid size={{ xs: 12, md: 8 }}>{renderContentSection()}</Grid>

					{/* Settings Section - Right side (4 cols) */}
					<Grid size={{ xs: 12, md: 4 }}>{renderSettingsSection()}</Grid>
				</Grid>
			</Form>
		</DashboardContent>
	);
};

export default PostCreateEditPage;
