<#
.SYNOPSIS
    Generates a cutout sprite: generate -> chroma key -> crop -> (optional) normalise.

.DESCRIPTION
    Wraps the whole sprite pipeline so the four lessons from the first batch are
    applied every time instead of remembered. See docs/design-direction.md 6.2b.

    KEY COLOUR IS THE COMPLEMENT OF THE SPRITE.
    Chroma keying works on hue distance, so a sprite whose own colour sits near
    the key colour gets eaten - a coral balloon on magenta came back with alpha 0
    through the middle of the balloon. Pass -SpriteHueFamily and the right key is
    chosen for you:

        warm   (red / coral / orange)  -> green key
        gold   (yellow / amber / sand) -> violet key
        cool   (teal / blue / green)   -> magenta key

    The background hue is auto-sampled from the generated image rather than
    assumed, because the model drifts several degrees between runs.

.PARAMETER Prompt
    Describe the object only. The background clause, the style clause and the
    no-text clause are appended for you.

.PARAMETER OutFile
    Project-relative path, e.g. "assets/images/props/lantern.png".

.PARAMETER SpriteHueFamily
    warm | gold | cool. Picks the chroma key colour.

.PARAMETER NormaliseTo
    Optional "WxH" (e.g. "512x640"). Use for a SET of sprites that must render at
    a shared size with a feature in the same place - raw crops come out at wildly
    different aspect ratios otherwise.

.EXAMPLE
    .\tools\New-Sprite.ps1 -Prompt "a small warm glowing paper lantern with a handle" -OutFile "assets/images/props/lantern.png" -SpriteHueFamily gold
#>
param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [Parameter(Mandatory = $true)][string]$OutFile,
    [ValidateSet('warm', 'gold', 'cool')][string]$SpriteHueFamily = 'warm',
    [string]$NormaliseTo,
    [switch]$KeepRaw
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outPath = Join-Path $root ($OutFile -replace '/', '\')

$keyByFamily = @{
    warm = 'bright chroma key green'
    gold = 'deep violet purple'
    cool = 'bright magenta pink'
}
$key = $keyByFamily[$SpriteHueFamily]

$noText = ', no text, no letters, no numbers, no writing, no symbols, no signage, no watermark'
$full = "$Prompt, thick dark ink outline, centred and filling most of the frame, on a solid flat $key background, children's sticker illustration style$noText"

Write-Host "1/4 generating (key: $key)"
# Delete any previous output FIRST. Checking "does the file exist" after the
# call is not enough: a rejected generation left the stale PNG in place, and the
# pipeline happily keyed, cropped and reported success on the old image.
if (Test-Path $outPath) { Remove-Item $outPath -Force }

& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Generate-Image.ps1') -Prompt $full -OutFile $OutFile | Out-Null
$genExit = $LASTEXITCODE
if ($genExit -ne 0 -or -not (Test-Path $outPath)) {
    throw "Generation failed (exit $genExit). The content filter rejects ordinary phrasing fairly often - shorten the prompt and drop adjectives like 'blank', 'bare' or 'held'."
}

if ($KeepRaw) { Copy-Item $outPath ($outPath -replace '\.png$', '-raw.png') -Force }

# Sample the actual background rather than trusting the requested colour.
$bmp = New-Object System.Drawing.Bitmap $outPath
$hue = $bmp.GetPixel(8, 8).GetHue()
$bmp.Dispose()
Write-Host ("2/4 keying background at hue {0:N1}" -f $hue)
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Remove-MagentaBackground.ps1') -InFile $OutFile -OutFile $OutFile -BackgroundHue $hue | Out-Null

Write-Host "3/4 cropping to content"
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'Crop-ToContent.ps1') -InFile $OutFile

if ($NormaliseTo) {
    if ($NormaliseTo -notmatch '^(\d+)x(\d+)$') { throw "NormaliseTo must look like 512x640" }
    $cw = [int]$Matches[1]; $ch = [int]$Matches[2]
    $src = New-Object System.Drawing.Bitmap $outPath
    $scale = [Math]::Min($cw / $src.Width, $ch / $src.Height)
    $nw = [int]($src.Width * $scale); $nh = [int]($src.Height * $scale)
    $dst = New-Object System.Drawing.Bitmap $cw, $ch, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($dst)
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    # Top-centre aligned, so the same feature lands at the same height in a set.
    $g.DrawImage($src, [int](($cw - $nw) / 2), 0, $nw, $nh)
    $g.Dispose(); $src.Dispose()
    $tmp = Join-Path $env:TEMP ("norm-" + [System.IO.Path]::GetFileName($outPath))
    $dst.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png); $dst.Dispose()
    Move-Item $tmp $outPath -Force
    Write-Host "4/4 normalised to ${cw}x${ch}"
} else {
    Write-Host "4/4 skipped normalise"
}

# Fail loudly if the key ate the sprite, rather than shipping an empty PNG.
$check = New-Object System.Drawing.Bitmap $outPath
$opaque = 0
for ($y = 0; $y -lt $check.Height; $y += 8) {
    for ($x = 0; $x -lt $check.Width; $x += 8) {
        if ($check.GetPixel($x, $y).A -gt 200) { $opaque++ }
    }
}
$total = [Math]::Ceiling($check.Height / 8) * [Math]::Ceiling($check.Width / 8)
$check.Dispose()
$pct = [Math]::Round($opaque / $total * 100, 1)
if ($pct -lt 8) {
    Write-Warning ("Only {0} pct of pixels survived - the key may have eaten the sprite. Try a different -SpriteHueFamily." -f $pct)
} else {
    Write-Host ("done: {0} pct opaque -> {1}" -f $pct, $OutFile)
}
