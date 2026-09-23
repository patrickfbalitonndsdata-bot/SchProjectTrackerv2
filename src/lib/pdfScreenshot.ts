import * as pdfjsLib from 'pdfjs-dist';

// Configure worker safely for Vite environment
try {
  if (typeof window !== 'undefined') {
    // In Vite browser build, point to the worker bundled or from CDN
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }
} catch {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export interface ScreenshotResult {
  screenshotDataUrl: string; // Base64 data URL (image/png) of the cropped top section
  page1Text: string;
  croppedText: string;
  width: number;
  height: number;
}

export interface ScreenshotCropOptions {
  cropHeightRatio?: number; // Fraction from top of Page 1 to capture (default: 0.46, covering PROJECT DETAILS)
  cropWidthRatio?: number;  // Fraction from left margin to capture (default: 0.62, focusing strictly on Project # & Study Type)
  cropXRatio?: number;      // Left offset fraction (default: 0.0)
  cropYRatio?: number;      // Top offset fraction (default: 0.0)
}

/**
 * Renders the targeted section of Page 1 of a PDF where the Project Number
 * and Study Type (under PROJECT DETAILS) are located, exactly matching
 * the user's reference photo.
 *
 * It captures the left column (header banner, Project Number, City/State,
 * contact info, and PROJECT DETAILS block) while cleanly excluding the
 * right-hand notes/maps column.
 *
 * @param pdfData Uint8Array, ArrayBuffer, or base64 string of the PDF
 * @param cropOptionsOrRatio Crop options object or height ratio number (default height: 0.46, width: 0.62)
 */
export async function capturePage1HeaderScreenshot(
  pdfData: Uint8Array | ArrayBuffer | string,
  cropOptionsOrRatio: number | ScreenshotCropOptions = {
    cropHeightRatio: 0.46,
    cropWidthRatio: 0.62,
    cropXRatio: 0.0,
    cropYRatio: 0.0,
  }
): Promise<ScreenshotResult> {
  const options: ScreenshotCropOptions = typeof cropOptionsOrRatio === 'number'
    ? { cropHeightRatio: cropOptionsOrRatio, cropWidthRatio: 0.62, cropXRatio: 0.0, cropYRatio: 0.0 }
    : {
        cropHeightRatio: cropOptionsOrRatio.cropHeightRatio ?? 0.46,
        cropWidthRatio: cropOptionsOrRatio.cropWidthRatio ?? 0.62,
        cropXRatio: cropOptionsOrRatio.cropXRatio ?? 0.0,
        cropYRatio: cropOptionsOrRatio.cropYRatio ?? 0.0,
      };

  const heightRatio = Math.min(Math.max(options.cropHeightRatio ?? 0.46, 0.25), 0.75);
  const widthRatio = Math.min(Math.max(options.cropWidthRatio ?? 0.62, 0.35), 1.0);
  const xRatio = Math.min(Math.max(options.cropXRatio ?? 0.0, 0.0), 0.5);
  const yRatio = Math.min(Math.max(options.cropYRatio ?? 0.0, 0.0), 0.5);

  let uint8Data: Uint8Array;

  if (typeof pdfData === 'string') {
    // Clean base64 string if data URL prefix exists
    const cleanBase64 = pdfData.replace(/^data:application\/pdf;base64,/, '').trim();
    const binary = atob(cleanBase64);
    const len = binary.length;
    uint8Data = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      uint8Data[i] = binary.charCodeAt(i);
    }
  } else if (pdfData instanceof ArrayBuffer) {
    uint8Data = new Uint8Array(pdfData);
  } else {
    uint8Data = pdfData;
  }

  // Load document with PDF.js
  const loadingTask = pdfjsLib.getDocument({
    data: uint8Data,
    cMapUrl: 'https://unpkg.com/pdfjs-dist/cmaps/',
    cMapPacked: true,
  });

  const pdfDoc = await loadingTask.promise;
  const page = await pdfDoc.getPage(1);

  // Render Page 1 at 2.0x scale for crisp, readable text and OCR quality
  const scale = 2.0;
  const viewport = page.getViewport({ scale });

  const fullWidth = viewport.width;
  const fullHeight = viewport.height;

  // Calculate targeted crop boundaries for Project Number & Study Type section
  const cropX = Math.round(fullWidth * xRatio);
  const cropY = Math.round(fullHeight * yRatio);
  const cropWidth = Math.round(fullWidth * widthRatio);
  const cropHeight = Math.round(fullHeight * heightRatio);

  // 1. Create full-page offscreen canvas
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = fullWidth;
  fullCanvas.height = fullHeight;
  const fullContext = fullCanvas.getContext('2d', { willReadFrequently: true });

  if (!fullContext) {
    throw new Error('Failed to obtain 2D canvas context for PDF rendering.');
  }

  // Set crisp white background
  fullContext.fillStyle = '#ffffff';
  fullContext.fillRect(0, 0, fullWidth, fullHeight);

  // Render Page 1
  const renderContext: any = {
    canvasContext: fullContext,
    canvas: fullCanvas,
    viewport,
  };
  await (page.render(renderContext) as any).promise;

  // 2. Create cropped canvas for the targeted Project Number & Study Type section
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropWidth;
  croppedCanvas.height = cropHeight;
  const cropContext = croppedCanvas.getContext('2d');

  if (!cropContext) {
    throw new Error('Failed to obtain 2D crop context.');
  }

  // Draw the targeted crop portion: strictly capturing Project Number & PROJECT DETAILS
  cropContext.fillStyle = '#ffffff';
  cropContext.fillRect(0, 0, cropWidth, cropHeight);
  cropContext.drawImage(
    fullCanvas,
    cropX, cropY, cropWidth, cropHeight,
    0, 0, cropWidth, cropHeight
  );

  const screenshotDataUrl = croppedCanvas.toDataURL('image/png');

  // 3. Extract text items specifically falling in the targeted crop section with proper visual line reconstruction
  let page1Text = '';
  let croppedText = '';
  try {
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{ str: string; transform: number[]; width?: number; height?: number }>;

    interface PositionedText {
      str: string;
      x: number;
      y: number;
    }

    const fullItems: PositionedText[] = [];
    const cropItems: PositionedText[] = [];

    // PDF coordinate system origin (0,0) is at bottom-left
    // In viewport coords, top is y = page.view[3], bottom is y = 0
    const pageBoxHeight = page.view ? page.view[3] : fullHeight / scale;
    const pageBoxWidth = page.view ? page.view[2] : fullWidth / scale;

    const cropBottomThreshold = pageBoxHeight * (1 - (yRatio + heightRatio));
    const cropTopThreshold = pageBoxHeight * (1 - yRatio);
    const cropLeftThreshold = pageBoxWidth * xRatio;
    const cropRightThreshold = pageBoxWidth * (xRatio + widthRatio);

    for (const item of items) {
      if (typeof item.str === 'string' && item.str.trim()) {
        const itemX = item.transform ? item.transform[4] : 0;
        const itemY = item.transform ? item.transform[5] : 0;
        const pos: PositionedText = {
          str: item.str.trim(),
          x: itemX,
          y: itemY,
        };

        fullItems.push(pos);

        if (
          itemY >= cropBottomThreshold &&
          itemY <= cropTopThreshold &&
          itemX >= cropLeftThreshold &&
          itemX <= cropRightThreshold
        ) {
          cropItems.push(pos);
        }
      }
    }

    // Helper: Reconstruct visual lines sorted from top (high Y) to bottom (low Y), and left (low X) to right (high X)
    const reconstructLines = (elements: PositionedText[], lineTolerance: number = 4.5): string => {
      if (elements.length === 0) return '';
      const sorted = [...elements].sort((a, b) => {
        if (Math.abs(b.y - a.y) > lineTolerance) {
          return b.y - a.y; // Higher Y coordinate comes earlier (higher on page)
        }
        return a.x - b.x; // Left to right
      });

      const lines: string[] = [];
      let curY = sorted[0].y;
      let curWords: string[] = [];

      for (const el of sorted) {
        if (Math.abs(el.y - curY) > lineTolerance) {
          if (curWords.length > 0) {
            lines.push(curWords.join(' '));
          }
          curY = el.y;
          curWords = [el.str];
        } else {
          curWords.push(el.str);
        }
      }
      if (curWords.length > 0) {
        lines.push(curWords.join(' '));
      }
      return lines.join('\n');
    };

    page1Text = reconstructLines(fullItems);
    croppedText = reconstructLines(cropItems);
  } catch (textErr) {
    console.warn('PDF.js getTextContent failed:', textErr);
  }

  return {
    screenshotDataUrl,
    page1Text,
    croppedText,
    width: cropWidth,
    height: cropHeight,
  };
}

/**
 * Direct PDF text extractor using client-side PDF.js.
 * Correctly decompress FlateDecode streams, font mappings, and reconstructs
 * human-readable line-by-line text without emitting raw PDF bytecode.
 */
export async function extractPdfTextWithPdfJs(
  pdfData: Uint8Array | ArrayBuffer | string
): Promise<{
  fullPage1Text: string;
  croppedText: string;
  screenshotDataUrl?: string;
}> {
  try {
    const result = await capturePage1HeaderScreenshot(pdfData, {
      cropHeightRatio: 0.46,
      cropWidthRatio: 0.62,
      cropXRatio: 0.0,
      cropYRatio: 0.0,
    });
    return {
      fullPage1Text: result.page1Text,
      croppedText: result.croppedText,
      screenshotDataUrl: result.screenshotDataUrl,
    };
  } catch (err) {
    console.warn('extractPdfTextWithPdfJs error:', err);
    return {
      fullPage1Text: '',
      croppedText: '',
    };
  }
}

/**
 * Creates a synthetic screenshot image matching the exact visual layout
 * of the user's reference photo (top banner with region, Project Number,
 * City/State, Firm info, and PROJECT DETAILS block with Study Type).
 */
export function generateSampleHeaderScreenshot(options?: {
  projectNumber?: string;
  cityState?: string;
  region?: string;
  firmName?: string;
  phone?: string;
  contactName?: string;
  email?: string;
  studyLine?: string;
  studySubLine?: string;
  dateRange?: string;
  locationsText?: string;
}): string {
  if (typeof document === 'undefined') return '';

  const {
    projectNumber = '26-460052',
    cityState = 'Jarrell, TX',
    region = 'Texas',
    firmName = 'Gilani Inc. PLLC',
    phone = '(210) 289-4739',
    contactName = 'Amer Gilani',
    email = 'amer_gilani@yahoo.com',
    studyLine = '3 (4hr) TMC (1 day)',
    studySubLine = 'w/ Heavy Trucks (FHWA 4+)',
    dateRange = '7:00-9:00, 16:00-18:00 | Tue/Wed/Thu | 07/14/26 - 07/16/26',
    locationsText = 'All Locations',
  } = options || {};

  // Dimensions matching the crop shown in the user's photo
  const width = 600;
  const height = 470;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Top Dark Banner (dark navy-slate like in reference photo)
  ctx.fillStyle = '#3c445c';
  ctx.fillRect(0, 0, width, 40);

  // Region label on top banner (as seen in photo with "Tex...")
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillText(region || 'Texas', width - 20, 20);

  // Reset text alignment for document body
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Project Number header: "26-460052 | Jarrell, TX"
  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
  ctx.fillText(projectNumber, 48, 96);

  // Bold vertical bar divider
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(256, 68, 3, 34);

  // City, State
  ctx.font = 'bold 34px system-ui, -apple-system, sans-serif';
  ctx.fillText(cityState, 276, 96);

  // Contact Info block
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillStyle = '#1e293b';

  const labelX = 100;
  const valX = 145;

  ctx.fillText('FIRM:', labelX, 142);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(firmName, valX, 142);

  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('PHONE:', labelX - 10, 160);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(phone, valX, 160);

  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('CONTACT:', labelX - 18, 178);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(contactName, valX, 178);

  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('EMAIL(TO):', labelX - 25, 196);
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText(email, valX, 196);

  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('EMAIL (CC):', labelX - 25, 214);

  ctx.fillText('EMAIL (BCC):', labelX - 32, 240);

  ctx.fillText('IPO:', labelX + 10, 258);

  // Horizontal separator line before PROJECT DETAILS
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(25, 286);
  ctx.lineTo(width - 25, 286);
  ctx.stroke();

  // PROJECT DETAILS header (underlined)
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText('PROJECT DETAILS', 28, 312);

  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(28, 316);
  ctx.lineTo(135, 316);
  ctx.stroke();

  // Study line (e.g., "3 (4hr) TMC (1 day)")
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#0f172a';
  ctx.fillText(studyLine, 28, 344);

  // Study sub-line (e.g., "w/ Heavy Trucks (FHWA 4+)")
  ctx.fillText(studySubLine, 28, 370);

  // Hours, Days, Dates (e.g., "7:00-9:00, 16:00-18:00 | Tue/Wed/Thu | 07/14/26 - 07/16/26")
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(dateRange, 28, 396);

  // "All Locations"
  ctx.fillText(locationsText, 28, 420);

  return canvas.toDataURL('image/png');
}
