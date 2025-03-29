import { RiPlayCircleFill } from '@remixicon/react';
import { Link } from 'react-router';

import { Button } from '../../_tri/Button';

export default function Hero() {
	return (
		<section
			aria-labelledby="hero-title"
			className="mt-32 flex flex-col items-center justify-center text-center sm:mt-40"
		>
			<h1
				id="hero-title"
				className="inline-block animate-slide-up-fade bg-linear-to-br from-gray-900 to-gray-800 bg-clip-text p-2 text-4xl font-bold tracking-tighter text-transparent sm:text-6xl md:text-7xl dark:from-gray-50 dark:to-gray-300"
				style={{ animationDuration: '700ms' }}
			>
				The database for <br /> modern applications
			</h1>
			<p
				className="mt-6 max-w-lg animate-slide-up-fade text-lg text-gray-700 dark:text-gray-400"
				style={{ animationDuration: '900ms' }}
			>
				Database is a general purpose, relational database built for modern application developers and for the cloud
				era.
			</p>

			<div
				className="relative mx-auto ml-3 mt-20 h-fit w-[40rem] max-w-6xl animate-slide-up-fade sm:ml-auto sm:w-full sm:px-2"
				style={{ animationDuration: '1400ms' }}
			>
				<div
					className="absolute inset-x-0 -bottom-20 -mx-10 h-2/4 bg-linear-to-t from-white via-white to-transparent lg:h-1/4 dark:from-gray-950 dark:via-gray-950"
					aria-hidden="true"
				/>
			</div>
		</section>
	);
}
