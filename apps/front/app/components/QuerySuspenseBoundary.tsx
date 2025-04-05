import { Suspense, type ReactNode, type SuspenseProps } from 'react';

import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary, type ErrorBoundaryProps } from 'react-error-boundary';

type Props = { children?: ReactNode; suspenseFallback?: SuspenseProps['fallback'] } & ErrorBoundaryProps;

const QuerySuspenseBoundary = ({ children, suspenseFallback, onReset, ...props }: Props) => {
	const { reset } = useQueryErrorResetBoundary();

	return (
		<ErrorBoundary
			onReset={(...args) => {
				onReset?.(...args);
				reset();
			}}
			{...props}
		>
			<Suspense fallback={suspenseFallback}>{children}</Suspense>
		</ErrorBoundary>
	);
};

export default QuerySuspenseBoundary;
