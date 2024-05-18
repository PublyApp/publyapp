import type { ReactNode } from 'react';

import { Container, Stack, type ContainerProps, type StackProps } from '@mui/material';
import _ from 'lodash';

// import type { ContainerProps } from '@mui/system';

type Props = {
	children: ReactNode;
	containerProps?: ContainerProps;
	stackProps?: StackProps;
};
// & ContainerProps;

const CompactContainer = ({ children, containerProps, stackProps /* sx, ...other */ }: Props) => {
	return (
		<Container {...containerProps}>
			<Stack
				sx={{
					// py: 12,
					// py: 14,
					pt: 8,
					pb: 18,
					m: 'auto',
					maxWidth: 480,
					// minHeight: '100vh',
					textAlign: 'center',
					justifyContent: 'center',
					...stackProps?.sx,
					// ...sx,
				}}
				{..._.omit(stackProps, ['sx'])}
			>
				{children}
			</Stack>
		</Container>
	);
};

export default CompactContainer;
