/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

vi.mock('react-i18next', () => ({
	useTranslation: () => ({
		t: (key: string) => key,
		i18n: { resolvedLanguage: 'fr', language: 'fr' },
	}),
}));

import { PublishScheduleRow } from './_publish-schedule-row';

afterEach(cleanup);

describe('PublishScheduleRow (#2410)', () => {
	test('shows the French date placeholder, not the browser mm/dd/yyyy', () => {
		render(<PublishScheduleRow disabled={false} onSchedule={vi.fn()} />);

		const date = screen.getByTestId('tenant-posts-schedule-date');
		expect(date.getAttribute('placeholder')).toBe('jj/mm/aaaa');
		expect(date.getAttribute('type')).toBe('text');
	});

	test('reads a French date and the time into one instant', () => {
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		const date = screen.getByTestId('tenant-posts-schedule-date');
		fireEvent.change(date, { target: { value: '02/01/2099' } });
		fireEvent.blur(date);
		fireEvent.change(screen.getByTestId('tenant-posts-schedule-time'), {
			target: { value: '10:30' },
		});
		fireEvent.click(screen.getByTestId('tenant-posts-schedule-submit'));

		expect(onSchedule).toHaveBeenCalledWith(new Date('2099-01-02T10:30'));
	});
});
