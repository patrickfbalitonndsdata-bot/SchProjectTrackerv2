/**
 * Utility functions for date and time formatting, particularly for Manila Time (Asia/Manila, UTC+8).
 */

const KNOWN_TZ_PATTERN = /\b(UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|AEST|AEDT)\b|[+\-]\d{4}\b|[+\-]\d{2}:?\d{2}|Z$/i;

const MONTH_MAP: Record<string, string> = {
  jan: '01', january: '01',
  feb: '02', february: '02',
  mar: '03', march: '03',
  apr: '04', april: '04',
  may: '05', may_: '05',
  jun: '06', june: '06',
  jul: '07', july: '07',
  aug: '08', august: '08',
  sep: '09', sept: '09', september: '09',
  oct: '10', october: '10',
  nov: '11', november: '11',
  dec: '12', december: '12'
};

export function getManilaNow(): { dateStr: string; timeStr: string; fullTimestamp: string } {
  const now = new Date();
  return formatToManila(now);
}

/**
 * Scans arbitrary text or email headers/bodies to extract the sent/received date and time string.
 * Supports Outlook headers (Sent:, Date:, Received:), HTML formatting, and RFC 2822 timestamps.
 */
export function extractDateFromText(text: string): { raw: string; parsedDate: Date | null } | null {
  if (!text) return null;

  // Clean HTML tags and entities
  const clean = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ');

  const patterns = [
    // 1. RFC 2822: Date: Mon, 14 Sep 2026 15:45:00 +0000 or -0400
    /(?:Delivery-Date|Date|Sent):\s*([A-Za-z]{3},\s+\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|AEST|AEDT|[+\-]\d{4}|[+\-]\d{2}:?\d{2}))?)/i,
    // 2. Outlook Sent header with weekday: Sent: Monday, September 14, 2026 4:45 PM (or with optional TZ)
    /(?:Sent|Date):\s*([A-Za-z]+,?\s+[A-Za-z]+\s+\d{1,2},?\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 3. Sent with day first: Sent: Tuesday, 15 September 2026 14:20 EDT
    /(?:Sent|Date):\s*([A-Za-z]+,?\s+\d{1,2}\s+[A-Za-z]+\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 4. Outlook Sent header without weekday: Sent: September 14, 2026 4:45 PM
    /(?:Sent|Date):\s*([A-Za-z]+\s+\d{1,2},?\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 5. Sent: 14 Sep 2026 16:45:00
    /(?:Sent|Date):\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 6. Numeric Sent: Sent: 09/14/2026 4:45:00 PM or 9/14/2026 16:45
    /(?:Sent|Date):\s*(\d{1,2}[/.\-]\d{1,2}[/.\-]\d{2,4}\s+(?:at\s+)?\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM)?(?:\s+(?:UTC|GMT|EDT|EST|CDT|CST|MDT|MST|PDT|PST|PHT|SGT|JST|[+\-]\d{4}))?)/i,
    // 7. Received transport header: Received: by ...; Mon, 14 Sep 2026 15:45:00 +0000
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

/**
 * Parses an email date/time string from Outlook (.msg or .eml) or headers/body.
 * If the string contains an explicit timezone (e.g. UTC, GMT, EDT, +0000), converts to Asia/Manila (UTC+8).
 * If no timezone is specified (e.g. 'Monday, September 14, 2026 4:45 PM'), preserves the exact date
 * and time literals without artificial UTC-to-Manila offset drift.
 */
export function parseEmailDateTimeToManila(input: string | Date | number | null | undefined): {
  dateStr: string;
  timeStr: string;
  fullTimestamp: string;
  rawIso: string;
  isDefaultedNow: boolean;
} {
  if (!input) {
    const now = new Date();
    const formatted = formatToManila(now);
    return { ...formatted, rawIso: now.toISOString(), isDefaultedNow: true };
  }

  if (input instanceof Date) {
    if (isNaN(input.getTime())) {
      const now = new Date();
      const formatted = formatToManila(now);
      return { ...formatted, rawIso: now.toISOString(), isDefaultedNow: true };
    }
    const formatted = formatToManila(input);
    return { ...formatted, rawIso: input.toISOString(), isDefaultedNow: false };
  }

  const str = String(input).trim();
  if (!str) {
    const now = new Date();
    const formatted = formatToManila(now);
    return { ...formatted, rawIso: now.toISOString(), isDefaultedNow: true };
  }

  // 1. If explicit timezone indicator exists, parse and convert to Asia/Manila
  if (KNOWN_TZ_PATTERN.test(str)) {
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 2000 && parsed.getFullYear() <= 2040) {
      const formatted = formatToManila(parsed);
      return { ...formatted, rawIso: parsed.toISOString(), isDefaultedNow: false };
    }
  }

  // 2. Parse literal month name and time if no timezone was specified
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
      const dateStr = `${year}-${mNum}-${day}`;
      const timeStr = `${hour12}:${min}:${sec} ${ampm}`;
      return {
        dateStr,
        timeStr,
        fullTimestamp: `${dateStr} ${timeStr}`,
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
      const dateStr = `${year}-${mNum}-${day}`;
      const timeStr = `${hour12}:${min}:${sec} ${ampm}`;
      return {
        dateStr,
        timeStr,
        fullTimestamp: `${dateStr} ${timeStr}`,
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
    const dateStr = `${year}-${month}-${day}`;
    const timeStr = `${hour12}:${min}:${sec} ${ampm}`;
    return {
      dateStr,
      timeStr,
      fullTimestamp: `${dateStr} ${timeStr}`,
      rawIso: `${year}-${month}-${day}T${String(rawH).padStart(2, '0')}:${min}:${sec}`,
      isDefaultedNow: false,
    };
  }

  // 3. Fallback standard Date parsing
  const d = new Date(str);
  if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2040) {
    const formatted = formatToManila(d);
    return { ...formatted, rawIso: d.toISOString(), isDefaultedNow: false };
  }

  // Fallback to now
  const now = new Date();
  const formatted = formatToManila(now);
  return { ...formatted, rawIso: now.toISOString(), isDefaultedNow: true };
}

export function formatToManila(dateInput: Date | string | number | null | undefined): {
  dateStr: string;
  timeStr: string;
  fullTimestamp: string;
} {
  if (!dateInput) {
    const fallback = new Date();
    return formatToManila(fallback);
  }

  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    return formatToManila(fallback);
  }

  // Format in Asia/Manila
  const formatterDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const formatterTime = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const dateStr = formatterDate.format(d); // YYYY-MM-DD
  const timeStr = formatterTime.format(d); // e.g. "4:45:00 PM"
  const fullTimestamp = `${dateStr} ${timeStr}`;

  return { dateStr, timeStr, fullTimestamp };
}

/**
 * Converts any time string (24-hour or existing 12-hour) to AM/PM format.
 * Examples:
 *  "16:45:00" -> "4:45:00 PM"
 *  "16:45"    -> "4:45 PM"
 *  "07:02:41" -> "7:02:41 AM"
 *  "4:45 PM"  -> "4:45 PM"
 */
export function formatTimeToAmPm(timeInput: string): string {
  if (!timeInput) return '';
  const trimmed = timeInput.trim();

  // If already formatted with AM or PM, return normalized
  if (/\b(am|pm)\b/i.test(trimmed)) {
    return trimmed;
  }

  // Check for 24-hour time HH:mm:ss or HH:mm
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

export function extractSpreadsheetId(input: string): string {
  if (!input) return '';
  const trimmed = input.trim();
  // Check if it's already an ID (alphanumeric, dashes, underscores, usually 30-50 chars)
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  // If user pasted a clean ID
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) {
    return trimmed;
  }
  return trimmed;
}
