import { Container, styled, type ContainerProps } from '@mui/material';

const PageContainer = styled<typeof Container>(({ maxWidth = 'lg', ...otherProps }: ContainerProps) => {
	return <Container maxWidth={maxWidth} {...otherProps} />;
})(() => {
	return {
		flexGrow: 1,
		display: 'flex',
		flexDirection: 'column',
	};
});

export default PageContainer;
