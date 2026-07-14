/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';

import {
	Table,
	TableBody,
	TableCaption,
	TableCell,
	TableFooter,
	TableHeader,
	TableHead,
	TableRow,
} from './table';

afterEach(cleanup);

describe('Table', () => {
	test('renders wrapper and row/column primitives with expected slots', () => {
		render(
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Name</TableHead>
						<TableHead>Email</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					<TableRow>
						<TableCell>Ada</TableCell>
						<TableCell>ada@example.com</TableCell>
					</TableRow>
				</TableBody>
				<TableFooter>
					<TableRow>
						<TableCell>1 row</TableCell>
					</TableRow>
				</TableFooter>
				<TableCaption>users</TableCaption>
			</Table>,
		);

		expect(screen.getByRole('table')).toBeTruthy();
		expect(screen.getByText('Name').closest('th')).not.toBeNull();
		expect(screen.getByText('1 row')).toBeTruthy();
		expect(screen.getByRole('columnheader', { name: 'Name' })).toBeTruthy();
		expect(screen.getByText('users')).toBeTruthy();
	});
});
