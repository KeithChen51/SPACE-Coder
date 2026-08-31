param(
  [Alias("SkillPath")]
  [string[]]$Path = @("."),
  [string]$IconImportPattern = "",
  [string[]]$SharedComponentNames = @("DataTable", "SelectField", "Dialog", "IconButton"),
  [string[]]$TokenSourceFileName = @("tokens.css", "tokens.json", "mono-tokens.js"),
  [string]$ExcludePathPattern = "\\node_modules\\|\\dist\\|\\build\\|\\coverage\\|\\.tmp\\|\\vendor\\|\\visualizations?\\lieflat\\runtime\\|\\templates\\visualization-lieflat\\runtime\\"
)

$ErrorActionPreference = "Stop"
$sourceExtensions = @(".css", ".ts", ".tsx", ".jsx", ".js")

$files = foreach ($root in $Path) {
  if (Test-Path -LiteralPath $root -PathType Leaf) {
    Get-Item -LiteralPath $root
  } elseif (Test-Path -LiteralPath $root -PathType Container) {
    Get-ChildItem -LiteralPath $root -Recurse -File |
      Where-Object {
        $_.Extension -in $sourceExtensions -and
        $_.FullName -notmatch $ExcludePathPattern
      }
  }
}
$files = @($files | Sort-Object FullName -Unique)

$enforceDataTable = $SharedComponentNames -contains "DataTable"
$enforceSelect = @($SharedComponentNames | Where-Object { $_ -in @("Select", "SelectField", "Combobox", "FieldShell") }).Count -gt 0
$enforceDialog = @($SharedComponentNames | Where-Object { $_ -in @("Dialog", "ConfirmDialog") }).Count -gt 0

$issues = New-Object 'System.Collections.Generic.List[object]'
$colorPattern = '#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)|oklch\([^)]+\)'

foreach ($file in $files) {
  $text = Get-Content -LiteralPath $file.FullName -Raw -Encoding UTF8
  $rel = $file.FullName
  $isTokenSource = $TokenSourceFileName -contains $file.Name

  if (-not $isTokenSource -and $file.Extension -in @(".css", ".ts", ".tsx", ".jsx", ".js") -and $text -match $colorPattern) {
    $issues.Add([pscustomobject]@{
      rule = "literal-color"
      file = $rel
      message = "Color literal found. Prefer design tokens unless this is a token source file."
    })
  }

  if ($file.Extension -in @(".tsx", ".jsx") -and $text -match '<(?:div|span)\b[^>]*\bonClick=') {
    $issues.Add([pscustomobject]@{
      rule = "non-interactive-click"
      file = $rel
      message = "div/span onClick found. Use button/link or document a semantic exception."
    })
  }

  if ($enforceSelect -and $file.Extension -in @(".tsx", ".jsx") -and $text -match '<select\b') {
    $issues.Add([pscustomobject]@{
      rule = "native-select"
      file = $rel
      message = "Native select found. Prefer shared SelectField/Combobox when the project has one."
    })
  }

  if ($enforceDataTable -and $file.Extension -in @(".tsx", ".jsx") -and $text -match '<table\b') {
    $issues.Add([pscustomobject]@{
      rule = "raw-table"
      file = $rel
      message = "Raw table markup found. Prefer shared DataTable when the project has one."
    })
  }

  if ($enforceDialog -and $file.Extension -in @(".tsx", ".jsx") -and ($text -match 'role="dialog"' -or $text -match 'aria-modal="true"')) {
    $issues.Add([pscustomobject]@{
      rule = "raw-dialog"
      file = $rel
      message = "Dialog semantics found. Prefer shared Dialog/ConfirmDialog when the project has one."
    })
  }

  if ($IconImportPattern -and $text -match $IconImportPattern) {
    $issues.Add([pscustomobject]@{
      rule = "direct-icon-import"
      file = $rel
      message = "Direct icon library import found. Prefer a centralized icon component."
    })
  }
}

$result = [pscustomobject]@{
  filesScanned = @($files).Count
  sharedComponentNames = $SharedComponentNames
  issues = $issues
}

$result | ConvertTo-Json -Depth 6

if ($issues.Count -gt 0) {
  exit 1
}
