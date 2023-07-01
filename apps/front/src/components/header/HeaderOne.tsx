import { useEffect, useRef, useState } from 'react';

import { AppBar, Container, Link, Toolbar } from '@mui/material';
import NextLink from 'next/link';

import { headerMenu } from '../../data/headerMenu';

const HeaderOne = () => {
	const appBarRef = useRef<HTMLDivElement>(null);
	const [appBarHeight, setAppBarHeight] = useState<number>(0);

	useEffect(() => {
		setAppBarHeight(appBarRef.current?.getBoundingClientRect().height);
	}, []);

	return (
		<>
			<AppBar ref={appBarRef} sx={{ bgcolor: '#fff', color: '#000' }}>
				<Container>
					Lorem ipsum dolor sit amet
					{headerMenu.map((item) => {
						return (
							<Link key={item.text} component={NextLink} href={item.path}>
								{item.text}
							</Link>
						);
					})}
				</Container>
			</AppBar>
			<Toolbar variant="dense" sx={{ minHeight: `${appBarHeight}px` /* , bgcolor: 'red' */ }} />
		</>
	);
};

export default HeaderOne;
