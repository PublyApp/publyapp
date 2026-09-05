import type { UseQueryResult } from '@tanstack/react-query';
import { isValidElement, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
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

const renderDefaultError = (resolved: ResolvedQueryError) => (
	// The loading branch already announces itself with `role="status"`
	// `aria-live="polite"` (see LoadingSpinner above); the error branch used a
	// bare `<span>`, so a screen reader user heard "Loading…" when the fetch
	// started and nothing when it failed. Mirror the same live region so the
	// resolved title/description reaches assistive tech (issue #2043).
	<span
		role="status"
		aria-live="polite"
		className="inline-flex flex-col gap-1 text-sm"
	>
		{resolved.code ? (
			<span className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
				{resolved.code}
			</span>
		) : null}
		<span className="font-medium text-foreground">{resolved.title}</span>
		{resolved.description ? (
			<span className="text-muted-foreground">{resolved.description}</span>
		) : null}
	</span>
);

const renderError = <TData, TError>(
	error: unknown,
	query: UseQueryResult<TData, TError>,
	ErrorSlot: Props<TData, TError>['ErrorSlot'],
	t: (key: string) => string,
) => {
	if (typeof ErrorSlot === 'function') {
		const Slot = ErrorSlot;
		return <Slot error={error} query={query} />;
	}
	if (isValidElement(ErrorSlot)) {
		return ErrorSlot;
	}
	// Issue #2043: the default error branch used to discard the real error
	// and show one generic sentence for every cause (server unreachable, 403,
	// 404, a malformed payload, the browser offline). Resolve whatever the
	// caller threw through the shared status→copy matcher; the fallback
	// branch inside the resolver covers the bare-Error case explicitly.
	return renderDefaultError(resolveQueryError(error, t));
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
					t,
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
		return renderError(query.error, query, ErrorSlot, t);
	}

	if (checkIfEmptyQueryData(query)) {
		return renderEmpty(EmptySlot);
	}

	return renderData(query, children);
};

export default QueryDisplay;
