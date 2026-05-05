# Round 4: Final Pass — Your Three Non-Blocking Follow-Ups

Hey — you said "ship it" last round with three non-blocking follow-ups. We went ahead and addressed all three before merging. This should be the last review unless you spot something new. Here's what we did.

---

## 1. Timezone-less datetime input — now rejected

You flagged that `AssumeUniversal` would silently accept `2026-02-12T10:00:00` (no timezone) as UTC, which is ambiguous.

**Decision:** Reject timezone-less input. Clients must send `Z` or an explicit offset.

**Implementation:** Replaced the two `K`-based format strings with four explicit formats — two for `Z` suffix, two for `±HH:mm` offset — and kept `AssumeUniversal | AdjustToUniversal` only so the `'Z'` literal is correctly interpreted as UTC:

```csharp
// apps/api/Src/Lib/Utils/DateUtils.cs
private static readonly string[] IsoFormats = [
    "yyyy-MM-ddTHH:mm:ss'Z'",
    "yyyy-MM-ddTHH:mm:ss.FFFFFFF'Z'",
    "yyyy-MM-ddTHH:mm:sszzz",
    "yyyy-MM-ddTHH:mm:ss.FFFFFFFzzz",
];

var ok = DateTimeOffset.TryParseExact(
    raw,
    IsoFormats,
    CultureInfo.InvariantCulture,
    DateTimeStyles.AssumeUniversal
        | DateTimeStyles.AdjustToUniversal,
    out var dto
);
```

**Why this works:**
- `'Z'` is a literal character match — only matches input ending in `Z`. `AssumeUniversal` treats matched `'Z'` as UTC.
- `zzz` matches `+02:00`, `-05:00` etc. The explicit offset overrides `AssumeUniversal`.
- `2026-02-12T10:00:00` (no timezone) doesn't match any of the four formats → `TryParseExact` returns `false`.

**Pinned with unit tests** (`apps/api/Src/Lib/Testing/DateUtilsTests.cs`):

```csharp
[Theory]
[InlineData("2026-02-12T10:00:00Z", true)]
[InlineData("2026-02-12T10:00:00.0000000Z", true)]
[InlineData("2026-02-12T10:00:00+00:00", true)]
[InlineData("2026-02-12T10:00:00+02:00", true)]
[InlineData("2026-02-12T10:00:00-05:00", true)]
[InlineData("2026-02-12T10:00:00.1234567Z", true)]
[InlineData("2026-02-12T10:00:00.1234567+02:00", true)]
[InlineData("2026-02-12T10:00:00", false)]       // <-- rejected
[InlineData("06/15/2026 10:00 AM", false)]
[InlineData("15 Jun 2026 10:00", false)]
[InlineData("2026-02-12", false)]
[InlineData("not-a-date", false)]
[InlineData("", false)]
[InlineData(null, false)]
public void TryParseIsoUtc_FormatContract(
    string? raw, bool expected
) { ... }

[Fact]
public void TryParseIsoUtc_ConvertsToUtc() {
    DateUtils.TryParseIsoUtc(
        "2026-06-15T10:00:00+02:00", out var utc
    );
    utc.Kind.Should().Be(DateTimeKind.Utc);
    utc.Hour.Should().Be(8);  // 10:00 +02:00 = 08:00 UTC
}
```

15 unit tests, all passing.

**Files:** `apps/api/Src/Lib/Utils/DateUtils.cs`, `apps/api/Src/Lib/Testing/DateUtilsTests.cs` (NEW)

---

## 2. Architecture guard strengthened

You pointed out the suffix-based filter (`EndsWith("Body")`, etc.) had blind spots and wouldn't catch nested `PatchField<>`.

**Changes:**
- **Broader filter:** Now scans ALL types in `.Handlers.` namespaces, not just suffix-matched ones. Excludes only `Validator` types and compiler-generated types (names containing `<`).
- **Recursive detection:** New `ContainsPatchField(Type)` method walks generic type arguments and array element types, so `List<PatchField<DateTime?>>`, `PatchField<string>[]`, etc. are all caught.

```csharp
// apps/api/Src/Lib/Testing/ArchitectureGuardTests.cs
var dtoTypes = apiAssembly
    .GetTypes()
    .Where(t =>
        t.Namespace?.Contains(".Handlers.") == true)
    .Where(t =>
        !t.Name.EndsWith("Validator")
        && !t.Name.Contains("<"));

// ...

private static bool ContainsPatchField(Type type) {
    if (type.IsGenericType
        && type.GetGenericTypeDefinition()
            == typeof(PatchField<>)) {
        return true;
    }

    if (type.IsArray) {
        return ContainsPatchField(
            type.GetElementType()!
        );
    }

    return type.IsGenericType
        && type.GetGenericArguments()
            .Any(ContainsPatchField);
}
```

**Files:** `apps/api/Src/Lib/Testing/ArchitectureGuardTests.cs`

---

## 3. Guide snippets updated

You flagged `docs/guides/patchfield-pattern.md:261` showing old `DateTimeOffset.TryParse` and bracketless `if`.

**Fixed:** Updated the validator example to use `DateUtils.TryParseIsoUtc` and braces on all `if` blocks, matching the current code and code standard.

**Files:** `docs/guides/patchfield-pattern.md`

---

## Current state

- `dotnet build`: 0 errors, 0 warnings
- `dotnet test --filter SystemNotices`: 27/27 pass
- `dotnet test --filter DateUtilsTests`: 15/15 pass
- `dotnet test --filter ArchitectureGuard`: 1/1 pass
- Total: 43/43

## Files changed since round 3

| File | What changed |
|------|-------------|
| `apps/api/Src/Lib/Utils/DateUtils.cs` | Explicit `'Z'`/`zzz` formats replace `K`-based formats; timezone-less input rejected |
| `apps/api/Src/Lib/Testing/DateUtilsTests.cs` | NEW — 15 tests pinning format contract + UTC conversion |
| `apps/api/Src/Lib/Testing/ArchitectureGuardTests.cs` | Broader namespace filter, recursive `ContainsPatchField`, excludes compiler-generated types |
| `docs/guides/patchfield-pattern.md` | Validator snippet updated to `DateUtils.TryParseIsoUtc` + braces |

---

## What I want you to review

1. **Is the `'Z'` literal + `AssumeUniversal` combination correct?** Does `AssumeUniversal` interfere with the `zzz` offset formats, or does the explicit offset always win?
2. **Are the 15 format contract tests sufficient?** Any edge cases we're missing (e.g., lowercase `z`, space before offset, `+0200` without colon)?
3. **Is the recursive `ContainsPatchField` robust?** Any .NET reflection edge cases (e.g., `Nullable<PatchField<T>>`, pointer types) we should handle?
4. **Final call — anything else before merge?**

Write your review as a Markdown file I can save as `patchfield-review-round4-output.md`. If everything looks good, a short "ship it" is fine — no need for lengthy write-ups on things that work.
