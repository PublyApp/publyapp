; Unshipped analyzer release
; https://github.com/dotnet/roslyn-analyzers/blob/main/src/Microsoft.CodeAnalysis.Analyzers/ReleaseTrackingAnalyzers.Help.md

### New Rules

Rule ID | Category | Severity | Notes
--------|----------|----------|--------------------
PUBLY0001 | PublyApp.Nullability | Disabled | Avoid the null-forgiving operator
PUBLY0002 | PublyApp.Nullability | Disabled | Avoid null-coalescing throw expressions
PUBLY0003 | PublyApp.Comparison | Disabled | Avoid ToLower()/ToLowerInvariant() for comparison or dispatch
PUBLY0006 | PublyApp.Correctness | Disabled | Avoid uncached request DTO getter calls
PUBLY0004 | PublyApp.Naming | Disabled | Avoid Dto suffix on handler contracts
