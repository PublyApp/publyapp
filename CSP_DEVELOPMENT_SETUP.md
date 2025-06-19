# CSP Development Setup

This document explains how to emulate Content Security Policy (CSP) during frontend development to catch CSP violations early.

## Overview

In your development environment, you have two separate servers:
- **Backend server**: Runs on port 6180 with CSP enabled via Helmet
- **Frontend server**: Runs on port 6181 with CSP emulation via Vite

## Features

### 1. Shared CSP Configuration

The CSP policy is defined in `packages/shared/lib/csp.ts` and used by both frontend and backend to ensure consistency.

### 2. Vite Development Server CSP Headers

The frontend development server now includes CSP headers that match your backend configuration:

```typescript
// apps/front/vite.config.ts
server: {
  headers: isDevelopment ? {
    'Content-Security-Policy': cspHeader,
    'Content-Security-Policy-Report-Only': cspHeader,
  } : {}
}
```

### 3. CSP Monitor Component

A real-time CSP violation monitor (`CSPMonitor`) that:
- Listens for `securitypolicyviolation` events
- Monitors console errors for CSP-related issues
- Displays violations in a floating alert panel
- Only appears in development mode

### 4. CSP Test Panel

A testing panel (`CSPTest`) that allows you to:
- Test various CSP violations
- Verify that CSP is working correctly
- See which resources are blocked vs allowed
- Only appears in development mode

## How to Use

### Starting Development

1. Start both servers:
   ```bash
   bun run dev
   ```

2. The frontend will now have CSP headers applied during development

### Monitoring CSP Violations

1. **CSP Monitor**: Automatically appears in the bottom-right corner when violations are detected
2. **CSP Test Panel**: Appears in the top-left corner for manual testing
3. **Browser Console**: Check for CSP-related errors
4. **Network Tab**: Look for blocked requests

### Testing CSP

Use the CSP Test Panel to trigger various violations:

- **Inline Script**: Tests `eval()` and inline scripts
- **External Script**: Tests loading external JavaScript
- **Inline Style**: Tests inline CSS
- **External Image**: Tests external image loading
- **External Fetch**: Tests external API calls

### Expected Behavior

- ✅ **Blocked tests** mean CSP is working correctly
- ❌ **Passed tests** might indicate CSP configuration issues

## CSP Policy Details

The current CSP policy includes:

```typescript
{
  defaultSrc: ["'self'"],
  scriptSrc: ["'self'", 'https://www.pdfvite.com', "'unsafe-inline'", "'unsafe-eval'"], // dev only
  styleSrc: ["'self'", "'unsafe-inline'"],
  imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
  fontSrc: ["'self'", 'data:'],
  connectSrc: ["'self'", 'https://www.pdfvite.com', 'ws:', 'wss:'], // dev only
  mediaSrc: ["'self'"],
  objectSrc: ["'none'"],
  baseUri: ["'self'"],
  formAction: ["'self'"],
  frameAncestors: ["'none'"],
  upgradeInsecureRequests: true,
}
```

## Troubleshooting

### Common CSP Violations

1. **Inline Scripts**: Use event handlers instead of `onclick` attributes
2. **External Resources**: Add domains to appropriate CSP directives
3. **Dynamic Imports**: Ensure they're from allowed sources
4. **Third-party Libraries**: Check if they require specific CSP allowances

### Adding New Domains

To allow new external domains, update the shared CSP configuration:

```typescript
// packages/shared/lib/csp.ts
const baseDirectives: CSPDirectives = {
  scriptSrc: ["'self'", 'https://www.pdfvite.com', 'https://new-domain.com'],
  // ... other directives
};
```

### Development vs Production

- **Development**: Includes `'unsafe-inline'` and `'unsafe-eval'` for hot reloading
- **Production**: Stricter policy without unsafe directives

## Benefits

1. **Early Detection**: Catch CSP issues during development
2. **Consistent Policy**: Same CSP rules across frontend and backend
3. **Real-time Monitoring**: Immediate feedback on violations
4. **Testing Tools**: Easy way to verify CSP behavior
5. **Reduced Back-and-Forth**: Fix issues before deployment

## Browser Extensions

For additional CSP monitoring, consider these browser extensions:
- **CSP Evaluator** (Chrome/Firefox)
- **CSP Scanner** (Chrome)
- **Security Headers** (Chrome)

These can provide additional insights into CSP violations and policy effectiveness.
