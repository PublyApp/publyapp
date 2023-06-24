import { useState, useRef, useEffect } from 'react';

import Link from 'next/link';
import Image from 'next/image';

import { dateFormate } from '../../utils';
import SocialLink from '../../data/social/SocialLink.json';
import MenuData from '../../data/menu/HeaderMenu.json';

// import OffcanvasMenu from './OffcanvasMenu';

const HeaderOne = () => {
	// Main Menu Toggle
	const menuRef = useRef<HTMLUListElement>(null);

	const toggleDropdownMenu = () => {
		const dropdownSelect = menuRef.current.children;
		const dropdownList = [];

		// eslint-disable-next-line no-plusplus
		for (let i = 0; i < dropdownSelect.length; i++) {
			const element = dropdownSelect[i];

			if (element.classList.contains('has-dropdown')) {
				dropdownList.push(element);
			}
		}

		dropdownList.forEach((element) => {
			element.children[0].addEventListener('click', () => {
				if (element.classList.contains('active')) {
					element.classList.remove('active');
					element.childNodes[1].classList.remove('opened');
				} else {
					dropdownList.forEach((submenu) => {
						if (element !== submenu) {
							submenu.classList.remove('active');
							submenu.childNodes[1].classList.remove('opened');
						} else {
							submenu.classList.add('active');
							submenu.childNodes[1].classList.add('opened');
						}
					});
				}
			});
		});
	};

	useEffect(() => {
		toggleDropdownMenu();
	}, []);

	// Offcanvas Menu
	// const [show, setShow] = useState(false);

	// const handleClose = () => {
	// 	return setShow(false);
	// };

	// const handleShow = () => {
	// 	return setShow(true);
	// };

	// Header Search
	const [searchshow, setSearchShow] = useState(false);

	const headerSearchShow = () => {
		setSearchShow(true);
	};

	const headerSearchClose = () => {
		setSearchShow(false);
	};

	// Mobile Menu Toggle
	const [mobileToggle, setMobileToggle] = useState(false);

	const MobileMenuToggler = () => {
		setMobileToggle(!mobileToggle);
		const HtmlTag = document.querySelector('html');
		const menuSelect = document.querySelectorAll('.main-navigation li');

		if (HtmlTag.classList.contains('main-menu-opened')) {
			HtmlTag.classList.remove('main-menu-opened');
		} else {
			setTimeout(() => {
				HtmlTag.classList.add('main-menu-opened');
			}, 800);
		}

		menuSelect.forEach((element) => {
			element.addEventListener('click', () => {
				if (!element.classList.contains('has-dropdown')) {
					HtmlTag.classList.remove('main-menu-opened');
					setMobileToggle(false);
				}
			});
		});
	};

	return (
		<>
			{/* <OffcanvasMenu ofcshow={show} ofcHandleClose={handleClose} /> */} {/* TODO: Drawer menu. */}
			<header className="page-header">
				<div className="header-top bg-grey-dark-one">
					<div className="container">
						<div className="row align-items-center">
							<div className="col-md">
								<ul className="header-top-nav list-inline justify-content-center justify-content-md-start">
									<li className="current-date">{dateFormate()}</li>
									<li>
										<Link href="/">Advertisement</Link>
									</li>
									<li>
										<Link href="/about-us">About</Link>
									</li>
									<li>
										<Link href="/contact">Contact</Link>
									</li>
								</ul>
							</div>
							<div className="col-md-auto">
								<ul className="ml-auto social-share header-top__social-share">
									<li>
										<a href={SocialLink.fb.url}>
											<i className={SocialLink.fb.icon} />
										</a>
									</li>
									<li>
										<a href={SocialLink.twitter.url}>
											<i className={SocialLink.twitter.icon} />
										</a>
									</li>
									<li>
										<a href={SocialLink.instagram.url}>
											<i className={SocialLink.instagram.icon} />
										</a>
									</li>
									<li>
										<a href={SocialLink.linked.url}>
											<i className={SocialLink.linked.icon} />
										</a>
									</li>
								</ul>
							</div>
						</div>
					</div>
				</div>
				<nav className="navbar bg-white">
					<div className="container">
						<div className="navbar-inner">
							<div className="brand-logo-container">
								<Link href="/">
									<Image src="/images/logo-black.svg" alt="brand-logo" width={102} height={34} />
								</Link>
							</div>
							<div className="main-nav-wrapper">
								<ul className="main-navigation list-inline" ref={menuRef}>
									{MenuData.map((data) => {
										return data.submenu ? (
											<li className="has-dropdown" key={data.label}>
												<Link href={data.path}>
													{/* {data.label} */}
													{data.label}
												</Link>
												<ul className="submenu">
													{data.submenu.map((iData) => {
														return (
															<li key={iData.sublabel}>
																<Link href={iData.subpath}>{iData.sublabel}</Link>
															</li>
														);
													})}
												</ul>
											</li>
										) : (
											<li key={data.label}>
												<Link href={data.path}>
													{/* {data.label} */}
													{data.label}
												</Link>
											</li>
										);
									})}
								</ul>
							</div>
							<div className="navbar-extra-features ml-auto">
								<form action="#" className={`navbar-search ${searchshow ? 'show-nav-search' : ''}`}>
									<div className="search-field">
										<input type="text" className="navbar-search-field" placeholder="Search Here..." />
										<button className="navbar-search-btn" type="button">
											<i className="fal fa-search" />
										</button>
									</div>
									<button type="button" className="navbar-search-close" onClick={headerSearchClose}>
										<i className="fal fa-times" />
									</button>
								</form>

								<button type="button" className="nav-search-field-toggler" onClick={headerSearchShow}>
									<i className="far fa-search" />
								</button>
								<button type="button" className="side-nav-toggler" /* onClick={handleShow} */>
									<span />
									<span />
									<span />
								</button>
							</div>
							<div className={`main-nav-toggler d-block d-lg-none ${mobileToggle ? 'expanded' : ''}`}>
								<button type="button" className="toggler-inner" onClick={MobileMenuToggler}>
									<span />
									<span />
									<span />
								</button>
							</div>
						</div>
					</div>
				</nav>
			</header>
		</>
	);
};

export default HeaderOne;
