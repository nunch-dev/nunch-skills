param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Target,
  [Parameter(ValueFromRemainingArguments = $true, Position = 1)]
  [string[]]$RemainingArgs
)

$ErrorActionPreference = "Continue"
$candidates = @()
if (-not [string]::IsNullOrWhiteSpace($env:NODE_REPL_NODE_PATH)) { $candidates += $env:NODE_REPL_NODE_PATH }
if (-not [string]::IsNullOrWhiteSpace($env:ProgramFiles)) { $candidates += (Join-Path $env:ProgramFiles "nodejs\node.exe") }
if (-not [string]::IsNullOrWhiteSpace($env:LOCALAPPDATA)) { $candidates += (Join-Path $env:LOCALAPPDATA "Programs\nodejs\node.exe") }
$onPath = Get-Command node -CommandType Application -ErrorAction SilentlyContinue
if ($null -ne $onPath) { $candidates += (@($onPath)[0]).Source }

foreach ($candidate in $candidates) {
  if (Test-Path -LiteralPath $candidate -PathType Leaf) {
    $versionOutput = & $candidate --version 2>$null
    if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch '^v([0-9]+)\.') { continue }
    if ([int]$Matches[1] -lt 22) { continue }
    & $candidate $Target @RemainingArgs
    exit $LASTEXITCODE
  }
}

Write-Error "nch-installer could not find Node.js 22 or newer"
exit 127
