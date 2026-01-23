import Box from '@mui/material/Box';
import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';

// ----------------------------------------------------------------------

type BreadcrumbsPortalContextValue = {
	targetRef: React.RefObject<HTMLDivElement | null>;
	setContent: (content: React.ReactNode) => void;
};

const BreadcrumbsPortalContext = createContext<
	BreadcrumbsPortalContextValue | undefined
>(undefined);

// ----------------------------------------------------------------------

export type BreadcrumbsPortalProviderProps = {
	children: React.ReactNode;
};

export function BreadcrumbsPortalProvider({
	children,
}: BreadcrumbsPortalProviderProps) {
	const targetRef = useRef<HTMLDivElement | null>(null);

	const setContent = useCallback(() => {
		// Content is set via portal, this is just for potential future use
	}, []);

	const value = useMemo(() => ({ targetRef, setContent }), [setContent]);

	return (
		<BreadcrumbsPortalContext.Provider value={value}>
			{children}
		</BreadcrumbsPortalContext.Provider>
	);
}

// ----------------------------------------------------------------------

export function useBreadcrumbsPortal() {
	return useContext(BreadcrumbsPortalContext);
}

// ----------------------------------------------------------------------

export type BreadcrumbsPortalTargetProps = {
	sx?: React.ComponentProps<typeof Box>['sx'];
};

export function BreadcrumbsPortalTarget({ sx }: BreadcrumbsPortalTargetProps) {
	const context = useBreadcrumbsPortal();

	if (!context) {
		return null;
	}

	return (
		<Box
			ref={context.targetRef}
			sx={[
				{
					flex: '1 1 auto',
					display: 'flex',
					alignItems: 'center',
					minWidth: 0,
				},
				...(Array.isArray(sx) ? sx : [sx]),
			]}
		/>
	);
}

// ----------------------------------------------------------------------

export type BreadcrumbsPortalContentProps = {
	children: React.ReactNode;
};

export function BreadcrumbsPortalContent({
	children,
}: BreadcrumbsPortalContentProps) {
	const context = useBreadcrumbsPortal();

	if (!context?.targetRef.current) {
		// Fallback: render inline if no portal target
		return <>{children}</>;
	}

	return createPortal(children, context.targetRef.current);
}
