import { useState } from 'react';

import {
	alpha,
	Button,
	ClickAwayListener,
	IconButton,
	Input,
	InputAdornment,
	Slide,
	styled,
	type SxProps,
	type Theme,
} from '@mui/material';

import { HEADER } from '@/front/lib/constants';
import Iconify from '@/ui-react/components/Iconify';

// ----------------------------------------------------------------------

const StyledSearchBar = styled('div')(({ theme }) => {
	return {
		top: 0,
		left: 0,
		zIndex: 99,
		width: '100%',
		display: 'flex',
		position: 'absolute',
		alignItems: 'center',
		height: HEADER.H_MOBILE,
		backdropFilter: 'blur(6px)',
		WebkitBackdropFilter: 'blur(6px)', // Fix on Mobile
		padding: theme.spacing(0, 3),
		boxShadow: theme.customShadows.z8,
		backgroundColor: `${alpha(theme.palette.background.default, 0.72)}`,
		[theme.breakpoints.up('md')]: {
			height: HEADER.H_MAIN_DESKTOP,
			padding: theme.spacing(0, 5),
		},
	};
});

// ----------------------------------------------------------------------

type SearchBarProps = {
	sx?: SxProps<Theme>;
};

const SearchBar = ({ sx }: SearchBarProps) => {
	const [open, setOpen] = useState(false);

	const handleOpen = () => {
		setOpen((prev) => {
			return !prev;
		});
	};

	const handleClose = () => {
		setOpen(false);
	};

	return (
		<ClickAwayListener onClickAway={handleClose}>
			<div>
				<IconButton color="inherit" aria-label="search" onClick={handleOpen} sx={sx}>
					<Iconify icon="carbon:search" />
				</IconButton>

				<Slide direction="down" in={open} mountOnEnter unmountOnExit>
					<StyledSearchBar>
						<Input
							autoFocus
							fullWidth
							disableUnderline
							placeholder="Search…"
							startAdornment={
								<InputAdornment position="start">
									<Iconify icon="carbon:search" sx={{ color: 'text.disabled' }} />
								</InputAdornment>
							}
							sx={{ mr: 1, fontWeight: 'fontWeightBold' }}
						/>
						<Button variant="contained" onClick={handleClose}>
							Search
						</Button>
					</StyledSearchBar>
				</Slide>
			</div>
		</ClickAwayListener>
	);
};

export default SearchBar;
