param(
  [string]$SourcePath = "packaging/icon-source.png",
  [string]$OutputPath = "packaging/icon.ico"
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing.dll @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class IconTools
{
    public static Bitmap RemoveCheckerboard(Bitmap source)
    {
        var output = new Bitmap(source.Width, source.Height, PixelFormat.Format32bppArgb);
        using (var graphics = Graphics.FromImage(output))
        {
            graphics.DrawImageUnscaled(source, 0, 0);
        }

        var rectangle = new Rectangle(0, 0, output.Width, output.Height);
        var data = output.LockBits(rectangle, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
        try
        {
            var length = Math.Abs(data.Stride) * output.Height;
            var pixels = new byte[length];
            Marshal.Copy(data.Scan0, pixels, 0, length);
            for (var y = 0; y < output.Height; y++)
            {
                var row = y * data.Stride;
                for (var x = 0; x < output.Width; x++)
                {
                    var index = row + x * 4;
                    var blue = pixels[index];
                    var green = pixels[index + 1];
                    var red = pixels[index + 2];
                    if (red >= 230 && Math.Abs(red - green) <= 3 && Math.Abs(green - blue) <= 3)
                    {
                        pixels[index + 3] = 0;
                    }
                }
            }
            Marshal.Copy(pixels, 0, data.Scan0, length);
        }
        finally
        {
            output.UnlockBits(data);
        }
        return output;
    }
}
"@

$sourceFile = Resolve-Path $SourcePath
$outputFile = Join-Path $PWD $OutputPath
$source = [System.Drawing.Bitmap]::FromFile($sourceFile)
$clean = [IconTools]::RemoveCheckerboard($source)
$sizes = @(16, 24, 32, 48, 64, 128, 256)
$frames = [System.Collections.Generic.List[byte[]]]::new()

try {
  foreach ($size in $sizes) {
    $frame = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($frame)
    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.DrawImage($clean, [System.Drawing.Rectangle]::new(0, 0, $size, $size))

      $stream = [System.IO.MemoryStream]::new()
      try {
        $frame.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
        $frames.Add($stream.ToArray())
      }
      finally {
        $stream.Dispose()
      }
    }
    finally {
      $graphics.Dispose()
      $frame.Dispose()
    }
  }

  $file = [System.IO.File]::Open($outputFile, [System.IO.FileMode]::Create, [System.IO.FileAccess]::Write)
  $writer = [System.IO.BinaryWriter]::new($file)
  try {
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$sizes.Count)
    $offset = 6 + (16 * $sizes.Count)
    for ($index = 0; $index -lt $sizes.Count; $index++) {
      $size = $sizes[$index]
      $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
      $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([UInt16]1)
      $writer.Write([UInt16]32)
      $writer.Write([UInt32]$frames[$index].Length)
      $writer.Write([UInt32]$offset)
      $offset += $frames[$index].Length
    }
    foreach ($frameData in $frames) {
      $writer.Write($frameData)
    }
  }
  finally {
    $writer.Dispose()
    $file.Dispose()
  }
}
finally {
  if ($null -ne $clean) {
    $clean.Dispose()
  }
  if ($null -ne $source) {
    $source.Dispose()
  }
}
