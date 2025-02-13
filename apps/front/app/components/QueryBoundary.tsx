import { Suspense, type ReactNode, type SuspenseProps } from 'react';

import { QueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorBoundary, type ErrorBoundaryProps } from 'react-error-boundary';

type Props = { children?: ReactNode; suspenseFallback?: SuspenseProps['fallback'] } & ErrorBoundaryProps;

const QueryBoundary = ({ children, suspenseFallback, onReset, ...props }: Props) => {
	return (
		<QueryErrorResetBoundary>
			{({ reset }) => {
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
			}}
		</QueryErrorResetBoundary>
	);
};

export default QueryBoundary;
