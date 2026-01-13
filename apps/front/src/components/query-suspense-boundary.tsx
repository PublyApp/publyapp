import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import {
	type ComponentType,
	type ReactNode,
	Suspense,
	type SuspenseProps,
	useEffect,
	useRef,
} from 'react';
import {
	ErrorBoundary,
	type ErrorBoundaryPropsWithComponent,
	type FallbackProps,
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
}): ComponentType<FallbackProps> => {
	return ({ error, resetErrorBoundary }: FallbackProps) => {
		// biome-ignore lint/correctness/useExhaustiveDependencies: code from template leave as is for now
		useEffect(() => {
			if (location.pathname !== errorLocation.pathname) {
				resetErrorBoundary();
			}
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
