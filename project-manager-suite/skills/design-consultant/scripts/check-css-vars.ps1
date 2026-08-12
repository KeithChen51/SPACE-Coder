param(
  [Alias("CssPath")]
  [string[]]$Path = @("."),
  [string[]]$TokenDefinitionPath = @(),
  [string[]]$Include = @("*.css", "*.scss", "*.ts", "*.tsx", "*.html"),
  [string[]]$ExternalVarPrefix = @(
    "--background-",
    "--text-",
    "--interactive-",
    "--color-",
    "--font-",
    "--input-",
    "--modal-"
  )
)

$ErrorActionPreference = "Stop"

if ($TokenDefinitionPath.Count -eq 0) {
  $defaultTokenPath = Join-Path $PSScriptRoot "..\tokens\tokens.css"
  if (Test-Path -LiteralPath $defaultTokenPath -PathType Leaf) {
    $TokenDefinitionPath = @($defaultTokenPath)
  }
}

$scanRoots = @($Path) + @($TokenDefinitionPath)

$files = foreach ($root in $scanRoots) {
  if (Test-Path -LiteralPath $root -PathType Leaf) {
    Get-Item -LiteralPath $root
  } elseif (Test-Path -LiteralPath $root -PathType Container) {
    Get-ChildItem -LiteralPath $root -Recurse -File |
      Where-Object {
        $file = $_
        $included = @($Include | Where-Object { $file.Name -like $_ }).Count -gt 0
        $included -and $file.FullName -notmatch "\\node_modules\\|\\dist\\|\\build\\|\\coverage\\"
      }
  }
}
$files = @($files | Sort-Object FullName -Unique)

$definitions = New-Object 'System.Collections.Generic.HashSet[string]'
$uses = New-Object 'System.Collections.Generic.HashSet[string]'
$useLocations = @{}

foreach ($file in $files) {
  $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  foreach ($match in [regex]::Matches($text, '(?m)(--[A-Za-z0-9_-]+)\s*:')) {
    [void]$definitions.Add($match.Groups[1].Value)
  }
  foreach ($match in [regex]::Matches($text, 'var\((--[A-Za-z0-9_-]+)')) {
    $name = $match.Groups[1].Value
    [void]$uses.Add($name)
    if (-not $useLocations.ContainsKey($name)) {
      $useLocations[$name] = New-Object 'System.Collections.Generic.List[string]'
    }
    $useLocations[$name].Add($file.FullName)
  }
}

$undefined = @()
foreach ($name in $uses) {
  $isExternal = $false
  foreach ($prefix in $ExternalVarPrefix) {
    if ($name.StartsWith($prefix)) {
      $isExternal = $true
      break
    }
  }
  if (-not $isExternal -and -not $definitions.Contains($name)) {
    $undefined += [pscustomobject]@{
      variable = $name
      files = @($useLocations[$name] | Sort-Object -Unique)
    }
  }
}

$result = [pscustomobject]@{
  filesScanned = @($files).Count
  definitions = $definitions.Count
  uses = $uses.Count
  undefined = $undefined
}

$result | ConvertTo-Json -Depth 6

if ($undefined.Count -gt 0) {
  exit 1
}
