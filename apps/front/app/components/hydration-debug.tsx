import { useEffect, useState } from 'react';

interface HydrationDebugProps {
	children: React.ReactNode;
	name?: string;
}

export const HydrationDebug = ({
	children,
	name = 'Component',
}: HydrationDebugProps) => {
	const [isHydrated, setIsHydrated] = useState(false);

	useEffect(() => {
		setIsHydrated(true);
	}, []);

	if (import.meta.env.DEV && !isHydrated) {
		return (
			<div
				style={{
					border: '2px dashed red',
					padding: '8px',
					margin: '4px',
					backgroundColor: '#fff3cd',
					color: '#856404',
				}}
			>
				<strong>Hydration Debug - {name}</strong>
				<br />
				Server-side rendered content (will be replaced on client)
				{children}
			</div>
		);
	}

	return <>{children}</>;
};
