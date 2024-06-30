// import React from 'react'

import { Suspense, useMemo } from 'react';

import { zodResolver } from '@hookform/resolvers/zod';
import {
	alpha,
	Box,
	Button,
	CircularProgress,
	Divider,
	Drawer,
	drawerClasses,
	IconButton,
	List,
	Stack,
	Tooltip,
	Typography,
	useTheme,
} from '@mui/material';
import _ from 'lodash';
import { useForm } from 'react-hook-form';

import { slugify } from '@devist/shared/utils/string.utils';

import { ResultItem } from '@/office/components/ResultItem';
import { selectIsOpenSlugDrawer, selectSetIsOpenSlugDrawer } from '@/office/lib/zustand/features/blogPost.slice';
import { useMainStore } from '@/office/lib/zustand/store';
import { getAddSlugToPostSchema } from '@/shared/validations/blogPost/blogPost.validations';
import FormProvider from '@/ui-react/components/form/FormProvider';
import RHFTextField from '@/ui-react/components/form/RHFTextField';
import Iconify from '@/ui-react/components/Iconify';
import Scrollbar from '@/ui-react/components/Scrollbar';
import useTranslate from '@/ui-react/hooks/useTranslate';
import {
	useAddSlugToBlogPostMutation,
	useFindBlogPostSlugSuspenseQuery,
} from '@/ui-react/lib/react-query/features/blogPost/blogPost.hooks';
import zod from '@/ui-react/lib/zod';
import { paper } from '@/ui-react/utils/css.utils';

type Props = {
	postId: string;
	postTitle: string;
};

const EditPostSlugDrawer = ({ postId, postTitle }: Props) => {
	const { t } = useTranslate();
	const theme = useTheme();
	const isOpenSlugDrawer = useMainStore(selectIsOpenSlugDrawer);
	const setIsOpenSlugDrawer = useMainStore(selectSetIsOpenSlugDrawer);

	const addSlugToPostSchema = getAddSlugToPostSchema(zod).pick({ slug: true });

	const addSlugForm = useForm({
		resolver: zodResolver(addSlugToPostSchema),
		values: { slug: '' },
	});

	const { handleSubmit } = addSlugForm;

	const handleSetSlugifyCurrentTitle = () => {
		addSlugForm.setValue('slug', slugify(postTitle));
	};

	// const onSubmitHandler: SubmitHandler<LoginInput> =
	const {
		result: { mutate: addSlugToPost, isPending: isAddSlugPending },
	} = useAddSlugToBlogPostMutation();

	const onSubmitAddSlugToPost = handleSubmit(
		async (values) => {
			addSlugToPost({ postId, slug: values.slug });
			// login(values);
			// console.log('Data', values);
		},
		(errors) => {
			console.log('--- addSlugForm errors ---', errors);
		},
	);

	const handleClose = () => {
		setIsOpenSlugDrawer(false);
	};

	const renderHead = (
		<Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ py: 2, pr: 1, pl: 2.5 }}>
			<Typography variant="h6" sx={{ flexGrow: 1 }}>
				{t('manage-blog-post-slugs')}
			</Typography>

			{/* <Tooltip title="Reset">
        <IconButton onClick={settings.onReset}>
          <Badge color="error" variant="dot" invisible={!settings.canReset}>
            <Iconify icon="solar:restart-bold" />
          </Badge>
        </IconButton>
      </Tooltip> */}

			<IconButton onClick={handleClose}>
				<Iconify icon="mingcute:close-line" />
			</IconButton>
		</Stack>
	);

	const renderInput = (
		<FormProvider form={addSlugForm} onSubmit={onSubmitAddSlugToPost} /* css={{ flexGrow: 1, display: 'contents' }} */>
			<Stack direction="row" gap={2.1}>
				{/* <TextField label="New Slug" sx={{ flexGrow: 1 }} /> */}
				<RHFTextField
					name="slug"
					placeholder={t('new-item', { item: 'slug' })}
					// sx={{ alignSelf: 'stretch', justifySelf: 'stretch' }}
				/>

				<Box>
					<Tooltip title={t('slugify-current-title')}>
						<Button variant="contained" size="large" onClick={handleSetSlugifyCurrentTitle}>
							<Iconify icon="gravity-ui:arrow-rotate-right" width={24} />
						</Button>
					</Tooltip>
				</Box>

				<Box>
					<Button variant="contained" size="large" sx={{ whiteSpace: 'nowrap' }} type="submit">
						{isAddSlugPending ? (
							<CircularProgress size={24} sx={{ color: theme.palette.common.white }} />
						) : (
							t('add-slug')
						)}
					</Button>
				</Box>
			</Stack>
		</FormProvider>
	);

	const renderList = (
		<Suspense fallback={<h1>Loading....</h1>}>
			{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
			<SlugsList postId={postId} /* currentSlug={currentSlug} */ />
		</Suspense>
	);

	return (
		<Drawer
			anchor="right"
			open={isOpenSlugDrawer}
			onClose={handleClose}
			slotProps={{
				backdrop: { invisible: /* true */ false },
			}}
			sx={{
				[`& .${drawerClasses.paper}`]: {
					...paper({ theme, bgcolor: theme.palette.background.default }),
					// width: 280,
					width: 900,
				},
			}}
		>
			{renderHead}

			<Divider sx={{ borderStyle: 'dashed' }} />

			<Scrollbar>
				<Stack spacing={3} sx={{ p: 3 }}>
					{renderInput}

					{renderList}

					{/* {renderItems()} */}

					{/* <Stack>
						{Array.from({ length: 8}, (_) => {
							return {
								id: nanoid(),
								slug: nanoid(),
							}
						}).map((e) => {
							return <Box key={e.id}>
							<Typography>{e.slug}</Typography>
						</Box>
						})}
					</Stack> */}
					{/* {renderMode}

          {renderContrast}

          {renderDirection}

          {renderLayout}

          {renderStretch}

          {renderPresets} */}
				</Stack>
			</Scrollbar>

			{/* <FullScreenOption /> */}
		</Drawer>
	);
};

export default EditPostSlugDrawer;

// --------------------------------

const SlugsList = ({ postId }: { postId: string }) => {
	const {
		result: { data },
	} = useFindBlogPostSlugSuspenseQuery({
		params: { postId /* , searchTerm */ } /* , options: { initialPageParam: 2 } */,
	});

	const flatData = useMemo(() => {
		return data.pages.flatMap((e) => {
			return e.slugs;
		});
	}, [data.pages]);

	const renderItems = (
		<List /* key={group || index} */ disablePadding>
			{/* {Array.from({ length: 8 }, (_) => {
					return {
						id: nanoid(),
						slug: nanoid(),
					};
				}). */}
			{flatData.map((e) => {
				// 	return <Box key={e.id}>
				// 	<Typography>{e.slug}</Typography>
				// </Box>
				// const isCurrentSlug = e.slug === currentSlug;

				return (
					<Stack key={e.objectId} direction="row" gap={2} mb={2}>
						<Box
							sx={{
								flexGrow: 1,
								'& > .MuiButtonBase-root': {
									padding: (theme) => {
										return theme.spacing(1.8);
									},

									...(e.isCurrent
										? {
												borderRadius: 1,
												borderColor: (theme) => {
													return theme.palette.info.main;
												},
												backgroundColor: (theme) => {
													return alpha(theme.palette.info.main, theme.palette.action.hoverOpacity);
												},
											}
										: {}),
								},
								'& .MuiTypography-root': {
									textTransform: 'unset',
								},
							}}
						>
							<ResultItem
								title={[{ text: e.slug }]}
								groupLabel=""
								onClickItem={() => {
									if (e.isCurrent) {
										// do nothing
										return;
									}

									console.log(e.slug);
								}}
							/>
						</Box>
						{e.isCurrent ? null : <Button variant="contained">Set a current</Button>}
					</Stack>
				);
			})}
		</List>
	);

	return _.isEmpty(flatData) ? <h1>So Empty !!!</h1> : renderItems;
};
