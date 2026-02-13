# PatchField\<T\> Pattern Guide

> Canonical reference for three-state PATCH field handling in the API.
> Policy checklist is in `AGENTS.md` (section: **PatchField\<T\> for Nullable PATCH Fields**).

## The Problem

JSON PATCH requests have an inherent ambiguity for nullable fields. Consider a `SystemNotice` with an optional `ExpiresAt`:

| Client intent | JSON body | How to represent in C#? |
|---------------|-----------|------------------------|
| Don't change `ExpiresAt` | `{ "title": "new title" }` | Field absent |
| Set `ExpiresAt` to a date | `{ "expiresAt": "2025-12-31" }` | Field has a value |
| Clear `ExpiresAt` (set to null) | `{ "expiresAt": null }` | Field explicitly null |

A plain `DateTime?` parameter cannot distinguish cases 1 and 3 — both map to `null`. This is why `PatchField<T>` exists.

## Three States

```
PatchField<T>.Absent()     -> Field not sent (don't touch it)
PatchField<T>.Set(value)   -> Field sent with a value (update it)
PatchField<T>.Set(null)    -> Field explicitly null (clear it)
```

## API Surface

`PatchField<T>` is a readonly struct located at `apps/api/Src/Lib/PatchField.cs`.

| Member | Description |
|--------|-------------|
| `bool IsPresent` | `true` if the field was sent (with value or null) |
| `T? Value` | The value. **Throws `InvalidOperationException` if absent.** Always check `IsPresent` first. |
| `static Absent()` | Factory: field was not sent |
| `static Set(T? value)` | Factory: field was sent (with value or null) |
| `bool TryGetValue(out T? value)` | Safe access pattern. Returns `false` if absent. |
| `TResult Match<TResult>(Func<T?, TResult> onPresent, Func<TResult> onAbsent)` | Exhaustive pattern matching. |

### Safety: `Value` throws when absent

```csharp
var field = PatchField<DateTime?>.Absent();
var v = field.Value;  // throws InvalidOperationException!

// Safe patterns:
if (field.IsPresent) {
    var v = field.Value;  // OK
}

if (field.TryGetValue(out var v)) {
    // use v
}

var result = field.Match(
    onPresent: value => $"Got: {value}",
    onAbsent: () => "Not sent"
);
```

### `default(PatchField<T>)` is safe

`default` produces `IsPresent = false` — effectively `Absent()`. Accessing `.Value` on a default struct throws, preventing silent bugs from uninitialized fields.

## When to Use PatchField

**Use `PatchField<T>` when ALL of these are true:**
1. The endpoint is an **update/PATCH** operation (not create)
2. The field is **nullable** in the database entity (`DateTime?`, `string?`, `Guid?`, etc.)
3. The client needs the ability to **clear** the field (set it to null)
4. You need to distinguish "not sent" from "explicitly null"

**Do NOT use `PatchField<T>` when:**
- The field is **required** (non-nullable) — use plain `T` or `T?` (null = not sent)
- The endpoint is a **create** operation — all fields are either required or optional with defaults
- The field is nullable but **cannot be cleared** by the client — plain `T?` (null = not sent) is fine
- The field is a **non-nullable type** like `int`, `bool`, `Guid` — use `T?` (null = not sent)

### Decision Tree

```
Is this an UPDATE/PATCH endpoint?
|
|-- NO  -> Don't use PatchField (use T or T? as normal)
|
`-- YES -> Is the field nullable in the entity?
          |
          |-- NO  -> Use T? in the args record
          |         (null = not sent, non-null = update)
          |
          `-- YES -> Can the client clear this field?
                    |
                    |-- NO  -> Use T? (null = not sent)
                    |
                    `-- YES -> Use PatchField<T?>
```

## Full Pattern (All Three Layers)

### Layer 1 — Body DTO getter method (handler file)

**CRITICAL:** Clearable fields MUST use non-nullable `JsonElement` (not `JsonElement?`). A nullable `JsonElement?` cannot distinguish "field omitted" from "field sent as null" — both map to C# `null`. Non-nullable `JsonElement` uses `ValueKind` to distinguish all three states:
- `Undefined` -> field omitted
- `Null` -> field explicitly sent as `null`
- `String` -> field sent with a value

```csharp
public record UpdateSystemNoticeBody {
    // Non-clearable optional fields: JsonElement? is fine
    public JsonElement? Severity { get; init; }
    public JsonElement? Title { get; init; }

    // Clearable field: MUST be non-nullable JsonElement
    public JsonElement ExpiresAt { get; init; }

    public PatchField<DateTime?> GetExpiresAt() =>
        ExpiresAt.ValueKind switch {
            JsonValueKind.Undefined =>
                PatchField<DateTime?>.Absent(),
            JsonValueKind.Null =>
                PatchField<DateTime?>.Set(null),
            JsonValueKind.String =>
                PatchField<DateTime?>.Set(
                    ExpiresAt.GetValueAsDateTime()
                ),
            _ => throw new InvalidOperationException(
                "ExpiresAt must be an ISO 8601 string, "
                + "null, or omitted"
            ),
        };
}
```

### Layer 2 — Service args record + interface (service file)

```csharp
// Args record bundles all domain parameters
public record UpdateSystemNoticeArgs(
    NoticeSeverity? Severity,
    string? Title,
    string? Message,
    DateTime? StartsAt,
    PatchField<DateTime?> ExpiresAt  // NOT DateTime? + bool
);

// Interface uses args record
Task<SystemNotice?> UpdateAsync(
    Guid id,
    UpdateSystemNoticeArgs args,
    CancellationToken cancellationToken = default);

// Implementation
if (args.ExpiresAt.IsPresent) {
    notice.ExpiresAt = args.ExpiresAt.Value;  // Sets to value OR null
}
```

### Layer 3 — Handler constructs args inline

```csharp
var args = new UpdateSystemNoticeArgs(
    Severity: severity,
    Title: body.GetTitle(),
    Message: body.GetMessage(),
    StartsAt: body.GetStartsAt(),
    ExpiresAt: body.GetExpiresAt()
);

var notice = await systemNoticeService.UpdateAsync(
    noticeId, args, cancellationToken
);
```

## Anti-Patterns (Never Do This)

```csharp
// WRONG - Separate boolean flag to signal "clear"
Task<Entity?> UpdateAsync(
    ...,
    DateTime? expiresAt,
    bool clearExpiresAt,   // Fragile, easy to misuse
    ...
);

// WRONG - Magic sentinel value
var expiresAt = DateTime.MinValue; // means "clear"

// WRONG - Checking JsonElement in service layer
if (body.ExpiresAt?.ValueKind == JsonValueKind.Null) {
    // Service should not know about JsonElement
}

// WRONG - Using PatchField for a required field
PatchField<string> title;  // Title is required, not clearable

// WRONG - Using JsonElement? for clearable fields
public JsonElement? ExpiresAt { get; init; }
// JsonElement? cannot distinguish omitted from explicit null!

// WRONG - Accessing .Value without checking IsPresent
notice.ExpiresAt = args.ExpiresAt.Value;  // Throws if absent!
```

## Applying PatchField to Other Types

The same pattern works for any clearable nullable field. Always use non-nullable `JsonElement` + `ValueKind` switch:

```csharp
// Clearable nullable string (e.g., description can be cleared)
// DTO property: public JsonElement Description { get; init; }
public PatchField<string?> GetDescription() =>
    Description.ValueKind switch {
        JsonValueKind.Undefined =>
            PatchField<string?>.Absent(),
        JsonValueKind.Null =>
            PatchField<string?>.Set(null),
        JsonValueKind.String =>
            PatchField<string?>.Set(
                Description.GetString()
            ),
        _ => throw new InvalidOperationException(
            "Description must be a string, null, or omitted"
        ),
    };

// Clearable nullable Guid (e.g., assignee can be unassigned)
// DTO property: public JsonElement AssigneeId { get; init; }
public PatchField<Guid?> GetAssigneeId() =>
    AssigneeId.ValueKind switch {
        JsonValueKind.Undefined =>
            PatchField<Guid?>.Absent(),
        JsonValueKind.Null =>
            PatchField<Guid?>.Set(null),
        JsonValueKind.String =>
            PatchField<Guid?>.Set(
                AssigneeId.GetValueAsGuid()
            ),
        _ => throw new InvalidOperationException(
            "AssigneeId must be a GUID, null, or omitted"
        ),
    };
```

## Validator Pattern for Clearable Fields

Clearable fields use non-nullable `JsonElement`, so validators need to handle `Undefined`/`Null`/`String`:

```csharp
RuleFor(x => x.ExpiresAt)
    .Must(e =>
        e.ValueKind == JsonValueKind.Undefined
        || e.ValueKind == JsonValueKind.Null
        || e.ValueKind == JsonValueKind.String)
    .WithMessage(
        "ExpiresAt must be a string, null, or omitted"
    )
    .Must(BeValidDateTimeOrUndefined)
    .WithMessage(
        "ExpiresAt must be a valid ISO 8601 date"
    );

private bool BeValidDateTimeOrUndefined(JsonElement element) {
    if (element.ValueKind == JsonValueKind.Undefined
        || element.ValueKind == JsonValueKind.Null) {
        return true;
    }
    if (element.ValueKind != JsonValueKind.String) {
        return false;
    }
    return DateUtils.TryParseIsoUtc(
        element.GetString(), out _
    );
}
```

## Reference Implementation

- `PatchField<T>` struct: `apps/api/Src/Lib/PatchField.cs`
- Real usage (DateTime): `apps/api/Src/Modules/SystemNotices/Handlers/Staff/UpdateSystemNotice.cs`
- Service with args record: `apps/api/Src/Modules/SystemNotices/Services/SystemNoticeService.cs`
