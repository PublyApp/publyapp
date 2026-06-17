import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Stack, { type StackProps } from '@mui/material/Stack';
import type { SxProps, Theme } from '@mui/material/styles';
import { varAlpha } from 'minimal-shared/utils';

import { editorClasses } from './classes';
import { HeadingBlock } from './components/heading-block';
import { ImageBlock } from './components/image-block';
import { LinkBlock } from './components/link-block';
import { ToolbarItem } from './components/toolbar-item';
import type { EditorToolbarProps } from './types';

// ----------------------------------------------------------------------

/**
 * Icons
 * https://remixicon.com
 */

export const Toolbar = ({
	sx,
	editor,
	fullItem,
	fullScreen,
	onToggleFullScreen,
	...other
}: StackProps & EditorToolbarProps) => {
	if (!editor) {
		return null;
	}

	const boxStyles: SxProps<Theme> = {
		gap: 0.5,
		display: 'flex',
	};

	return (
		<Stack
			className={editorClasses.toolbar.root}
			divider={
				<Divider
					orientation="vertical"
					flexItem
					sx={{ height: 16, my: 'auto' }}
				/>
			}
			sx={[
				(theme) => {
					return {
						gap: 1,
						p: 1.25,
						flexWrap: 'wrap',
						flexDirection: 'row',
						alignItems: 'center',
						bgcolor: 'background.paper',
						borderTopLeftRadius: 'inherit',
						borderTopRightRadius: 'inherit',
						borderBottom: `solid 1px ${varAlpha(theme.vars.palette.grey['500Channel'], 0.2)}`,
					};
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
			{...other}
		>
			<HeadingBlock editor={editor} />

			{/* Text style */}
			<Box sx={{ ...boxStyles }}>
				<ToolbarItem
					aria-label="Bold"
					active={editor.isActive('bold')}
					className={editorClasses.toolbar.bold}
					onClick={() => {
						return editor.chain().focus().toggleBold().run();
					}}
					icon={
						<path d="M8 11H12.5C13.8807 11 15 9.88 15 8.5C15 7.12 13.88 6 12.5 6H8V11ZM18 15.5C18 17.99 15.99 20 13.5 20H6V4H12.5C14.9853 4 17 6.01 17 8.5C17 9.7 16.53 10.8 15.76 11.6058C17.0979 12.38 18 13.84 18 15.5ZM8 13V18H13.5C14.8807 18 16 16.88 16 15.5C16 14.12 14.88 13 13.5 13H8Z" />
					}
				/>
				<ToolbarItem
					aria-label="Italic"
					active={editor.isActive('italic')}
					className={editorClasses.toolbar.italic}
					onClick={() => {
						return editor.chain().focus().toggleItalic().run();
					}}
					icon={
						<path d="M15 20H7V18H9.92661L12.0425 6H9V4H17V6H14.0734L11.9575 18H15V20Z" />
					}
				/>
				<ToolbarItem
					aria-label="Underline"
					active={editor.isActive('underline')}
					className={editorClasses.toolbar.underline}
					onClick={() => {
						return editor.chain().focus().toggleUnderline().run();
					}}
					icon={
						<path d="M8 3V12C8 14.21 9.79 16 12 16C14.2091 16 16 14.21 16 12V3H18V12C18 15.31 15.31 18 12 18C8.68629 18 6 15.31 6 12V3H8ZM4 20H20V22H4V20Z" />
					}
				/>
				<ToolbarItem
					aria-label="Strike"
					active={editor.isActive('strike')}
					className={editorClasses.toolbar.italic}
					onClick={() => {
						return editor.chain().focus().toggleStrike().run();
					}}
					icon={
						<path d="M17.1538 14C17.3846 14.52 17.5 15.09 17.5 15.7196C17.5 17.06 16.98 18.11 15.93 18.867C14.8809 19.62 13.43 20 11.59 20C9.94674 20 8.32 19.62 6.72 18.8555V16.6009C8.23538 17.48 9.79 17.92 11.38 17.917C13.9333 17.92 15.21 17.18 15.22 15.7196C15.2208 15.09 15 14.56 14.57 14.1173C14.5339 14.08 14.49 14.04 14.45 14H3V12H21V14H17.1538ZM13.076 11H7.62908C7.4566 10.84 7.3 10.67 7.15 10.4778C6.71592 9.92 6.5 9.25 6.5 8.45207C6.5 7.22 6.97 6.17 7.9 5.299C8.82916 4.43 10.27 4 12.22 4C13.6934 4 15.1 4.33 16.44 4.98426V7.13591C15.2448 6.45 13.93 6.11 12.5 6.10587C10.0187 6.11 8.78 6.89 8.78 8.45207C8.77917 8.87 9 9.24 9.43 9.55079C9.86878 9.86 10.41 10.11 11.05 10.3004C11.6665 10.48 12.34 10.71 13.08 11H13.076Z" />
					}
				/>
			</Box>

			{/* List */}
			<Box sx={{ ...boxStyles }}>
				<ToolbarItem
					aria-label="Bullet list"
					active={editor.isActive('bulletList')}
					className={editorClasses.toolbar.bulletList}
					onClick={() => {
						return editor.chain().focus().toggleBulletList().run();
					}}
					icon={
						<path d="M8 4H21V6H8V4ZM4.5 6.5C3.67157 6.5 3 5.83 3 5C3 4.17 3.67 3.5 4.5 3.5C5.32843 3.5 6 4.17 6 5C6 5.83 5.33 6.5 4.5 6.5ZM4.5 13.5C3.67157 13.5 3 12.83 3 12C3 11.17 3.67 10.5 4.5 10.5C5.32843 10.5 6 11.17 6 12C6 12.83 5.33 13.5 4.5 13.5ZM4.5 20.4C3.67157 20.4 3 19.73 3 18.9C3 18.07 3.67 17.4 4.5 17.4C5.32843 17.4 6 18.07 6 18.9C6 19.73 5.33 20.4 4.5 20.4ZM8 11H21V13H8V11ZM8 18H21V20H8V18Z" />
					}
				/>
				<ToolbarItem
					aria-label="Ordered list"
					active={editor.isActive('orderedList')}
					className={editorClasses.toolbar.orderedList}
					onClick={() => {
						return editor.chain().focus().toggleOrderedList().run();
					}}
					icon={
						<path d="M8 4H21V6H8V4ZM5 3V6H6V7H3V6H4V4H3V3H5ZM3 14V11.5H5V11H3V10H6V12.5H4V13H6V14H3ZM5 19.5H3V18.5H5V18H3V17H6V21H3V20H5V19.5ZM8 11H21V13H8V11ZM8 18H21V20H8V18Z" />
					}
				/>
			</Box>

			{/* Text align */}
			<Box sx={{ ...boxStyles }}>
				<ToolbarItem
					aria-label="Align left"
					active={editor.isActive({ textAlign: 'left' })}
					className={editorClasses.toolbar.alignLeft}
					onClick={() => {
						return editor.chain().focus().setTextAlign('left').run();
					}}
					icon={
						<path d="M3 4H21V6H3V4ZM3 19H17V21H3V19ZM3 14H21V16H3V14ZM3 9H17V11H3V9Z" />
					}
				/>
				<ToolbarItem
					aria-label="Align center"
					active={editor.isActive({ textAlign: 'center' })}
					className={editorClasses.toolbar.alignCenter}
					onClick={() => {
						return editor.chain().focus().setTextAlign('center').run();
					}}
					icon={
						<path d="M3 4H21V6H3V4ZM5 19H19V21H5V19ZM3 14H21V16H3V14ZM5 9H19V11H5V9Z" />
					}
				/>
				<ToolbarItem
					aria-label="Align right"
					active={editor.isActive({ textAlign: 'right' })}
					className={editorClasses.toolbar.alignRight}
					onClick={() => {
						return editor.chain().focus().setTextAlign('right').run();
					}}
					icon={
						<path d="M3 4H21V6H3V4ZM7 19H21V21H7V19ZM3 14H21V16H3V14ZM7 9H21V11H7V9Z" />
					}
				/>
				<ToolbarItem
					aria-label="Align justify"
					active={editor.isActive({ textAlign: 'justify' })}
					className={editorClasses.toolbar.alignJustify}
					onClick={() => {
						return editor.chain().focus().setTextAlign('justify').run();
					}}
					icon={
						<path d="M3 4H21V6H3V4ZM3 19H21V21H3V19ZM3 14H21V16H3V14ZM3 9H21V11H3V9Z" />
					}
				/>
			</Box>

			{/* Code - Code block */}
			{fullItem && (
				<Box sx={{ ...boxStyles }}>
					<ToolbarItem
						aria-label="Align justify"
						active={editor.isActive('code')}
						className={editorClasses.toolbar.code}
						onClick={() => {
							return editor.chain().focus().toggleCode().run();
						}}
						icon={
							<path d="M16.95 8.46448L18.3642 7.05026L23.3139 12L18.3642 16.9498L16.95 15.5355L20.4855 12L16.95 8.46448ZM7.05048 8.46448L3.51495 12L7.05048 15.5355L5.63627 16.9498L0.686523 12L5.63627 7.05026L7.05048 8.46448Z" />
						}
					/>
					<ToolbarItem
						aria-label="Align justify"
						active={editor.isActive('codeBlock')}
						className={editorClasses.toolbar.codeBlock}
						onClick={() => {
							return editor.chain().focus().toggleCodeBlock().run();
						}}
						icon={
							<path d="M3 3H21C21.5523 3 22 3.45 22 4V20C22 20.55 21.55 21 21 21H3C2.44772 21 2 20.55 2 20V4C2 3.45 2.45 3 3 3ZM4 5V19H20V5H4ZM20 12L16.4645 15.5355L15.0503 14.1213L17.1716 12L15.0503 9.87868L16.4645 8.46447L20 12ZM6.82843 12L8.94975 14.1213L7.53553 15.5355L4 12L7.53553 8.46447L8.94975 9.87868L6.82843 12ZM11.2443 17H9.11597L12.7557 7H14.884L11.2443 17Z" />
						}
					/>
				</Box>
			)}

			{/* Blockquote - Hr line */}
			{fullItem && (
				<Box sx={{ ...boxStyles }}>
					<ToolbarItem
						aria-label="Blockquote"
						active={editor.isActive('blockquote')}
						className={editorClasses.toolbar.blockquote}
						onClick={() => {
							return editor.chain().focus().toggleBlockquote().run();
						}}
						icon={
							<path d="M4.58341 17.3211C3.55316 16.23 3 15 3 13.0103C3 9.51 5.46 6.37 9.03 4.82318L9.92328 6.20079C6.58804 8.01 5.94 10.35 5.68 11.822C6.21263 11.54 6.92 11.45 7.6 11.5105C9.40908 11.68 10.83 13.16 10.83 15C10.8312 16.93 9.26 18.5 7.33 18.5C6.2581 18.5 5.23 18.01 4.58 17.3211ZM14.5834 17.3211C13.5532 16.23 13 15 13 13.0103C13 9.51 15.46 6.37 19.03 4.82318L19.9233 6.20079C16.588 8.01 15.94 10.35 15.68 11.822C16.2126 11.54 16.92 11.45 17.6 11.5105C19.4091 11.68 20.83 13.16 20.83 15C20.8312 16.93 19.26 18.5 17.33 18.5C16.2581 18.5 15.23 18.01 14.58 17.3211Z" />
						}
					/>
					<ToolbarItem
						aria-label="Horizontal"
						className={editorClasses.toolbar.hr}
						onClick={() => {
							return editor.chain().focus().setHorizontalRule().run();
						}}
						icon={
							<path d="M2 11H4V13H2V11ZM6 11H18V13H6V11ZM20 11H22V13H20V11Z" />
						}
					/>
				</Box>
			)}

			{/* Link - Image */}
			<Box sx={{ ...boxStyles }}>
				<LinkBlock editor={editor} />
				<ImageBlock editor={editor} />
			</Box>

			{/* HardBreak - Clear */}
			<Box sx={{ ...boxStyles }}>
				<ToolbarItem
					aria-label="HardBreak"
					onClick={() => {
						return editor.chain().focus().setHardBreak().run();
					}}
					className={editorClasses.toolbar.hardbreak}
					icon={
						<path d="M15 18H16.5C17.8807 18 19 16.88 19 15.5C19 14.12 17.88 13 16.5 13H3V11H16.5C18.9853 11 21 13.01 21 15.5C21 17.99 18.99 20 16.5 20H15V22L11 19L15 16V18ZM3 4H21V6H3V4ZM9 18V20H3V18H9Z" />
					}
				/>
				<ToolbarItem
					aria-label="Clear"
					className={editorClasses.toolbar.clear}
					onClick={() => {
						return editor.chain().focus().clearNodes().unsetAllMarks().run();
					}}
					icon={
						<path d="M12.6512 14.0654L11.6047 20H9.57389L10.9247 12.339L3.51465 4.92892L4.92886 3.51471L20.4852 19.0711L19.071 20.4853L12.6512 14.0654ZM11.7727 7.53009L12.0425 5.99999H10.2426L8.24257 3.99999H19.9999V5.99999H14.0733L13.4991 9.25652L11.7727 7.53009Z" />
					}
				/>
			</Box>

			{/* Undo - Redo */}
			{fullItem && (
				<Box sx={{ ...boxStyles }}>
					<ToolbarItem
						aria-label="Undo"
						className={editorClasses.toolbar.undo}
						disabled={!editor.can().chain().focus().undo().run()}
						onClick={() => {
							return editor.chain().focus().undo().run();
						}}
						icon={
							<path d="M8 7V11L2 6L8 1V5H13C17.4183 5 21 8.58 21 13C21 17.42 17.42 21 13 21H4V19H13C16.3137 19 19 16.31 19 13C19 9.69 16.31 7 13 7H8Z" />
						}
					/>
					<ToolbarItem
						aria-label="Redo"
						className={editorClasses.toolbar.redo}
						disabled={!editor.can().chain().focus().redo().run()}
						onClick={() => {
							return editor.chain().focus().redo().run();
						}}
						icon={
							<path d="M16 7H11C7.68629 7 5 9.69 5 13C5 16.31 7.69 19 11 19H20V21H11C6.58172 21 3 17.42 3 13C3 8.58 6.58 5 11 5H16V1L22 6L16 11V7Z" />
						}
					/>
				</Box>
			)}

			<Box sx={{ ...boxStyles }}>
				<ToolbarItem
					aria-label="Fullscreen"
					active={fullScreen}
					className={editorClasses.toolbar.fullscreen}
					onClick={onToggleFullScreen}
					icon={
						fullScreen ? (
							<path d="M18 7H22V9H16V3H18V7ZM8 9H2V7H6V3H8V9ZM18 17V21H16V15H22V17H18ZM8 15V21H6V17H2V15H8Z" />
						) : (
							<path d="M16 3H22V9H20V5H16V3ZM2 3H8V5H4V9H2V3ZM20 19V15H22V21H16V19H20ZM4 19H8V21H2V15H4V19Z" />
						)
					}
				/>
			</Box>
		</Stack>
	);
};
