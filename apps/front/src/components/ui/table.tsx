import type * as React from 'react';
import { cn } from '~/lib/utils';

const Table = ({
	className,
	containerClassName,
	...props
}: React.ComponentProps<'table'> & { containerClassName?: string }) => {
	return (
		<div
			data-slot="table-container"
			className={cn(
				'relative w-full overflow-auto shadow-none',
				containerClassName,
			)}
		>
			<table
				className={cn('w-full caption-bottom text-sm shadow-none', className)}
				{...props}
			/>
		</div>
	);
};

const TableHeader = ({
	className,
	...props
}: React.ComponentProps<'thead'>) => {
	return <thead className={cn('border-b', className)} {...props} />;
};

const TableBody = ({ className, ...props }: React.ComponentProps<'tbody'>) => {
	return (
		<tbody className={cn('[&_tr:last-child]:border-0', className)} {...props} />
	);
};

const TableFooter = ({
	className,
	...props
}: React.ComponentProps<'tfoot'>) => {
	return (
		<tfoot
			className={cn(
				'border-t bg-muted/50 font-medium [&>tr]:last:border-b-0',
				className,
			)}
			{...props}
		/>
	);
};

const TableRow = ({ className, ...props }: React.ComponentProps<'tr'>) => {
	return <tr className={cn('transition-colors', className)} {...props} />;
};

const TableHead = ({ className, ...props }: React.ComponentProps<'th'>) => {
	return (
		<th
			className={cn(
				'text-left align-middle font-medium text-muted-foreground',
				className,
			)}
			{...props}
		/>
	);
};

const TableCell = ({ className, ...props }: React.ComponentProps<'td'>) => {
	return <td className={cn('align-middle', className)} {...props} />;
};

const TableCaption = ({
	className,
	...props
}: React.ComponentProps<'caption'>) => {
	return (
		<caption
			className={cn('text-sm text-muted-foreground', className)}
			{...props}
		/>
	);
};

export {
	Table,
	TableHeader,
	TableBody,
	TableFooter,
	TableHead,
	TableRow,
	TableCell,
	TableCaption,
};
