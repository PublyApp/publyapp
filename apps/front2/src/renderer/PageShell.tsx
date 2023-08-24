import React from 'react';

import VPSFrontProvider from '../providers/VPSFrontProvider';
import type { PageContext } from './types';
// import logo from './logo.svg';
import { PageContextProvider } from './usePageContext';

// import './PageShell.css';
// import { Link } from './Link';

const PageShell = ({ children, pageContext }: { children: React.ReactNode; pageContext: PageContext }) => {
	return (
		<React.StrictMode>
			<PageContextProvider pageContext={pageContext}>
				{/* <Layout>
					<Sidebar>
						<Logo />
						<Link className="navitem" href="/">
							Home
						</Link>
						<Link className="navitem" href="/about">
							About
						</Link>
					</Sidebar>
					<Content>
						{children}
					</Content>
				</Layout> */}
				<VPSFrontProvider>{children}</VPSFrontProvider>
			</PageContextProvider>
		</React.StrictMode>
	);
};

// const Layout = ({ children }: { children: React.ReactNode }) => {
// 	return (
// 		<div
// 			style={{
// 				display: 'flex',
// 				maxWidth: 900,
// 				margin: 'auto',
// 			}}
// 		>
// 			{children}
// 		</div>
// 	);
// };

// const Sidebar = ({ children }: { children: React.ReactNode }) => {
// 	return (
// 		<div
// 			style={{
// 				padding: 20,
// 				flexShrink: 0,
// 				display: 'flex',
// 				flexDirection: 'column',
// 				alignItems: 'center',
// 				lineHeight: '1.8em',
// 			}}
// 		>
// 			{children}
// 		</div>
// 	);
// };

// const Content = ({ children }: { children: React.ReactNode }) => {
// 	return (
// 		<div
// 			style={{
// 				padding: 20,
// 				paddingBottom: 50,
// 				borderLeft: '2px solid #eee',
// 				minHeight: '100vh',
// 			}}
// 		>
// 			{children}
// 		</div>
// 	);
// };

// const Logo = () => {
// 	return (
// 		<div
// 			style={{
// 				marginTop: 20,
// 				marginBottom: 10,
// 			}}
// 		>
// 			<a href="/">
// 				<img src={logo} height={64} width={64} alt="logo" />
// 			</a>
// 		</div>
// 	);
// };

export { PageShell };
