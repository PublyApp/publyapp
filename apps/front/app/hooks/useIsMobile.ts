// import { useMediaQuery } from '@mantine/hooks';

// TODO: use mantine theme value
const MOBILE_BREAKPOINT = 768;

export const useIsMobile = () => {
	const isMobile = useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
	return isMobile;
};
