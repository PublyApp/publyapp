import Paper, { type PaperProps } from '@mui/material/Paper';
import { styled } from '@mui/material/styles';
import _ from 'lodash';
import type { ReactNode, RefObject } from 'react';
import { useEffect, useState } from 'react';

type Placement =
	| 'bottom-right'
	| 'bottom-left'
	| 'bottom-center'
	| 'top-right'
	| 'top-left'
	| 'top-center';

interface FloatingCardProps extends Omit<PaperProps, 'elevation'> {
	children: ReactNode;
	placement?: Placement;
	offset?: number;
	elevation?: number;
	onClose?: () => void;
	/**
	 * Optional ref to a parent container element.
	 * When provided, the card will center itself relative to this container
	 * instead of the viewport (for center placements).
	 */
	parentContainerRef?: RefObject<HTMLElement | null>;
}

const StyledPaper = styled(Paper, {
	shouldForwardProp: (prop) => prop !== 'placement' && prop !== 'offset',
})<{
	placement: Placement;
	offset: number;
}>(({ theme, placement, offset }) => {
	const positions: Record<Placement, Record<string, number | string>> = {
		'bottom-right': { bottom: offset, right: offset },
		'bottom-left': { bottom: offset, left: offset },
		'bottom-center': {
			bottom: offset,
			left: '50%',
			transform: 'translateX(-50%)',
		},
		'top-right': { top: offset, right: offset },
		'top-left': { top: offset, left: offset },
		'top-center': { top: offset, left: '50%', transform: 'translateX(-50%)' },
	};

	return {
		position: 'fixed',
		...positions[placement],
		padding: theme.spacing(2),
		minWidth: 250,
		maxWidth: 400,
		borderRadius: theme.shape.borderRadius,
		zIndex: theme.zIndex.speedDial,

		// Responsive positioning
		[theme.breakpoints.down('sm')]: {
			minWidth: 200,
			maxWidth: 'calc(100vw - 32px)',
			...(placement.includes('left') && { left: 16 }),
			...(placement.includes('right') && { right: 16 }),
			...(placement.includes('bottom') && { bottom: 16 }),
			...(placement.includes('top') && { top: 16 }),
		},
	};
});

export function FloatingCard({
	children,
	placement = 'bottom-right',
	offset = 20,
	elevation = 6,
	onClose,
	parentContainerRef,
	...paperProps
}: FloatingCardProps) {
	const [parentPosition, setParentPosition] = useState<{
		left: number;
		width: number;
	} | null>(null);

	// Track parent container position when ref is provided
	useEffect(() => {
		if (!parentContainerRef?.current) return;

		const updatePosition = () => {
			if (parentContainerRef.current) {
				const rect = parentContainerRef.current.getBoundingClientRect();
				setParentPosition({
					left: rect.left,
					width: rect.width,
				});
			}
		};

		// Initial position - no throttling/debouncing needed
		updatePosition();

		// Throttle scroll events to ~60fps (16ms)
		const throttledUpdate = _.throttle(updatePosition, 16);

		// Debounce resize events (wait 150ms after resize stops)
		const debouncedUpdate = _.debounce(updatePosition, 150);

		window.addEventListener('resize', debouncedUpdate);
		window.addEventListener('scroll', throttledUpdate, true);

		return () => {
			window.removeEventListener('resize', debouncedUpdate);
			window.removeEventListener('scroll', throttledUpdate, true);

			// Cancel any pending throttled/debounced calls
			throttledUpdate.cancel();
			debouncedUpdate.cancel();
		};
	}, [parentContainerRef]);

	// Calculate custom positioning when parent container ref is provided
	const customSx =
		parentContainerRef && parentPosition && placement.includes('center')
			? {
					position: 'fixed' as const,
					...(placement.includes('bottom') && { bottom: offset }),
					...(placement.includes('top') && { top: offset }),
					left: parentPosition.left + parentPosition.width / 2,
					transform: 'translateX(-50%)',
				}
			: undefined;

	return (
		<StyledPaper
			placement={placement}
			offset={offset}
			elevation={elevation}
			{...paperProps}
			sx={{
				...paperProps.sx,
				...(customSx && customSx),
			}}
		>
			{/* {onClose && (
				<IconButton
					size="small"
					onClick={onClose}
					sx={{
						position: 'absolute',
						top: 8,
						right: 8,
					}}
					aria-label="Close"
				>
					<CloseIcon fontSize="small" />
				</IconButton>
			)} */}
			{/* <Box sx={{ ...(onClose && { pr: 4 }) }}>{children}</Box> */}
			{children}
		</StyledPaper>
	);
}
