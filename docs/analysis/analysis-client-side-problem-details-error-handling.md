# Client-Side ProblemDetails Error Handling Analysis

## Context

We've migrated the backend API from a custom `ApiResponse` error format to RFC 7807 ProblemDetails. The Kiota-generated TypeScript client now has typed error classes:

- `AppProblemDetails` - For general errors (400, 401, 403, 404, 500)
- `ValidationProblemDetails` - For validation errors (422) with field-level `errors` dictionary

**Problem:** The frontend currently uses a type guard function `isJsClientError()` to detect API errors. The user wants to use `instanceof` checks instead for a cleaner developer experience.

---

## Current Implementation

### Backend ProblemDetails Structure (C#)

```csharp
// apps/api/Src/Lib/ProblemResults/AppProblemDetails.cs
public class AppProblemDetails : ProblemDetails {
    [JsonPropertyName("translationKey")]
    public string TranslationKey { get; set; } = string.Empty;
}

// apps/api/Src/Lib/ProblemResults/ValidationProblemDetails.cs
public class ValidationProblemDetails : AppProblemDetails {
    [JsonPropertyName("errors")]
    public IDictionary<string, string[]> Errors { get; set; }
}
```

### Generated Kiota Types (TypeScript)

```typescript
// packages/js-client/src/models/index.ts
export interface AppProblemDetails extends AdditionalDataHolder, ApiError, Parsable {
    detail?: string | null;
    instance?: string | null;
    status?: number | null;
    title?: string | null;
    translationKey?: string | null;
    type?: string | null;
}

export interface ValidationProblemDetails extends AdditionalDataHolder, ApiError, Parsable {
    detail?: string | null;
    errors?: ValidationProblemDetails_errors | null;
    instance?: string | null;
    status?: number | null;
    title?: string | null;
    translationKey?: string | null;
    type?: string | null;
}
```

### Kiota's ApiError Interface

```typescript
// @microsoft/kiota-abstractions
export interface ApiError extends Error {
    responseStatusCode: number | undefined;
    responseHeaders: Record<string, string[]> | undefined;
}
```

### Current Type Guard Approach

```typescript
// apps/front/app/lib/js-client/js-client-error.ts
type JsClientError = {
    key?: string;
    messageEscaped: string;
    responseStatusCode: number;
    responseHeaders: Record<string, string>;
};

export const isJsClientError = (error: unknown): error is JsClientError => {
    if (
        _.isObject(error) &&
        _.has(error, 'messageEscaped') &&
        _.has(error, 'responseStatusCode') &&
        _.has(error, 'responseHeaders')
    ) {
        return true;
    }
    return false;
};
```

**Usage in components:**
```typescript
if (isJsClientError(error)) {
    toast.error(
        error.key
            ? t(error.key, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
            : error.messageEscaped,
    );
}
```

---

## Why `instanceof` Doesn't Work Out of the Box

### Problem 1: Kiota Generates Interfaces, Not Classes

Kiota generates TypeScript **interfaces** for response/error types. Interfaces are compile-time only constructs in TypeScript - they don't exist at runtime, so `instanceof` cannot be used with them.

```typescript
// This is what Kiota generates - an INTERFACE
export interface AppProblemDetails extends AdditionalDataHolder, ApiError, Parsable {
    // ...
}

// You CANNOT do this:
if (error instanceof AppProblemDetails) { } // Error: 'AppProblemDetails' only refers to a type
```

### Problem 2: Kiota Deserializes to Plain Objects

Even if Kiota generated classes, it wouldn't help. Kiota's deserialization system uses factory functions (`createAppProblemDetailsFromDiscriminatorValue`) that create **plain JavaScript objects** conforming to the interface shape, not class instances.

```typescript
// Kiota internally does something like:
const errorObject = {
    detail: "Not found",
    status: 404,
    translationKey: "not-found",
    responseStatusCode: 404,
    // ... etc
};
throw errorObject; // Plain object, not a class instance
```

---

## Proposed Solutions

### Option 1: Keep Type Guard Functions (Simplest)

Update the existing type guard to work with ProblemDetails properties.

```typescript
// apps/front/app/lib/js-client/js-client-error.ts
import type { AppProblemDetails, ValidationProblemDetails } from '@org/js-client/src/models';

export const isProblemDetails = (error: unknown): error is AppProblemDetails => {
    return (
        _.isObject(error) &&
        _.has(error, 'responseStatusCode') &&
        (_.has(error, 'detail') || _.has(error, 'translationKey') || _.has(error, 'status'))
    );
};

export const isValidationProblemDetails = (error: unknown): error is ValidationProblemDetails => {
    return isProblemDetails(error) && _.has(error, 'errors');
};

// Deprecated alias for backward compatibility
export const isJsClientError = isProblemDetails;
```

**Pros:**
- Minimal changes required
- No runtime overhead
- Idiomatic TypeScript pattern

**Cons:**
- Can't use `instanceof`
- Must call function for every check

---

### Option 2: Wrap RequestAdapter (Recommended for `instanceof`)

Create a custom `RequestAdapter` wrapper that intercepts all errors and wraps them in actual class instances.

#### Step 1: Create Error Classes

```typescript
// apps/front/app/lib/js-client/problem-details-error.ts
import type { AppProblemDetails, ValidationProblemDetails } from '@org/js-client/src/models';

/**
 * Type guard to check if an error is a ProblemDetails object (before wrapping).
 */
const isProblemDetailsObject = (error: unknown): error is AppProblemDetails => {
    return (
        typeof error === 'object' &&
        error !== null &&
        'responseStatusCode' in error &&
        ('detail' in error || 'translationKey' in error || 'status' in error)
    );
};

const isValidationProblemDetailsObject = (error: unknown): error is ValidationProblemDetails => {
    return isProblemDetailsObject(error) && 'errors' in error;
};

/**
 * Error class wrapping AppProblemDetails for instanceof checks.
 */
export class ProblemDetailsError extends Error {
    public readonly detail: string | null | undefined;
    public readonly title: string | null | undefined;
    public readonly status: number | null | undefined;
    public readonly translationKey: string | null | undefined;
    public readonly type: string | null | undefined;
    public readonly instance: string | null | undefined;
    public readonly responseStatusCode: number | undefined;
    public readonly responseHeaders: Record<string, string[]> | undefined;

    constructor(problemDetails: AppProblemDetails) {
        super(problemDetails.detail ?? problemDetails.title ?? 'Unknown error');
        this.name = 'ProblemDetailsError';

        // Copy all properties
        this.detail = problemDetails.detail;
        this.title = problemDetails.title;
        this.status = problemDetails.status;
        this.translationKey = problemDetails.translationKey;
        this.type = problemDetails.type;
        this.instance = problemDetails.instance;
        this.responseStatusCode = problemDetails.responseStatusCode;
        this.responseHeaders = problemDetails.responseHeaders;

        // Maintain proper prototype chain for instanceof
        Object.setPrototypeOf(this, ProblemDetailsError.prototype);
    }
}

/**
 * Error class wrapping ValidationProblemDetails for instanceof checks.
 */
export class ValidationProblemDetailsError extends ProblemDetailsError {
    public readonly errors: Record<string, string[]> | null | undefined;

    constructor(problemDetails: ValidationProblemDetails) {
        super(problemDetails);
        this.name = 'ValidationProblemDetailsError';
        this.errors = problemDetails.errors as Record<string, string[]> | null | undefined;

        Object.setPrototypeOf(this, ValidationProblemDetailsError.prototype);
    }
}

/**
 * Wraps a raw error into the appropriate ProblemDetailsError class.
 */
export function wrapError(error: unknown): Error {
    if (isValidationProblemDetailsObject(error)) {
        return new ValidationProblemDetailsError(error);
    }
    if (isProblemDetailsObject(error)) {
        return new ProblemDetailsError(error);
    }
    if (error instanceof Error) {
        return error;
    }
    return new Error(String(error));
}
```

#### Step 2: Create RequestAdapter Wrapper

```typescript
// apps/front/app/lib/js-client/error-wrapping-request-adapter.ts
import type {
    RequestAdapter,
    RequestInformation,
    Parsable,
    ParsableFactory,
    ErrorMappings,
    SerializationWriterFactory,
    ParseNodeFactory,
    BackingStoreFactory,
    PrimitiveTypesForDeserialization,
    PrimitiveTypesForDeserializationType,
} from '@microsoft/kiota-abstractions';
import { wrapError } from './problem-details-error';

/**
 * RequestAdapter wrapper that converts Kiota errors to ProblemDetailsError instances.
 * This enables instanceof checks for error handling.
 */
export class ErrorWrappingRequestAdapter implements RequestAdapter {
    constructor(private readonly inner: RequestAdapter) {}

    // Delegate properties
    get baseUrl(): string {
        return this.inner.baseUrl;
    }
    set baseUrl(value: string) {
        this.inner.baseUrl = value;
    }

    getSerializationWriterFactory(): SerializationWriterFactory {
        return this.inner.getSerializationWriterFactory();
    }

    getParseNodeFactory(): ParseNodeFactory {
        return this.inner.getParseNodeFactory();
    }

    getBackingStoreFactory(): BackingStoreFactory | undefined {
        return this.inner.getBackingStoreFactory();
    }

    enableBackingStore(backingStoreFactory?: BackingStoreFactory): void {
        this.inner.enableBackingStore(backingStoreFactory);
    }

    convertToNativeRequest<T>(requestInfo: RequestInformation): Promise<T> {
        return this.inner.convertToNativeRequest(requestInfo);
    }

    // Wrap all send methods with error transformation
    async send<ModelType extends Parsable>(
        requestInfo: RequestInformation,
        deserializer: ParsableFactory<ModelType>,
        errorMappings: ErrorMappings | undefined,
    ): Promise<ModelType | undefined> {
        try {
            return await this.inner.send(requestInfo, deserializer, errorMappings);
        } catch (error) {
            throw wrapError(error);
        }
    }

    async sendCollection<ModelType extends Parsable>(
        requestInfo: RequestInformation,
        deserializer: ParsableFactory<ModelType>,
        errorMappings: ErrorMappings | undefined,
    ): Promise<ModelType[] | undefined> {
        try {
            return await this.inner.sendCollection(requestInfo, deserializer, errorMappings);
        } catch (error) {
            throw wrapError(error);
        }
    }

    async sendPrimitive<ResponseType extends PrimitiveTypesForDeserializationType>(
        requestInfo: RequestInformation,
        responseType: PrimitiveTypesForDeserialization,
        errorMappings: ErrorMappings | undefined,
    ): Promise<ResponseType | undefined> {
        try {
            return await this.inner.sendPrimitive(requestInfo, responseType, errorMappings);
        } catch (error) {
            throw wrapError(error);
        }
    }

    async sendCollectionOfPrimitive<
        ResponseType extends Exclude<PrimitiveTypesForDeserializationType, ArrayBuffer>,
    >(
        requestInfo: RequestInformation,
        responseType: Exclude<PrimitiveTypesForDeserialization, 'ArrayBuffer'>,
        errorMappings: ErrorMappings | undefined,
    ): Promise<ResponseType[] | undefined> {
        try {
            return await this.inner.sendCollectionOfPrimitive(
                requestInfo,
                responseType,
                errorMappings,
            );
        } catch (error) {
            throw wrapError(error);
        }
    }

    async sendNoResponseContent(
        requestInfo: RequestInformation,
        errorMappings: ErrorMappings | undefined,
    ): Promise<void> {
        try {
            return await this.inner.sendNoResponseContent(requestInfo, errorMappings);
        } catch (error) {
            throw wrapError(error);
        }
    }

    async sendEnum<EnumObject extends Record<string, unknown>>(
        requestInfo: RequestInformation,
        enumObject: EnumObject,
        errorMappings: ErrorMappings | undefined,
    ): Promise<EnumObject[keyof EnumObject] | undefined> {
        try {
            return await this.inner.sendEnum(requestInfo, enumObject, errorMappings);
        } catch (error) {
            throw wrapError(error);
        }
    }

    async sendCollectionOfEnum<EnumObject extends Record<string, unknown>>(
        requestInfo: RequestInformation,
        enumObject: EnumObject,
        errorMappings: ErrorMappings | undefined,
    ): Promise<EnumObject[keyof EnumObject][] | undefined> {
        try {
            return await this.inner.sendCollectionOfEnum(
                requestInfo,
                enumObject,
                errorMappings,
            );
        } catch (error) {
            throw wrapError(error);
        }
    }
}
```

#### Step 3: Modify ClientManager

```typescript
// apps/front/app/lib/js-client/client-manager.ts
import { ErrorWrappingRequestAdapter } from './error-wrapping-request-adapter';

// In the createClientWithFetch method:
private static createClientWithFetch(customFetch: typeof fetch): ApiClient {
    const authProvider = new AnonymousAuthenticationProvider();
    const httpClient = KiotaClientFactory.create(customFetch);
    const innerAdapter = new FetchRequestAdapter(
        authProvider,
        undefined,
        undefined,
        httpClient,
    );

    // Wrap the adapter to transform errors
    const adapter = new ErrorWrappingRequestAdapter(innerAdapter);
    adapter.baseUrl = env.VITE_ASP_SERVER_URL;

    return createApiClient(adapter);
}
```

#### Step 4: Usage in Components

```typescript
import { ProblemDetailsError, ValidationProblemDetailsError } from '@/front/lib/js-client/problem-details-error';

// In error handlers:
if (error instanceof ValidationProblemDetailsError) {
    // Handle validation errors with field-level details
    console.log(error.errors); // { email: ["Email is required"], ... }
    toast.error(error.translationKey
        ? t(error.translationKey, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
        : error.detail ?? 'Validation failed'
    );
} else if (error instanceof ProblemDetailsError) {
    // Handle general API errors
    toast.error(error.translationKey
        ? t(error.translationKey, { ns: I18N_NAMESPACES.RESPONSE_MESSAGE })
        : error.detail ?? error.title ?? 'An error occurred'
    );
}
```

**Pros:**
- Enables `instanceof` checks
- Clean, familiar JavaScript/TypeScript pattern
- All errors automatically wrapped at the source
- Proper Error inheritance (stack traces work correctly)
- Subclass for validation errors (`ValidationProblemDetailsError`)

**Cons:**
- More code to maintain (wrapper adapter + error classes)
- Slight runtime overhead (wrapping every error)
- Must keep error class properties in sync with Kiota-generated types

---

### Option 3: Proxy-Based Client Wrapper

Use JavaScript Proxy to intercept all method calls on the ApiClient.

```typescript
function createErrorWrappingClient(client: ApiClient): ApiClient {
    return new Proxy(client, {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (typeof value === 'function') {
                return async (...args: unknown[]) => {
                    try {
                        return await value.apply(target, args);
                    } catch (error) {
                        throw wrapError(error);
                    }
                };
            }
            // Recursively proxy nested objects (for client.auth.login, etc.)
            if (typeof value === 'object' && value !== null) {
                return createErrorWrappingClient(value);
            }
            return value;
        },
    });
}
```

**Pros:**
- Less boilerplate than Option 2
- Automatically handles all methods including nested ones

**Cons:**
- Proxy has performance implications
- Harder to debug
- Type inference may be affected
- Recursive proxying is complex and error-prone

---

### Option 4: Higher-Order Function Wrapper

Wrap individual API calls at the call site.

```typescript
async function withErrorWrapping<T>(fn: () => Promise<T>): Promise<T> {
    try {
        return await fn();
    } catch (error) {
        throw wrapError(error);
    }
}

// Usage:
const result = await withErrorWrapping(() => client.auth.login.post(body));
```

**Pros:**
- Simple implementation
- Opt-in per call
- No global changes needed

**Cons:**
- Must wrap every API call manually
- Easy to forget
- Verbose

---

## Comparison Table

| Aspect | Option 1: Type Guards | Option 2: Adapter Wrapper | Option 3: Proxy | Option 4: HOF |
|--------|----------------------|---------------------------|-----------------|---------------|
| `instanceof` support | No | Yes | Yes | Yes |
| Code changes needed | ~9 files | ~3 new files + modify ClientManager | ~1 file + modify ClientManager | Every call site |
| Runtime overhead | Minimal | Low (try-catch per request) | Medium (proxy overhead) | Low |
| Type safety | Good | Good | May lose some inference | Good |
| Maintenance burden | Low | Medium | Medium | High (manual wrapping) |
| Debugging | Easy | Easy | Harder | Easy |
| Automatic for all calls | N/A | Yes | Yes | No |

---

## Recommendation

**For `instanceof` support: Option 2 (RequestAdapter Wrapper)**

This approach:
1. Is explicit and easy to understand
2. Wraps errors at the correct layer (adapter level)
3. Maintains full type safety
4. Has minimal performance overhead
5. Follows standard patterns (decorator/wrapper pattern)

**If `instanceof` is not critical: Option 1 (Type Guards)**

Type guards are the idiomatic TypeScript solution and require the least changes. The pattern `if (isProblemDetails(error))` is clear and well-understood.

---

## Files to Create/Modify for Option 2

| File | Action |
|------|--------|
| `apps/front/app/lib/js-client/problem-details-error.ts` | Create - Error classes |
| `apps/front/app/lib/js-client/error-wrapping-request-adapter.ts` | Create - Adapter wrapper |
| `apps/front/app/lib/js-client/client-manager.ts` | Modify - Use wrapped adapter |
| `apps/front/app/lib/js-client/js-client-error.ts` | Delete or deprecate |
| `apps/front/app/components/error-boundary.tsx` | Update imports/usage |
| `apps/front/app/routes/authed/_layout/authed-layout.tsx` | Update imports/usage |
| `apps/front/app/lib/react-query/features/common/auth.hooks.ts` | Update imports/usage |
| 5 form components | Update error handling |

---

## Questions to Consider

1. Is `instanceof` important enough to justify the additional complexity?
2. Do you prefer explicit type guards (functional style) or class-based checks (OOP style)?
3. Are there other parts of the codebase that would benefit from class-based errors?
4. How important is maintaining the exact same API surface as Kiota's generated types?
