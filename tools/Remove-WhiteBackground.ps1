<#
.SYNOPSIS
    Converts a solid white/near-white background into real alpha transparency,
    saving a new PNG. Companion counterpart to Remove-MagentaBackground.ps1 for
    assets that were generated (or already existed) on a plain white backdrop
    rather than a magenta chroma-key backdrop.

.DESCRIPTION
    No image-editing tool or library is available on this machine, so this uses
    .NET's built-in System.Drawing (present in Windows PowerShell) to key
    pixel-by-pixel: a pixel counts as background when it's both close to pure
    white in value (R/G/B all near 255) and low in saturation (so a pale-yellow
    highlight on the subject itself isn't mistaken for background). Edge pixels
    get a soft partial alpha (blended from "closeness" to white) instead of a
    hard cutoff, to avoid jagged edges.

.EXAMPLE
    .\tools\Remove-WhiteBackground.ps1 -InFile "assets/images/companion/companion-happy.png" -OutFile "assets/images/companion/companion-happy.png"
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$InFile,

    [Parameter(Mandatory = $true)]
    [string]$OutFile
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Get-ProjectRoot {
    Split-Path -Parent $PSScriptRoot
}

function Resolve-ProjectPath {
    param([string]$Path)
    if ([System.IO.Path]::IsPathRooted($Path)) { return $Path }
    return Join-Path (Get-ProjectRoot) $Path
}

function Clamp01 {
    param([double]$Value)
    if ($Value -lt 0) { return 0.0 }
    if ($Value -gt 1) { return 1.0 }
    return $Value
}

$resolvedIn = Resolve-ProjectPath -Path $InFile
$resolvedOut = Resolve-ProjectPath -Path $OutFile

$outDir = Split-Path -Parent $resolvedOut
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
}

$src = [System.Drawing.Bitmap]::FromFile($resolvedIn)
$w = $src.Width
$h = $src.Height
$dst = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

# "Closeness to white" score: how near the pixel's darkest channel is to 255
# (a proxy for value) combined with how low its saturation is (max-min small).
# Both must be high for a pixel to be treated as background — a bright but
# saturated color (e.g. the mascot's gold) won't be mistaken for the backdrop.
$valueCore = 0.90
$valueFeather = 0.78
$satCoreMax = 0.10
$satFeatherMax = 0.22

for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
        $p = $src.GetPixel($x, $y)
        $r = $p.R / 255.0
        $g = $p.G / 255.0
        $b = $p.B / 255.0
        $max = [Math]::Max($r, [Math]::Max($g, $b))
        $min = [Math]::Min($r, [Math]::Min($g, $b))
        $sat = if ($max -eq 0) { 0 } else { ($max - $min) / $max }

        $valueScore = Clamp01 (($max - $valueFeather) / ($valueCore - $valueFeather))
        $satScore = Clamp01 (($satFeatherMax - $sat) / ($satFeatherMax - $satCoreMax))
        $whiteScore = [Math]::Min($valueScore, $satScore)

        $alpha = [int](255 * (1.0 - $whiteScore))
        $dst.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $p.R, $p.G, $p.B))
    }
}

$src.Dispose()
$dst.Save($resolvedOut, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()

Write-Host "Saved transparent PNG to: $resolvedOut"
