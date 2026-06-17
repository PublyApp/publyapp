import debounce from 'lodash/debounce';
import { useEffect, useMemo, useRef, useState } from 'react';

type UseUrlBackedDebouncedSearchArgs = {
	persistedValue: string;
	isSelectionMode?: boolean;
	debounceMs?: number;
	onDebouncedValueChange: (value: string) => void;
};

type SearchDraftState = {
	basePersistedValue: string;
	value: string;
};

export const useUrlBackedDebouncedSearch = ({
	persistedValue,
	isSelectionMode = false,
	debounceMs = 300,
	onDebouncedValueChange,
}: UseUrlBackedDebouncedSearchArgs) => {
	const [draftState, setDraftState] = useState<SearchDraftState>({
		basePersistedValue: persistedValue,
		value: persistedValue,
	});
	const onDebouncedValueChangeRef = useRef(onDebouncedValueChange);

	useEffect(() => {
		onDebouncedValueChangeRef.current = onDebouncedValueChange;
	}, [onDebouncedValueChange]);

	const debouncedCommit = useMemo(() => {
		const commit = debounce((nextValue: string) => {
			onDebouncedValueChangeRef.current(nextValue);
		}, debounceMs);

		if (isSelectionMode) {
			commit.cancel();
		}

		return commit;
	}, [debounceMs, isSelectionMode]);

	useEffect(() => {
		return () => {
			debouncedCommit.cancel();
		};
	}, [debouncedCommit]);

	useEffect(() => {
		debouncedCommit.cancel();
	}, [debouncedCommit, persistedValue]);

	const searchValue =
		isSelectionMode || draftState.basePersistedValue !== persistedValue
			? persistedValue
			: draftState.value;

	const handleSearchValueChange = (nextValue: string) => {
		setDraftState({
			basePersistedValue: persistedValue,
			value: nextValue,
		});

		if (isSelectionMode) {
			debouncedCommit.cancel();
			return;
		}

		if (nextValue === persistedValue) {
			debouncedCommit.cancel();
			return;
		}

		debouncedCommit(nextValue);
	};

	return {
		searchValue,
		setSearchValue: handleSearchValueChange,
		debouncedValue: searchValue,
	};
};
