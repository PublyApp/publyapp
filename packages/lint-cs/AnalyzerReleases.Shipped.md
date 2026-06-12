; Shipped analyzer releases
; https://github.com/dotnet/roslyn-analyzers/blob/main/src/Microsoft.CodeAnalysis.Analyzers/ReleaseTrackingAnalyzers.Help.md
;
; NOTE: All PUBLY rules intentionally remain in AnalyzerReleases.Unshipped.md and are NOT
; migrated here, even though they are enforced in this repo. This is deliberate policy:
;
;   1. Every PUBLY rule ships with isEnabledByDefault: false (dormant). Moving a rule to
;      Shipped.md is normally paired with enabling it by default — but PUBLY rules must
;      never activate for consumers that reference the analyzer package without opting in.
;
;   2. Effective per-repo enforcement is driven entirely by .editorconfig severities:
;        dotnet_diagnostic.PUBLYxxxx.severity = warning
;      Combined with <TreatWarningsAsErrors>true</TreatWarningsAsErrors> in
;      Directory.Build.props, this turns each opted-in rule into a hard build error.
;      Currently all eight rules (PUBLY0001–PUBLY0008) are enforced this way.
;
;   3. The Roslyn release-tracking analyzer treats "Disabled" (isEnabledByDefault: false)
;      as the correct steady-state for this package. The "Disabled" entries in
;      AnalyzerReleases.Unshipped.md are NOT a sign that rules are missing or broken —
;      see the explanatory NOTE at the top of that file for details.
;
; In short: do NOT move PUBLY rule rows here. Enforcement is an .editorconfig concern,
; not a release-promotion concern.
