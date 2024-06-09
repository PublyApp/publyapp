// import React from 'react'

import { Divider, Drawer, drawerClasses, IconButton, Stack, Typography, useTheme } from '@mui/material';

import { selectIsOpenSlugDrawer, selectSetIsOpenSlugDrawer } from '@/office/lib/zustand/features/blogPost.slice';
import { useMainStore } from '@/office/lib/zustand/store';
import Iconify from '@/ui-react/components/Iconify';
import Scrollbar from '@/ui-react/components/Scrollbar';
import useTranslate from '@/ui-react/hooks/useTranslate';
import { paper } from '@/ui-react/utils/css.utils';

// type Props = {}

const EditPostSlugDrawer = (/* props: Props */) => {
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
