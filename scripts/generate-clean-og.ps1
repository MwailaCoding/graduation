Add-Type -AssemblyName System.Drawing

$width = 1200
$height = 630

$bmp = New-Object System.Drawing.Bitmap($width, $height)
$g = [System.Drawing.Graphics]::FromImage($bmp)

$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

# 1. Background fill: Deep Forest Green (#193C2F)
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(25, 60, 47))
$g.FillRectangle($bgBrush, 0, 0, $width, $height)

# 2. Luxury double hairline borders in Champagne Gold (#C4A46C)
$goldPenOuter = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(160, 196, 164, 108), 1.5)
$g.DrawRectangle($goldPenOuter, 20, 20, 1159, 589)

$goldPenInner = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 196, 164, 108), 1.0)
$g.DrawRectangle($goldPenInner, 26, 26, 1147, 577)

# 3. Corner accents (small 8px gold squares at the 4 corners of inner frame)
$goldBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(196, 164, 108))
$g.FillRectangle($goldBrush, 24, 24, 5, 5)
$g.FillRectangle($goldBrush, 1171, 24, 5, 5)
$g.FillRectangle($goldBrush, 24, 601, 5, 5)
$g.FillRectangle($goldBrush, 1171, 601, 5, 5)

# 4. Left photo: Majala & Achala
$photoPath = Resolve-Path "public/assets/photos/twins/twins-hero-bench.jpg"
if (Test-Path $photoPath) {
    $srcImg = [System.Drawing.Image]::FromFile($photoPath)
    
    # Destination rect for the framed photo
    $destX = 46
    $destY = 46
    $destW = 415
    $destH = 538

    # Crop source: focus on Majala and Achala nicely centered (src width 853, height 1280)
    # We want a 415x538 aspect ratio (~0.77). In source: 853 x 1105
    $srcCropX = 0
    $srcCropY = 60
    $srcCropW = $srcImg.Width
    $srcCropH = [int]($srcImg.Width * ($destH / $destW))
    if (($srcCropY + $srcCropH) -gt $srcImg.Height) {
        $srcCropH = $srcImg.Height - $srcCropY
    }

    $srcRect = New-Object System.Drawing.Rectangle($srcCropX, $srcCropY, $srcCropW, $srcCropH)
    $destRect = New-Object System.Drawing.Rectangle($destX, $destY, $destW, $destH)
    
    $g.DrawImage($srcImg, $destRect, $srcRect, [System.Drawing.GraphicsUnit]::Pixel)
    $srcImg.Dispose()

    # Photo Gold Border Frame
    $photoFramePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(210, 196, 164, 108), 2.0)
    $g.DrawRectangle($photoFramePen, $destX, $destY, $destW, $destH)
}

# 5. Right Content Layout (X = 505)
$contentX = 505
$textBrushIvory = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(247, 243, 234))
$textBrushGold = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(196, 164, 108))
$textBrushSand = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(225, 218, 206))
$textBrushMuted = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(165, 178, 154))

# Eyebrow
$fontEyebrow = New-Object System.Drawing.Font("Georgia", 11.0, [System.Drawing.FontStyle]::Bold)
$g.DrawString("YOU ARE CORDIALLY INVITED TO THE", $fontEyebrow, $textBrushGold, $contentX, 75)

# Thin gold horizontal bar under eyebrow
$barPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(196, 164, 108), 1.5)
$g.DrawLine($barPen, $contentX, 106, ($contentX + 50), 106)

# Main Title: "Graduation & Thanksgiving Celebration"
$fontTitle = New-Object System.Drawing.Font("Georgia", 34.0, [System.Drawing.FontStyle]::Bold)
$titleText = "Graduation &`nThanksgiving Celebration"
$titleRect = New-Object System.Drawing.RectangleF($contentX, 125, 630, 115)
$g.DrawString($titleText, $fontTitle, $textBrushIvory, $titleRect)

# Graduates: "Majala Mwaila & Achala Mwaila"
$fontGraduates = New-Object System.Drawing.Font("Georgia", 22.0, [System.Drawing.FontStyle]::Italic)
$g.DrawString("Majala Mwaila & Achala Mwaila", $fontGraduates, $textBrushGold, $contentX, 260)

# Elegant divider rule
$dividerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(100, 196, 164, 108), 1.0)
$g.DrawLine($dividerPen, $contentX, 315, ($contentX + 610), 315)

# Details Card Box (Soft translucent forest container with gold border)
$boxBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(50, 247, 243, 234))
$boxPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(90, 196, 164, 108), 1.0)
$boxRect = New-Object System.Drawing.Rectangle($contentX, 340, 615, 140)
$g.FillRectangle($boxBrush, $boxRect)
$g.DrawRectangle($boxPen, $boxRect)

# Date Row
$fontLabel = New-Object System.Drawing.Font("Segoe UI", 10.0, [System.Drawing.FontStyle]::Bold)
$fontValue = New-Object System.Drawing.Font("Segoe UI", 13.5, [System.Drawing.FontStyle]::Regular)

$g.DrawString("DATE & TIME", $fontLabel, $textBrushGold, ($contentX + 24), 360)
$g.DrawString("Saturday, 12 December 2026 at 12:00 PM", $fontValue, $textBrushIvory, ($contentX + 24), 382)

# Venue Row
$g.DrawString("VENUE", $fontLabel, $textBrushGold, ($contentX + 24), 422)
$g.DrawString("Rainbow Ruiru Resort, Ruiru", $fontValue, $textBrushSand, ($contentX + 24), 444)

# Footer: Formal Invitation Note (dignified, zero gimmicks)
$fontFooter = New-Object System.Drawing.Font("Segoe UI", 10.5, [System.Drawing.FontStyle]::Regular)
$g.DrawString("MWAILA FAMILY CELEBRATION   |   FORMAL INVITATION", $fontFooter, $textBrushMuted, $contentX, 515)

# Save high-quality outputs
$encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]88)

$bmp.Save("public/og-image.jpg", $encoder, $encoderParams)
$bmp.Save("src/app/opengraph-image.jpg", $encoder, $encoderParams)
$bmp.Save("src/app/twitter-image.jpg", $encoder, $encoderParams)
$bmp.Save("public/og-image.png", [System.Drawing.Imaging.ImageFormat]::Png)

$g.Dispose()
$bmp.Dispose()

$fi = Get-Item "public/og-image.jpg"
Write-Host "Generated clean professional OG image! Size: $($fi.Length) bytes"
