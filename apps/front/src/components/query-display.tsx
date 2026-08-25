import type { UseQueryResult } from '@tanstack/react-query';
import { isValidElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { checkIfEmptyQueryData } from '@org/shared-ts/lib/query/query-state';

type LoadingMode = 'loading' | 'pending' | 'fetching';
type LoadingSpinnerProps = {
	size?: 'sm' | 'md' | 'lg';
	className?: string;
};
const LOADING_SPINNER_SIZE_CLASS = {
	sm: 'size-4',
	md: 'size-6',
	lg: 'size-8',
} satisfies Record<NonNullable<LoadingSpinnerProps['size']>, string>;

type RenderSlot<TProps = object> =
	| ReactNode
	| React.JSXElementConstructor<TProps>;

type Props<TData = unknown, TError = Error> = {
	query: UseQueryResult<TData, TError>;
	loadingStrategy?: LoadingMode; // defaults to 'pending'
	LoadingSlot?: RenderSlot;
	ErrorSlot?: RenderSlot<{
		error: unknown;
		query: UseQueryResult<TData, TError>;
	}>;
	EmptySlot?: RenderSlot;
	// Render prop only (not ComponentType): an inline closure passed here must
	// stay a render function, and direct invocation keeps the element tree stable
	// across parent rerenders instead of remounting the data subtree.
	children?: ReactNode | ((props: { data: TData }) => ReactNode);
	forceRender?: 'loading' | 'error' | 'empty' | 'data';
};

const renderLoading = (
	LoadingSlot: Props['LoadingSlot'],
	loadingLabel: string,
) => {
	if (typeof LoadingSlot === 'function') {
		const Slot = LoadingSlot;
		return <Slot />;
	}
	if (isValidElement(LoadingSlot)) {
		return LoadingSlot;
	}
	return (
		LoadingSlot ?? (
			<LoadingSpinner {...defaultLoadingProps} label={loadingLabel} />
		)
	);
};

const LoadingSpinner = ({
	size = 'sm',
	className,
	label,
}: LoadingSpinnerProps & { label: string }) => (
	<span
		role="status"
		aria-label={label}
		className={`${LOADING_SPINNER_SIZE_CLASS[size]} animate-spin rounded-full border-2 border-muted-foreground/30 border-t-foreground ${
			className ?? ''
		}`}
	/>
);

const renderError = <TData, TError>(
	error: unknown,
	query: UseQueryResult<TData, TError>,
	ErrorSlot: Props<TData, TError>['ErrorSlot'],
	errorMessage: string,
) => {
	if (typeof ErrorSlot === 'function') {
		const Slot = ErrorSlot;
		return <Slot error={error} query={query} />;
	}
	if (isValidElement(ErrorSlot)) {
		return ErrorSlot;
	}
	return <span>{errorMessage}</span>;
};

const renderEmpty = (EmptySlot?: Props['EmptySlot']) => {
	if (typeof EmptySlot === 'function') {
		const Slot = EmptySlot;
		return <Slot />;
	}
	if (isValidElement(EmptySlot)) {
		return EmptySlot;
	}
	return EmptySlot ?? null;
};

const renderData = <TData, TError>(
	query: UseQueryResult<TData, TError>,
	children?: Props<TData, TError>['children'],
) => {
	if (typeof children === 'function') {
		// Invoke the render prop directly instead of mounting it as a component:
		// an inline closure is a new component type on every parent render, which
		// would remount (and reset) the whole data subtree — forms included — on
		// each keystroke. Direct invocation keeps the returned element tree stable.
		return children({ data: query.data as TData });
	}
	if (isValidElement(children)) {
		return children;
	}
	return children;
};

const defaultLoadingProps: LoadingSpinnerProps = {
	size: 'sm',
};

const QueryDisplay = <TData = unknown, TError = Error>({
	query,
	loadingStrategy = 'pending',
	LoadingSlot,
	ErrorSlot,
	EmptySlot,
	forceRender,
	children,
}: Props<TData, TError>) => {
	const { t } = useTranslation('common');

	if (forceRender) {
		switch (forceRender) {
			case 'loading':
				return renderLoading(LoadingSlot, t('loading'));
			case 'error':
				return renderError(
					query.error ?? new Error('forced error'),
					query,
					ErrorSlot,
					t('query-display-error-default'),
				);
			case 'empty':
				return renderEmpty(EmptySlot);
			case 'data':
				return renderData(query, children);
		}
	}

	let showLoading = query.isPending;
	if (loadingStrategy === 'loading') {
		showLoading = query.isLoading;
	} else if (loadingStrategy === 'fetching') {
		showLoading = Boolean(query.isFetching);
	}

	if (showLoading) {
		return renderLoading(LoadingSlot, t('loading'));
	}

	if (query.isError) {
		return renderError(
			query.error,
			query,
			ErrorSlot,
			t('query-display-error-default'),
		);
	}

	if (checkIfEmptyQueryData(query)) {
		return renderEmpty(EmptySlot);
	}

	return renderData(query, children);
};

export default QueryDisplay;
