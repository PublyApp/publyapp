import React from 'react';

import { RiCloseLine, RiMenuLine } from '@remixicon/react';
import { Link } from 'react-router';

import useScroll from '../../../lib/use-scroll';
import { cx } from '../../../lib/utils';
import { Button } from '../../Button';

export function Navigation() {
	const scrolled = useScroll(15);
	const [open, setOpen] = React.useState(false);

	React.useEffect(() => {
		const mediaQuery: MediaQueryList = window.matchMedia('(min-width: 768px)');
		const handleMediaQueryChange = () => {
			setOpen(false);
		};

		mediaQuery.addEventListener('change', handleMediaQueryChange);
		handleMediaQueryChange();

		return () => {
			mediaQuery.removeEventListener('change', handleMediaQueryChange);
		};
	}, []);

	return (
		<header
			className={cx(
				'fixed inset-x-3 top-4 z-50 mx-auto flex max-w-6xl transform-gpu animate-slide-down-fade justify-center overflow-hidden rounded-xl border border-transparent px-3 py-3 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1.03)] will-change-transform',
				open === true ? 'h-52' : 'h-16',
				scrolled || open === true
					? 'backdrop-blur-nav max-w-3xl border-gray-100 bg-white/80 shadow-xl shadow-black/5 dark:border-white/15 dark:bg-black/70'
					: 'bg-white/0 dark:bg-gray-950/0',
			)}
		>
			<div className="w-full md:my-auto">
				<div className="relative flex items-center justify-between">
					<Link to={''} aria-label="Home">
						<span className="sr-only">Company logo</span>
						<div className="w-28 md:w-32 bg-gray-300 h-10 flex items-center justify-center">Logo</div>
					</Link>
					<nav className="hidden md:block">
						<div className="flex items-center gap-10 font-medium">
							<Link className="px-2 py-1 text-gray-900 dark:text-gray-50" to={''}>
								About
							</Link>
							<Link className="px-2 py-1 text-gray-900 dark:text-gray-50" to={''}>
								Pricing
							</Link>
							<Link className="px-2 py-1 text-gray-900 dark:text-gray-50" to={''}>
								Changelog
							</Link>
						</div>
					</nav>
					<div className="hidden md:flex gap-2">
						<Button className="hidden h-10 font-semibold md:flex">Login</Button>
						<Button className="hidden h-10 font-semibold md:flex">Dashboard</Button>
					</div>
					<div className="flex gap-x-2 md:hidden">
						<Button>Login</Button>
						<Button>Dashboard</Button>
						<Button onClick={() => setOpen(!open)} variant="light" className="aspect-square p-2">
							{open ? (
								<RiCloseLine aria-hidden="true" className="size-5" />
							) : (
								<RiMenuLine aria-hidden="true" className="size-5" />
							)}
						</Button>
					</div>
				</div>
				<nav className={cx('my-6 flex text-lg ease-in-out will-change-transform md:hidden', open ? '' : 'hidden')}>
					<ul className="space-y-4 font-medium">
						<li onClick={() => setOpen(false)}>
							<Link to={''}>About</Link>
						</li>
						<li onClick={() => setOpen(false)}>
							<Link to={''}>Pricing</Link>
						</li>
						<li onClick={() => setOpen(false)}>
							<Link to={''}>Changelog</Link>
						</li>
					</ul>
				</nav>
			</div>
		</header>
	);
}
