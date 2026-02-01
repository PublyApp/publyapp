import { useLocalStorage } from 'minimal-shared/hooks';
import { createContext, useCallback, useContext, useMemo } from 'react';

import type { BrandContextValue, BrandItem } from './types';

// ----------------------------------------------------------------------

const BRAND_STORAGE_KEY = 'app-current-brand';

type BrandState = {
	brandId: string | null;
};

export const BrandContext = createContext<BrandContextValue | undefined>(
	undefined,
);

// ----------------------------------------------------------------------

export type BrandProviderProps = {
	children: React.ReactNode;
	data: BrandItem[];
};

export function BrandProvider({ children, data }: BrandProviderProps) {
	const { state, setField } = useLocalStorage<BrandState>(BRAND_STORAGE_KEY, {
		brandId: data[0]?.id ?? null,
	});

	const brand = useMemo(
		() => data.find((b) => b.id === state.brandId) ?? data[0] ?? null,
		[data, state.brandId],
	);

	const setBrand = useCallback(
		(newBrand: BrandItem) => {
			setField('brandId', newBrand.id);
		},
		[setField],
	);

	const memoizedValue = useMemo(
		() => ({
			brand,
			brands: data,
			setBrand,
		}),
		[brand, data, setBrand],
	);

	return (
		<BrandContext.Provider value={memoizedValue}>
			{children}
		</BrandContext.Provider>
	);
}

// ----------------------------------------------------------------------

export function useBrand(): BrandContextValue {
	const context = useContext(BrandContext);

	if (!context) {
		throw new Error('useBrand must be used within a BrandProvider');
	}

	return context;
}
