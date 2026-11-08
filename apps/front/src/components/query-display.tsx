import type { UseQueryResult } from '@tanstack/react-query';
import { isValidElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorKindState } from '~/components/error-views/error-kind-state';
import {
	resolveQueryError,
	type ResolvedQueryError,
} from '~/lib/server/query-error-resolver';

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
	/** `page` (default): spinner + full inline error state. `inline`: spinner plus a visible
	 * « Chargement… » label, for menus and selects. `discreet`: nothing while loading and nothing on
	 * error, for banners and badges that only matter when data exists. Explicit slots win. */
	variant?: 'page' | 'inline' | 'discreet';
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
	/** Extra emptiness rule for payloads whose emptiness lives inside the
	 * object (a list response's `data` array, for one): the default check only
	 * sees `undefined`/`null`/an empty top-level array. */
	isEmpty?: (data: TData) => boolean;
	forceRender?: 'loading' | 'error' | 'empty' | 'data';
};

const renderLoading = (
	LoadingSlot: Props['LoadingSlot'],
	loadingLabel: string,
	variant: NonNullable<Props['variant']>,
) => {
	if (typeof LoadingSlot === 'function') {
		const Slot = LoadingSlot;
		return <Slot />;
	}
	if (isValidElement(LoadingSlot) || LoadingSlot !== undefined) {
		return LoadingSlot;
	}
	if (variant === 'discreet') {
		return null;
	}
	if (variant === 'inline') {
		return (
			<span
				data-testid="query-display-inline-loading"
				className="inline-flex items-center gap-2 text-sm text-muted-foreground"
			>
				<LoadingSpinner {...defaultLoadingProps} label={loadingLabel} />
				<span aria-hidden="true">{loadingLabel}</span>
			</span>
		);
	}
	return <LoadingSpinner {...defaultLoadingProps} label={loadingLabel} />;
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

const renderDefaultError = (
	resolved: ResolvedQueryError,
	onRetry: () => void,
	error: unknown,
) => {
	if (resolved.silent) {
		return null;
	}

	return (
		<ErrorKindState
			scale="inline"
			kind={resolved.kind}
			error={error}
			onRetry={onRetry}
		/>
	);
};

const renderError = <TData, TError>(
	error: unknown,
	query: UseQueryResult<TData, TError>,
	ErrorSlot: Props<TData, TError>['ErrorSlot'],
	t: (key: string) => string,
	variant: NonNullable<Props['variant']>,
) => {
	if (typeof ErrorSlot === 'function') {
		const Slot = ErrorSlot;
		return <Slot error={error} query={query} />;
	}
	if (isValidElement(ErrorSlot)) {
		return ErrorSlot;
	}
	if (variant === 'discreet') {
		return null;
	}
	// Issue #2043: the default error branch used to discard the real error
	// and show one generic sentence for every cause (server unreachable, 403,
	// 404, a malformed payload, the browser offline). Resolve whatever the
	// caller threw through the shared status→copy matcher; the fallback
	// branch inside the resolver covers the bare-Error case explicitly.
	return renderDefaultError(
		resolveQueryError(error, t),
		() => void query.refetch(),
		error,
	);
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
	variant = 'page',
	LoadingSlot,
	ErrorSlot,
	EmptySlot,
	isEmpty,
	forceRender,
	children,
}: Props<TData, TError>) => {
	const { t } = useTranslation('common');

	if (forceRender) {
		switch (forceRender) {
			case 'loading':
				return renderLoading(LoadingSlot, t('loading'), variant);
			case 'error':
				return renderError(
					query.error ?? new Error('forced error'),
					query,
					ErrorSlot,
					t,
					variant,
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
		return renderLoading(LoadingSlot, t('loading'), variant);
	}

	if (query.isError) {
		return renderError(query.error, query, ErrorSlot, t, variant);
	}

	// `checkIfEmptyQueryData` short-circuits first, so a custom rule only ever
	// runs on data that exists (never `undefined`/`null`).
	if (checkIfEmptyQueryData(query) || isEmpty?.(query.data as TData) === true) {
		return renderEmpty(EmptySlot);
	}

	return renderData(query, children);
};

export default QueryDisplay;
