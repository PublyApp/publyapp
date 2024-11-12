import type { ReactNode } from 'react';

import type { ListItemButtonProps } from '@mui/material/ListItemButton';
import type { StackProps } from '@mui/material/Stack';

// ----------------------------------------------------------------------

export type NavConfigProps = {
	hiddenLabel?: boolean;
	itemGap?: number;
	iconSize?: number;
	itemRadius?: number;
	itemPadding?: string;
	currentRole?: string;
	itemSubHeight?: number;
	itemRootHeight?: number;
};

export type NavItemProps = ListItemButtonProps & {
	item: NavListProps;
	depth: number;
	open?: boolean;
	active: boolean;
	externalLink?: boolean;
};

export type NavListProps = {
	title: string;
	path: string;
	icon?: React.ReactElement;
	info?: React.ReactElement;
	caption?: string;
	disabled?: boolean;
	roles?: string[];
	children?: NavListProps[];
};

export type NavSectionProps = StackProps & {
	data: {
		subheader: ReactNode;
		items?: NavListProps[];
	}[];
	config?: NavConfigProps;
};
