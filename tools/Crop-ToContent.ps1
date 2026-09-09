<#
.SYNOPSIS
    Crops a transparent PNG to the bounding box of its non-transparent pixels.

.DESCRIPTION
    The image generator centres a sprite on a 1024x1024 canvas, which usually
    leaves 50-70% of the frame empty. Sizing such a file with CSS sizes the
    CANVAS, not the artwork — so a 168px element can render a 50px balloon, well
    under the 80px minimum touch target this age group needs.

    This project has already paid for that mistake once: a bed sprite with ~25%
    dead padding could not be positioned correctly by any CSS value, because the
    image's own bounding box was the real constraint. Fix it at the source.

    Adds a small padding margin so drop-shadows and glows are not clipped.

.PARAMETER InFile
    PNG with an alpha channel. Run the chroma-key step first.

.PARAMETER OutFile
    Where to write. Defaults to overwriting InFile.

.PARAMETER PaddingPercent
    Margin kept around the content, as a percentage of the cropped size.

.EXAMPLE
    .\tools\Crop-ToContent.ps1 -InFile "assets/images/props/balloon-gold.png"
#>
param(
    [Parameter(Mandatory = $true)][string]$InFile,
    [string]$OutFile,
    [double]$PaddingPercent = 3,
    [int]$AlphaThreshold = 12
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
function Resolve-ProjectPath([string]$p) {
    if ([System.IO.Path]::IsPathRooted($p)) { return $p }
    return Join-Path $root ($p -replace '/', '\')
}

$inPath = Resolve-ProjectPath $InFile
if (-not (Test-Path $inPath)) { throw "Not found: $inPath" }
if (-not $OutFile) { $OutFile = $InFile }
$outPath = Resolve-ProjectPath $OutFile

$src = New-Object System.Drawing.Bitmap $inPath
$w = $src.Width; $h = $src.Height

# Find the tight bounding box of pixels that are meaningfully opaque.
$minX = $w; $minY = $h; $maxX = -1; $maxY = -1
for ($y = 0; $y -lt $h; $y++) {
    for ($x = 0; $x -lt $w; $x++) {
        if ($src.GetPixel($x, $y).A -gt $AlphaThreshold) {
            if ($x -lt $minX) { $minX = $x }
            if ($x -gt $maxX) { $maxX = $x }
            if ($y -lt $minY) { $minY = $y }
            if ($y -gt $maxY) { $maxY = $y }
        }
    }
}

if ($maxX -lt 0) {
    $src.Dispose()
    throw "Image is fully transparent - the chroma key probably ate the sprite. Check the background hue."
}

$contentW = $maxX - $minX + 1
$contentH = $maxY - $minY + 1
$padX = [int]([Math]::Round($contentW * $PaddingPercent / 100))
$padY = [int]([Math]::Round($contentH * $PaddingPercent / 100))

$cropX = [Math]::Max(0, $minX - $padX)
$cropY = [Math]::Max(0, $minY - $padY)
$cropW = [Math]::Min($w - $cropX, $contentW + 2 * $padX)
$cropH = [Math]::Min($h - $cropY, $contentH + 2 * $padY)

$dst = New-Object System.Drawing.Bitmap $cropW, $cropH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($dst)
$g.Clear([System.Drawing.Color]::Transparent)
$g.DrawImage($src, (New-Object System.Drawing.Rectangle 0, 0, $cropW, $cropH),
             (New-Object System.Drawing.Rectangle $cropX, $cropY, $cropW, $cropH),
             [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$src.Dispose()

$dst.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$dst.Dispose()

# NOTE: "${pct}%" would parse the % as the modulo operator. Use -f instead.
$pct = [Math]::Round(($cropW * $cropH) / ($w * $h) * 100, 1)
Write-Host ("Cropped {0}x{1} -> {2}x{3} ({4} pct of original) : {5}" -f $w, $h, $cropW, $cropH, $pct, $outPath)
