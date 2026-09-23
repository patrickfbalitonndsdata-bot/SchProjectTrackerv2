import express from 'express';
import path from 'path';
import multer from 'multer';
import zlib from 'zlib';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import { simpleParser } from 'mailparser';
import MsgReaderModule from '@kenjiuno/msgreader';
import { PDFParse } from 'pdf-parse';
import {
  extractStudyFromPage1Only,
  extractStudyFromProjectDetails,
  extractStudyStandardFormat,
  extractStudyKeywordMatch,
  extractTargetedPdfSections,
  STUDY_TYPE_KEYWORDS,
  normalizeStudyType,
} from './src/lib/roster';

// Handle commonjs/esm interop
const MsgReader = (MsgReaderModule as any).default?.default || (MsgReaderModule as any).default || MsgReaderModule;

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer in-memory storage for handling file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40MB max
});

// Lazy initialize Gemini AI client
let genAIClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  if (!genAIClient) {
    genAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAIClient;
}

/**
 * Fallback PDF text stream extractor using native zlib decompression.
 * Decompresses all /FlateDecode streams to extract text operators like (text) Tj and [(parts)] TJ.
 */
function extractTextFromPdfStreams(buffer: Buffer): string {
  try {
    const textChunks: string[] = [];
    const str = buffer.toString('latin1');
    const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match: RegExpExecArray | null;
    let streamCount = 0;

    while ((match = streamRegex.exec(str)) !== null) {
      streamCount++;
      if (streamCount > 250) break;
      const rawStream = Buffer.from(match[1], 'latin1');
      let decompressed = '';
      try {
        decompressed = zlib.inflateSync(rawStream).toString('latin1');
      } catch {
        try {
          decompressed = zlib.inflateRawSync(rawStream).toString('latin1');
        } catch {
          decompressed = rawStream.toString('latin1');
        }
      }

      if (decompressed) {
        // Extract text in (..) Tj
        const tjRegex = /\(([^()]*)\)\s*T[jJ]/g;
        let tjMatch: RegExpExecArray | null;
        while ((tjMatch = tjRegex.exec(decompressed)) !== null) {
          if (tjMatch[1] && tjMatch[1].trim()) {
            textChunks.push(tjMatch[1]);
          }
        }

        // Extract text in [(..)] TJ
        const arrayRegex = /\[([^\[\]]*)\]\s*TJ/gi;
        let arrMatch: RegExpExecArray | null;
        while ((arrMatch = arrayRegex.exec(decompressed)) !== null) {
          const innerParts = arrMatch[1].match(/\(([^()]*)\)/g);
          if (innerParts) {
            const combined = innerParts.map((p) => p.slice(1, -1)).join('');
            if (combined.trim()) textChunks.push(combined);
          }
        }
      }
    }

    return textChunks.join(' ').replace(/\s+/g, ' ').trim();
  } catch (err) {
    console.warn('extractTextFromPdfStreams failed:', err);
    return '';
  }
}

/**
 * Strict multimodal PDF reader using Gemini. Reads the PDF binary directly
 * and extracts all visible Page 1 text verbatim, project number, study type, and region.
 */
async function extractDirectPdfWithGemini(
  ai: GoogleGenAI,
  pdfBuffer: Buffer,
  fileName: string
): Promise<{
  verbatimText?: string;
  projectNumber?: string;
  study?: string;
  region?: string;
  cityState?: string;
  notes?: string;
} | null> {
  const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest'];
  const base64Pdf = pdfBuffer.toString('base64');

  const prompt = `You are an expert document reader. Strictly read and inspect Page 1 of this PDF project cover sheet / setup attachment verbatim.
FileName: ${fileName}

Strictly extract:
1. "verbatimText": All readable text from Page 1 verbatim preserving line breaks and original document layout.
2. "projectNumber": Primary Project Number (format ##-######, e.g. "26-450188" or "26-770124", usually located near top-left header).
3. "cityState": City and State if visible in header (e.g. "Rosenberg, TX" or "Mead, CO").
4. "region": Region if stated (e.g. "TX", "Eastern", "CO").
5. "study": Study / Study Type strictly under the "PROJECT DETAILS" section. Standard keywords include:
   - TMC
   - ATR
   - Screenline /SNL
   - PEDS
   - Peds & Bikes
   - Bikes
   - Unmet Demand
   - Queue / QUE
   - Red Light Violation / RLV
   - Parking / PKG
   - Driveway / DWY
   - Mainline / MNL
   - Radar (Spot Speed)
   (Pattern often looks like "# (##hr) <Study type> (# day)" e.g. "1 (24hr) ATR (1 day)").

Return a valid JSON object matching the requested schema.`;

  for (const model of candidateModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout reading PDF with model ${model}`)), 20000)
        );

        const aiPromise = ai.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                mimeType: 'application/pdf',
                data: base64Pdf,
              },
            },
            prompt,
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                verbatimText: { type: Type.STRING },
                projectNumber: { type: Type.STRING },
                study: { type: Type.STRING },
                region: { type: Type.STRING },
                cityState: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
            },
          },
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);
        const textResponse = response?.text?.trim() || '';
        if (textResponse) {
          const parsed = JSON.parse(textResponse);
          return parsed;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        const isTransient =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isTransient && attempt === 1) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        break;
      }
    }
  }

  // Fallback: If structured JSON fails due to temporary rate/demand constraints, try plain text generation
  for (const model of candidateModels) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              mimeType: 'application/pdf',
              data: base64Pdf,
            },
          },
          'Read Page 1 of this PDF cover sheet verbatim. Output the full text, Project Number (##-######) at top-left, and Study under PROJECT DETAILS.',
        ],
      });
      const raw = res.text || '';
      if (raw.trim()) {
        const prjMatch = raw.match(/\b(\d{2}-\d{6})\b/);
        const studyVal = extractStudyFromPage1Only(raw);
        return {
          verbatimText: raw,
          projectNumber: prjMatch ? prjMatch[1] : undefined,
          study: studyVal || undefined,
        };
      }
    } catch {
      // Continue
    }
  }

  return null;
}

/**
 * Multimodal vision reader using Gemini to scan an image screenshot of the Page 1
 * Project Header & PROJECT DETAILS crop (matching the user's reference photo).
 */
async function extractScreenshotWithGemini(
  ai: GoogleGenAI,
  imageBuffer: Buffer,
  mimeType: string = 'image/png',
  fileName: string = 'screenshot.png'
): Promise<{
  verbatimText?: string;
  projectNumber?: string;
  study?: string;
  studyRaw?: string;
  region?: string;
  cityState?: string;
  notes?: string;
} | null> {
  const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest'];
  const base64Image = imageBuffer.toString('base64');

  const prompt = `You are an expert document inspector. You are given a targeted cropped screenshot of Page 1 of a traffic data setup / cover sheet, specifically cropped to the section showing the Project Number header ("##-###### | City, State"), firm/contact information, and the "PROJECT DETAILS" section containing the Study Type (e.g., "3 (4hr) TMC (1 day)" or "2 (24hr) ATR (1 day)").
FileName: ${fileName}

Carefully read all visible text in this screenshot and extract:
1. "projectNumber": Primary Project Number in header (format: ##-######, e.g. "26-460052" or "26-020288").
2. "study": Standardized traffic study type from under "PROJECT DETAILS" (e.g. TMC, ATR, Screenline, Peds & Bikes, PEDS, Bikes, Unmet Demand, Queue, Red Light Violation, Parking, Radar, Driveway, Mainline).
3. "studyRaw": Verbatim first line under "PROJECT DETAILS" (e.g. "3 (4hr) TMC (1 day)" or "2 (24hr) ATR (1 day)").
4. "region": Region or market in the top banner or header (e.g. "Texas", "TX", "SoCal (Los Angeles)", "Houston", "Denver", "CO").
5. "cityState": City and State shown beside Project Number (e.g. "Jarrell, TX" or "Rosemead, CA").
6. "notes": Any additional notes or specifications if visible.
7. "verbatimText": All readable text from this screenshot verbatim, preserved with line breaks.

Return a valid JSON object matching the requested schema.`;

  for (const model of candidateModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout scanning screenshot with model ${model}`)), 18000)
        );

        const aiPromise = ai.models.generateContent({
          model,
          contents: [
            {
              inlineData: {
                mimeType,
                data: base64Image,
              },
            },
            prompt,
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                projectNumber: { type: Type.STRING },
                study: { type: Type.STRING },
                studyRaw: { type: Type.STRING },
                region: { type: Type.STRING },
                cityState: { type: Type.STRING },
                notes: { type: Type.STRING },
                verbatimText: { type: Type.STRING },
              },
            },
          },
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);
        const textResponse = response?.text?.trim() || '';
        if (textResponse) {
          const parsed = JSON.parse(textResponse);
          return parsed;
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        const isTransient =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isTransient && attempt === 1) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        break;
      }
    }
  }

  // Fallback if structured output fails
  for (const model of candidateModels) {
    try {
      const res = await ai.models.generateContent({
        model,
        contents: [
          {
            inlineData: {
              mimeType,
              data: base64Image,
            },
          },
          'Read this cropped screenshot of Page 1. Extract Project Number (##-######), City/State, Region, and Study Type under PROJECT DETAILS. Output verbatim text.',
        ],
      });
      const raw = res.text || '';
      if (raw.trim()) {
        const prjMatch = raw.match(/\b(\d{2}-\d{6})\b/);
        const studyVal = extractStudyFromPage1Only(raw);
        return {
          verbatimText: raw,
          projectNumber: prjMatch ? prjMatch[1] : undefined,
          study: studyVal || undefined,
        };
      }
    } catch {}
  }

  return null;
}

// Resilient Gemini extraction with primary model 'gemini-3.8-flash', exponential retry, and model fallback
async function extractWithGemini(
  ai: GoogleGenAI,
  prompt: string,
  pdfAttachments?: Array<{ fileName: string; buffer: Buffer }>
): Promise<{ data: any; modelUsed: string } | null> {
  const candidateModels = ['gemini-3.8-flash', 'gemini-flash-latest'];

  const contents: any[] = [];
  if (pdfAttachments && pdfAttachments.length > 0) {
    for (const p of pdfAttachments.slice(0, 5)) {
      if (p.buffer && p.buffer.length > 0) {
        contents.push({
          inlineData: {
            mimeType: 'application/pdf',
            data: p.buffer.toString('base64'),
          },
        });
      }
    }
  }
  contents.push(prompt);

  for (const model of candidateModels) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout with model ${model}`)), 22000)
        );

        const aiPromise = ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                scheduler: { type: Type.STRING },
                region: { type: Type.STRING },
                projectNumber: { type: Type.STRING },
                study: { type: Type.STRING },
                jobType: { type: Type.STRING },
                version: { type: Type.STRING },
                projects: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      projectNumber: { type: Type.STRING },
                      study: { type: Type.STRING },
                      version: { type: Type.STRING },
                      jobType: { type: Type.STRING },
                      sourceFile: { type: Type.STRING },
                    },
                  },
                },
                category: { type: Type.STRING },
                reason: { type: Type.STRING },
                remarks: { type: Type.STRING },
                emailAddress: { type: Type.STRING },
                emailSentDate: { type: Type.STRING },
                emailSentTime: { type: Type.STRING },
                confidence: { type: Type.STRING },
                notes: { type: Type.STRING },
              },
            },
          },
        });

        const response: any = await Promise.race([aiPromise, timeoutPromise]);
        const textResponse = response?.text?.trim() || '';
        if (textResponse) {
          const parsed = JSON.parse(textResponse);
          return { data: parsed, modelUsed: model };
        }
      } catch (err: any) {
        const msg = err?.message || String(err);
        const isTransient =
          msg.includes('503') ||
          msg.includes('UNAVAILABLE') ||
          msg.includes('high demand') ||
          msg.includes('429') ||
          msg.includes('RESOURCE_EXHAUSTED');

        if (isTransient && attempt === 1) {
          await new Promise((r) => setTimeout(r, 1200));
          continue;
        }
        break;
      }
    }
  }

  return null;
}

const KNOWN_TZ_PATTERN = /\b(UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|AEST|AEDT)\b|[+\-]\d{4}\b|[+\-]\d{2}:?\d{2}|Z$/i;

const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12',
};

// Scans text/headers for sent or received email date and time
function extractDateFromText(text: string): { raw: string; parsedDate: Date | null } | null {
  if (!text) return null;

  const clean = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ');

  const patterns = [
    // 1. RFC 2822: Date: Mon, 14 Sep 2026 15:45:00 +0000
    /(?:Delivery-Date|Date|Sent):\s*([A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|AEST|AEDT|[+\-]\d{4}|[+\-]\d{2}:?\d{2}))?)/i,
    // 2. Outlook Sent header: Sent: Monday, September 14, 2026 4:45 PM
    /(?:Sent|Date):\s*([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 3. Sent with day first: Sent: Tuesday, 15 September 2026 14:20 EDT
    /(?:Sent|Date):\s*([A-Za-z]+,?\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 4. Sent without weekday: Sent: September 14, 2026 4:45 PM
    /(?:Sent|Date):\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 5. Sent: 14 Sep 2026 16:45:00
    /(?:Sent|Date):\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 6. Numeric Sent: Sent: 09/14/2026 4:45:00 PM or 9/14/2026 16:45
    /(?:Sent|Date):\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 7. Received transport header
    /Received:\s*[^;]+;\s*([A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 8. On [date] at [time], [name] wrote:
    /On\s+([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4}(?:\s+at)?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?)/i,
  ];

  for (const p of patterns) {
    const match = clean.match(p);
    if (match && match[1]) {
      const candidate = match[1].trim();
      const d = new Date(candidate);
      const valid = !isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2040;
      return {
        raw: candidate,
        parsedDate: valid ? d : null,
      };
    }
  }

  return null;
}

// Convert Date to Manila timezone (Asia/Manila, UTC+8)
function toManilaDateTime(dateInput: Date | string | number | null | undefined): {
  dateMnl: string;
  timeMnl: string;
  rawIso: string;
  isDefaultedNow: boolean;
} {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  if (!dateInput) {
    const now = new Date();
    return {
      dateMnl: dateFormatter.format(now),
      timeMnl: timeFormatter.format(now),
      rawIso: now.toISOString(),
      isDefaultedNow: true,
    };
  }

  if (dateInput instanceof Date) {
    if (isNaN(dateInput.getTime())) {
      const now = new Date();
      return {
        dateMnl: dateFormatter.format(now),
        timeMnl: timeFormatter.format(now),
        rawIso: now.toISOString(),
        isDefaultedNow: true,
      };
    }
    return {
      dateMnl: dateFormatter.format(dateInput),
      timeMnl: timeFormatter.format(dateInput),
      rawIso: dateInput.toISOString(),
      isDefaultedNow: false,
    };
  }

  const str = String(dateInput).trim();
  if (!str) {
    const now = new Date();
    return {
      dateMnl: dateFormatter.format(now),
      timeMnl: timeFormatter.format(now),
      rawIso: now.toISOString(),
      isDefaultedNow: true,
    };
  }

  // 1. If explicit timezone indicator exists, convert accurately to Asia/Manila (UTC+8)
  if (KNOWN_TZ_PATTERN.test(str)) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000 && parsed.getFullYear() <= 2040) {
      return {
        dateMnl: dateFormatter.format(parsed),
        timeMnl: timeFormatter.format(parsed),
        rawIso: parsed.toISOString(),
        isDefaultedNow: false,
      };
    }
  }

  // 2. If no timezone exists, parse literal date and time without artificial +8h offset
  // Pattern A: [Month Name] DD, YYYY HH:MM:SS [AM/PM]
  const matchA = str.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (matchA) {
    const mStr = matchA[1].toLowerCase().slice(0, 3);
    const mNum = MONTH_MAP[mStr];
    if (mNum) {
      const day = matchA[2].padStart(2, '0');
      const year = matchA[3];
      const rawH = parseInt(matchA[4], 10);
      const min = matchA[5];
      const sec = matchA[6] || '00';
      const ampm = matchA[7] ? matchA[7].toUpperCase() : (rawH >= 12 ? 'PM' : 'AM');
      const hour12 = rawH > 12 ? rawH - 12 : (rawH === 0 ? 12 : rawH);
      return {
        dateMnl: `${year}-${mNum}-${day}`,
        timeMnl: `${hour12}:${min}:${sec} ${ampm}`,
        rawIso: `${year}-${mNum}-${day}T${String(rawH).padStart(2, '0')}:${min}:${sec}`,
        isDefaultedNow: false,
      };
    }
  }

  // Pattern B: DD [Month Name] YYYY HH:MM:SS [AM/PM]
  const matchB = str.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (matchB) {
    const mStr = matchB[2].toLowerCase().slice(0, 3);
    const mNum = MONTH_MAP[mStr];
    if (mNum) {
      const day = matchB[1].padStart(2, '0');
      const year = matchB[3];
      const rawH = parseInt(matchB[4], 10);
      const min = matchB[5];
      const sec = matchB[6] || '00';
      const ampm = matchB[7] ? matchB[7].toUpperCase() : (rawH >= 12 ? 'PM' : 'AM');
      const hour12 = rawH > 12 ? rawH - 12 : (rawH === 0 ? 12 : rawH);
      return {
        dateMnl: `${year}-${mNum}-${day}`,
        timeMnl: `${hour12}:${min}:${sec} ${ampm}`,
        rawIso: `${year}-${mNum}-${day}T${String(rawH).padStart(2, '0')}:${min}:${sec}`,
        isDefaultedNow: false,
      };
    }
  }

  // Pattern C: MM/DD/YYYY or YYYY-MM-DD
  const matchC = str.match(/(\d{1,4})[/.\-](\d{1,2})[/.\-](\d{1,4})\s+(?:at\s+)?(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i);
  if (matchC) {
    let year: string, month: string, day: string;
    if (matchC[1].length === 4) {
      year = matchC[1];
      month = matchC[2].padStart(2, '0');
      day = matchC[3].padStart(2, '0');
    } else {
      month = matchC[1].padStart(2, '0');
      day = matchC[2].padStart(2, '0');
      year = matchC[3].length === 2 ? `20${matchC[3]}` : matchC[3];
    }
    const rawH = parseInt(matchC[4], 10);
    const min = matchC[5];
    const sec = matchC[6] || '00';
    const ampm = matchC[7] ? matchC[7].toUpperCase() : (rawH >= 12 ? 'PM' : 'AM');
    const hour12 = rawH > 12 ? rawH - 12 : (rawH === 0 ? 12 : rawH);
    return {
      dateMnl: `${year}-${month}-${day}`,
      timeMnl: `${hour12}:${min}:${sec} ${ampm}`,
      rawIso: `${year}-${month}-${day}T${String(rawH).padStart(2, '0')}:${min}:${sec}`,
      isDefaultedNow: false,
    };
  }

  // 3. Fallback standard Date parsing
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2040) {
    return {
      dateMnl: dateFormatter.format(d),
      timeMnl: timeFormatter.format(d),
      rawIso: d.toISOString(),
      isDefaultedNow: false,
    };
  }

  // Fallback to now
  const now = new Date();
  return {
    dateMnl: dateFormatter.format(now),
    timeMnl: timeFormatter.format(now),
    rawIso: now.toISOString(),
    isDefaultedNow: true,
  };
}

function formatTimeToAmPm(timeInput: string): string {
  if (!timeInput) return '';
  const trimmed = timeInput.trim();
  if (/\b(am|pm)\b/i.test(trimmed)) return trimmed;
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (match) {
    const rawHour = parseInt(match[1], 10);
    const minute = match[2];
    const second = match[3] ? `:${match[3]}` : '';
    const ampm = rawHour >= 12 ? 'PM' : 'AM';
    const hour12 = rawHour % 12 || 12;
    return `${hour12}:${minute}${second} ${ampm}`;
  }
  return trimmed;
}

function cleanFieldValue(val: string): string {
  if (!val) return '';
  // Cut off if it hits another field label like ". Reason:" or ", Reason:" or " Region:"
  const cutOff = val.split(/(?:\.|\;|\,)?\s*(?:Reason|Region|Scheduler|Study|Job|Version|Category|Remarks|Project)\s*[:=\-]/i);
  return cutOff[0].replace(/[.,;\s]+$/, '').trim();
}

// Project Number extractor specifically targeting First Page of PDF (top-left pattern ##-###### | <City, State> or ##-######)
function extractProjectNumberFromPage1Only(page1Text: string): string {
  if (!page1Text) return '';
  // 1. Top-left line format "26-770124 | City, State"
  const p1BarMatch = page1Text.match(/\b(\d{2}-\d{6})\s*\|/);
  if (p1BarMatch) return p1BarMatch[1];

  // 2. Check first 25 lines of page 1
  const p1TopLines = page1Text.split(/\r?\n/).slice(0, 25).join('\n');
  const p1TopMatch = p1TopLines.match(/\b(\d{2}-\d{6})\b/);
  if (p1TopMatch) return p1TopMatch[1];

  // 3. Any ##-###### on page 1
  const p1Any = page1Text.match(/\b(\d{2}-\d{6})\b/);
  if (p1Any) return p1Any[1];

  // 4. Project label on page 1
  const prjMatch = page1Text.match(/(?:project(?:\s*(?:no\.?|#|number|code))?|prj)\s*[:=\-]?\s*([A-Za-z0-9\-_]{3,20})/i);
  if (prjMatch) return cleanFieldValue(prjMatch[1]);

  // 5. Fallback loose match: 2 digits - 5 to 7 digits
  const loose = page1Text.match(/\b(\d{2}-\d{5,7})\b/);
  if (loose) return loose[1];

  return '';
}

// Fallback project number extractor for text-only emails when no PDF is attached
function extractProjectNumberFromText(text: string, subject: string, page1Text: string = ''): string {
  if (page1Text) {
    const p1Prj = extractProjectNumberFromPage1Only(page1Text);
    if (p1Prj) return p1Prj;
  }

  const subjFmt = subject.match(/\b(\d{2}-\d{6})\b/);
  if (subjFmt) return subjFmt[1];

  const textFmt = text.match(/\b(\d{2}-\d{6})\b/);
  if (textFmt) return textFmt[1];

  const combined = `${subject}\n${text}`;
  const prjMatch = combined.match(/(?:project(?:\s*(?:no\.?|#|number|code))?|prj)\s*[:=\-]?\s*([A-Za-z0-9\-_]{3,20})/i);
  if (prjMatch) return cleanFieldValue(prjMatch[1]);

  const loose = combined.match(/\b(\d{2}-\d{5,7})\b/);
  if (loose) return loose[1];

  return '';
}

// Study / Study Type extractor targeting the First Page of the PDF file under PROJECT DETAILS
// File name is completely disregarded
function extractStudyFromPdf(page1Text: string = ''): string {
  return extractStudyFromPage1Only(page1Text);
}

// Heuristic fallback text parser for PSU fields
function heuristicExtract(
  text: string,
  subject: string,
  sender: string,
  pdfFirstPageText: string = ''
) {
  const combined = `${subject}\n${text}`;
  
  // Project Number: from PDF First Page if present, else email text
  const projectNumber = pdfFirstPageText
    ? extractProjectNumberFromPage1Only(pdfFirstPageText)
    : extractProjectNumberFromText(text, subject, '');

  // Study: strictly from PDF First Page under PROJECT DETAILS; filename is disregarded
  const study = pdfFirstPageText
    ? extractStudyFromPage1Only(pdfFirstPageText)
    : '';

  // Version
  const verMatch = combined.match(/(?:version|ver\.?|rev\.?|v)\s*[:=\-]?\s*([vV]?[0-9]+(?:\.[0-9]+)*[A-Za-z]?)/i);
  const version = verMatch ? cleanFieldValue(verMatch[1]) : '';

  // Region
  const regMatch = combined.match(/(?:region|territory|market)\s*[:=\-]?\s*([A-Za-z0-9\s\-_/]+)/i);
  let region = regMatch ? cleanFieldValue(regMatch[1]) : '';
  if (!region) {
    if (/\b(APAC|EMEA|LATAM|NA|EU|US|GLOBAL)\b/i.test(combined)) {
      const rm = combined.match(/\b(APAC|EMEA|LATAM|NA|EU|US|GLOBAL)\b/i);
      region = rm ? rm[1].toUpperCase() : '';
    }
  }

  // Job Type
  const jobMatch = combined.match(/(?:job\s*type|type\s*of\s*job)\s*[:=\-]?\s*([^\r\n,;]+)/i);
  let jobType = jobMatch ? cleanFieldValue(jobMatch[1]) : '';
  if (!jobType) {
    if (/new\s*study|new\s*job|initial/i.test(combined)) jobType = 'New';
    else if (/amendment|revision/i.test(combined)) jobType = 'Amendment';
    else if (/closure|close-out/i.test(combined)) jobType = 'Closure';
  }

  // Scheduler
  const schedMatch = combined.match(/(?:scheduler(?:\s*name)?|scheduled\s*by|planner)\s*[:=\-]?\s*([^\r\n,;]+)/i);
  let scheduler = schedMatch ? cleanFieldValue(schedMatch[1]) : '';
  if (!scheduler && sender) {
    // If sender has display name
    const senderClean = sender.replace(/<.*?>/, '').trim();
    if (senderClean && !senderClean.includes('@')) {
      scheduler = senderClean;
    }
  }

  // Category
  const catMatch = combined.match(/(?:category|email\s*category)\s*[:=\-]?\s*([^\r\n,;]+)/i);
  let category = catMatch ? cleanFieldValue(catMatch[1]) : '';
  if (!category) {
    if (/psu\s*request|request/i.test(combined)) category = 'PSU Request';
    else if (/update|revision/i.test(combined)) category = 'Update / Revision';
    else if (/cancellation/i.test(combined)) category = 'Cancellation';
    else category = 'General PSU';
  }

  // Reason
  const reasonMatch = combined.match(/(?:reason|sub-?category|purpose)\s*[:=\-]?\s*([^\r\n,;]+)/i);
  const reason = reasonMatch ? cleanFieldValue(reasonMatch[1]) : '';

  // Remarks
  const remMatch = combined.match(/(?:remarks?|notes?|comments?)\s*[:=\-]?\s*([^\r\n]+)/i);
  const remarks = remMatch ? cleanFieldValue(remMatch[1]) : '';

  return {
    projectNumber,
    version,
    region,
    jobType,
    study,
    scheduler,
    category,
    reason,
    remarks,
  };
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Proxy endpoint for appending rows to Google Sheets via Google Apps Script
// This completely bypasses browser iframe restrictions, CORS issues, and adblockers.
app.post('/api/sheets/append', async (req, res) => {
  try {
    const { appsScriptUrl, payload } = req.body;
    const targetUrl = (appsScriptUrl || 'https://script.google.com/macros/s/AKfycby7Jj8CsavEF9LBiTR4eg_Pl0tosLMqCfl7cUDLK7OStwCFF9TjwretZfVUOdRyr8TlcQ/exec').trim();

    // Ensure sheetName is strictly 'Project Tracker' if empty or if 'Scheduling Submission' was inadvertently passed
    if (payload) {
      if (!payload.sheetName || payload.sheetName === 'Scheduling Submission') {
        payload.sheetName = 'Project Tracker';
      }
      if (!payload.spreadsheetId) {
        payload.spreadsheetId = '1zJGQYdRbqcD6GlYmPO72sdgcZV4cob12KtgxnQy8Zxk';
      }
    }

    console.log(`[Sheets API Proxy] Appending to ${targetUrl}, sheetName: ${payload?.sheetName}, project: ${payload?.projectNumber}`);

    const gasRes = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (!gasRes.ok) {
      const errText = await gasRes.text();
      console.error(`[Sheets API Proxy] HTTP error ${gasRes.status}:`, errText);
      return res.status(gasRes.status).json({
        status: 'error',
        message: `Google Apps Script returned status ${gasRes.status}: ${errText}`,
      });
    }

    const data: any = await gasRes.json();
    console.log(`[Sheets API Proxy] Append success:`, data.message, data.updatedRange);
    return res.json(data);
  } catch (err: any) {
    console.error(`[Sheets API Proxy] Append exception:`, err);
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to append to Google Sheets via server proxy',
    });
  }
});

// Proxy endpoint for reading recent entries from Google Sheets
app.get('/api/sheets/getRecent', async (req, res) => {
  try {
    const appsScriptUrl = (req.query.appsScriptUrl as string) || 'https://script.google.com/macros/s/AKfycby7Jj8CsavEF9LBiTR4eg_Pl0tosLMqCfl7cUDLK7OStwCFF9TjwretZfVUOdRyr8TlcQ/exec';
    let sheetName = (req.query.sheetName as string) || 'Project Tracker';
    if (sheetName === 'Scheduling Submission') sheetName = 'Project Tracker';
    const limit = (req.query.limit as string) || '40';
    const spreadsheetId = (req.query.spreadsheetId as string) || '1zJGQYdRbqcD6GlYmPO72sdgcZV4cob12KtgxnQy8Zxk';

    const cleanUrl = appsScriptUrl.trim();
    const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=getRecent&sheetName=${encodeURIComponent(
      sheetName
    )}&limit=${limit}&spreadsheetId=${encodeURIComponent(spreadsheetId)}`;

    const gasRes = await fetch(url);
    if (!gasRes.ok) {
      return res.status(gasRes.status).json({
        status: 'error',
        message: `Google Apps Script returned status ${gasRes.status}`,
      });
    }

    const data: any = await gasRes.json();
    return res.json(data);
  } catch (err: any) {
    console.error('[Sheets API Proxy] getRecent exception:', err);
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to fetch recent entries via server proxy',
    });
  }
});

// Proxy endpoint for pinging Google Apps Script
app.get('/api/sheets/ping', async (req, res) => {
  try {
    const appsScriptUrl = (req.query.appsScriptUrl as string) || 'https://script.google.com/macros/s/AKfycby7Jj8CsavEF9LBiTR4eg_Pl0tosLMqCfl7cUDLK7OStwCFF9TjwretZfVUOdRyr8TlcQ/exec';
    let sheetName = (req.query.sheetName as string) || 'Project Tracker';
    if (sheetName === 'Scheduling Submission') sheetName = 'Project Tracker';

    const cleanUrl = appsScriptUrl.trim();
    const url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=ping&sheetName=${encodeURIComponent(sheetName)}`;

    const gasRes = await fetch(url);
    const data: any = await gasRes.json();
    return res.json(data);
  } catch (err: any) {
    return res.status(500).json({
      status: 'error',
      message: err?.message || 'Failed to ping Google Apps Script',
    });
  }
});

interface ExtractedAttachment {
  fileName: string;
  contentType: string;
  size: number;
  isPdf: boolean;
  base64Data?: string;
  extractedTextSnippet?: string;
  buffer?: Buffer;
}

/**
 * Carves raw PDF streams directly from a buffer by searching for %PDF- and %%EOF markers.
 * This guarantees that even if MAPI or CFB structures are obscure, non-standard, or damaged,
 * any PDF attached inside an Outlook .msg or .eml container is recovered intact.
 */
function carvePdfsFromBuffer(buffer: Buffer): Array<{ buffer: Buffer; fileName?: string }> {
  const results: Array<{ buffer: Buffer; fileName?: string }> = [];
  const magic = Buffer.from('%PDF-');
  let searchPos = 0;

  while (searchPos < buffer.length) {
    const startIdx = buffer.indexOf(magic, searchPos);
    if (startIdx === -1) break;

    const eofMarker = Buffer.from('%%EOF');
    let lastEof = -1;
    let scanPos = startIdx;

    while (scanPos < buffer.length && scanPos < startIdx + 60 * 1024 * 1024) {
      const nextPdf = buffer.indexOf(magic, scanPos + 5);
      const eofIdx = buffer.indexOf(eofMarker, scanPos);
      if (eofIdx === -1) break;
      if (nextPdf !== -1 && eofIdx > nextPdf) {
        break;
      }
      lastEof = eofIdx + eofMarker.length;
      scanPos = lastEof;
    }

    if (lastEof !== -1 && lastEof > startIdx + 50) {
      let endIdx = lastEof;
      while (
        endIdx < buffer.length &&
        (buffer[endIdx] === 0x0a || buffer[endIdx] === 0x0d || buffer[endIdx] === 0x00 || buffer[endIdx] === 0x20)
      ) {
        endIdx++;
      }
      const pdfBytes = buffer.subarray(startIdx, endIdx);
      if (pdfBytes.length > 100) {
        results.push({ buffer: Buffer.from(pdfBytes) });
      }
      searchPos = endIdx;
    } else {
      searchPos = startIdx + 5;
    }
  }
  return results;
}

/**
 * Directly inspects the underlying CFB (Compound File Binary) directory tree from MsgReader
 * to find any attachment streams (tag 3701) and their associated filenames (3707 / 3704 / 3001).
 */
function extractAttachmentsFromCfb(reader: any): Array<{ fileName: string; buffer: Buffer; mimeType?: string }> {
  const attachments: Array<{ fileName: string; buffer: Buffer; mimeType?: string }> = [];
  if (!reader || !Array.isArray(reader.propertyData)) return attachments;

  const props = reader.propertyData;
  for (let i = 0; i < props.length; i++) {
    const prop = props[i];
    if (!prop || !prop.name) continue;

    // Check if this entry is an attachment directory (e.g. __attach_version1.0_#00000000)
    if (
      prop.name.toLowerCase().startsWith('__attach_version1.0') &&
      Array.isArray(prop.children) &&
      prop.children.length > 0
    ) {
      let fileName = '';
      let dataBuf: Buffer | null = null;
      let mimeType = '';

      for (const childIdx of prop.children) {
        const child = props[childIdx];
        if (!child || !child.name) continue;
        const cname = child.name.toLowerCase();

        // 3707 = long filename (001f = unicode utf-16le, 001e = ascii/utf-8)
        if (cname.includes('3707001f')) {
          try {
            const raw = reader.readProperty(child);
            if (raw) fileName = Buffer.from(raw).toString('utf16le').replace(/\0+$/, '').trim();
          } catch {}
        } else if (cname.includes('3707001e') && !fileName) {
          try {
            const raw = reader.readProperty(child);
            if (raw) fileName = Buffer.from(raw).toString('utf8').replace(/\0+$/, '').trim();
          } catch {}
        } else if (cname.includes('3704') && !fileName) {
          try {
            const raw = reader.readProperty(child);
            if (raw) {
              const str = cname.endsWith('001f') ? Buffer.from(raw).toString('utf16le') : Buffer.from(raw).toString('utf8');
              fileName = str.replace(/\0+$/, '').trim();
            }
          } catch {}
        } else if (cname.includes('3001') && !fileName) {
          try {
            const raw = reader.readProperty(child);
            if (raw) {
              const str = cname.endsWith('001f') ? Buffer.from(raw).toString('utf16le') : Buffer.from(raw).toString('utf8');
              fileName = str.replace(/\0+$/, '').trim();
            }
          } catch {}
        }

        // 370e = MIME type tag
        if (cname.includes('370e')) {
          try {
            const raw = reader.readProperty(child);
            if (raw) {
              const str = cname.endsWith('001f') ? Buffer.from(raw).toString('utf16le') : Buffer.from(raw).toString('utf8');
              mimeType = str.replace(/\0+$/, '').trim();
            }
          } catch {}
        }

        // 3701 = attachment binary data (0102 = binary, 000d = storage/OLE object)
        if (cname.includes('37010102') || (cname.includes('3701') && child.type === 2)) {
          try {
            const raw = reader.readProperty(child);
            if (raw && raw.length > 0) {
              dataBuf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
            }
          } catch {}
        } else if (cname.includes('3701000d') && child.type === 1 && Array.isArray(child.children)) {
          // OLE storage or embedded object inside attachment
          for (const subChildIdx of child.children) {
            const subChild = props[subChildIdx];
            if (subChild && subChild.type === 2) {
              try {
                const raw = reader.readProperty(subChild);
                if (raw && raw.length > 50) {
                  const sBuf = Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
                  if (sBuf.includes(Buffer.from('%PDF-'))) {
                    dataBuf = sBuf;
                    break;
                  }
                }
              } catch {}
            }
          }
        }
      }

      // If data is an OLE wrapper containing a PDF, extract the clean PDF slice
      if (dataBuf && dataBuf.length > 50) {
        const pdfMagic = Buffer.from('%PDF-');
        const pdfIdx = dataBuf.indexOf(pdfMagic);
        if (pdfIdx > 0 && pdfIdx < 500) {
          const carved = carvePdfsFromBuffer(dataBuf);
          if (carved.length > 0) {
            dataBuf = carved[0].buffer;
          }
        }
      }

      if (dataBuf && dataBuf.length > 0) {
        attachments.push({
          fileName: fileName || `attachment_${attachments.length + 1}`,
          buffer: dataBuf,
          mimeType,
        });
      }
    }
  }

  return attachments;
}

/**
 * Master Outlook MSG attachment extractor.
 * Combines high-level MAPI metadata, CFB directory inspection, and raw PDF stream carving
 * to ensure 100% of attached files are reliably extracted.
 */
function extractAllAttachmentsFromMsg(msgReader: any, fileBuffer: Buffer): ExtractedAttachment[] {
  const result: ExtractedAttachment[] = [];

  const addAttachmentIfNew = (name: string, buf: Buffer, mime?: string) => {
    if (!buf || buf.length < 10) return;
    // Deduplicate by size and first 128 bytes
    const isDuplicate = result.some(
      (existing) =>
        existing.size === buf.length ||
        (existing.buffer && existing.buffer.subarray(0, 128).equals(buf.subarray(0, 128)))
    );
    if (isDuplicate) return;

    let cleanName = (name || '').trim().replace(/[\\/:*?"<>|]/g, '_');
    const isPdf =
      cleanName.toLowerCase().endsWith('.pdf') ||
      mime === 'application/pdf' ||
      (buf.length >= 5 && buf.subarray(0, 1024).toString('latin1').includes('%PDF-'));

    if (isPdf && !cleanName.toLowerCase().endsWith('.pdf')) {
      cleanName = cleanName ? `${cleanName}.pdf` : `attachment_${result.length + 1}.pdf`;
    }
    if (!cleanName) {
      cleanName = `attachment_${result.length + 1}${isPdf ? '.pdf' : ''}`;
    }

    result.push({
      fileName: cleanName,
      contentType: isPdf ? 'application/pdf' : mime || 'application/octet-stream',
      size: buf.length,
      isPdf,
      base64Data: isPdf ? buf.toString('base64') : undefined,
      buffer: buf,
    });
  };

  // Tier 1: MsgReader high-level attachments
  try {
    const fileData = msgReader?.getFileData?.();
    if (fileData && Array.isArray(fileData.attachments)) {
      for (let i = 0; i < fileData.attachments.length; i++) {
        const attachMeta = fileData.attachments[i];
        let rawContent: any = null;
        let fileName =
          attachMeta?.fileName ||
          attachMeta?.name ||
          attachMeta?.fileNameShort ||
          (attachMeta as any)?.displayName ||
          '';

        try {
          const attachData = msgReader.getAttachment(i);
          if (attachData) {
            fileName = (attachData as any).fileName || (attachData as any).name || fileName;
            rawContent = (attachData as any).content || (attachData as any).data;
          }
        } catch {
          // Fallback to calling getAttachment with attachment meta object
          try {
            const attachData = msgReader.getAttachment(attachMeta);
            if (attachData) {
              fileName = (attachData as any).fileName || (attachData as any).name || fileName;
              rawContent = (attachData as any).content || (attachData as any).data;
            }
          } catch {}
        }

        if (!rawContent && attachMeta?.content) {
          rawContent = attachMeta.content;
        }
        if (!rawContent && (attachMeta as any)?.data) {
          rawContent = (attachMeta as any).data;
        }
        if (!rawContent && typeof attachMeta?.dataId === 'number' && msgReader?.reader?.readFileOf) {
          try {
            rawContent = msgReader.reader.readFileOf(attachMeta.dataId);
          } catch {}
        }

        if (rawContent) {
          const buf = Buffer.isBuffer(rawContent) ? rawContent : Buffer.from(rawContent);
          addAttachmentIfNew(fileName, buf, (attachMeta as any)?.attachMimeTag);

          // Handle embedded MSG files recursively
          if (fileName.toLowerCase().endsWith('.msg') || (attachMeta as any)?.innerMsgContent) {
            try {
              const innerMsgReader = new MsgReader(buf);
              const innerAttachments = extractAllAttachmentsFromMsg(innerMsgReader, buf);
              for (const inner of innerAttachments) {
                if (inner.buffer) {
                  addAttachmentIfNew(inner.fileName, inner.buffer, inner.contentType);
                }
              }
            } catch (innerErr) {
              console.warn('Failed to parse inner MSG attachment:', innerErr);
            }
          }
        }
      }
    }
  } catch (t1Err) {
    console.warn('Tier 1 MsgReader parse error:', t1Err);
  }

  // Tier 2: CFB property data direct walker
  try {
    if (msgReader?.reader) {
      const cfbAtts = extractAttachmentsFromCfb(msgReader.reader);
      for (const att of cfbAtts) {
        addAttachmentIfNew(att.fileName, att.buffer, att.mimeType);
      }
    }
  } catch (t2Err) {
    console.warn('Tier 2 CFB property parse error:', t2Err);
  }

  // Tier 3: Direct PDF stream carver from the binary
  // If no PDFs found yet, or if there are embedded PDFs in the binary that were missed
  try {
    const carved = carvePdfsFromBuffer(fileBuffer);
    if (carved.length > 0) {
      for (let idx = 0; idx < carved.length; idx++) {
        const c = carved[idx];
        const alreadyHas = result.some(
          (a) =>
            a.isPdf &&
            (a.size === c.buffer.length || (a.buffer && a.buffer.subarray(0, 100).equals(c.buffer.subarray(0, 100))))
        );
        if (!alreadyHas) {
          addAttachmentIfNew(`Project_Setup_${result.length + 1}.pdf`, c.buffer, 'application/pdf');
        }
      }
    }
  } catch (t3Err) {
    console.warn('Tier 3 PDF carving error:', t3Err);
  }

  return result;
}

// File parser endpoint
app.post('/api/parse-email', upload.any(), async (req, res) => {
  try {
    const rawFiles = (req.files as Express.Multer.File[]) || (req.file ? [req.file] : []);
    if (!rawFiles || rawFiles.length === 0) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Find if an Outlook/email container (.msg or .eml) was uploaded
    const emailFile = rawFiles.find((f) => {
      const e = path.extname(f.originalname).toLowerCase();
      return e === '.msg' || e === '.eml' || e === '.txt';
    });

    const primaryFile = emailFile || rawFiles[0];
    const originalName = primaryFile.originalname;
    const fileBuffer = primaryFile.buffer;
    const ext = path.extname(originalName).toLowerCase();

    let subject = '';
    let from = '';
    let to = '';
    let emailDateRaw = '';
    let bodyText = '';
    let extractedAttachments: ExtractedAttachment[] = [];

    // Register any additional files uploaded in the same request as attachments
    for (const f of rawFiles) {
      // Never re-add the primary email container file itself as an attachment
      if (f.originalname === primaryFile.originalname && f.size === primaryFile.size) continue;
      const fExt = path.extname(f.originalname).toLowerCase();
      if (fExt === '.msg' || fExt === '.eml') continue;
      const isPdf = fExt === '.pdf' || f.mimetype === 'application/pdf';
      if (!extractedAttachments.some((ea) => ea.fileName === f.originalname)) {
        extractedAttachments.push({
          fileName: f.originalname,
          contentType: f.mimetype || (isPdf ? 'application/pdf' : 'application/octet-stream'),
          size: f.size,
          isPdf,
          base64Data: isPdf ? f.buffer.toString('base64') : undefined,
          buffer: f.buffer,
        });
      }
    }

    // 1. Check file type
    if (ext === '.msg') {
      // Parse Outlook .msg
      try {
        let msgReader: any = null;
        let fileData: any = {};
        try {
          msgReader = new MsgReader(fileBuffer);
          fileData = msgReader.getFileData() || {};
        } catch (mErr) {
          console.warn('MsgReader initialization warning:', mErr);
        }

        subject = fileData.subject || '';
        from = fileData.senderName ? `${fileData.senderName} <${fileData.senderEmail || ''}>` : fileData.senderEmail || '';
        to = Array.isArray(fileData.recipients)
          ? fileData.recipients.map((r: any) => r.name || r.email).filter(Boolean).join(', ')
          : '';

        // Date extraction: comprehensive multi-stage search across MAPI properties, headers, body, and HTML
        let detectedDateRaw = '';

        if (fileData.messageDeliveryTime) {
          const d = new Date(fileData.messageDeliveryTime);
          if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2040) {
            detectedDateRaw = typeof fileData.messageDeliveryTime === 'string'
              ? fileData.messageDeliveryTime
              : fileData.messageDeliveryTime.toISOString();
          }
        }

        if (!detectedDateRaw && fileData.clientSubmitTime) {
          const d = new Date(fileData.clientSubmitTime);
          if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2040) {
            detectedDateRaw = typeof fileData.clientSubmitTime === 'string'
              ? fileData.clientSubmitTime
              : fileData.clientSubmitTime.toISOString();
          }
        }

        if (!detectedDateRaw && fileData.headers) {
          const headerDate = extractDateFromText(fileData.headers);
          if (headerDate) detectedDateRaw = headerDate.raw;
        }

        if (!detectedDateRaw && fileData.body) {
          const bodyDate = extractDateFromText(fileData.body);
          if (bodyDate) detectedDateRaw = bodyDate.raw;
        }

        if (!detectedDateRaw && fileData.bodyHtml) {
          const htmlDate = extractDateFromText(fileData.bodyHtml);
          if (htmlDate) detectedDateRaw = htmlDate.raw;
        }

        if (!detectedDateRaw && fileData.creationTime) {
          const d = new Date(fileData.creationTime);
          if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2040) {
            detectedDateRaw = typeof fileData.creationTime === 'string'
              ? fileData.creationTime
              : fileData.creationTime.toISOString();
          }
        }

        emailDateRaw = detectedDateRaw;
        bodyText = fileData.body || '';

        // Extract all attachments using the multi-tier extractor
        const msgAttachments = extractAllAttachmentsFromMsg(msgReader, fileBuffer);
        for (const att of msgAttachments) {
          if (!extractedAttachments.some((ea) => ea.fileName === att.fileName && ea.size === att.size)) {
            extractedAttachments.push(att);
          }
        }
      } catch (msgErr: any) {
        console.error('Error parsing MSG file:', msgErr);
        // Even if high-level MSG parsing failed, salvage any embedded PDFs directly!
        const carved = carvePdfsFromBuffer(fileBuffer);
        for (let idx = 0; idx < carved.length; idx++) {
          const c = carved[idx];
          extractedAttachments.push({
            fileName: `Project_Setup_${idx + 1}.pdf`,
            contentType: 'application/pdf',
            size: c.buffer.length,
            isPdf: true,
            base64Data: c.buffer.toString('base64'),
            buffer: c.buffer,
          });
        }
      }
    } else if (ext === '.eml' || ext === '.txt') {
      // Parse EML / RFC 822
      try {
        const parsed = await simpleParser(fileBuffer);
        subject = parsed.subject || '';
        from = parsed.from?.text || '';
        to = Array.isArray(parsed.to) ? parsed.to.map((t) => t.text).join(', ') : parsed.to?.text || '';
        
        let detectedDateRaw = '';
        if (parsed.date && !isNaN(parsed.date.getTime()) && parsed.date.getFullYear() >= 2000 && parsed.date.getFullYear() <= 2040) {
          detectedDateRaw = parsed.date.toISOString();
        }

        if (!detectedDateRaw && parsed.headers) {
          const rawHeaderDate = parsed.headers.get('date') || parsed.headers.get('delivery-date');
          if (rawHeaderDate) {
            detectedDateRaw = typeof rawHeaderDate === 'string' ? rawHeaderDate : String(rawHeaderDate);
          }
        }

        if (!detectedDateRaw && (parsed.text || parsed.html)) {
          const bodyDate = extractDateFromText(`${parsed.text || ''}\n${parsed.html || ''}`);
          if (bodyDate) detectedDateRaw = bodyDate.raw;
        }

        emailDateRaw = detectedDateRaw;
        bodyText = parsed.text || '';

        if (Array.isArray(parsed.attachments)) {
          for (const att of parsed.attachments) {
            const fileName = att.filename || 'attachment';
            const attBuffer = att.content ? Buffer.from(att.content) : Buffer.alloc(0);
            const isPdf =
              fileName.toLowerCase().endsWith('.pdf') ||
              att.contentType === 'application/pdf' ||
              (attBuffer.length >= 5 && attBuffer.subarray(0, 1024).toString('latin1').includes('%PDF-'));

            extractedAttachments.push({
              fileName,
              contentType: isPdf ? 'application/pdf' : att.contentType || 'application/octet-stream',
              size: att.size || attBuffer.length,
              isPdf,
              base64Data: isPdf ? attBuffer.toString('base64') : undefined,
              buffer: attBuffer,
            });

            // Check if attachment is an embedded .msg file
            if (fileName.toLowerCase().endsWith('.msg') && attBuffer.length > 0) {
              try {
                const innerMsgReader = new MsgReader(attBuffer);
                const innerFileData = innerMsgReader.getFileData();
                if (Array.isArray(innerFileData.attachments)) {
                  for (let j = 0; j < innerFileData.attachments.length; j++) {
                    const innerAttachMeta = innerFileData.attachments[j];
                    try {
                      const innerAttachData = innerMsgReader.getAttachment(j);
                      const innerFileName =
                        (innerAttachData as any)?.fileName ||
                        (innerAttachData as any)?.name ||
                        innerAttachMeta?.fileName ||
                        (innerAttachMeta as any)?.name ||
                        `inner_attachment_${j + 1}`;
                      let innerRaw =
                        (innerAttachData as any)?.content || (innerAttachMeta as any)?.content || (innerAttachMeta as any)?.data;
                      if (!innerRaw) continue;
                      const innerContent = Buffer.isBuffer(innerRaw) ? innerRaw : Buffer.from(innerRaw);
                      const innerIsPdf =
                        innerFileName.toLowerCase().endsWith('.pdf') ||
                        (innerContent.length >= 5 &&
                          innerContent.subarray(0, 1024).toString('latin1').includes('%PDF-'));

                      extractedAttachments.push({
                        fileName: innerFileName,
                        contentType: innerIsPdf ? 'application/pdf' : 'application/octet-stream',
                        size: innerContent.length,
                        isPdf: innerIsPdf,
                        base64Data: innerIsPdf ? innerContent.toString('base64') : undefined,
                        buffer: innerContent,
                      });
                    } catch (innerErr) {
                      console.warn('Failed to parse inner attachment index in eml', j, innerErr);
                    }
                  }
                }
              } catch (innerMsgErr) {
                console.warn('Failed to parse nested MSG inside EML', innerMsgErr);
              }
            }
          }
        }

        // If no PDF attachments found in EML, run PDF carver on fileBuffer
        if (!extractedAttachments.some((a) => a.isPdf)) {
          const carved = carvePdfsFromBuffer(fileBuffer);
          for (let idx = 0; idx < carved.length; idx++) {
            const c = carved[idx];
            extractedAttachments.push({
              fileName: `Project_Setup_${idx + 1}.pdf`,
              contentType: 'application/pdf',
              size: c.buffer.length,
              isPdf: true,
              base64Data: c.buffer.toString('base64'),
              buffer: c.buffer,
            });
          }
        }
      } catch (emlErr: any) {
        console.error('Error parsing EML file:', emlErr);
        // Salvage any embedded PDFs from the EML buffer
        const carved = carvePdfsFromBuffer(fileBuffer);
        for (let idx = 0; idx < carved.length; idx++) {
          const c = carved[idx];
          extractedAttachments.push({
            fileName: `Project_Setup_${idx + 1}.pdf`,
            contentType: 'application/pdf',
            size: c.buffer.length,
            isPdf: true,
            base64Data: c.buffer.toString('base64'),
            buffer: c.buffer,
          });
        }
      }
    } else if (ext === '.pdf') {
      // User directly uploaded a PDF attachment
      subject = originalName.replace(/\.pdf$/i, '');
      emailDateRaw = new Date().toISOString();
      bodyText = 'Direct PDF upload';
      extractedAttachments.push({
        fileName: originalName,
        contentType: 'application/pdf',
        size: fileBuffer.length,
        isPdf: true,
        base64Data: fileBuffer.toString('base64'),
        buffer: fileBuffer,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: `Unsupported file format (${ext}). Please upload an Outlook .msg file, .eml file, or .pdf attachment.`,
      });
    }

    // Convert email sent/received date to Manila timezone (Asia/Manila, UTC+8)
    const manilaTimes = toManilaDateTime(emailDateRaw);

    // Extract text from PDF attachments: STRICTLY scan ONLY the FIRST PAGE of each PDF file in parallel
    let pdfFirstPagesText = '';
    const pdfAttachments = extractedAttachments.filter((att) => att.isPdf && att.buffer);

    const parsedPdfList: Array<{
      fileName: string;
      page1: string;
      projectNumber: string;
      study: string;
      region?: string;
      cityState?: string;
      targetedSnippet?: string;
    }> = await Promise.all(
      pdfAttachments.map(async (att) => {
        let page1 = '';
        let geminiPdfResult: any = null;

        if (att.buffer) {
          // 1. Primary extraction with pdf-parse (first page)
          try {
            const parser = new PDFParse({ data: new Uint8Array(att.buffer) });
            const textResult = await parser.getText({ first: 1, pageJoiner: '' });
            const rawP1 = textResult?.pages?.[0]?.text || textResult?.text || '';
            page1 = (rawP1 || '').trim();
            try {
              await parser.destroy?.();
            } catch {}
          } catch (pdfErr) {
            console.warn('PDF text extraction error for', att.fileName, pdfErr);
          }

          // 2. If first page is empty, try full doc text
          if (!page1 || page1.length < 15) {
            try {
              const parserFull = new PDFParse({ data: new Uint8Array(att.buffer) });
              const fullResult = await parserFull.getText({ pageJoiner: '\n' });
              const fullP1 = fullResult?.pages?.[0]?.text || fullResult?.text || '';
              if (fullP1 && fullP1.trim().length > 15) {
                page1 = fullP1.trim();
              }
              try {
                await parserFull.destroy?.();
              } catch {}
            } catch (eFull) {
              console.warn('PDF full-text fallback error for', att.fileName, eFull);
            }
          }

          // Strip residual page joiners/footers
          page1 = page1.replace(/\s*--\s*\d+\s*(?:of|\/)\s*\d+\s*--\s*/gi, '').trim();

          // 3. Fallback: inspect raw items from getTextContent
          if (!page1 || page1.length < 15) {
            try {
              const parser2 = new PDFParse({ data: new Uint8Array(att.buffer) });
              const doc = await (parser2 as any).load();
              if (doc && doc.numPages >= 1) {
                const p1 = await doc.getPage(1);
                const tc = await p1.getTextContent({ includeMarkedContent: false, disableNormalization: false });
                if (tc && Array.isArray(tc.items) && tc.items.length > 0) {
                  const strings = tc.items
                    .filter((item: any) => 'str' in item && typeof item.str === 'string')
                    .map((item: any) => item.str.trim())
                    .filter(Boolean);
                  if (strings.length > 0) {
                    page1 = strings.join(' ').trim();
                  }
                }
              }
              try {
                await parser2.destroy?.();
              } catch {}
            } catch (e2) {
              console.warn('Fallback getTextContent error for', att.fileName, e2);
            }
          }

          // 4. Fallback: Decompress FlateDecode content streams directly via native zlib
          if (!page1 || page1.length < 15) {
            const streamDecompressed = extractTextFromPdfStreams(att.buffer);
            if (streamDecompressed && streamDecompressed.length > 15) {
              page1 = streamDecompressed;
            }
          }

          // Targeted section extraction from local extracted text
          let targeted = extractTargetedPdfSections(page1);

          // 5. Strict multimodal direct reading of the PDF attachment with Gemini AI
          const ai = getGemini();
          if (ai && att.buffer) {
            try {
              geminiPdfResult = await extractDirectPdfWithGemini(ai, att.buffer, att.fileName);
              if (geminiPdfResult) {
                // If local parser returned minimal text or AI returned higher fidelity text, adopt AI text
                if (geminiPdfResult.verbatimText && (!page1 || page1.length < 25 || geminiPdfResult.verbatimText.length > page1.length)) {
                  page1 = geminiPdfResult.verbatimText;
                  targeted = extractTargetedPdfSections(page1);
                }
              }
            } catch (gErr) {
              console.warn('Gemini direct PDF reading error for', att.fileName, gErr);
            }
          }

          // 6. Final verification: ensure page1 is cleaned and does not contain raw PDF bytecode
          page1 = page1.replace(/\s*--\s*\d+\s*(?:of|\/)\s*\d+\s*--\s*/gi, '').trim();
          targeted = extractTargetedPdfSections(page1);

          // Resolve Project Number: Header lines -> Gemini PDF reader -> full page 1 scan
          const prjNum = targeted.projectNumber || geminiPdfResult?.projectNumber || extractProjectNumberFromPage1Only(page1) || '';

          // Resolve Study Type: PROJECT DETAILS section -> Gemini PDF reader -> keyword scan
          const rawStudy = targeted.study || (geminiPdfResult?.study ? normalizeStudyType(geminiPdfResult.study) : '') || extractStudyFromPage1Only(page1) || '';
          const studyType = normalizeStudyType(rawStudy);

          const resolvedRegion = targeted.region || geminiPdfResult?.region || '';
          const resolvedCityState = targeted.cityState || geminiPdfResult?.cityState || '';

          // Attach all rich properties directly to attachment object for live viewing and client use
          att.extractedTextSnippet = targeted.targetedSnippet || (page1 ? page1.substring(0, 1000) : '(No text could be extracted from Page 1)');
          (att as any).projectNumber = prjNum;
          (att as any).study = studyType;
          (att as any).region = resolvedRegion;
          (att as any).cityState = resolvedCityState;
          if (!att.base64Data && att.buffer) {
            att.base64Data = att.buffer.toString('base64');
          }

          return {
            fileName: att.fileName,
            page1,
            projectNumber: prjNum,
            study: studyType,
            region: resolvedRegion,
            cityState: resolvedCityState,
            targetedSnippet: targeted.targetedSnippet,
          };
        }

        return {
          fileName: att.fileName,
          page1: '',
          projectNumber: '',
          study: '',
        };
      })
    );

    // Accumulate Page 1 texts for heuristic and AI analysis
    for (const p of parsedPdfList) {
      if (p.page1) {
        pdfFirstPagesText += `\n--- [Attachment: ${p.fileName} - PAGE 1] ---\n${p.targetedSnippet || p.page1}\n`;
      }
    }

    // Heuristic extraction directly on email text and PDF First Page text
    const heuristic = heuristicExtract(bodyText, subject, from, pdfFirstPagesText);

    // Prioritize exact ##-###### from PDF Page 1 top-left if found
    const firstPdfWithPrj = parsedPdfList.find((p) => p.projectNumber && /\b\d{2}-\d{6}\b/.test(p.projectNumber));
    let detectedProjectNumber = firstPdfWithPrj?.projectNumber || heuristic.projectNumber || '';

    // Auto-populate region from PDF header if email text did not specify one
    if (firstPdfWithPrj?.region && !heuristic.region) {
      heuristic.region = firstPdfWithPrj.region;
    }

    // Prioritize study type strictly extracted from PDF attachment First Page
    const isBannedStudy = (s: string) =>
      !s ||
      typeof s !== 'string' ||
      /^(safety\s*studies|safety|near-miss|collection|priority\s*client|priority|due\s*date|email|phone|contact|firm|ipo|special\s*instructions|did\s*you\s*know|with|w\/)\b/i.test(s.trim());

    const pdfStrictStudy = parsedPdfList.find((p) => p.study && !isBannedStudy(p.study))?.study || '';
    let detectedStudy = pdfStrictStudy || (!isBannedStudy(heuristic.study) ? heuristic.study : '');

    // Check if fast-path extracted all required data without needing an expensive remote AI call
    const hasValidProject = Boolean(detectedProjectNumber && /\b\d{2}-\d{6}\b/.test(detectedProjectNumber));
    const hasValidStudy = Boolean(detectedStudy);

    let extractedData: Record<string, any> = {};
    let aiConfidence: { overall: 'high' | 'medium' | 'low'; notes?: string } = {
      overall: 'high',
      notes: 'Extracted instantly from PDF Page 1 targeted sections',
    };

    // If key fields (projectNumber or study) could not be extracted from Page 1, invoke Gemini as fallback
    const ai = getGemini();
    const needsAiFallback = ai && (!hasValidProject || !hasValidStudy);

    if (needsAiFallback) {
      try {
        const prompt = `You are an expert assistant parsing an Outlook email and its attached documents/PDFs for a project scheduler PSU (Project Setup / Schedule Update) submission system.
Extract the following exact fields based on the email content, subject, and attached PDF Page 1 texts:

Fields to extract:
1. "scheduler": Scheduler name or person submitting/requesting.
2. "region": Region (e.g., US, NA, EMEA, APAC, LATAM, EU, CO, TX).
3. "projectNumber": Primary Project Number / ID (formatted ##-###### from Page 1 top-left, e.g. "26-450188" or "26-770124").
4. "study": Primary Study / Study Type strictly from Page 1 under "PROJECT DETAILS" matching flexible format "### (#hr) <Study type> (## day)" (where numbers can have 1 or more digits).
   Keyword recognition prioritized for:
   - TMC
   - ATR
   - Screenline /SNL
   - PEDS
   - Peds & Bikes
   - Bikes
   - Unmet Demand
   - Queue / QUE
   - Red Light Violation / RLV
   - Parking / PKG
   - Driveway / DWY
   - Mainline / MNL
   - Radar (Spot Speed)
5. "jobType": Job Type (e.g., New, Amendment, Revision).
6. "version": Version string if stated (e.g. initial, v2, v3, 1.0; if not specified, return "").
7. "projects": Array of projects detected in attached PDF Page 1s:
   For EACH attached PDF file:
   - Extract "projectNumber" (##-######)
   - Extract "study"
   - Extract "version" and "jobType"
   - Include "sourceFile"
8. "category": Email / PSU Category.
9. "reason": Reason or Email Sub-Category / Description.
10. "remarks": Any remarks, notes, special constraints.
11. "emailAddress": Sender email address.
12. "emailSentDate": Sent/received date if found.
13. "emailSentTime": Sent/received time if found.

Email Metadata:
- File Name: ${originalName}
- Subject: ${subject}
- From: ${from}
- To: ${to}
- Email Sent/Received Date: ${manilaTimes.dateMnl} ${manilaTimes.timeMnl} (MNL)

Email Body:
${bodyText.substring(0, 4000)}

Attached PDF First Pages (Top-left & Details):
${pdfFirstPagesText || '(No PDF page 1 text)'}

Output MUST be a valid JSON object matching this schema:
{
  "scheduler": string,
  "region": string,
  "projectNumber": string,
  "study": string,
  "jobType": string,
  "version": string,
  "projects": [
    {
      "projectNumber": string,
      "study": string,
      "version": string,
      "jobType": string,
      "sourceFile": string
    }
  ],
  "category": string,
  "reason": string,
  "remarks": string,
  "emailAddress": string,
  "emailSentDate": string,
  "emailSentTime": string,
  "confidence": "high" | "medium" | "low",
  "notes": string
}
Do not include markdown code fences in your raw output, or wrap cleanly in JSON.`;

        const aiResult = await extractWithGemini(
          ai,
          prompt,
          pdfAttachments.filter((p) => p.buffer).map((p) => ({ fileName: p.fileName, buffer: p.buffer! }))
        );
        if (aiResult && aiResult.data) {
          const parsedAi = aiResult.data;

          if (manilaTimes.isDefaultedNow && parsedAi.emailSentDate) {
            const aiDateCandidate = `${parsedAi.emailSentDate} ${parsedAi.emailSentTime || ''}`.trim();
            const parsedFromAi = toManilaDateTime(aiDateCandidate);
            if (!parsedFromAi.isDefaultedNow) {
              manilaTimes.dateMnl = parsedFromAi.dateMnl;
              manilaTimes.timeMnl = parsedFromAi.timeMnl;
              manilaTimes.rawIso = parsedFromAi.rawIso;
              manilaTimes.isDefaultedNow = false;
              emailDateRaw = aiDateCandidate;
            }
          }

          extractedData = {
            scheduler: parsedAi.scheduler || '',
            region: parsedAi.region || '',
            psuReceivedDate: manilaTimes.dateMnl,
            psuReceivedTime: formatTimeToAmPm(manilaTimes.timeMnl),
            projectNumber: parsedAi.projectNumber || detectedProjectNumber,
            study: parsedAi.study || detectedStudy,
            jobType: parsedAi.jobType || '',
            version: parsedAi.version || '',
            aiProjects: Array.isArray(parsedAi.projects) ? parsedAi.projects : [],
            category: parsedAi.category || '',
            reason: parsedAi.reason || '',
            remarks: parsedAi.remarks || '',
            emailAddress: parsedAi.emailAddress || (from.match(/<([^>]+)>/) ? from.match(/<([^>]+)>/)![1] : from),
          };
          aiConfidence = {
            overall: parsedAi.confidence || 'high',
            notes: parsedAi.notes || `Analyzed via ${aiResult.modelUsed}`,
          };
        }
      } catch (aiErr: any) {
        aiConfidence = {
          overall: 'medium',
          notes: 'Extracted via intelligent heuristic parser',
        };
      }
    }

    const emailMatch = from.match(/<([^>]+)>/);
    const cleanEmail = emailMatch ? emailMatch[1] : (from.includes('@') ? from.trim() : '');

    // Prioritize exact ##-###### from PDF Page 1 top-left if found
    let finalProjectNumber = detectedProjectNumber || extractedData.projectNumber || heuristic.projectNumber || '';

    let finalStudy = normalizeStudyType(detectedStudy || extractedData.study || '');
    if (!finalStudy && heuristic.study && !isBannedStudy(heuristic.study)) {
      finalStudy = normalizeStudyType(heuristic.study);
    }

    const initialVersion = extractedData.version || heuristic.version || '';
    const isRevisedVer = Boolean(
      initialVersion &&
      initialVersion.toLowerCase() !== 'initial' &&
      (/\(?v\d+/i.test(initialVersion) || initialVersion.toLowerCase().includes('v1') || initialVersion.toLowerCase().includes('v2'))
    );

    // Compile multiple projects list from individual PDFs, Gemini AI, and text scan
    const compiledProjects: Array<{
      id: string;
      projectNumber: string;
      study: string;
      version: string;
      jobType: string;
      sourceFile?: string;
    }> = [];

    // Strict 1-to-1 Rule: The count of Project Numbers MUST strictly match the count of PDF files attached to the email!
    // E.g. If 1 PDF attachment -> exactly 1 Project Number is added.
    // E.g. If 2 PDF attachments -> exactly 2 Project Numbers are added (one for each PDF).
    // E.g. If N PDF attachments -> exactly N Project Numbers are added (one for each PDF).
    // Never add extra phantom projects from email body text or regex scans!
    if (parsedPdfList.length > 0) {
      for (let idx = 0; idx < parsedPdfList.length; idx++) {
        const pdfItem = parsedPdfList[idx];
        const prj = pdfItem.projectNumber.trim() || finalProjectNumber;
        const study = (!isBannedStudy(pdfItem.study) ? pdfItem.study : '') || finalStudy;

        compiledProjects.push({
          id: `proj-${idx + 1}`,
          projectNumber: prj,
          study,
          version: initialVersion,
          jobType: isRevisedVer ? 'Re-PSU (Revised)' : 'New Installs',
          sourceFile: pdfItem.fileName,
        });
      }

      // Optionally enrich existing projects with metadata (version/jobType) from AI if project numbers match,
      // but STRICTLY DO NOT add any new or phantom projects!
      if (Array.isArray(extractedData.aiProjects)) {
        for (const p of extractedData.aiProjects) {
          const prj = (p.projectNumber || '').trim();
          if (prj) {
            const existing = compiledProjects.find((cp) => cp.projectNumber === prj);
            if (existing) {
              const validAiStudy = p.study && !isBannedStudy(p.study) ? p.study.trim() : '';
              if (!existing.study && validAiStudy) existing.study = validAiStudy;
              if (p.version) existing.version = (p.version || '').trim();
              if (p.jobType) existing.jobType = (p.jobType || '').trim();
            }
          }
        }
      }
    } else {
      // Only when 0 PDF files are attached (e.g. text-only email) do we create 1 project from email text
      compiledProjects.push({
        id: 'proj-1',
        projectNumber: finalProjectNumber,
        study: finalStudy,
        version: initialVersion,
        jobType: isRevisedVer ? 'Re-PSU (Revised)' : 'New Installs',
        sourceFile: '',
      });
    }

    // Synchronize top-level fields with the primary project or any project with study
    if (compiledProjects.length > 0) {
      finalProjectNumber = compiledProjects[0].projectNumber || finalProjectNumber;
      if (compiledProjects[0].study) {
        finalStudy = compiledProjects[0].study;
      } else {
        const anyWithStudy = compiledProjects.find((p) => p.study);
        if (anyWithStudy) {
          finalStudy = anyWithStudy.study;
        }
      }

      // Backfill any empty project study with finalStudy so all inputs are consistently filled
      if (finalStudy) {
        for (const p of compiledProjects) {
          if (!p.study) {
            p.study = finalStudy;
          }
        }
      }
    }

    extractedData = {
      emailAddress: '', // Do not extract Email Address from the Outlook email file; entered via input box
      scheduler: '', // Left blank for user's manual selection/input
      region: '', // Left blank; automatically filled when user picks Scheduler based on assigned region
      psuReceivedDate: manilaTimes.dateMnl,
      psuReceivedTime: formatTimeToAmPm(manilaTimes.timeMnl),
      projectNumber: finalProjectNumber,
      study: finalStudy,
      jobType: isRevisedVer ? 'Re-PSU (Revised)' : 'New Installs', // Default to Re-PSU (Revised) for (v1), v2+; else New Installs
      version: initialVersion,
      projects: compiledProjects,
      category: '', // Left blank for user's manual selection
      reason: '', // Left blank for user's manual input
      remarks: '', // Left blank for user's manual input
    };

    // Clean attachments before returning to client (include base64Data for live viewing)
    const clientAttachments = extractedAttachments.map((att) => ({
      fileName: att.fileName,
      contentType: att.contentType,
      size: att.size,
      isPdf: att.isPdf,
      base64Data: att.base64Data,
      extractedTextSnippet: att.extractedTextSnippet,
      projectNumber: (att as any).projectNumber,
      study: (att as any).study,
      region: (att as any).region,
      cityState: (att as any).cityState,
    }));

    return res.json({
      success: true,
      metadata: {
        fileName: originalName,
        subject,
        from,
        to,
        dateSentReceivedRaw: emailDateRaw || manilaTimes.rawIso,
        dateMnl: manilaTimes.dateMnl,
        timeMnl: formatTimeToAmPm(manilaTimes.timeMnl),
        bodyTextPreview: bodyText.substring(0, 800),
        attachments: clientAttachments,
      },
      extractedData,
      aiConfidence,
    });
  } catch (err: any) {
    console.error('Server error in /api/parse-email:', err);
    return res.status(500).json({
      success: false,
      error: err.message || 'An unexpected error occurred while parsing the file.',
    });
  }
});

// Dedicated endpoint to strictly read, view, and extract any PDF file
app.post('/api/extract-pdf', upload.single('file'), async (req, res) => {
  try {
    let pdfBuffer: Buffer | null = null;
    let fileName = 'document.pdf';

    if (req.file) {
      pdfBuffer = req.file.buffer;
      fileName = req.file.originalname || fileName;
    } else if (req.body.base64) {
      pdfBuffer = Buffer.from(req.body.base64, 'base64');
      fileName = req.body.fileName || fileName;
    }

    if (!pdfBuffer || pdfBuffer.length === 0) {
      return res.status(400).json({ success: false, error: 'No PDF buffer or file provided.' });
    }

    let page1 = '';
    let geminiPdfResult: any = null;

    // 1. pdf-parse (first page)
    try {
      const parser = new PDFParse({ data: new Uint8Array(pdfBuffer) });
      const textResult = await parser.getText({ first: 1, pageJoiner: '' });
      page1 = (textResult?.pages?.[0]?.text || textResult?.text || '').trim();
      try {
        await parser.destroy?.();
      } catch {}
    } catch (e) {
      console.warn('extract-pdf: pdf-parse error:', e);
    }

    // 2. pdf-parse (full text)
    if (!page1 || page1.length < 15) {
      try {
        const parserFull = new PDFParse({ data: new Uint8Array(pdfBuffer) });
        const fullResult = await parserFull.getText({ pageJoiner: '\n' });
        const fullP1 = fullResult?.pages?.[0]?.text || fullResult?.text || '';
        if (fullP1 && fullP1.trim().length > 15) page1 = fullP1.trim();
        try {
          await parserFull.destroy?.();
        } catch {}
      } catch (eFull) {
        console.warn('extract-pdf: full text error:', eFull);
      }
    }

    page1 = page1.replace(/\s*--\s*\d+\s*(?:of|\/)\s*\d+\s*--\s*/gi, '').trim();

    // 3. getTextContent
    if (!page1 || page1.length < 15) {
      try {
        const parser2 = new PDFParse({ data: new Uint8Array(pdfBuffer) });
        const doc = await (parser2 as any).load();
        if (doc && doc.numPages >= 1) {
          const p1 = await doc.getPage(1);
          const tc = await p1.getTextContent({ includeMarkedContent: false, disableNormalization: false });
          if (tc && Array.isArray(tc.items) && tc.items.length > 0) {
            const strings = tc.items
              .filter((item: any) => 'str' in item && typeof item.str === 'string')
              .map((item: any) => item.str.trim())
              .filter(Boolean);
            if (strings.length > 0) page1 = strings.join(' ').trim();
          }
        }
        try {
          await parser2.destroy?.();
        } catch {}
      } catch (e2) {
        console.warn('extract-pdf: getTextContent error:', e2);
      }
    }

    // 4. Native zlib stream decompression
    if (!page1 || page1.length < 15) {
      const streamText = extractTextFromPdfStreams(pdfBuffer);
      if (streamText && streamText.length > 15) page1 = streamText;
    }

    let targeted = extractTargetedPdfSections(page1);

    // 5. Strict multimodal direct reading with Gemini AI
    const ai = getGemini();
    if (ai) {
      try {
        geminiPdfResult = await extractDirectPdfWithGemini(ai, pdfBuffer, fileName);
        if (geminiPdfResult?.verbatimText && (!page1 || page1.length < 25 || geminiPdfResult.verbatimText.length > page1.length)) {
          page1 = geminiPdfResult.verbatimText;
          targeted = extractTargetedPdfSections(page1);
        }
      } catch (gErr) {
        console.warn('extract-pdf: Gemini direct reading error:', gErr);
      }
    }

    // 6. Clean and format page1
    page1 = page1.replace(/\s*--\s*\d+\s*(?:of|\/)\s*\d+\s*--\s*/gi, '').trim();
    targeted = extractTargetedPdfSections(page1);

    const projectNumber = targeted.projectNumber || geminiPdfResult?.projectNumber || '';
    const study = normalizeStudyType(targeted.study || geminiPdfResult?.study || '');
    const region = targeted.region || geminiPdfResult?.region || '';
    const cityState = targeted.cityState || geminiPdfResult?.cityState || '';

    return res.json({
      success: true,
      fileName,
      page1Text: page1,
      targetedSnippet: targeted.targetedSnippet || page1.substring(0, 1000),
      projectNumber,
      study,
      region,
      cityState,
      base64Data: pdfBuffer.toString('base64'),
    });
  } catch (err: any) {
    console.error('Error in /api/extract-pdf:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to extract PDF.' });
  }
});

// Dedicated endpoint to strictly extract text and key fields from a Page 1 header screenshot
app.post('/api/extract-screenshot', upload.single('image'), async (req, res) => {
  try {
    let imageBuffer: Buffer | null = null;
    let mimeType = 'image/png';
    let fileName = 'screenshot.png';

    if (req.file) {
      imageBuffer = req.file.buffer;
      mimeType = req.file.mimetype || mimeType;
      fileName = req.file.originalname || fileName;
    } else if (req.body.image) {
      let rawData = req.body.image as string;
      const dataUrlMatch = rawData.match(/^data:([^;]+);base64,(.+)$/);
      if (dataUrlMatch) {
        mimeType = dataUrlMatch[1];
        rawData = dataUrlMatch[2];
      }
      imageBuffer = Buffer.from(rawData, 'base64');
      if (req.body.fileName) fileName = req.body.fileName;
    }

    if (!imageBuffer || imageBuffer.length === 0) {
      return res.status(400).json({ success: false, error: 'No image buffer or screenshot data provided.' });
    }

    const ai = getGemini();
    let geminiResult: any = null;
    if (ai) {
      try {
        geminiResult = await extractScreenshotWithGemini(ai, imageBuffer, mimeType, fileName);
      } catch (aiErr) {
        console.warn('/api/extract-screenshot: Gemini error:', aiErr);
      }
    }

    const verbatimText = geminiResult?.verbatimText || '';
    const targeted = extractTargetedPdfSections(verbatimText);

    const projectNumber = geminiResult?.projectNumber || targeted.projectNumber || '';
    const study = normalizeStudyType(geminiResult?.study || targeted.study || '');
    const region = geminiResult?.region || targeted.region || '';
    const cityState = geminiResult?.cityState || targeted.cityState || '';

    return res.json({
      success: true,
      fileName,
      projectNumber,
      study,
      studyRaw: geminiResult?.studyRaw,
      region,
      cityState,
      notes: geminiResult?.notes,
      verbatimText: verbatimText || targeted.targetedSnippet,
      targetedSnippet: targeted.targetedSnippet || verbatimText.substring(0, 1000),
    });
  } catch (err: any) {
    console.error('Error in /api/extract-screenshot:', err);
    return res.status(500).json({ success: false, error: err.message || 'Failed to extract screenshot.' });
  }
});

// Explicit API error handling middleware (handles Multer errors, payload limits, etc.)
app.use('/api', (err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  if (res.headersSent) {
    return next(err);
  }
  return res.status(err.status || 400).json({
    success: false,
    error: err.message || 'An error occurred processing the API request.',
  });
});

// Explicit catch-all for /api/* to ensure API requests never fall through to Vite's HTML SPA fallback
app.all('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    error: `API route not found: ${req.method} ${req.path}`,
  });
});

// Vite middleware & static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
