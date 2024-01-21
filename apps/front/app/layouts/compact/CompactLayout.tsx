import { Container, Stack } from '@mui/material';
import { Outlet } from '@remix-run/react';

import useOffSetTop from '@devist/ui-react/hooks/useOffsetTop';

import Header from './Header';

// ----------------------------------------------------------------------
type Props = { children?: React.ReactNode };

const CompactLayout = ({ children }: Props) => {
	const isOffset = useOffSetTop();

	return (
		<>
			<Header isOffset={isOffset} />

			<Container component="main">
				<Stack
					sx={{
						py: 12,
						m: 'auto',
						maxWidth: 480,
						minHeight: '100vh',
						textAlign: 'center',
						justifyContent: 'center',
					}}
				>
					{children ?? <Outlet />}
				</Stack>
			</Container>
		</>
	);
};

export default CompactLayout;
