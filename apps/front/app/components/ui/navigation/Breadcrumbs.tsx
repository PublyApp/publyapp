/* eslint-disable jsx-a11y/anchor-is-valid */
/* eslint-disable jsx-a11y/no-redundant-roles */
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';

export const Breadcrumbs = () => {
	return (
		<nav aria-label="Breadcrumb" className="ml-2">
			<ol role="list" className="flex items-center space-x-3 text-sm">
				<li className="flex">
					<Link
						to="#"
						className="text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
					>
						Home
					</Link>
				</li>
				<ChevronRight className="size-4 shrink-0 text-gray-600 dark:text-gray-400" aria-hidden="true" />
				<li className="flex">
					<div className="flex items-center">
						<Link
							to="#"
							// aria-current={page.current ? 'page' : undefined}
							className="text-gray-900 dark:text-gray-50"
						>
							Quotes
						</Link>
					</div>
				</li>
			</ol>
		</nav>
	);
};
