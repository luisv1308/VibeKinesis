param(
  [switch]$Force
)

Add-Type -AssemblyName System.Drawing
$dir = Join-Path $PSScriptRoot '..\public'
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }

function New-HandPng {
  param(
    [string]$Path,
    [int[]]$BgRgb,
    [int[]]$AccentRgb,
    [bool]$Overwrite
  )
  if ((Test-Path $Path) -and -not $Overwrite) {
    Write-Host "Omitido (ya existe): $Path"
    return
  }
  $bmp = New-Object System.Drawing.Bitmap 256, 256
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.Clear([System.Drawing.Color]::FromArgb(255, $BgRgb[0], $BgRgb[1], $BgRgb[2]))
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, $AccentRgb[0], $AccentRgb[1], $AccentRgb[2])), 8
  $g.DrawEllipse($pen, 40, 60, 176, 140)
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Host "Creado: $Path"
}

$overwrite = $Force.IsPresent
New-HandPng (Join-Path $dir 'single_hand_open.png') @(12, 18, 28) @(0, 255, 240) $overwrite
New-HandPng (Join-Path $dir 'single_hand_close.png') @(28, 14, 18) @(255, 90, 90) $overwrite
New-HandPng (Join-Path $dir 'original_hand_extended.png') @(14, 22, 34) @(120, 220, 255) $overwrite
if (-not $overwrite) {
  Write-Host 'Para regenerar y SOBRESCRIBIR, ejecuta: .\make-hand-placeholders.ps1 -Force'
}
