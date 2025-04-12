import {
	Suspense,
	useEffect,
	useRef,
	type ReactNode,
	type SuspenseProps,
} from 'react';

import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import {
	ErrorBoundary,
	type ErrorBoundaryPropsWithComponent,
} from 'react-error-boundary';
import { useLocation } from 'react-router';

type Props = {
	children?: ReactNode;
	suspenseFallback?: SuspenseProps['fallback'];
} & ErrorBoundaryPropsWithComponent;

// https://stackoverflow.com/a/71877172/15003148
const getFallBackComponent = ({
	FallbackComponent,
	location,
	errorLocation,
}: {
	FallbackComponent: ErrorBoundaryPropsWithComponent['FallbackComponent'];
	location: ReturnType<typeof useLocation>;
	errorLocation: ReturnType<typeof useLocation>;
}): ErrorBoundaryPropsWithComponent['FallbackComponent'] => {
	return ({ error, resetErrorBoundary }) => {
		useEffect(() => {
			if (location.pathname !== errorLocation.pathname) {
				resetErrorBoundary();
			}
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [location.pathname]);

		if (!FallbackComponent) {
			return <div>Error: No fallback component provided</div>;
		}

		return (
			<FallbackComponent
				error={error}
				resetErrorBoundary={resetErrorBoundary}
			/>
		);
	};
};

const QuerySuspenseBoundary = ({
	children,
	suspenseFallback,
	onReset,
	FallbackComponent,
	...props
}: Props) => {
	const location = useLocation();
	const errorLocation = useRef(location);
	const { reset } = useQueryErrorResetBoundary();

	return (
		<ErrorBoundary
			onReset={(...args) => {
				onReset?.(...args);
				reset();
			}}
			FallbackComponent={getFallBackComponent({
				FallbackComponent,
				location,
				errorLocation: errorLocation.current,
			})}
			{...props}
		>
			<Suspense fallback={suspenseFallback}>{children}</Suspense>
		</ErrorBoundary>
	);
};

export default QuerySuspenseBoundary;
