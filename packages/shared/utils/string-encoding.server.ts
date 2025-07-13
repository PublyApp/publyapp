import crypto from 'node:crypto';

// Secret key for email encoding - should be at least 32 bytes
// crypto.randomBytes(32).toString('base64');
const STRING_ENCODING_SECRET_DEFAULT =
	'kkV4WINee3ZuveFJkBTwja5jhQ6dJ1gtbutuhp1Ncjg=';

/**
 * Encodes an email address using AES-256-GCM encryption
 * @param email - The email address to encode
 * @returns The encoded email as a base64 string
 */
export function encodeString(
	email: string,
	secret: string = STRING_ENCODING_SECRET_DEFAULT,
): string {
	try {
		// Generate a random IV (Initialization Vector)
		const iv = crypto.randomBytes(16);

		// Create cipher with IV
		const key = Buffer.from(secret, 'base64');
		const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

		// Encrypt the email
		let encrypted = cipher.update(email, 'utf8', 'hex');
		encrypted += cipher.final('hex');

		// Get the auth tag
		const authTag = cipher.getAuthTag();

		// Combine IV, encrypted data, and auth tag
		const combined = Buffer.concat([
			iv,
			Buffer.from(encrypted, 'hex'),
			authTag,
		]);

		// Return as URL-safe base64
		return combined
			.toString('base64')
			.replace(/\+/g, '-')
			.replace(/\//g, '_')
			.replace(/=/g, '');
	} catch (error) {
		throw new Error(
			`Failed to encode string: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

/**
 * Decodes an encoded email address
 * @param encodedEmail - The encoded email as a base64 string
 * @returns The decoded email address
 */
export function decodeString(
	encodedEmail: string,
	secret: string = STRING_ENCODING_SECRET_DEFAULT,
): string {
	try {
		// Convert from URL-safe base64 back to regular base64
		const base64 =
			encodedEmail.replace(/-/g, '+').replace(/_/g, '/') +
			'='.repeat((4 - (encodedEmail.length % 4)) % 4); // Add padding back

		const combined = Buffer.from(base64, 'base64');

		// Extract IV (first 16 bytes)
		const iv = combined.subarray(0, 16);

		// Extract auth tag (last 16 bytes)
		const authTag = combined.subarray(combined.length - 16);

		// Extract encrypted data (everything in between)
		const encrypted = combined.subarray(16, combined.length - 16);

		// Create decipher with IV - decode base64 secret back to bytes
		const key = Buffer.from(secret, 'base64'); // FIXED: Use 'base64' not 'utf8'
		const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
		decipher.setAuthTag(authTag);

		// Decrypt the email
		let decrypted = decipher.update(encrypted, undefined, 'utf8');
		decrypted += decipher.final('utf8');

		return decrypted;
	} catch (error) {
		throw new Error(
			`Failed to decode string: ${error instanceof Error ? error.message : 'Unknown error'}`,
		);
	}
}

/**
 * Validates if a string is a valid encoded email
 * @param encodedEmail - The string to validate
 * @returns True if it's a valid encoded email, false otherwise
 */
export function isValidEncodedString(
	encodedEmail: string,
	secret: string = STRING_ENCODING_SECRET_DEFAULT,
): boolean {
	try {
		decodeString(encodedEmail, secret);
		return true;
	} catch {
		return false;
	}
}
