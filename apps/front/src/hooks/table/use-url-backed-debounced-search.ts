import { useDebounce } from 'minimal-shared/hooks';
import { useEffect, useRef, useState } from 'react';

import { getSelectionLockedSearchAction } from '#app/lib/mrt-table/selection-locked-search.ts';

type UseUrlBackedDebouncedSearchArgs = {
	persistedValue: string;
	isSelectionMode?: boolean;
	debounceMs?: number;
	onDebouncedValueChange: (value: string) => void;
};

export const useUrlBackedDebouncedSearch = ({
	persistedValue,
	isSelectionMode = false,
	debounceMs = 300,
	onDebouncedValueChange,
}: UseUrlBackedDebouncedSearchArgs) => {
	const [searchValue, setSearchValue] = useState(persistedValue);
	const debouncedValue = useDebounce(searchValue, debounceMs);
	const isCancellingSelectionLockedSearchRef = useRef(false);

	useEffect(() => {
		if (isSelectionMode) {
			return;
		}

		// This is an external-store sync, not derived-state mirroring. The URL query
		// is the committed server filter, while searchValue is the immediate input
		// draft. Keep the draft aligned when navigation/back-forward or a reset changes
		// the URL outside this input. Do not depend on searchValue here: typing is
		// allowed to diverge locally until the debounce commits back to the URL.
		setSearchValue((currentValue) => {
			return currentValue === persistedValue ? currentValue : persistedValue;
		});
	}, [isSelectionMode, persistedValue]);

	useEffect(() => {
		if (!isSelectionMode) {
			return;
		}

		isCancellingSelectionLockedSearchRef.current = true;

		// Bulk-selection mode freezes search so selected row ids cannot silently drift
		// under a new query. Snap the draft back to the committed URL value and wait for
		// the pending debounce cycle to settle before accepting future search changes.
		setSearchValue((currentValue) => {
			return currentValue === persistedValue ? currentValue : persistedValue;
		});
	}, [isSelectionMode, persistedValue]);

	useEffect(() => {
		const searchAction = getSelectionLockedSearchAction({
			isSelectionMode,
			isCancellingSelectionLockedSearch:
				isCancellingSelectionLockedSearchRef.current,
			searchValue,
			debouncedValue,
			persistedValue,
		});

		if (searchAction === 'wait' || searchAction === 'none') {
			return;
		}

		if (
			searchAction === 'clear-cancel' ||
			searchAction === 'clear-cancel-and-apply'
		) {
			isCancellingSelectionLockedSearchRef.current = false;

			if (searchAction === 'clear-cancel') {
				return;
			}
		}

		onDebouncedValueChange(debouncedValue);
	}, [
		debouncedValue,
		isSelectionMode,
		onDebouncedValueChange,
		persistedValue,
		searchValue,
	]);

	return {
		searchValue,
		setSearchValue,
		debouncedValue,
	};
};
