$ErrorActionPreference = "Stop"
$pluginRoot = Split-Path -Parent $PSScriptRoot
$architecture = switch ($env:PROCESSOR_ARCHITECTURE) {
    "ARM64" { "arm64" }
    "AMD64" { "amd64" }
    default { throw "unsupported architecture: $env:PROCESSOR_ARCHITECTURE" }
}
$binary = Join-Path $pluginRoot "bin/nunch-skills-manager-windows-$architecture.exe"
& $binary @args
exit $LASTEXITCODE
