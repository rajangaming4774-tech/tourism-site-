<#
    Measures the Shore Temple's stone colour from the reference photographs.

    WHY THIS EXISTS
    ---------------
    The granite tones in assets/models/shore-temple.glb were picked by eye off a
    couple of photographs, which is exactly the kind of guess the rest of this
    project refuses to make. There are 738 full-resolution photographs of the
    actual stone on disk. The colour can be measured.

    WHAT IS MEASURABLE AND WHAT IS NOT
    ----------------------------------
    A photographed pixel is albedo multiplied by illumination, so no single
    photograph gives the stone's reflectance. What a LARGE set of photographs
    gives, taken across many years, cameras, hours and skies, is the stone's
    CHROMATICITY — the ratio between channels — because the lighting varies
    randomly around neutral and the median cancels it. Sunset shots pull warm,
    overcast shots pull cool, and the middle of the distribution is the stone.

    So this script reports a measured hue and a measured relative channel
    balance, and it does NOT claim to measure absolute brightness. The albedo
    level is set separately, from published reflectance for weathered granite.

    HOW PIXELS ARE CHOSEN
    ---------------------
    Naively averaging a photograph returns the average of sky, grass, visitors'
    shirts and stone. Each is rejected on a rule that is about what it is, not
    about the colour wanted:
      - sky        : blue dominant and bright
      - vegetation : green dominant
      - people     : saturation above what weathered granite ever reaches
      - blown / black: no colour information survives at either clipping end
    What is left is overwhelmingly stone, ground and shadowed stone.

    Two-stage median: per image first, then across images. One photograph that
    is mostly one blue shirt cannot then move the result.

    Usage: powershell -File scripts/measure-shore-temple-colour.ps1 [-Count 150]
#>
param(
    [int]$Count = 150,
    [int]$ThumbWidth = 110
)

Add-Type -AssemblyName System.Drawing

$imgDir = Join-Path $PSScriptRoot "..\assets\reference\shore-temple\photogrammetry\images"
$dataset = Join-Path $PSScriptRoot "..\assets\reference\shore-temple\photogrammetry\dataset.json"

if (-not (Test-Path $dataset)) { throw "No dataset.json - run build-shore-temple-sfm.js first." }

# Core tier only, and only the full-resolution originals: the 1920 px renditions
# have been through Wikimedia's thumbnailer, which re-encodes and can shift
# colour slightly. Originals are what the camera wrote.
$ds = Get-Content $dataset -Raw | ConvertFrom-Json
$files = $ds.images |
    Where-Object { $_.tier -eq "core" -and $_.source -eq "original" } |
    Select-Object -First $Count -ExpandProperty file

Write-Output "sampling $($files.Count) photographs"

$perImage = New-Object System.Collections.Generic.List[object]
$done = 0
$skipped = 0

foreach ($name in $files) {
    $path = Join-Path $imgDir $name
    if (-not (Test-Path $path)) { $skipped++; continue }
    try {
        $src = [System.Drawing.Bitmap]::FromFile($path)
    } catch { $skipped++; continue }

    try {
        $h = [int]($src.Height * $ThumbWidth / $src.Width)
        if ($h -lt 8) { $src.Dispose(); $skipped++; continue }
        $thumb = New-Object System.Drawing.Bitmap $ThumbWidth, $h
        $g = [System.Drawing.Graphics]::FromImage($thumb)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($src, 0, 0, $ThumbWidth, $h)
        $g.Dispose()

        $rs = New-Object System.Collections.Generic.List[int]
        $gs = New-Object System.Collections.Generic.List[int]
        $bs = New-Object System.Collections.Generic.List[int]

        for ($y = 0; $y -lt $h; $y++) {
            for ($x = 0; $x -lt $ThumbWidth; $x++) {
                $c = $thumb.GetPixel($x, $y)
                $r = [int]$c.R; $gg = [int]$c.G; $bb = [int]$c.B
                $mx = [Math]::Max($r, [Math]::Max($gg, $bb))
                $mn = [Math]::Min($r, [Math]::Min($gg, $bb))

                if ($mx -gt 238) { continue }          # blown
                if ($mx -lt 28)  { continue }          # black, no colour left
                if ($bb -gt $r + 8 -and $mx -gt 105) { continue }   # sky
                if ($gg -gt $r + 6 -and $gg -gt $bb + 6) { continue } # vegetation
                if ($mx -gt 0 -and (($mx - $mn) / $mx) -gt 0.42) { continue } # clothing
                $rs.Add($r); $gs.Add($gg); $bs.Add($bb)
            }
        }

        $thumb.Dispose()
        if ($rs.Count -lt 200) { $skipped++; continue }   # too little stone visible

        $rs.Sort(); $gs.Sort(); $bs.Sort()
        $m = [int]($rs.Count / 2)
        $perImage.Add([pscustomobject]@{
            file = $name; n = $rs.Count
            r = $rs[$m]; g = $gs[$m]; b = $bs[$m]
        })
        $done++
        if ($done % 25 -eq 0) { Write-Output "  $done/$($files.Count)" }
    } finally {
        $src.Dispose()
    }
}

if ($perImage.Count -lt 10) { throw "only $($perImage.Count) usable photographs - cannot measure" }

function Median([int[]]$v) { $s = $v | Sort-Object; return $s[[int]($s.Count / 2)] }
function Pct([int[]]$v, [double]$p) { $s = $v | Sort-Object; return $s[[int](($s.Count - 1) * $p)] }

$R = Median ($perImage.r); $G = Median ($perImage.g); $B = Median ($perImage.b)

Write-Output ""
Write-Output "usable photographs: $($perImage.Count)  (skipped $skipped)"
Write-Output "median stone pixel, sRGB 0-255:  R=$R G=$G B=$B"
Write-Output ("  spread R  p10=" + (Pct ($perImage.r) 0.1) + "  p90=" + (Pct ($perImage.r) 0.9))
Write-Output ("  spread G  p10=" + (Pct ($perImage.g) 0.1) + "  p90=" + (Pct ($perImage.g) 0.9))
Write-Output ("  spread B  p10=" + (Pct ($perImage.b) 0.1) + "  p90=" + (Pct ($perImage.b) 0.9))

# Chromaticity: the part that IS measured. Normalised so the channels sum to 3,
# i.e. a neutral grey would read 1.000 / 1.000 / 1.000.
$sum = $R + $G + $B
$cr = [Math]::Round(3.0 * $R / $sum, 4)
$cg = [Math]::Round(3.0 * $G / $sum, 4)
$cb = [Math]::Round(3.0 * $B / $sum, 4)
Write-Output ""
Write-Output "measured chromaticity (neutral = 1.000 each):  R=$cr  G=$cg  B=$cb"

$hex = "#{0:X2}{1:X2}{2:X2}" -f $R, $G, $B
Write-Output "median colour as sRGB hex: $hex"

$out = Join-Path $PSScriptRoot "..\data\research\3d\shore-temple-stone-colour.json"
[pscustomobject]@{
    measured    = (Get-Date).ToString("yyyy-MM-dd")
    photographs = $perImage.Count
    method      = "per-image median of stone-classified pixels, then median across images; core-tier full-resolution originals only"
    median_srgb = @{ r = $R; g = $G; b = $B; hex = $hex }
    chromaticity = @{ r = $cr; g = $cg; b = $cb }
    caveat      = "Chromaticity is measured. Absolute brightness is NOT: a photographed pixel is albedo times illumination, and no set of photographs separates the two."
    per_image   = $perImage
} | ConvertTo-Json -Depth 4 | Set-Content -Path $out -Encoding utf8
Write-Output "wrote $out"
