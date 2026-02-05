import type { SxProps, Theme } from '@mui/material/styles';

// ----------------------------------------------------------------------

export type BrandItem = {
	id: string;
	name: string;
	logo?: string;
};

export type BrandContextValue = {
	brand: BrandItem | null;
	brands: BrandItem[];
	setBrand: (brand: BrandItem) => void;
};

export type BrandSwitcherProps = {
	sx?: SxProps<Theme>;
};
