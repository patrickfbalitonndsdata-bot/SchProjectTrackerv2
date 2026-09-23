import { ParseResult, AttachmentInfo } from '../types';
import { formatToManila, parseEmailDateTimeToManila, extractDateFromText } from './dateUtils';
import { extractStudyFromProjectDetails, extractTargetedPdfSections, getDefaultJobTypeForVersion } from './roster';
import { capturePage1HeaderScreenshot } from './pdfScreenshot';

// Convert Uint8Array to base64 safely
export function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// Carve embedded PDF streams from a Uint8Array by matching %PDF- and %%EOF
export function carvePdfsFromUint8Array(bytes: Uint8Array): Uint8Array[] {
  const results: Uint8Array[] = [];
  const magic = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  const eof = [0x25, 0x25, 0x45, 0x4f, 0x46]; // %%EOF
  let searchPos = 0;
  const len = bytes.length;

  while (searchPos < len) {
    let startIdx = -1;
    for (let i = searchPos; i <= len - 5; i++) {
      if (
        bytes[i] === magic[0] &&
        bytes[i + 1] === magic[1] &&
        bytes[i + 2] === magic[2] &&
        bytes[i + 3] === magic[3] &&
        bytes[i + 4] === magic[4]
      ) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) break;

    let lastEof = -1;
    let scanPos = startIdx + 5;
    const maxScan = Math.min(len, startIdx + 50 * 1024 * 1024);

    while (scanPos < maxScan) {
      let eofIdx = -1;
      for (let i = scanPos; i <= maxScan - 5; i++) {
        if (
          bytes[i] === eof[0] &&
          bytes[i + 1] === eof[1] &&
          bytes[i + 2] === eof[2] &&
          bytes[i + 3] === eof[3] &&
          bytes[i + 4] === eof[4]
        ) {
          eofIdx = i;
          break;
        }
      }
      if (eofIdx === -1) break;

      // Check if another %PDF- appears before this %%EOF
      let nextPdf = -1;
      for (let i = scanPos; i < eofIdx; i++) {
        if (
          bytes[i] === magic[0] &&
          bytes[i + 1] === magic[1] &&
          bytes[i + 2] === magic[2] &&
          bytes[i + 3] === magic[3] &&
          bytes[i + 4] === magic[4]
        ) {
          nextPdf = i;
          break;
        }
      }
      if (nextPdf !== -1) {
        break;
      }

      lastEof = eofIdx + 5;
      scanPos = lastEof;
    }

    if (lastEof !== -1 && lastEof > startIdx + 50) {
      let endIdx = lastEof;
      while (
        endIdx < len &&
        (bytes[endIdx] === 0x0a || bytes[endIdx] === 0x0d || bytes[endIdx] === 0x00 || bytes[endIdx] === 0x20)
      ) {
        endIdx++;
      }
      const pdfBytes = bytes.subarray(startIdx, endIdx);
      if (pdfBytes.length > 100) {
        results.push(pdfBytes);
      }
      searchPos = endIdx;
    } else {
      searchPos = startIdx + 5;
    }
  }

  return results;
}

// Clean parsed field values
function cleanValue(val: string | null | undefined): string {
  if (!val) return '';
  return val
    .replace(/^["'`:;\s]+|["'`:;\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract Project Number (##-###### e.g., 26-770124 or project labels)
export function extractProjectNumber(text: string, subject: string = ''): string {
  const combined = `${subject}\n${text}`;

  // 1. Exact ##-###### format (e.g. "26-770124 | Mead, CO" -> "26-770124")
  const topBarMatch = combined.match(/\b(\d{2}-\d{6})\s*\|/);
  if (topBarMatch) return topBarMatch[1];

  const exactMatch = combined.match(/\b(\d{2}-\d{6})\b/);
  if (exactMatch) return exactMatch[1];

  // 2. Project ID label
  const prjMatch = combined.match(/(?:project(?:\s*(?:no\.?|#|number|code))?|prj)\s*[:=\-]?\s*([A-Za-z0-9\-_]{3,20})/i);
  if (prjMatch) return cleanValue(prjMatch[1]);

  // 3. Fallback loose match (2 digits - 5 to 7 digits)
  const loose = combined.match(/\b(\d{2}-\d{5,7})\b/);
  if (loose) return loose[1];

  return '';
}

// Extract Study / Study Type strictly from PDF First Page content under PROJECT DETAILS
// File name is completely disregarded
export function extractStudy(text: string, page1Text: string = ''): string {
  return extractStudyFromProjectDetails(text, page1Text);
}

// Client-side text stream / plain text extractor from PDF binary (Page 1 focused)
function extractTextFromPdfBuffer(buffer: ArrayBuffer): string {
  try {
    const maxScanBytes = Math.min(buffer.byteLength, 2 * 1024 * 1024);
    const bytes = new Uint8Array(buffer, 0, maxScanBytes);
    const decoder = new TextDecoder('latin1');
    const fullText = decoder.decode(bytes);

    // Extract text in PDF text operators
    const textSnippets: string[] = [];
    const textMatches = fullText.match(/\(([^()]{1,250})\)\s*T[jJ]/g);
    if (textMatches) {
      for (const m of textMatches) {
        const inner = m.match(/\(([^()]+)\)/);
        if (inner && inner[1]) {
          textSnippets.push(inner[1]);
        }
      }
    }

    // Also look for TJ arrays e.g. [(26)-(770124)] TJ
    const arrayMatches = fullText.match(/\[([^\[\]]{1,400})\]\s*TJ/gi);
    if (arrayMatches) {
      for (const am of arrayMatches) {
        const parts = am.match(/\(([^()]+)\)/g);
        if (parts) {
          textSnippets.push(parts.map((p) => p.slice(1, -1)).join(''));
        }
      }
    }

    const str = textSnippets.join(' ').trim();
    if (str.length > 10) {
      return str;
    }
    return '';
  } catch {
    return '';
  }
}

// Extract string text from binary MSG buffer using standard browser TextDecoders
function extractStringsFromMsgBuffer(buffer: ArrayBuffer): string {
  try {
    const bytes = new Uint8Array(buffer);
    const utf16Decoder = new TextDecoder('utf-16le', { fatal: false });
    const utf8Decoder = new TextDecoder('utf-8', { fatal: false });

    // Decode both utf-16le (standard for Outlook CFB stream properties) and utf-8
    const utf16Str = utf16Decoder.decode(bytes);
    const utf8Str = utf8Decoder.decode(bytes);

    // Filter out non-printable garbage
    const cleanUtf16 = utf16Str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');
    const cleanUtf8 = utf8Str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, ' ');

    return `${cleanUtf16}\n${cleanUtf8}`;
  } catch {
    return '';
  }
}

/**
 * Pure client-side fallback parser for .eml, .msg, and .pdf files.
 * Uses 100% native Web APIs without Node.js polyfill dependencies.
 */
function extractAllProjects(text: string, subject: string, fileName: string, defaultStudy: string, defaultVersion: string) {
  // If parsing a single file (like an email or PDF), return exactly one project entry
  const projectNumber = extractProjectNumber(text, `${subject} ${fileName}`);
  return [
    {
      id: 'proj-1',
      projectNumber,
      study: defaultStudy,
      version: defaultVersion,
      jobType: getDefaultJobTypeForVersion(defaultVersion),
      sourceFile: fileName,
    },
  ];
}

export async function parseFileClientSide(file: File): Promise<ParseResult> {
  const fileName = file.name;
  const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
  const now = new Date();
  const defaultMnl = formatToManila(now);

  if (ext === '.eml') {
    const text = await file.text();
    const subjectMatch = text.match(/^Subject:\s*(.+)$/im);
    const fromMatch = text.match(/^From:\s*(.+)$/im);
    const toMatch = text.match(/^To:\s*(.+)$/im);

    const subject = subjectMatch ? cleanValue(subjectMatch[1]) : fileName;
    const from = fromMatch ? cleanValue(fromMatch[1]) : '';
    const to = toMatch ? cleanValue(toMatch[1]) : '';

    // Extract date from headers or body
    const extractedDate = extractDateFromText(text);
    const headerDateMatch = text.match(/^Date:\s*(.+)$/im);
    const dateRaw = extractedDate ? extractedDate.raw : (headerDateMatch ? headerDateMatch[1].trim() : '');

    const mnlTimes = parseEmailDateTimeToManila(dateRaw);
    const emailOnly = from.match(/<([^>]+)>/) ? from.match(/<([^>]+)>/)![1] : (from.includes('@') ? from : '');

    const projectNumber = extractProjectNumber(text, subject);
    // Study is extracted from the First Page of the attached PDF file, not email text or filename
    const study = '';

    // Version
    const verMatch = `${subject}\n${text}`.match(/(?:version|ver\.?|rev\.?|v)\s*[:=\-]?\s*([vV]?[0-9]+(?:\.[0-9]+)*[A-Za-z]?)/i);
    let version = verMatch ? cleanValue(verMatch[1]) : 'Initial';
    if (version.toLowerCase() === 'initial') version = 'Initial';

    // Region
    const regMatch = `${subject}\n${text}`.match(/(?:region|territory|market)\s*[:=\-]?\s*([A-Za-z0-9\-_ ]{2,15})/i);
    const region = regMatch ? cleanValue(regMatch[1]) : '';

    // Reason & Category
    const catMatch = `${subject}\n${text}`.match(/(?:category|type)\s*[:=\-]?\s*([A-Za-z0-9\-_ .]{3,40})/i);
    const category = catMatch ? cleanValue(catMatch[1]) : 'Initial';

    const reasonMatch = `${subject}\n${text}`.match(/(?:reason|sub-?category|description|purpose)\s*[:=\-]?\s*([^\r\n,;]+)/i);
    let reason = reasonMatch ? cleanValue(reasonMatch[1]) : '';
    if (category.toLowerCase() === 'initial' && !reason) {
      reason = 'Initial';
    }

    // Carve any embedded PDFs from the EML text / buffer
    const arrayBuffer = await file.arrayBuffer();
    const carvedPdfs = carvePdfsFromUint8Array(new Uint8Array(arrayBuffer));
    const emlAttachments: AttachmentInfo[] = [];

    for (let idx = 0; idx < carvedPdfs.length; idx++) {
      const pdfBytes = carvedPdfs[idx];
      const pdfBuf = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);
      const b64 = uint8ArrayToBase64(pdfBytes);

      let shotUrl = '';
      let page1Text = '';
      let croppedText = '';
      try {
        const shot = await capturePage1HeaderScreenshot(pdfBuf, {
          cropHeightRatio: 0.46,
          cropWidthRatio: 0.62,
          cropXRatio: 0.0,
          cropYRatio: 0.0,
        });
        shotUrl = shot.screenshotDataUrl;
        page1Text = shot.page1Text;
        croppedText = shot.croppedText;
      } catch (shotErr) {
        console.warn('capturePage1HeaderScreenshot failed for EML PDF:', shotErr);
      }

      const readableText = croppedText && croppedText.length > 20 ? croppedText : page1Text;
      const targeted = extractTargetedPdfSections(readableText);
      const prj = targeted.projectNumber || extractProjectNumber(readableText, fileName);
      const studyType = targeted.study || '';

      emlAttachments.push({
        fileName: `attachment_${idx + 1}.pdf`,
        contentType: 'application/pdf',
        size: pdfBytes.byteLength,
        isPdf: true,
        base64Data: b64,
        screenshotDataUrl: shotUrl || undefined,
        extractedTextSnippet: targeted.targetedSnippet || readableText.substring(0, 1000).trim(),
        projectNumber: prj,
        study: studyType,
        region: targeted.region || region,
        cityState: targeted.cityState,
      });
    }

    const firstPdfWithPrj = emlAttachments.find((a) => a.projectNumber && /\b\d{2}-\d{6}\b/.test(a.projectNumber));
    const finalPrj = firstPdfWithPrj?.projectNumber || projectNumber;
    const firstPdfWithStudy = emlAttachments.find((a) => a.study);
    const finalStudyType = firstPdfWithStudy?.study || study;

    const compiledProjects = emlAttachments.length > 0
      ? emlAttachments.map((att, idx) => ({
          id: `proj-${idx + 1}`,
          projectNumber: att.projectNumber || finalPrj,
          study: att.study || finalStudyType,
          version,
          jobType: getDefaultJobTypeForVersion(version),
          sourceFile: att.fileName,
        }))
      : extractAllProjects(text, subject, fileName, finalStudyType, version);

    return {
      success: true,
      metadata: {
        fileName,
        subject,
        from,
        to,
        dateSentReceivedRaw: dateRaw || mnlTimes.rawIso,
        dateMnl: mnlTimes.dateStr,
        timeMnl: mnlTimes.timeStr,
        bodyTextPreview: text.substring(0, 800),
        attachments: emlAttachments,
      },
      extractedData: {
        emailAddress: emailOnly,
        scheduler: '', // Left blank for user's selection/input
        region: '', // Left blank; automatically filled when user picks Scheduler
        psuReceivedDate: mnlTimes.dateStr,
        psuReceivedTime: mnlTimes.timeStr,
        projectNumber: finalPrj,
        study: finalStudyType,
        jobType: getDefaultJobTypeForVersion(version),
        version,
        projects: compiledProjects,
        category: '', // Left blank for user's selection
        reason: '', // Left blank for user's selection/input
        remarks: '', // Left blank for user's input
      },
      aiConfidence: {
        overall: 'medium',
        notes: extractedDate ? 'Extracted via client-side email parser (email date detected)' : 'Extracted via client-side email parser',
      },
    };
  }

  if (ext === '.msg') {
    const arrayBuffer = await file.arrayBuffer();
    const extractedText = extractStringsFromMsgBuffer(arrayBuffer);
    const subjectMatch = extractedText.match(/(?:Subject|Title)\s*[:=\-]?\s*([^\r\n]{3,120})/i);
    const subject = subjectMatch ? cleanValue(subjectMatch[1]) : fileName;

    const fromMatch = extractedText.match(/(?:From|Sender)\s*[:=\-]?\s*([^\r\n]{3,80})/i);
    const from = fromMatch ? cleanValue(fromMatch[1]) : '';
    const emailMatch = extractedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const emailOnly = emailMatch ? emailMatch[0] : '';

    // Extract date from decoded MSG strings
    const extractedDate = extractDateFromText(extractedText);
    const dateRaw = extractedDate ? extractedDate.raw : '';
    const mnlTimes = parseEmailDateTimeToManila(dateRaw);

    const projectNumber = extractProjectNumber(extractedText, subject);
    const study = '';

    // Version
    const verMatch = `${subject}\n${extractedText}`.match(/(?:version|ver\.?|rev\.?|v)\s*[:=\-]?\s*([vV]?[0-9]+(?:\.[0-9]+)*[A-Za-z]?)/i);
    let version = verMatch ? cleanValue(verMatch[1]) : 'Initial';
    if (version.toLowerCase() === 'initial') version = 'Initial';

    // Region
    const regMatch = `${subject}\n${extractedText}`.match(/(?:region|territory|market)\s*[:=\-]?\s*([A-Za-z0-9\-_ ]{2,15})/i);
    const region = regMatch ? cleanValue(regMatch[1]) : '';

    // Carve any embedded PDF attachments from the MSG binary
    const carvedPdfs = carvePdfsFromUint8Array(new Uint8Array(arrayBuffer));
    const msgAttachments: AttachmentInfo[] = [];

    for (let idx = 0; idx < carvedPdfs.length; idx++) {
      const pdfBytes = carvedPdfs[idx];
      const pdfBuf = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength);
      const b64 = uint8ArrayToBase64(pdfBytes);

      let shotUrl = '';
      let page1Text = '';
      let croppedText = '';
      try {
        const shot = await capturePage1HeaderScreenshot(pdfBuf, {
          cropHeightRatio: 0.46,
          cropWidthRatio: 0.62,
          cropXRatio: 0.0,
          cropYRatio: 0.0,
        });
        shotUrl = shot.screenshotDataUrl;
        page1Text = shot.page1Text;
        croppedText = shot.croppedText;
      } catch (shotErr) {
        console.warn('capturePage1HeaderScreenshot failed for MSG PDF:', shotErr);
      }

      const readableText = croppedText && croppedText.length > 20 ? croppedText : page1Text;
      const targeted = extractTargetedPdfSections(readableText);
      const prj = targeted.projectNumber || extractProjectNumber(readableText, fileName);
      const studyType = targeted.study || '';

      msgAttachments.push({
        fileName: `attachment_${idx + 1}.pdf`,
        contentType: 'application/pdf',
        size: pdfBytes.byteLength,
        isPdf: true,
        base64Data: b64,
        screenshotDataUrl: shotUrl || undefined,
        extractedTextSnippet: targeted.targetedSnippet || readableText.substring(0, 1000).trim(),
        projectNumber: prj,
        study: studyType,
        region: targeted.region || region,
        cityState: targeted.cityState,
      });
    }

    const firstPdfWithPrj = msgAttachments.find((a) => a.projectNumber && /\b\d{2}-\d{6}\b/.test(a.projectNumber));
    const finalPrj = firstPdfWithPrj?.projectNumber || projectNumber;
    const firstPdfWithStudy = msgAttachments.find((a) => a.study);
    const finalStudyType = firstPdfWithStudy?.study || study;

    // Strict 1-to-1 Rule: Project count matches attached PDF count
    const compiledProjects = msgAttachments.length > 0
      ? msgAttachments.map((att, idx) => ({
          id: `proj-${idx + 1}`,
          projectNumber: att.projectNumber || finalPrj,
          study: att.study || finalStudyType,
          version,
          jobType: getDefaultJobTypeForVersion(version),
          sourceFile: att.fileName,
        }))
      : extractAllProjects(extractedText, subject, fileName, finalStudyType, version);

    return {
      success: true,
      metadata: {
        fileName,
        subject,
        from,
        to: '',
        dateSentReceivedRaw: dateRaw || mnlTimes.rawIso,
        dateMnl: mnlTimes.dateStr,
        timeMnl: mnlTimes.timeStr,
        bodyTextPreview: extractedText.substring(0, 800),
        attachments: msgAttachments,
      },
      extractedData: {
        emailAddress: '', // Not extracted from email file; manual input box
        scheduler: '', // Left blank for user's selection/input
        region: '', // Left blank; automatically filled when user picks Scheduler
        psuReceivedDate: mnlTimes.dateStr,
        psuReceivedTime: mnlTimes.timeStr,
        projectNumber: finalPrj,
        study: finalStudyType,
        jobType: getDefaultJobTypeForVersion(version),
        version,
        projects: compiledProjects,
        category: '',
        reason: '',
        remarks: '', // Left blank for user's input
      },
      aiConfidence: {
        overall: 'medium',
        notes: extractedDate ? 'Extracted via client-side message scanner (email date detected)' : 'Extracted via client-side message scanner',
      },
    };
  }

  if (ext === '.pdf') {
    const arrayBuffer = await file.arrayBuffer();
    const subject = fileName.replace(/\.pdf$/i, '');

    // Convert to base64 for interactive viewing
    let base64Data = '';
    try {
      base64Data = uint8ArrayToBase64(new Uint8Array(arrayBuffer));
    } catch {}

    // Capture screenshot of the Page 1 Project Header & PROJECT DETAILS crop (specifically targeting Project Number & Study Type)
    let screenshotDataUrl: string | undefined = undefined;
    let page1Text = '';
    let croppedText = '';
    try {
      const shot = await capturePage1HeaderScreenshot(arrayBuffer, {
        cropHeightRatio: 0.46,
        cropWidthRatio: 0.62,
        cropXRatio: 0.0,
        cropYRatio: 0.0,
      });
      screenshotDataUrl = shot.screenshotDataUrl;
      page1Text = shot.page1Text;
      croppedText = shot.croppedText;
    } catch (shotErr) {
      console.warn('capturePage1HeaderScreenshot failed in clientFileParser:', shotErr);
    }

    // Fast & Targeted extraction from the first lines and PROJECT DETAILS section
    const textToScan = (croppedText && croppedText.length > 20 ? croppedText : page1Text) || extractTextFromPdfBuffer(arrayBuffer);
    const targeted = extractTargetedPdfSections(textToScan);

    // Strictly extract from Content of the First Page of the PDF file.
    // File name is not important and is completely disregarded.
    const projectNumber = targeted.projectNumber || extractProjectNumber(textToScan, '');
    const study = targeted.study || extractStudy(textToScan, textToScan);
    const region = targeted.region || '';
    const projects = extractAllProjects(textToScan, '', fileName, study, 'Initial');

    return {
      success: true,
      metadata: {
        fileName,
        subject,
        from: '',
        to: '',
        dateSentReceivedRaw: now.toISOString(),
        dateMnl: defaultMnl.dateStr,
        timeMnl: defaultMnl.timeStr,
        bodyTextPreview: 'Direct PDF upload',
        attachments: [
          {
            fileName,
            contentType: 'application/pdf',
            size: file.size,
            isPdf: true,
            base64Data,
            screenshotDataUrl,
            extractedTextSnippet: targeted.targetedSnippet || textToScan
              .replace(/\s*--\s*\d+\s*(?:of|\/)\s*\d+\s*--\s*/gi, '')
              .substring(0, 1000)
              .trim(),
            projectNumber,
            study,
            region,
            cityState: targeted.cityState,
          },
        ],
      },
      extractedData: {
        emailAddress: '',
        scheduler: '',
        region,
        psuReceivedDate: defaultMnl.dateStr,
        psuReceivedTime: defaultMnl.timeStr,
        projectNumber,
        study,
        jobType: 'New Installs',
        version: 'Initial',
        projects,
        category: '',
        reason: '',
        remarks: '',
      },
      aiConfidence: {
        overall: 'high',
        notes: 'Extracted instantly from PDF Page 1 targeted sections',
      },
    };
  }

  throw new Error(`Unsupported file format (${ext}). Please upload an Outlook .msg file, .eml file, or .pdf attachment.`);
}

/**
 * Parses multiple files client-side.
 * If user selects both an email file (.msg/.eml) and one or more PDF attachments,
 * or multiple PDF attachments, this combines them and guarantees attachments are extracted.
 */
export async function parseFilesClientSide(files: File[]): Promise<ParseResult> {
  if (!files || files.length === 0) {
    throw new Error('No files provided');
  }
  if (files.length === 1) {
    return parseFileClientSide(files[0]);
  }

  // Find if an Outlook/email container (.msg or .eml) was uploaded
  const emailFile = files.find((f) => {
    const e = '.' + f.name.split('.').pop()?.toLowerCase();
    return e === '.msg' || e === '.eml' || e === '.txt';
  });

  const baseFile = emailFile || files[0];
  const baseResult = await parseFileClientSide(baseFile);

  const existingAttachments = baseResult.metadata?.attachments ? [...baseResult.metadata.attachments] : [];

  // Now process all other files (e.g. PDFs) as attachments
  for (const f of files) {
    if (f === baseFile) continue;
    const fExt = '.' + f.name.split('.').pop()?.toLowerCase();
    if (fExt === '.pdf') {
      const arrBuf = await f.arrayBuffer();
      const b64 = uint8ArrayToBase64(new Uint8Array(arrBuf));

      let shotUrl = '';
      let page1Text = '';
      let croppedText = '';
      try {
        const shot = await capturePage1HeaderScreenshot(arrBuf, {
          cropHeightRatio: 0.46,
          cropWidthRatio: 0.62,
          cropXRatio: 0.0,
          cropYRatio: 0.0,
        });
        shotUrl = shot.screenshotDataUrl;
        page1Text = shot.page1Text;
        croppedText = shot.croppedText;
      } catch (shotErr) {
        console.warn('capturePage1HeaderScreenshot failed for multi-file PDF:', shotErr);
      }

      const readableText = croppedText && croppedText.length > 20 ? croppedText : page1Text;
      const targeted = extractTargetedPdfSections(readableText);
      const prj = targeted.projectNumber || extractProjectNumber(readableText, f.name);
      const studyType = targeted.study || '';

      if (!existingAttachments.some((a) => a.fileName === f.name)) {
        existingAttachments.push({
          fileName: f.name,
          contentType: 'application/pdf',
          size: f.size,
          isPdf: true,
          base64Data: b64,
          screenshotDataUrl: shotUrl || undefined,
          extractedTextSnippet: targeted.targetedSnippet || readableText.substring(0, 1000).trim(),
          projectNumber: prj,
          study: studyType,
          region: targeted.region,
          cityState: targeted.cityState,
        });
      }
    }
  }

  baseResult.metadata.attachments = existingAttachments;

  // Strict 1-to-1 Rule: align projects with PDF attachments if any
  const pdfs = existingAttachments.filter((a) => a.isPdf);
  if (pdfs.length > 0) {
    baseResult.extractedData.projects = pdfs.map((pdf, idx) => ({
      id: `proj-${idx + 1}`,
      projectNumber: pdf.projectNumber || baseResult.extractedData.projectNumber || '',
      study: pdf.study || baseResult.extractedData.study || '',
      version: baseResult.extractedData.version || 'Initial',
      jobType: baseResult.extractedData.jobType || 'New Installs',
      sourceFile: pdf.fileName,
    }));
    if (pdfs[0].projectNumber) baseResult.extractedData.projectNumber = pdfs[0].projectNumber;
    if (pdfs[0].study) baseResult.extractedData.study = pdfs[0].study;
  }

  return baseResult;
}

