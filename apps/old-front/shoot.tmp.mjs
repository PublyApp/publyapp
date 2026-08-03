import { chromium } from '@playwright/test';
const [url, prefix, theme, locale] = process.argv.slice(2);
const b = await chromium.launch();
const ctx = await b.newContext({
	viewport: { width: 1440, height: 900 },
	colorScheme: theme === 'dark' ? 'dark' : 'light',
});
const p = await ctx.newPage();
await p.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
// dismiss cookie band
try {
	await p
		.getByRole('button', { name: /reject all|tout refuser/i })
		.click({ timeout: 3000 });
} catch {}
await p.waitForTimeout(500);
const h = await p.evaluate(() => document.documentElement.scrollHeight);
console.log('docHeight', h);
let i = 0;
for (let y = 0; y < h; y += 850) {
	await p.evaluate((yy) => window.scrollTo(0, yy), y);
	await p.waitForTimeout(700);
	await p.screenshot({
		path: `/tmp/${prefix}-${String(i).padStart(2, '0')}.png`,
	});
	i++;
}
await b.close();
