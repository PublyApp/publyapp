import type { IAddressItem, IPaymentCard } from '#app/types/common.ts';
import type { IUserAccountBillingHistory } from '#app/types/user.ts';

type BillingPlan = {
	subscription: string;
	price: number;
	primary: boolean;
};

export const billingDemoPlans: BillingPlan[] = [
	{ subscription: 'basic', price: 0, primary: false },
	{ subscription: 'starter', price: 4.99, primary: true },
	{ subscription: 'premium', price: 9.99, primary: false },
];

export const billingDemoCards: IPaymentCard[] = [
	{
		id: 'card-1',
		cardNumber: '**** **** **** 1234',
		cardType: 'mastercard',
	},
	{
		id: 'card-2',
		cardNumber: '**** **** **** 5678',
		cardType: 'visa',
		primary: true,
	},
	{
		id: 'card-3',
		cardNumber: '**** **** **** 7878',
		cardType: 'visa',
	},
];

export const billingDemoAddressBook: IAddressItem[] = [
	{
		id: 'address-1',
		primary: true,
		name: 'Radan Adzic',
		phoneNumber: '+1 202-555-0142',
		fullAddress: '908 Jack Locks, Rancho Cordova, Virginia 85807',
		addressType: 'Home',
	},
	{
		id: 'address-2',
		name: 'Publy Operations',
		phoneNumber: '+1 202-555-0187',
		fullAddress: '14 Market Street, Austin, Texas 78701',
		addressType: 'Office',
	},
	{
		id: 'address-3',
		name: 'Billing Team',
		phoneNumber: '+1 202-555-0129',
		fullAddress: '205 River Road, Seattle, Washington 98101',
		addressType: 'Office',
	},
	{
		id: 'address-4',
		name: 'Accounts Payable',
		phoneNumber: '+1 202-555-0193',
		fullAddress: '77 King Avenue, Denver, Colorado 80203',
		addressType: 'Office',
	},
];

export const billingDemoInvoices: IUserAccountBillingHistory[] = [
	{
		id: 'invoice-1',
		invoiceNumber: 'INV-1990',
		createdAt: '2026-04-20T09:00:00.000Z',
		price: 9.99,
	},
	{
		id: 'invoice-2',
		invoiceNumber: 'INV-1989',
		createdAt: '2026-03-20T09:00:00.000Z',
		price: 9.99,
	},
	{
		id: 'invoice-3',
		invoiceNumber: 'INV-1988',
		createdAt: '2026-02-20T09:00:00.000Z',
		price: 9.99,
	},
	{
		id: 'invoice-4',
		invoiceNumber: 'INV-1987',
		createdAt: '2026-01-20T09:00:00.000Z',
		price: 4.99,
	},
	{
		id: 'invoice-5',
		invoiceNumber: 'INV-1986',
		createdAt: '2025-12-20T09:00:00.000Z',
		price: 4.99,
	},
	{
		id: 'invoice-6',
		invoiceNumber: 'INV-1985',
		createdAt: '2025-11-20T09:00:00.000Z',
		price: 4.99,
	},
	{
		id: 'invoice-7',
		invoiceNumber: 'INV-1984',
		createdAt: '2025-10-20T09:00:00.000Z',
		price: 4.99,
	},
	{
		id: 'invoice-8',
		invoiceNumber: 'INV-1983',
		createdAt: '2025-09-20T09:00:00.000Z',
		price: 0,
	},
	{
		id: 'invoice-9',
		invoiceNumber: 'INV-1982',
		createdAt: '2025-08-20T09:00:00.000Z',
		price: 0,
	},
	{
		id: 'invoice-10',
		invoiceNumber: 'INV-1981',
		createdAt: '2025-07-20T09:00:00.000Z',
		price: 0,
	},
];
