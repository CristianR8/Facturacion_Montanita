const fs = require("fs");
const os = require("os");
const path = require("path");
const { app } = require("electron");
const { execFile } = require("child_process");

const userDataPath = app && typeof app.getPath === "function" ? app.getPath("userData") : process.cwd();
const printerLogFile = path.join(userDataPath, "main.log");
const THERMAL_PAPER_WIDTH = 315;
const THERMAL_SIDE_PADDING = 12;
const THERMAL_PRINTABLE_WIDTH = THERMAL_PAPER_WIDTH - THERMAL_SIDE_PADDING * 2;
const THERMAL_PAPER_HEIGHT = 1800;
const THERMAL_FONT_SIZE = 8.2;
const THERMAL_TEXT_COLUMNS = 42;
const THERMAL_LOGO_MAX_WIDTH = 150;
const THERMAL_LOGO_MAX_HEIGHT = 60;

function writePrinterLog(message) {
  const line = `[${new Date().toISOString()}] [printer] ${message}\n`;
  try {
    fs.mkdirSync(path.dirname(printerLogFile), { recursive: true });
    fs.appendFileSync(printerLogFile, line, "utf8");
  } catch {
    // Ignore logging failures so printing can still continue.
  }
}

function formatMoney(value, currency) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function normalizePrinterName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeReceiptText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function wrapReceiptText(value, width = THERMAL_TEXT_COLUMNS) {
  const normalized = normalizeReceiptText(value);

  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    if (word.length > width) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = "";
      }

      for (let index = 0; index < word.length; index += width) {
        lines.push(word.slice(index, index + width));
      }
      continue;
    }

    const nextLine = currentLine ? `${currentLine} ${word}` : word;
    if (nextLine.length <= width) {
      currentLine = nextLine;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines;
}

function centerReceiptText(value, width = THERMAL_TEXT_COLUMNS) {
  return wrapReceiptText(value, width).map((line) => {
    const leftPadding = Math.max(0, Math.floor((width - line.length) / 2));
    return `${" ".repeat(leftPadding)}${line}`;
  });
}

function formatReceiptPair(label, value, width = THERMAL_TEXT_COLUMNS) {
  const normalizedLabel = normalizeReceiptText(label);
  const normalizedValue = normalizeReceiptText(value);

  if (!normalizedLabel && !normalizedValue) {
    return [];
  }

  if (!normalizedValue) {
    return wrapReceiptText(normalizedLabel, width);
  }

  if (!normalizedLabel) {
    return [normalizedValue.padStart(width)];
  }

  const inlineText = `${normalizedLabel} ${normalizedValue}`;

  if (inlineText.length <= width) {
    const spacing = Math.max(2, width - normalizedLabel.length - normalizedValue.length);
    return [`${normalizedLabel}${" ".repeat(spacing)}${normalizedValue}`];
  }

  return [...wrapReceiptText(normalizedLabel, width), normalizedValue.padStart(width)];
}

function formatReceiptField(label, value, width = THERMAL_TEXT_COLUMNS) {
  const normalizedValue = normalizeReceiptText(value);

  if (!normalizedValue) {
    return [];
  }

  const fieldLabel = `${normalizeReceiptText(label)}:`;
  const inlineText = `${fieldLabel} ${normalizedValue}`;

  if (inlineText.length <= width) {
    return [inlineText];
  }

  return [fieldLabel, ...wrapReceiptText(normalizedValue, width)];
}

function formatReceiptDate(value) {
  const receiptDate = value ? new Date(value) : new Date();

  if (Number.isNaN(receiptDate.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(receiptDate);
}

function resolveLogoSourcePath(logoUrl) {
  const normalizedLogoUrl = String(logoUrl || "").trim();

  if (
    !normalizedLogoUrl ||
    /^https?:\/\//i.test(normalizedLogoUrl) ||
    /^data:image\//i.test(normalizedLogoUrl)
  ) {
    return null;
  }

  const appPath = app && typeof app.getAppPath === "function" ? app.getAppPath() : process.cwd();
  const candidatePaths = [];

  if (path.isAbsolute(normalizedLogoUrl)) {
    candidatePaths.push(normalizedLogoUrl);
  } else {
    candidatePaths.push(path.resolve(process.cwd(), normalizedLogoUrl));
    candidatePaths.push(path.resolve(process.cwd(), "dist", normalizedLogoUrl));
    candidatePaths.push(path.resolve(__dirname, "..", normalizedLogoUrl));
    candidatePaths.push(path.resolve(__dirname, "..", "dist", normalizedLogoUrl));
    candidatePaths.push(path.resolve(appPath, normalizedLogoUrl));
    candidatePaths.push(path.resolve(appPath, "dist", normalizedLogoUrl));
  }

  if (process.resourcesPath) {
    candidatePaths.push(path.resolve(process.resourcesPath, normalizedLogoUrl));
    candidatePaths.push(path.resolve(process.resourcesPath, "dist", normalizedLogoUrl));
  }

  const visited = new Set();

  for (const candidatePath of candidatePaths) {
    if (!candidatePath || visited.has(candidatePath)) {
      continue;
    }
    visited.add(candidatePath);

    try {
      if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
        return candidatePath;
      }
    } catch {
      // Ignore invalid candidates and continue searching.
    }
  }

  return null;
}

function createTemporaryLogoFile(logoUrl) {
  const sourcePath = resolveLogoSourcePath(logoUrl);

  if (!sourcePath) {
    return null;
  }

  const extension = path.extname(sourcePath) || ".img";
  const tempLogoPath = path.join(os.tmpdir(), `lamontanita-logo-${Date.now()}${extension}`);

  fs.writeFileSync(tempLogoPath, fs.readFileSync(sourcePath));
  return tempLogoPath;
}

function buildThermalReceipt(invoice, companyProfile) {
  const divider = "-".repeat(THERMAL_TEXT_COLUMNS);
  const totalDivider = "=".repeat(THERMAL_TEXT_COLUMNS);
  const lines = [];

  lines.push(...centerReceiptText(String(companyProfile.businessName || "").toUpperCase()));
  lines.push(...centerReceiptText(companyProfile.address));
  lines.push(...centerReceiptText(companyProfile.phone ? `Tel. ${companyProfile.phone}` : ""));
  lines.push(divider);
  lines.push(...formatReceiptPair("Factura", invoice.id));
  lines.push(...formatReceiptPair("Fecha", formatReceiptDate(invoice.createdAt)));
  lines.push(...formatReceiptField("Cliente", invoice.customerName));
  lines.push(...formatReceiptField("Documento", invoice.customerDocument));
  lines.push(...formatReceiptField("Telefono", invoice.customerPhone));
  lines.push(...formatReceiptField("Correo", invoice.customerEmail));
  lines.push(...formatReceiptField("Pago", invoice.paymentMethod));
  lines.push(divider);

  for (const item of invoice.items) {
    lines.push(...wrapReceiptText(item.description));
    if (item.weightGrams) {
      lines.push(...formatReceiptField("Peso", `${item.weightGrams} g`));
    }
    lines.push(
      ...formatReceiptPair(
        `${item.quantity} x ${formatMoney(item.unitPrice, companyProfile.currency)}`,
        formatMoney(item.quantity * item.unitPrice, companyProfile.currency)
      )
    );
    lines.push("");
  }

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  lines.push(divider);
  lines.push(...formatReceiptPair("Subtotal", formatMoney(invoice.subtotal, companyProfile.currency)));
  lines.push(...formatReceiptPair("IVA", formatMoney(invoice.tax, companyProfile.currency)));
  lines.push(totalDivider);
  lines.push(...formatReceiptPair("TOTAL", formatMoney(invoice.total, companyProfile.currency)));
  lines.push(totalDivider);

  const footerLines = centerReceiptText(companyProfile.footerMessage);
  if (footerLines.length > 0) {
    lines.push("");
    lines.push(...footerLines);
  }

  return lines.join("\r\n");
}

function getPrintPreview(invoice, companyProfile) {
  const preview = buildThermalReceipt(invoice, companyProfile);

  return {
    ok: true,
    mode: "preview",
    printerName: companyProfile.printerName,
    preview,
    message: "Vista previa del ticket generada."
  };
}

function execPowerShell(script, extraEnv = {}, timeoutMs = 15000) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");

  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
      {
        timeout: timeoutMs,
        windowsHide: true,
        env: { ...process.env, ...extraEnv }
      },
      (error, stdout, stderr) => {
        if (error) {
          const timedOut =
            error.killed ||
            error.signal === "SIGTERM" ||
            error.code === "ETIMEDOUT";

          reject(
            new Error(
              stderr?.trim() ||
                stdout?.trim() ||
                (timedOut
                  ? "La impresion tardo demasiado en completarse. Intenta de nuevo."
                  : error.message) ||
                "PowerShell no pudo completar la impresion."
            )
          );
          return;
        }

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim()
        });
      }
    );
  });
}

async function sendReceiptToPrinter(receiptText, printerName, logoFilePath) {
  const receiptPath = path.join(os.tmpdir(), `lamontanita-${Date.now()}.txt`);
  fs.writeFileSync(receiptPath, receiptText, "utf8");

  try {
    const printerNameBase64 = Buffer.from(printerName, "utf8").toString("base64");
    const script = [
      "$ProgressPreference = 'SilentlyContinue'",
      "$ErrorActionPreference = 'Stop'",
      "$preferred = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($env:PRINTER_NAME_B64))",
      "$file = $env:RECEIPT_FILE",
      "$logoFile = if ($env:LOGO_FILE) { $env:LOGO_FILE } else { $null }",
      "function Normalize-PrinterValue([string]$value) {",
      "  if (-not $value) { return '' }",
      "  $normalized = $value.Normalize([Text.NormalizationForm]::FormD)",
      "  $builder = New-Object System.Text.StringBuilder",
      "  foreach ($char in $normalized.ToCharArray()) {",
      "    if ([Globalization.CharUnicodeInfo]::GetUnicodeCategory($char) -ne [Globalization.UnicodeCategory]::NonSpacingMark) {",
      "      [void]$builder.Append($char)",
      "    }",
      "  }",
      "  return (($builder.ToString().ToLowerInvariant() -replace '[^a-z0-9]+', ' ').Trim())",
      "}",
      "function Test-VirtualPrinter($printer) {",
      "  $combined = Normalize-PrinterValue \"$($printer.Name) $($printer.DriverName) $($printer.PortName)\"",
      "  foreach ($pattern in @('onenote', 'pdf', 'xps', 'fax', 'send to microsoft', 'microsoft print')) {",
      "    if ($combined -like \"*$pattern*\") { return $true }",
      "  }",
      "  return $false",
      "}",
      "function Get-PrinterScore($printer, [string]$preferredNormalized) {",
      "  if (-not $printer) { return -1000 }",
      "  if (Test-VirtualPrinter $printer) { return -1000 }",
      "  $name = Normalize-PrinterValue $printer.Name",
      "  $driver = Normalize-PrinterValue $printer.DriverName",
      "  $port = Normalize-PrinterValue $printer.PortName",
      "  $combined = \"$name $driver $port\".Trim()",
      "  $score = 0",
      "  if ($preferredNormalized) {",
      "    if ($name -eq $preferredNormalized) {",
      "      $score += 1000",
      "    } elseif ($name -like \"*$preferredNormalized*\" -or $preferredNormalized -like \"*$name*\") {",
      "      $score += 800",
      "    } elseif ($driver -eq $preferredNormalized) {",
      "      $score += 700",
      "    } elseif ($driver -like \"*$preferredNormalized*\" -or $preferredNormalized -like \"*$driver*\") {",
      "      $score += 600",
      "    } else {",
      "      $tokenMatches = @($preferredNormalized -split ' ' | Where-Object { $_ -and $combined -like \"*$_*\" }).Count",
      "      if ($tokenMatches -gt 0) { $score += ($tokenMatches * 60) }",
      "    }",
      "  }",
      "  foreach ($pattern in @('xp 58', 'xp58', 'xp 80', 'xp80', 'xprinter', 'thermal', 'receipt', 'ticket', 'pos', 'esc pos')) {",
      "    if ($combined -like \"*$pattern*\") {",
      "      $score += 220",
      "      break",
      "    }",
      "  }",
      "  if ($port -match '^(usb|lpt|com)') { $score += 80 }",
      "  if (-not $printer.WorkOffline) { $score += 25 }",
      "  if ($printer.Default) { $score += 10 }",
      "  return $score",
      "}",
      "$preferredNormalized = Normalize-PrinterValue $preferred",
      "$printers = Get-CimInstance Win32_Printer | Select-Object Name,DriverName,Default,PortName,WorkOffline",
      "$rankedPrinters = $printers | ForEach-Object {",
      "  [PSCustomObject]@{",
      "    Printer = $_",
      "    Score = Get-PrinterScore $_ $preferredNormalized",
      "  }",
      "} | Sort-Object Score -Descending",
      "$selectedEntry = $rankedPrinters | Select-Object -First 1",
      "$selected = if ($selectedEntry -and $selectedEntry.Score -gt 0) { $selectedEntry.Printer } else { $null }",
      "$availablePrinters = (@($printers | ForEach-Object { $_.Name }) -join ', ')",
      "if (-not $selected) {",
      "  throw \"No se encontro una impresora termica valida. Disponibles: $availablePrinters. Actualiza el nombre de la impresora en el perfil de la empresa o revisa el driver en Windows.\"",
      "}",
      "Add-Type -AssemblyName System.Drawing",
      "$logo = if ($logoFile -and (Test-Path -LiteralPath $logoFile)) { [System.Drawing.Image]::FromFile($logoFile) } else { $null }",
      "$text = Get-Content -Path $file -Raw -Encoding UTF8",
      "$lines = $text -split \"`r?`n\"",
      `$contentX = ${THERMAL_SIDE_PADDING}`,
      `$contentWidth = ${THERMAL_PRINTABLE_WIDTH}`,
      `$paperWidth = ${THERMAL_PAPER_WIDTH}`,
      `$maxPageHeight = ${THERMAL_PAPER_HEIGHT}`,
      `$maxLogoWidth = ${THERMAL_LOGO_MAX_WIDTH}`,
      `$maxLogoHeight = ${THERMAL_LOGO_MAX_HEIGHT}`,
      `$font = New-Object System.Drawing.Font('Consolas', ${THERMAL_FONT_SIZE}, [System.Drawing.FontStyle]::Regular)`,
      "$measurementBitmap = New-Object System.Drawing.Bitmap 1, 1",
      "$measurementGraphics = [System.Drawing.Graphics]::FromImage($measurementBitmap)",
      "$measurementGraphics.PageUnit = [System.Drawing.GraphicsUnit]::Display",
      "$stringFormat = New-Object System.Drawing.StringFormat",
      "$stringFormat.Alignment = [System.Drawing.StringAlignment]::Near",
      "$stringFormat.LineAlignment = [System.Drawing.StringAlignment]::Near",
      "$stringFormat.Trimming = [System.Drawing.StringTrimming]::None",
      "$stringFormat.FormatFlags = [System.Drawing.StringFormatFlags]::LineLimit",
      "$baseLineHeight = [Math]::Ceiling($font.GetHeight($measurementGraphics))",
      "$logoWidth = 0",
      "$logoHeight = 0",
      "if ($logo) {",
      "  $logoScale = [Math]::Min([double]$maxLogoWidth / [double]$logo.Width, [double]$maxLogoHeight / [double]$logo.Height)",
      "  if ($logoScale -gt 1) { $logoScale = 1 }",
      "  $logoWidth = [int][Math]::Round($logo.Width * $logoScale)",
      "  $logoHeight = [int][Math]::Round($logo.Height * $logoScale)",
      "}",
      "$pageHeight = 8",
      "if ($logoHeight -gt 0) { $pageHeight += ($logoHeight + 8) }",
      "foreach ($line in $lines) {",
      "  if ([string]::IsNullOrWhiteSpace($line)) {",
      "    $lineHeight = [Math]::Max(6, [Math]::Floor($baseLineHeight * 0.5))",
      "  } else {",
      "    $measured = $measurementGraphics.MeasureString($line, $font, [System.Drawing.SizeF]::new([single]$contentWidth, 10000), $stringFormat)",
      "    $lineHeight = [Math]::Max([Math]::Ceiling($measured.Height), $baseLineHeight)",
      "  }",
      "  $pageHeight += ($lineHeight + 1)",
      "}",
      "$pageHeight += 8",
      "if ($pageHeight -lt 180) { $pageHeight = 180 }",
      "if ($pageHeight -gt $maxPageHeight) { $pageHeight = $maxPageHeight }",
      "$measurementGraphics.Dispose()",
      "$measurementBitmap.Dispose()",
      "$document = New-Object System.Drawing.Printing.PrintDocument",
      "$document.PrinterSettings.PrinterName = $selected.Name",
      "if (-not $document.PrinterSettings.IsValid) { throw \"La impresora seleccionada no es valida: $($selected.Name)\" }",
      `$document.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('Thermal80Receipt', ${THERMAL_PAPER_WIDTH}, $pageHeight)`,
      "$document.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)",
      "$document.OriginAtMargins = $false",
      "$document.PrintController = New-Object System.Drawing.Printing.StandardPrintController",
      "$brush = [System.Drawing.Brushes]::Black",
      "$lineIndex = 0",
      "$logoPrinted = $false",
      "$document.add_PrintPage({ param($sender, $e)",
      "  $e.Graphics.PageUnit = [System.Drawing.GraphicsUnit]::Display",
      "  $currentBaseLineHeight = [Math]::Ceiling($font.GetHeight($e.Graphics))",
      "  $y = 0",
      "  if (-not $logoPrinted -and $logo) {",
      "    $logoX = [int][Math]::Round($contentX + (($contentWidth - $logoWidth) / 2))",
      "    $e.Graphics.DrawImage($logo, $logoX, $y, $logoWidth, $logoHeight)",
      "    $y += ($logoHeight + 8)",
      "    $logoPrinted = $true",
      "  }",
      "  while ($lineIndex -lt $lines.Length) {",
      "    $line = [string]$lines[$lineIndex]",
      "    if ([string]::IsNullOrWhiteSpace($line)) {",
      "      $lineHeight = [Math]::Max(6, [Math]::Floor($currentBaseLineHeight * 0.5))",
      "    } else {",
      "      $measured = $e.Graphics.MeasureString($line, $font, [System.Drawing.SizeF]::new([single]$contentWidth, 10000), $stringFormat)",
      "      $lineHeight = [Math]::Max([Math]::Ceiling($measured.Height), $currentBaseLineHeight)",
      "    }",
      "    $rect = New-Object System.Drawing.RectangleF($contentX, $y, $contentWidth, $lineHeight)",
      "    $e.Graphics.DrawString($lines[$lineIndex], $font, $brush, $rect, $stringFormat)",
      "    $y += ($lineHeight + 1)",
      "    $lineIndex++",
      "  }",
      "  $e.HasMorePages = $false",
      "})",
      "$document.Print()",
      "$font.Dispose()",
      "if ($logo) { $logo.Dispose() }",
      "$document.Dispose()",
      "@{ printerName = $selected.Name; driverName = $selected.DriverName; portName = $selected.PortName; selectionScore = $selectedEntry.Score; availablePrinters = @($printers | ForEach-Object { $_.Name }) } | ConvertTo-Json -Compress"
    ].join("\n");

    const result = await execPowerShell(
      script,
      {
        PRINTER_NAME_B64: printerNameBase64,
        RECEIPT_FILE: receiptPath,
        ...(logoFilePath ? { LOGO_FILE: logoFilePath } : {})
      },
      30000
    );

    const printerInfo = result.stdout ? JSON.parse(result.stdout) : null;
    return {
      ...result,
      printerInfo
    };
  } finally {
    fs.unlink(receiptPath, () => {});
    if (logoFilePath) {
      fs.unlink(logoFilePath, () => {});
    }
  }
}

async function printInvoice(invoice, companyProfile) {
  const preview = buildThermalReceipt(invoice, companyProfile);

  try {
    const logoFilePath = createTemporaryLogoFile(companyProfile.logoUrl);
    writePrinterLog(
      `Preparing print for invoice ${invoice.id}. Requested printer: ${companyProfile.printerName}. Logo: ${logoFilePath ? "included" : "not found"}`
    );

    const result = await sendReceiptToPrinter(preview, companyProfile.printerName, logoFilePath);
    writePrinterLog(
      `Print command finished for invoice ${invoice.id}. stdout="${result.stdout}" stderr="${result.stderr}"`
    );

    const printerInfo = result.printerInfo || {
      printerName: companyProfile.printerName,
      driverName: companyProfile.printerName || "POS-80",
      portName: "USB001"
    };

    return {
      ok: true,
      mode: "system",
      printerName: printerInfo.printerName,
      preview,
      message: `Factura enviada a la impresora termica ${printerInfo.driverName} en ${printerInfo.portName}.`
    };
  } catch (error) {
    writePrinterLog(
      `Print failed for invoice ${invoice.id}: ${
        error instanceof Error ? error.stack || error.message : String(error)
      }`
    );
    throw error;
  }
}

module.exports = {
  buildThermalReceipt,
  getPrintPreview,
  printInvoice
};
