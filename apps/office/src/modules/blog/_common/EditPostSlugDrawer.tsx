// import React from 'react'

import { Suspense, useMemo } from 'react';

import { css, cx } from '@emotion/css';
import {
	alpha,
	Box,
	Button,
	Divider,
	Drawer,
	drawerClasses,
	IconButton,
	List,
	Stack,
	TextField,
	Typography,
	useTheme,
} from '@mui/material';
import _ from 'lodash';
import { nanoid } from 'nanoid';

import { ResultItem } from '@/office/components/ResultItem';
import { selectIsOpenSlugDrawer, selectSetIsOpenSlugDrawer } from '@/office/lib/zustand/features/blogPost.slice';
import { useMainStore } from '@/office/lib/zustand/store';
import Iconify from '@/ui-react/components/Iconify';
import Scrollbar from '@/ui-react/components/Scrollbar';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { useFindBlogPostSlugSuspenseQuery } from '@/ui-react/lib/react-query/features/blogPost/blogPost.hooks';
import { paper } from '@/ui-react/utils/css.utils';

type Props = {
	postId: string;
	postTitle: string;
	currentSlug: string;
};

const EditPostSlugDrawer = ({ currentSlug, postId, postTitle }: Props) => {
	console.log({ currentSlug, postId, postTitle });

	const { t } = useTranslate();
	const theme = useTheme();
	const isOpenSlugDrawer = useMainStore(selectIsOpenSlugDrawer);
	const setIsOpenSlugDrawer = useMainStore(selectSetIsOpenSlugDrawer);

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
		<Stack direction="row" gap={2.1}>
			<TextField label="New Slug" sx={{ flexGrow: 1 }} />
			<Button variant="contained">Add Slug</Button>
		</Stack>
	);

	const renderList = (
		<Suspense fallback={<h1>Loading....</h1>}>
			<SlugsList postId={postId} currentSlug={currentSlug} />
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

const SlugsList = ({ postId, currentSlug }: { postId: string; currentSlug: string }) => {
	const {
		result: { data },
	} = useFindBlogPostSlugSuspenseQuery({
		params: { postId /* , searchTerm */ } /* , options: { initialPageParam: 2 } */,
	});

	const flatData = useMemo(() => {
		return data.pages.flatMap((e) => {
			return e.slugs;
		});
	}, []);

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
				const isCurrentSlug = e.slug === currentSlug;

				return (
					<Box
						key={e.objectId}
						sx={(theme) => {
							return {
								'& > .MuiButtonBase-root': {
									padding: theme.spacing(1.8),

									...(isCurrentSlug
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
							};
						}}
					>
						<ResultItem
							title={[{ text: e.slug }]}
							groupLabel={''}
							onClickItem={() => {
								if (isCurrentSlug) {
									// do nothing
									return;
								}
								console.log(e.slug);
							}}
						/>
					</Box>
				);
			})}
		</List>
	);

	return _.isEmpty(flatData) ? <h1>So Empty !!!</h1> : renderItems;
};
