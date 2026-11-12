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

process.env.TZ = 'UTC';

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

		expect(onSchedule).toHaveBeenCalledTimes(1);
		const at = onSchedule.mock.calls[0]?.[0] as Date;
		// Pinned instant: 10:30 on the wall clock of the test zone (UTC).
		expect(at.toISOString()).toBe('2099-01-02T10:30:00.000Z');
	});

	test('an invalid date edit blocks Schedule instead of reusing the previous valid date', () => {
		const onSchedule = vi.fn();
		render(<PublishScheduleRow disabled={false} onSchedule={onSchedule} />);

		const date = screen.getByTestId('tenant-posts-schedule-date');
		const submit = screen.getByTestId(
			'tenant-posts-schedule-submit',
		) as HTMLButtonElement;
		fireEvent.change(date, { target: { value: '02/01/2099' } });
		fireEvent.blur(date);
		fireEvent.change(screen.getByTestId('tenant-posts-schedule-time'), {
			target: { value: '10:30' },
		});
		expect(submit.disabled).toBe(false);

		fireEvent.change(date, { target: { value: '31/02/2099' } });
		fireEvent.blur(date);

		expect(screen.getByRole('alert')).toBeTruthy();
		expect(submit.disabled).toBe(true);
		fireEvent.click(submit);
		expect(onSchedule).not.toHaveBeenCalled();

		fireEvent.change(date, { target: { value: '03/01/2099' } });
		fireEvent.blur(date);
		expect(submit.disabled).toBe(false);
	});
});
