import { zodResolver } from '@hookform/resolvers/zod';
import { RiGithubFill, RiGoogleFill } from '@remixicon/react';
import { useForm } from 'react-hook-form';
import { useFetcher } from 'react-router';

import { Logo } from '@/front/components/Logo';
import { RHFForm } from '@/front/components/react-hook-form/RHFForm';
import { RHFInput } from '@/front/components/react-hook-form/RHFInput';
import { Button } from '@/front/components/tremor/Button';
import { Divider } from '@/front/components/tremor/Divider';
import { Label } from '@/front/components/tremor/Label';
import { defaultZodClient } from '@/front/lib/zod';
import { getLoginSchema } from '@/shared/validations/auth.validations';

// const GoogleIcon = (props: SVGProps<SVGSVGElement>) => {
// 	return (
// 		<svg fill="currentColor" viewBox="0 0 24 24" {...props}>
// 			<path d="M3.06364 7.50914C4.70909 4.24092 8.09084 2 12 2C14.6954 2 16.959 2.99095 18.6909 4.60455L15.8227 7.47274C14.7864 6.48185 13.4681 5.97727 12 5.97727C9.39542 5.97727 7.19084 7.73637 6.40455 10.1C6.2045 10.7 6.09086 11.3409 6.09086 12C6.09086 12.6591 6.2045 13.3 6.40455 13.9C7.19084 16.2636 9.39542 18.0227 12 18.0227C13.3454 18.0227 14.4909 17.6682 15.3864 17.0682C16.4454 16.3591 17.15 15.3 17.3818 14.05H12V10.1818H21.4181C21.5364 10.8363 21.6 11.5182 21.6 12.2273C21.6 15.2727 20.5091 17.8363 18.6181 19.5773C16.9636 21.1046 14.7 22 12 22C8.09084 22 4.70909 19.7591 3.06364 16.4909C2.38638 15.1409 2 13.6136 2 12C2 10.3864 2.38638 8.85911 3.06364 7.50914Z" />
// 		</svg>
// 	);
// };

const LoginForm = () => {
	const fetcher = useFetcher<{
		email: string;
		password: string;
	}>();

	const isLoading = fetcher.state === 'loading';

	const form = useForm({
		resolver: zodResolver(getLoginSchema(defaultZodClient)),
		defaultValues: {
			email: '',
			password: '',
		},
	});

	const handleLogin = form.handleSubmit((data) => {
		fetcher.submit(data, {
			method: 'post',
		});
	});

	return (
		<div className="flex min-h-dvh items-center justify-center p-4 sm:p-6">
			<div className="flex w-full flex-col items-start sm:max-w-sm">
				<div className="relative flex items-center justify-center rounded-lg bg-white p-3 shadow-lg ring-1 ring-black/5">
					<Logo className="size-8 text-blue-500 dark:text-blue-500" aria-label="Insights logo" />
				</div>
				<div className="mt-6 flex flex-col">
					<h1 className="text-lg font-semibold text-gray-900 dark:text-gray-50">Log in to Insights</h1>
					<p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
						Don&rsquo;t have an account?{' '}
						<a className="text-blue-500 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-400" href="#">
							Sign up
						</a>
					</p>
				</div>
				<div className="mt-10 w-full">
					<div className="gap-2 sm:flex sm:flex-row sm:items-center">
						<Button asChild variant="secondary" className="w-full">
							<a href="#" className="inline-flex items-center gap-2">
								<RiGithubFill className="size-5 shrink-0" aria-hidden="true" />
								Login with GitHub
							</a>
						</Button>
						<Button asChild variant="secondary" className="mt-2 w-full sm:mt-0">
							<a href="#" className="inline-flex items-center gap-2">
								<RiGoogleFill className="size-4" aria-hidden="true" />
								Login with Google
							</a>
						</Button>
					</div>
					<Divider className="my-6">or</Divider>
					<RHFForm form={form} onSubmit={handleLogin} formProps={{ className: 'flex w-full flex-col gap-y-6' }}>
						{/* <form onSubmit={handleLogin} className=> */}
						<div className="flex flex-col gap-y-4">
							<div className="flex flex-col space-y-2">
								<Label htmlFor="email-form-item" className="font-medium">
									Email
								</Label>
								<RHFInput
									type="email"
									autoComplete="email"
									name="email"
									id="email-form-item"
									placeholder="emily.ross@acme.ch"
								/>
							</div>
							<div className="flex flex-col space-y-2">
								<Label htmlFor="password-form-item" className="font-medium">
									Password
								</Label>
								<RHFInput
									type="password"
									autoComplete="current-password"
									name="password"
									id="password-form-item"
									placeholder="Password"
								/>
							</div>
						</div>
						<Button type="submit" isLoading={isLoading}>
							{isLoading ? '' : 'Continue'}
						</Button>
						{/* </form> */}
					</RHFForm>
				</div>
				<Divider />
				<p className="text-sm text-gray-700 dark:text-gray-300">
					Forgot your password?{' '}
					<a className="text-blue-500 hover:text-blue-600 dark:text-blue-500 dark:hover:text-blue-400" href="#">
						Reset password
					</a>
				</p>
			</div>
		</div>
	);

	// return (
	// 	<div className="flex min-h-screen flex-1 flex-col justify-center px-4 py-10 lg:px-6">
	// 		<div className="sm:mx-auto sm:w-full sm:max-w-sm">
	// 			<h3 className="text-center text-tremor-title font-semibold text-tremor-content-strong dark:text-dark-tremor-content-strong">
	// 				Log in or create account
	// 			</h3>
	// 			<RHFForm form={form} onSubmit={handleLogin} formProps={{ className: 'mt-6 space-y-4' }}>
	// 				<div>
	// 					<label
	// 						htmlFor="email"
	// 						className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong"
	// 					>
	// 						Email
	// 					</label>
	// 					<Input
	// 						type="email"
	// 						id="email"
	// 						name="email"
	// 						autoComplete="email"
	// 						placeholder="john@company.com"
	// 						className="mt-2"
	// 					/>
	// 				</div>
	// 				<div>
	// 					<label
	// 						htmlFor="password"
	// 						className="text-tremor-default font-medium text-tremor-content-strong dark:text-dark-tremor-content-strong"
	// 					>
	// 						Password
	// 					</label>
	// 					<Input
	// 						type="password"
	// 						id="password"
	// 						name="password"
	// 						autoComplete="password"
	// 						placeholder="password"
	// 						className="mt-2"
	// 					/>
	// 				</div>
	// 				<button
	// 					type="submit"
	// 					className="mt-4 w-full whitespace-nowrap rounded-tremor-default bg-tremor-brand py-2 text-center text-tremor-default font-medium text-tremor-brand-inverted shadow-tremor-input hover:bg-tremor-brand-emphasis dark:bg-dark-tremor-brand dark:text-dark-tremor-brand-inverted dark:shadow-dark-tremor-input dark:hover:bg-dark-tremor-brand-emphasis"
	// 				>
	// 					Sign in
	// 				</button>
	// 			</RHFForm>
	// 			<Divider>or with</Divider>
	// 			<a
	// 				href="#"
	// 				className="flex w-full items-center justify-center space-x-2 rounded-tremor-default border border-tremor-border bg-tremor-background py-2 text-tremor-content-strong shadow-tremor-input hover:bg-tremor-background-subtle dark:border-dark-tremor-border dark:bg-dark-tremor-background dark:text-dark-tremor-content-strong dark:shadow-dark-tremor-input dark:hover:bg-dark-tremor-background-subtle"
	// 			>
	// 				<GoogleIcon className="size-5" aria-hidden />
	// 				<span className="text-tremor-default font-medium">Sign in with Google</span>
	// 			</a>
	// 			<p className="mt-4 text-tremor-label text-tremor-content dark:text-dark-tremor-content">
	// 				By signing in, you agree to our{' '}
	// 				<a href="#" className="underline underline-offset-4">
	// 					terms of service
	// 				</a>{' '}
	// 				and{' '}
	// 				<a href="#" className="underline underline-offset-4">
	// 					privacy policy
	// 				</a>
	// 				.
	// 			</p>
	// 		</div>
	// 	</div>
	// );
};

export default LoginForm;
