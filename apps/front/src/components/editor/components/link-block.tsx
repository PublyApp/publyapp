import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Popover from '@mui/material/Popover';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useCallback, useState } from 'react';

import { editorClasses } from '../classes';
import type { EditorToolbarProps } from '../types';
import { ToolbarItem } from './toolbar-item';

// ----------------------------------------------------------------------

export const LinkBlock = ({ editor }: Pick<EditorToolbarProps, 'editor'>) => {
	const [url, setUrl] = useState('');

	const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

	const handleOpenPopover = (event: React.MouseEvent<HTMLButtonElement>) => {
		const previousUrl = editor?.getAttributes('link').href;

		setAnchorEl(event.currentTarget);

		if (previousUrl) {
			setUrl(previousUrl);
		} else {
			setUrl('');
		}
	};

	const handleClosePopover = useCallback(() => {
		setAnchorEl(null);
	}, []);

	const handleUpdateUrl = useCallback(() => {
		handleClosePopover();

		if (!url) {
			editor?.chain().focus().extendMarkRange('link').unsetLink().run();
		} else {
			editor
				?.chain()
				.focus()
				.extendMarkRange('link')
				.setLink({ href: url })
				.run();
		}
	}, [editor, handleClosePopover, url]);

	if (!editor) {
		return null;
	}

	return (
		<>
			<ToolbarItem
				aria-label="Link"
				active={editor.isActive('link')}
				className={editorClasses.toolbar.link}
				onClick={handleOpenPopover}
				icon={
					<path d="M17.6567 14.8284L16.2425 13.4142L17.6567 12C19.2188 10.44 19.22 7.91 17.66 6.34314C16.0946 4.78 13.56 4.78 12 6.34314L10.5856 7.75736L9.17139 6.34314L10.5856 4.92893C12.9287 2.59 16.73 2.59 19.07 4.92893C21.414 7.27 21.41 11.07 19.07 13.4142L17.6567 14.8284ZM14.8282 17.6569L13.414 19.0711C11.0709 21.41 7.27 21.41 4.93 19.0711C2.5856 16.73 2.59 12.93 4.93 10.5858L6.34296 9.17157L7.75717 10.5858L6.34296 12C4.78086 13.56 4.78 16.09 6.34 17.6569C7.90506 19.22 10.44 19.22 12 17.6569L13.414 16.2426L14.8282 17.6569ZM14.8282 7.75736L16.2425 9.17157L9.17139 16.2426L7.75717 14.8284L14.8282 7.75736Z" />
				}
			/>

			<ToolbarItem
				aria-label="Unset link"
				disabled={!editor.isActive('link')}
				className={editorClasses.toolbar.unsetlink}
				onClick={() => {
					return editor.chain().focus().unsetLink().run();
				}}
				icon={
					<path d="M17.657 14.8284L16.2428 13.4142L17.657 12C19.2191 10.44 19.22 7.91 17.66 6.34316C16.0949 4.78 13.56 4.78 12 6.34316L10.5859 7.75737L9.17171 6.34316L10.5859 4.92895C12.9291 2.59 16.73 2.59 19.07 4.92895C21.4143 7.27 21.41 11.07 19.07 13.4142L17.657 14.8284ZM14.8286 17.6569L13.4143 19.0711C11.0712 21.41 7.27 21.41 4.93 19.0711C2.58592 16.73 2.59 12.93 4.93 10.5858L6.34328 9.17159L7.75749 10.5858L6.34328 12C4.78118 13.56 4.78 16.09 6.34 17.6569C7.90538 19.22 10.44 19.22 12 17.6569L13.4143 16.2427L14.8286 17.6569ZM14.8286 7.75737L16.2428 9.17159L9.17171 16.2427L7.75749 14.8284L14.8286 7.75737ZM5.77539 2.29291L7.70724 1.77527L8.74252 5.63897L6.81067 6.15661L5.77539 2.29291ZM15.2578 18.3611L17.1896 17.8434L18.2249 21.7071L16.293 22.2248L15.2578 18.3611ZM2.29303 5.77527L6.15673 6.81054L5.63909 8.7424L1.77539 7.70712L2.29303 5.77527ZM18.3612 15.2576L22.2249 16.2929L21.7072 18.2248L17.8435 17.1895L18.3612 15.2576Z" />
				}
			/>

			<Popover
				id={anchorEl ? 'simple-popover' : undefined}
				open={!!anchorEl}
				anchorEl={anchorEl}
				onClose={handleClosePopover}
				anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
				slotProps={{ paper: { sx: { p: 2.5 } } }}
			>
				<Typography variant="subtitle2" sx={{ mb: 1 }}>
					URL
				</Typography>

				<Box sx={{ gap: 1, display: 'flex', alignItems: 'center' }}>
					<TextField
						size="small"
						placeholder="Enter URL here..."
						value={url}
						onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
							setUrl(event.target.value);
						}}
						sx={{ width: 240 }}
					/>
					<Button variant="contained" onClick={handleUpdateUrl}>
						Apply
					</Button>
				</Box>
			</Popover>
		</>
	);
};
