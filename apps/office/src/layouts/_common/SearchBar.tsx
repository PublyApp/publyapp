/* eslint-disable @typescript-eslint/no-use-before-define */
import { memo, useCallback, useState } from 'react';

import Box from '@mui/material/Box';
import Dialog, { dialogClasses } from '@mui/material/Dialog';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import InputBase from '@mui/material/InputBase';
import List from '@mui/material/List';
// import ListItemButton from '@mui/material/ListItemButton';
// import ListItemText from '@mui/material/ListItemText';
import Stack from '@mui/material/Stack';
import { /* alpha, */ useTheme } from '@mui/material/styles';
import match from 'autosuggest-highlight/match';
import parse from 'autosuggest-highlight/parse';

// import { nanoid } from 'nanoid';

import { flattenArray } from '@devist/shared/utils/array.utils';

import type { NavListProps, NavSectionProps } from '@/office/components/nav-section/types';
import { ResultItem } from '@/office/components/ResultItem';
import SearchNotFound from '@/office/components/SearchNotFound';
// import { useNavData } from '@/office/hooks/useNavData';
import Iconify from '@/ui-react/components/Iconify';
import Label from '@/ui-react/components/Label';
import Scrollbar from '@/ui-react/components/Scrollbar';
import useBoolean from '@/ui-react/hooks/useBoolean';
import useEventListener from '@/ui-react/hooks/useEventListener';
import useResponsive from '@/ui-react/hooks/useResponsive';
import useRouter from '@/ui-react/hooks/useRouter';

// ----------------------------------------------------------------------

const SearchBar = () => {
	const theme = useTheme();

	const router = useRouter();

	const search = useBoolean();

	const lgUp = useResponsive('up', 'lg');

	const [searchQuery, setSearchQuery] = useState('');

	// const navData = useNavData();
	const navData: any[] = [];

	const handleClose = useCallback(() => {
		search.setFalse();
		setSearchQuery('');
	}, [search]);

	const handleKeyDown = (event: KeyboardEvent) => {
		if (event.key === 'k' && event.metaKey) {
			search.toggle();
			setSearchQuery('');
		}
	};

	useEventListener('keydown', handleKeyDown);

	const handleClick = useCallback(
		(path: string) => {
			if (path.includes('http')) {
				window.open(path);
			} else {
				router.push(path);
			}

			handleClose();
		},
		[handleClose, router],
	);

	const handleSearch = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
		setSearchQuery(event.target.value);
	}, []);

	const dataFiltered = applyFilter({
		inputData: getAllItems({ data: navData }),
		query: searchQuery,
	});

	const notFound = searchQuery && !dataFiltered.length;

	const renderItems = () => {
		const data = groupedData(dataFiltered);

		return Object.keys(data)
			.sort((a, b) => {
				return -b.localeCompare(a);
			})
			.map((group, index) => {
				return (
					<List key={group || index} disablePadding>
						{data[group].map((item) => {
							const { title, path } = item;

							const partsTitle = parse(title, match(title, searchQuery));

							const partsPath = parse(path, match(path, searchQuery));

							return (
								<ResultItem
									subTitle={partsPath}
									title={partsTitle}
									key={`${title}${path}`}
									groupLabel={searchQuery && group}
									onClickItem={() => {
										return handleClick(path);
									}}
								/>
							);
						})}
					</List>
				);
			});
	};

	const renderButton = (
		<Stack direction="row" alignItems="center">
			<IconButton onClick={search.setTrue}>
				<Iconify icon="eva:search-fill" />
			</IconButton>

			{lgUp && <Label sx={{ px: 0.75, fontSize: 12, color: 'text.secondary' }}>⌘K</Label>}
		</Stack>
	);

	return (
		<>
			{renderButton}

			<Dialog
				fullWidth
				maxWidth="sm"
				open={search.value}
				onClose={handleClose}
				transitionDuration={{
					enter: theme.transitions.duration.shortest,
					exit: 0,
				}}
				PaperProps={{
					sx: {
						mt: 15,
						overflow: 'unset',
					},
				}}
				sx={{
					[`& .${dialogClasses.container}`]: {
						alignItems: 'flex-start',
					},
				}}
			>
				<Box sx={{ p: 3, borderBottom: `solid 1px ${theme.palette.divider}` }}>
					<InputBase
						fullWidth
						autoFocus
						placeholder="Search..."
						value={searchQuery}
						onChange={handleSearch}
						startAdornment={
							<InputAdornment position="start">
								<Iconify icon="eva:search-fill" width={24} sx={{ color: 'text.disabled' }} />
							</InputAdornment>
						}
						endAdornment={<Label sx={{ letterSpacing: 1, color: 'text.secondary' }}>esc</Label>}
						inputProps={{
							sx: { typography: 'h6' },
						}}
					/>
				</Box>

				<Scrollbar sx={{ p: 3, pt: 2, height: 400 }}>
					{notFound ? <SearchNotFound query={searchQuery} sx={{ py: 10 }} /> : renderItems()}
				</Scrollbar>
			</Dialog>
		</>
	);
};

export default memo(SearchBar);

// ----------------------------------------------------------------------

type ItemProps = {
	group: string;
	title: string;
	path: string;
};

export const getAllItems = ({ data }: NavSectionProps) => {
	const reduceItems = data
		.map((list) => {
			return handleLoop(list.items, list.subheader);
		})
		.flat();

	const items = flattenArray(reduceItems).map((option) => {
		const group = splitPath(reduceItems, option.path);

		return {
			group: group && group.length > 1 ? group[0] : option.subheader,
			title: option.title,
			path: option.path,
		};
	});

	return items;
};

// ----------------------------------------------------------------------

type FilterProps = {
	inputData: ItemProps[];
	query: string;
};

export const applyFilter = ({ inputData, query }: FilterProps) => {
	if (query) {
		// eslint-disable-next-line no-param-reassign
		inputData = inputData.filter((item) => {
			return (
				item.title.toLowerCase().indexOf(query.toLowerCase()) !== -1 ||
				item.path.toLowerCase().indexOf(query.toLowerCase()) !== -1
			);
		});
	}

	return inputData;
};

// ----------------------------------------------------------------------

export const splitPath = (array: NavListProps[], key: string) => {
	let stack = array.map((item) => {
		return {
			path: [item.title],
			currItem: item,
		};
	});

	while (stack.length) {
		const { path, currItem } = stack.pop() as {
			path: string[];
			currItem: NavListProps;
		};

		if (currItem.path === key) {
			return path;
		}

		if (currItem.children?.length) {
			stack = stack.concat(
				currItem.children.map((item: NavListProps) => {
					return {
						path: path.concat(item.title),
						currItem: item,
					};
				}),
			);
		}
	}

	return null;
};

// ----------------------------------------------------------------------

export const handleLoop = (array: any, subheader?: string) => {
	return array?.map((list: any) => {
		return {
			subheader,
			...list,
			...(list.children && {
				children: handleLoop(list.children, subheader),
			}),
		};
	});
};

// ----------------------------------------------------------------------

type GroupsProps = {
	[key: string]: ItemProps[];
};

export const groupedData = (array: ItemProps[]) => {
	const group = array.reduce((groups: GroupsProps, item) => {
		// eslint-disable-next-line no-param-reassign
		groups[item.group] = groups[item.group] || [];

		groups[item.group].push(item);

		return groups;
	}, {});

	return group;
};
