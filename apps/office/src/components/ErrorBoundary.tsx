// import { type ComponentType, type ReactNode } from 'react';

// import { /* QueryErrorResetBoundary, */ useQueryErrorResetBoundary } from '@tanstack/react-query';
// import { ErrorBoundary as ErrorBoundaryLib, type FallbackProps } from 'react-error-boundary';
// import { Outlet } from 'react-router-dom';

// const ErrorBoundary = ({
// 	FallbackComponent,
// 	children,
// }: {
// 	FallbackComponent: ComponentType<FallbackProps>;
// 	children?: ReactNode;
// }) => {
// 	const { reset } = useQueryErrorResetBoundary();

// 	return (
// 		<ErrorBoundaryLib
// 			FallbackComponent={FallbackComponent}
// 			onReset={() => {
// 				console.log('call');
// 				reset();
// 			}}
// 		>
// 			{/* eslint-disable-next-line @typescript-eslint/no-use-before-define */}
// 			{/* <Composed /> */}
// 			{children ?? <Outlet />}
// 		</ErrorBoundaryLib>
// 	);

// 	// return (
// 	// 	<QueryErrorResetBoundary>
// 	// 		{({ reset }) => {
// 	// 			return (
// 	// 				<ErrorBoundaryLib FallbackComponent={FallbackComponent} onReset={reset}>
// 	// 					{children ?? <Outlet />}
// 	// 				</ErrorBoundaryLib>
// 	// 			);
// 	// 		}}
// 	// 	</QueryErrorResetBoundary>
// 	// );
// };

// export default ErrorBoundary;

// // const Composed = () => {
// // 	const location = useLocation();
// // 	const { resetBoundary } = useErrorBoundary();

// // 	// useEffect(() => {
// // 	// 	console.log(location.key);
// // 	// });

// // 	useEffect(() => {
// // 		console.log(location.key);
// // 		resetBoundary();
// // 	}, [resetBoundary, location.key]);

// // 	return null;
// // };

// // export const useResetErrorBoundaryEffect = (resetBoundary: (...args: any[]) => void) => {
// // 	const location = useLocation();
// // 	// const { resetBoundary } = useErrorBoundary();

// // 	// useEffect(() => {
// // 	// 	console.log(location.key);
// // 	// });

// // 	useEffect(() => {
// // 		console.log(location.key);
// // 		resetBoundary();
// // 	}, [resetBoundary, location.key]);
// // };
