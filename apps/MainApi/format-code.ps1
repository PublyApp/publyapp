#!/usr/bin/env pwsh

param(
    [switch]$Verbose,
    [switch]$DryRun,
    [switch]$IncludeAnalyzers,
    [switch]$IncludeStyle
)

Write-Host "🔧 C# Code Formatter" -ForegroundColor Cyan
Write-Host "===================" -ForegroundColor Cyan

$projectPath = Get-Location
Write-Host "Project path: $projectPath" -ForegroundColor Yellow

# Build arguments
$args = @()

if ($DryRun) {
    $args += "--dry-run"
    Write-Host "Running in dry-run mode (no changes will be made)" -ForegroundColor Yellow
}

if ($IncludeAnalyzers) {
    $args += "--include-analyzers"
    Write-Host "Including analyzer fixes" -ForegroundColor Yellow
}

if ($IncludeStyle) {
    $args += "--include-style"
    Write-Host "Including style fixes" -ForegroundColor Yellow
}

if ($Verbose) {
    $args += "--verbosity"
    $args += "detailed"
    Write-Host "Verbose output enabled" -ForegroundColor Yellow
}

# Run dotnet format
Write-Host "`nRunning: dotnet format $($args -join ' ')" -ForegroundColor Green
try {
    & dotnet format @args
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Code formatting completed successfully!" -ForegroundColor Green
    } else {
        Write-Host "`n❌ Code formatting failed with exit code: $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "`n❌ Error running dotnet format: $_" -ForegroundColor Red
    exit 1
}

# Additional formatting options
Write-Host "`n📋 Additional formatting options:" -ForegroundColor Cyan
Write-Host "  • Format specific files: dotnet format --include <file1.cs> <file2.cs>" -ForegroundColor Gray
Write-Host "  • Format with specific severity: dotnet format --severity <error|warning|info>" -ForegroundColor Gray
Write-Host "  • Format with specific diagnostics: dotnet format --diagnostics <diagnostic-id>" -ForegroundColor Gray
Write-Host "  • Format solution: dotnet format --include <solution.sln>" -ForegroundColor Gray
