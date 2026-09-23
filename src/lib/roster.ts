/**
 * Scheduler Roster with assigned regions, PSU Categories, and Study Extractor
 */

export interface SchedulerItem {
  name: string;
  region: string;
}

export const SCHEDULER_ROSTER: SchedulerItem[] = [
  { name: 'Dan', region: 'NYC' },
  { name: 'Dale', region: 'Florida' },
  { name: 'Dwight', region: 'NOCAL/SOCAL' },
  { name: 'Ella', region: 'PENNDOT' },
  { name: 'James', region: 'South Central' },
  { name: 'Jean', region: 'NYSDOT' },
  { name: 'John', region: 'PENNDOT, NYSDOT' },
  { name: 'Jovie', region: 'NYC, Mid West' },
  { name: 'Kat', region: 'South Central' },
  { name: 'Kristine', region: 'NOCAL' },
  { name: 'Kyle', region: 'South Central' },
  { name: 'Marc', region: 'Florida, South East' },
  { name: 'Maybe', region: '' },
  { name: 'Mia', region: 'North East' },
  { name: 'Mitch', region: 'South East' },
  { name: 'Monica', region: 'Mid Atlantic' },
  { name: 'Patrick', region: 'South Central' },
  { name: 'Recca', region: '' },
  { name: 'Rhea', region: 'North East' },
  { name: 'Roselyn', region: '' },
  { name: 'Shane', region: 'North East, Mid Atlantic' },
  { name: 'Teddy', region: 'NOCAL' },
  { name: 'Zai', region: 'SOCAL' },
];

export const COMMON_REGIONS: string[] = [
  'NYC',
  'Florida',
  'NOCAL/SOCAL',
  'PENNDOT',
  'South Central',
  'NYSDOT',
  'NYC, Mid West',
  'Mid West',
  'NOCAL',
  'Florida, South East',
  'PENNDOT, NYSDOT',
  'North East',
  'South East',
  'Mid Atlantic',
  'North East, Mid Atlantic',
  'SOCAL',
];

export const PSU_CATEGORIES: string[] = [
  'Initial',
  'Pop-Up Projects',
  'Project Updates',
  'Ops/Regional Updates',
  'Changes in PSU (Client)',
  'Changes in PSU (NDS)',
  'Technician',
  'Redo',
  'Permit Requirement',
  'Weather Issues',
  'Scheduling Updates/Documentation',
];

export const CATEGORY_RECOMMENDED_REASONS: Record<string, string[]> = {
  'Initial': [
    'Initial',
  ],
  'Pop-Up Projects': [
    'Additional projects added within the same week',
  ],
  'Project Updates': [
    'Changes in Project Schedule',
    'Removal of Postponed/Hold Projects',
    'Installation, swap, or teardown changes',
    'Routing adjustments, including travel-time',
    'Limited inventory allocation due to additional projects',
    'Late sending of PSU',
    'Changes of plans (re-arrange outline)',
  ],
  'Ops/Regional Updates': [
    'Additional location/s request by Ops',
    'Changes in collection period or hours',
    'Changes in locations and project notes',
    'Changes in Location Count',
    'New/moved/updated Install, TD or collection period',
  ],
  'Changes in PSU (Client)': [
    'Addtional notes or special instruction',
  ],
  'Changes in PSU (NDS)': [
    'PSU updates due to data discrepancies',
  ],
  'Technician': [
    'Project reassignment to another technician',
    'Vehicle problems',
    'Technician emergency or illness',
    'Workload or capacity constraints for the day/week',
    'Unable to install equipment',
    'Incomplete installation',
    'Incorrect or bad camera placement',
    'Redo locations/projects',
    'Faulty equipment',
    'Data processing issues',
    'Technician did not follow SCH provided placement',
    'Missing collection period/hours',
  ],
  'Redo': [
    'Other site-related concerns',
  ],
  'Permit Requirement': [
    'Permit added (received late from the client), requiring a schedule adjustment',
  ],
  'Weather Issues': [
    'Project rescheduling due to weather conditions',
  ],
  'Scheduling Updates/Documentation': [
    'Changes to schedule emails, including updated attachments and project details',
    'Project was already installed, but the PSU was not sent within working hours',
    'Tech was notified on the same day, but Region will provide a response or update on the following business day',
  ],
};

export const PSU_REASONS: string[] = [
  'Initial',
  'Additional projects added within the same week',
  'Changes in Project Schedule',
  'Removal of Postponed/Hold Projects',
  'Installation, swap, or teardown changes',
  'Routing adjustments, including travel-time',
  'Limited inventory allocation due to additional projects',
  'Late sending of PSU',
  'Changes of plans (re-arrange outline)',
  'Additional location/s request by Ops',
  'Changes in collection period or hours',
  'Changes in locations and project notes',
  'Changes in Location Count',
  'New/moved/updated Install, TD or collection period',
  'Addtional notes or special instruction',
  'PSU updates due to data discrepancies',
  'Project reassignment to another technician',
  'Vehicle problems',
  'Technician emergency or illness',
  'Workload or capacity constraints for the day/week',
  'Unable to install equipment',
  'Incomplete installation',
  'Incorrect or bad camera placement',
  'Redo locations/projects',
  'Faulty equipment',
  'Data processing issues',
  'Technician did not follow SCH provided placement',
  'Missing collection period/hours',
  'Other site-related concerns',
  'Permit added (received late from the client), requiring a schedule adjustment',
  'Project rescheduling due to weather conditions',
  'Changes to schedule emails, including updated attachments and project details',
  'Project was already installed, but the PSU was not sent within working hours',
  'Tech was notified on the same day, but Region will provide a response or update on the following business day',
];

export const JOB_TYPES: string[] = [
  'New Installs',
  'Re-PSU (Revised)',
  'REDO',
  'Live Technicians',
  'Teardowns',
  'Swaps',
];

export const DEFAULT_JOB_TYPE = 'New Installs';

/**
 * Checks if a given version string represents a revision (v1, (v1), v2, v3, etc.)
 */
export function isRevisedVersion(version: string | undefined | null): boolean {
  if (!version) return false;
  const clean = version.trim().toLowerCase();
  if (clean === 'initial' || clean === '') return false;
  // Matches (v1), v1, (v2), v2, v3, etc.
  if (/\(?v\d+/i.test(clean) || /^v\d+/i.test(clean) || /\bv\d+\b/i.test(clean)) {
    return true;
  }
  if (clean.includes('v1') || clean.includes('v2') || clean.includes('v3') || clean.includes('rev')) {
    return true;
  }
  return false;
}

/**
 * Returns the default Job Type for a given version:
 * For (v1), v2 and up, default is "Re-PSU (Revised)"
 * For initial / Initial, default is "New Installs"
 */
export function getDefaultJobTypeForVersion(version: string | undefined | null): string {
  return isRevisedVersion(version) ? 'Re-PSU (Revised)' : 'New Installs';
}

/**
 * Standard Traffic Study Keywords provided for Keyword Recognition and Form Fill Outs:
 * 1. TMC
 * 2. ATR
 * 3. Screenline /SNL
 * 4. PEDS
 * 5. Peds & Bikes
 * 6. Bikes
 * 7. Unmet Demand
 * 8. Queue / QUE
 * 9. Red Light Violation / RLV
 * 10. Parking / PKG
 * 11. Driveway / DWY
 * 12. Mainline / MNL
 * 13. Radar (Spot Speed)
 */
export const STUDY_TYPE_KEYWORDS = [
  'TMC',
  'ATR',
  'Screenline /SNL',
  'PEDS',
  'Peds & Bikes',
  'Bikes',
  'Unmet Demand',
  'Queue / QUE',
  'Red Light Violation / RLV',
  'Parking / PKG',
  'Driveway / DWY',
  'Mainline / MNL',
  'Radar (Spot Speed)',
] as const;

export type StandardStudyType = (typeof STUDY_TYPE_KEYWORDS)[number];

export interface StudyKeywordRule {
  canonical: StandardStudyType;
  regex: RegExp;
  label: string;
  abbreviation?: string;
}

export const STUDY_KEYWORD_RULES: StudyKeywordRule[] = [
  {
    canonical: 'Screenline /SNL',
    regex: /\b(?:screenline\s*(?:\/|\s)\s*snl|screenline\/snl|screenline|screen\s*line|\bsnl\b)\b/i,
    label: 'Screenline /SNL',
    abbreviation: 'SNL',
  },
  {
    canonical: 'Red Light Violation / RLV',
    regex: /\b(?:red\s*light\s*violations?\s*(?:\/|\s)\s*rlv|red\s*light\s*violations?\/rlv|red\s*light\s*violations?|\brlv\b)\b/i,
    label: 'Red Light Violation / RLV',
    abbreviation: 'RLV',
  },
  {
    canonical: 'Queue / QUE',
    regex: /\b(?:queue\s*(?:\/|\s)\s*que|queue\/que|queue\s*length|queuing|queue|\bque\b)\b/i,
    label: 'Queue / QUE',
    abbreviation: 'QUE',
  },
  {
    canonical: 'Parking / PKG',
    regex: /\b(?:parking\s*(?:\/|\s)\s*pkg|parking\/pkg|parking\s*study|parking\s*inventory|parking|\bpkg\b)\b/i,
    label: 'Parking / PKG',
    abbreviation: 'PKG',
  },
  {
    canonical: 'Driveway / DWY',
    regex: /\b(?:driveway\s*(?:\/|\s)\s*dwy|driveway\/dwy|driveways?|\bdwy\b)\b/i,
    label: 'Driveway / DWY',
    abbreviation: 'DWY',
  },
  {
    canonical: 'Mainline / MNL',
    regex: /\b(?:mainline\s*(?:\/|\s)\s*mnl|mainline\/mnl|mainlines?|\bmnl\b)\b/i,
    label: 'Mainline / MNL',
    abbreviation: 'MNL',
  },
  {
    canonical: 'Radar (Spot Speed)',
    regex: /\b(?:radar\s*(?:\/|\s|\()?spot\s*speed\)?|radar\s*\(spot\s*speed\)|spot\s*speed|radar)\b/i,
    label: 'Radar (Spot Speed)',
    abbreviation: 'Radar',
  },
  {
    canonical: 'Peds & Bikes',
    regex: /\b(?:peds?\s*(?:&|and|\/)\s*bikes?|peds?\s*(?:&|and|\/)\s*bicycles?|pedestrians?\s*(?:&|and|\/)\s*bicycles?|pedestrians?\s*(?:&|and|\/)\s*bikes?)\b/i,
    label: 'Peds & Bikes',
  },
  {
    canonical: 'PEDS',
    regex: /\b(?:peds?|pedestrians?)\b/i,
    label: 'PEDS',
  },
  {
    canonical: 'Bikes',
    regex: /\b(?:bikes?|bicycles?)\b/i,
    label: 'Bikes',
  },
  {
    canonical: 'Unmet Demand',
    regex: /\b(?:unmet\s*demand)\b/i,
    label: 'Unmet Demand',
  },
  {
    canonical: 'TMC',
    regex: /\b(?:tmc|turning\s+movement(?:\s+count)?s?)\b/i,
    label: 'TMC',
    abbreviation: 'TMC',
  },
  {
    canonical: 'ATR',
    regex: /\b(?:atr|automatic\s+traffic\s+recorder|tube(?:\s+count)?s?)\b/i,
    label: 'ATR',
    abbreviation: 'ATR',
  },
];

export const SECONDARY_STUDY_KEYWORDS = [
  'Class',
  'Classification',
  'Volume',
  'Drone',
  'Speed',
];

/**
 * Normalizes any recognized study keyword string into its standard canonical format.
 * e.g., "snl" -> "Screenline /SNL", "que" -> "Queue / QUE", "rlv" -> "Red Light Violation / RLV"
 */
export function normalizeStudyType(candidate: string | null | undefined): string {
  if (!candidate || typeof candidate !== 'string') return '';
  const trimmed = candidate.trim();
  if (!trimmed) return '';

  // 1. Direct regex check against the 12 standard keywords
  for (const rule of STUDY_KEYWORD_RULES) {
    if (rule.regex.test(trimmed)) {
      return rule.canonical;
    }
  }

  // 2. Secondary study types
  for (const sec of SECONDARY_STUDY_KEYWORDS) {
    const escaped = sec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`\\b${escaped}\\b`, 'i').test(trimmed)) {
      return sec;
    }
  }

  return trimmed;
}

/**
 * Primary Strategy: Standard format way of scanning the PDF for Study type.
 * Prioritizes flexible multi-digit patterns under "PROJECT DETAILS":
 *   ### (#hr) <Study type> (## day)
 * where numbers can have 1 or more digits (e.g. 1, 3, 22, 125, 300, etc.)
 */
export function extractStudyStandardFormat(text: string): string {
  if (!text || !text.trim()) return '';

  const cleanText = text.replace(/[\u00A0\u2000-\u200B]/g, ' ').trim();

  // Helper to validate and clean candidate study
  const isValidStudy = (cand: string): boolean => {
    if (!cand || typeof cand !== 'string') return false;
    const s = cand.trim();
    if (s.length < 2 || s.length > 50) return false;
    // Strictly reject noise, email slogans, headers, or other non-study terms
    if (
      /^(with|w\/|all|locations?|wed|thu|tue|mon|fri|sat|sun|schedule|collection|priority|due\s*date|special\s*instructions|did\s*you\s*know|safety\s*studies|email|phone|contact|firm|ipo)\b/i.test(
        s
      )
    ) {
      return false;
    }
    if (/^[\d:\-\/\s()]+$/.test(s)) return false;
    return true;
  };

  // 1. Locate "PROJECT DETAILS" section if present
  let searchArea = '';
  const pdMatch = cleanText.match(/PROJECT\s+DETAILS\b([\s\S]{1,3000})/i);
  if (pdMatch) {
    searchArea = pdMatch[1];
    const stopMatch = searchArea.search(/\n\s*(?:SPECIAL\s+INSTRUCTIONS|ATTACHMENTS|EQUIPMENT)\b/i);
    if (stopMatch !== -1 && stopMatch > 10) {
      searchArea = searchArea.substring(0, stopMatch);
    }
  } else {
    const headerMatch = cleanText.match(/(?:IPO\s*:|EMAIL\s*(?:\([^)]*\))?\s*:|CONTACT\s*:)([\s\S]{1,3000})/i);
    searchArea = headerMatch ? headerMatch[1] : cleanText;
  }

  // Strategy 1: Flexible Multi-line / single-line exact pattern:
  // Supports ### (#hr) <Study Type> (## day) with 1 or more digits in any position
  // e.g. "1 (24hr) ATR (1 day)", "125 (4hr) Screenline /SNL (14 day)", "300 (48hr) Mainline / MNL (7 days)"
  const flexibleRegex1 = /(?:^|\n|\r|\s)(?:\d+[\s\t]*)?\(\s*\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|h)?\s*\)[\s\t]+([A-Za-z0-9\/\-&]+(?:[\s\t]+[A-Za-z0-9\/\-&()]+)*?)[\s\t]+\(\s*\d+(?:\.\d+)?\s*(?:days?|day\/s|days\/s|d)?\s*\)/i;
  const match1 = searchArea.match(flexibleRegex1) || cleanText.match(flexibleRegex1);
  if (match1 && isValidStudy(match1[1])) {
    return normalizeStudyType(match1[1]);
  }

  // Strategy 2: Multi-line / single-line duration pattern: ### (#hr) <Study type>
  // e.g. "12 (4hr) Queue / QUE", "1 (24hr) ATR"
  const flexibleRegex2 = /(?:^|\n|\r|\s)(?:\d+[\s\t]*)?\(\s*\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|h)?\s*\)[\s\t]+([A-Za-z0-9\/\-&]+(?:[\s\t]+[A-Za-z0-9\/\-&()]+)*?)(?=\s*(?:\n|\r|w\/|with|\d{1,2}:\d{2}|$))/i;
  const match2 = searchArea.match(flexibleRegex2) || cleanText.match(flexibleRegex2);
  if (match2 && isValidStudy(match2[1])) {
    return normalizeStudyType(match2[1]);
  }

  // Strategy 3: Check line-by-line under PROJECT DETAILS
  const lines = searchArea.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^PROJECT\s+DETAILS$/i.test(line)) continue;
    if (/^[_\-=*~#]{2,}$/.test(line)) continue;
    if (/^(SPECIAL\s+INSTRUCTIONS|ATTACHMENTS)\b/i.test(line)) break;

    // A. Match line containing (## day/s) with 1 or more digits
    const dayMatch = line.match(/\(\s*\d+(?:\.\d+)?\s*(?:days?|day\/s|days\/s|d)?\s*\)/i);
    if (dayMatch && dayMatch.index !== undefined) {
      let candidate = line.substring(0, dayMatch.index).trim();
      candidate = candidate
        .replace(/^\s*\d+\s*\(\s*\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|h)?\s*\)\s*/i, '')
        .replace(/^\s*\(\s*\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|h)?\s*\)\s*/i, '')
        .replace(/^\s*\d+\s+/, '')
        .trim();

      if (isValidStudy(candidate)) {
        return normalizeStudyType(candidate);
      }
    }

    // B. Match line with duration indicator: ### (#hr) <Study type>
    const durMatch = line.match(/(?:^\s*\d+\s*)?\(\s*\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|h)?\s*\)\s*([A-Za-z0-9\/\-&]+(?:\s+[A-Za-z0-9\/\-&()]+)*)/i);
    if (durMatch && durMatch[1]) {
      let candidate = durMatch[1].replace(/\s+\(\s*\d+.*$/i, '').trim();
      if (isValidStudy(candidate)) {
        return normalizeStudyType(candidate);
      }
    }
  }

  // Strategy 4: Explicit Study / Study Type label pattern
  const labelMatch = cleanText.match(/(?:study\s*(?:type)?|study\s*name)\s*[:=\-]\s*([A-Za-z0-9\/\-& ]{2,40})/i);
  if (labelMatch && isValidStudy(labelMatch[1])) {
    return normalizeStudyType(labelMatch[1]);
  }

  return '';
}

/**
 * Secondary Strategy: Match the official keywords provided against the PDF First Page text.
 * Used if the primary standard format scan does not yield a match.
 * File name is disregarded.
 */
export function extractStudyKeywordMatch(text: string): string {
  const clean = (text || '').trim();
  if (!clean) return '';

  const normalizedPunct = clean.replace(/[_.\-\/\\()[\]]/g, ' ');

  // 1. Primary official study type keywords (in order of specificity)
  for (const rule of STUDY_KEYWORD_RULES) {
    if (rule.regex.test(clean) || rule.regex.test(normalizedPunct)) {
      return rule.canonical;
    }
  }

  // 2. Secondary known traffic study keywords
  for (const sec of SECONDARY_STUDY_KEYWORDS) {
    const escaped = sec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const secRegex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (secRegex.test(clean) || secRegex.test(normalizedPunct)) {
      return sec;
    }
  }

  return '';
}

/**
 * Extracts Study / Study Type STRICTLY from the very FIRST PAGE content of the PDF file.
 * File name is not important and is completely disregarded.
 * 1. PRIORITIZE standard format scanning on Page 1 (under PROJECT DETAILS: ### (#hr) <Study type> (## day))
 * 2. FALL BACK to keyword matching on Page 1 content (checking PROJECT DETAILS area first, then full Page 1).
 */
export function extractStudyFromPage1Only(page1Text: string): string {
  if (!page1Text || !page1Text.trim()) return '';

  // STEP 1: PRIORITIZE standard format scanning on Page 1 under PROJECT DETAILS
  const standardP1 = extractStudyStandardFormat(page1Text);
  if (standardP1) {
    return standardP1;
  }

  // STEP 2: FALLBACK - Keyword matching against PROJECT DETAILS section on Page 1
  let pdArea = '';
  const pdMatch = page1Text.match(/PROJECT\s+DETAILS\b([\s\S]{1,3000})/i);
  if (pdMatch) {
    pdArea = pdMatch[1];
    const stopMatch = pdArea.search(/\n\s*(?:SPECIAL\s+INSTRUCTIONS|ATTACHMENTS|EQUIPMENT)\b/i);
    if (stopMatch !== -1 && stopMatch > 10) {
      pdArea = pdArea.substring(0, stopMatch);
    }
  }
  if (pdArea) {
    const kwPd = extractStudyKeywordMatch(pdArea);
    if (kwPd) {
      return kwPd;
    }
  }

  // STEP 3: FALLBACK - Keyword matching against the entire Page 1 text
  const kwPage1 = extractStudyKeywordMatch(page1Text);
  if (kwPage1) {
    return kwPage1;
  }

  return '';
}

/**
 * Study / Study Type extractor targeting the First Page of the PDF file under PROJECT DETAILS.
 * File name is completely disregarded.
 */
export function extractStudyFromProjectDetails(
  text: string,
  page1Text: string = ''
): string {
  const p1 = page1Text && page1Text.trim() ? page1Text : text;
  return extractStudyFromPage1Only(p1);
}

export interface TargetedPdfSections {
  projectHeader: string;
  projectDetails: string;
  targetedSnippet: string;
  projectNumber: string;
  study: string;
  region: string;
  cityState?: string;
}

/**
 * Fast & Targeted PDF First Page Extractor:
 * Selects only the specific text sections needed for instant extraction:
 * 1. Project Number & Region Header (from the first lines of the extracted text)
 *    e.g.
 *    Massachusetts (Eastern)
 *    26-430138 | Cambridge, MA
 * 2. Study / Study Type section (from ### PROJECT DETAILS)
 *    e.g.
 *    PROJECT DETAILS
 *    1 (48hr) ATR (2 day)
 *    w/ Bicycles, Volume, Classification, Speed
 *    00:00-24:00 | Wed, Thu | 09/09/26 - 09/10/26
 *    Location(s): 1
 *    Where keywords in this lines section are matched.
 */
// Check if a line is internal PDF file syntax rather than extracted human text
function isPdfInternalSyntaxLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return true;
  if (/^%PDF-\d/i.test(trimmed)) return true;
  if (/^%[\x80-\xFF]/.test(trimmed)) return true;
  if (/^\d+\s+\d+\s+obj\b/i.test(trimmed)) return true;
  if (/^(?:endobj|endstream|stream|xref|trailer|startxref|%%EOF)$/i.test(trimmed)) return true;
  if (/^\/Filter\s+\/[A-Za-z0-9]+/i.test(trimmed)) return true;
  if (/^\/(?:Length|Type|Pages|Catalog|Resources|Font|MediaBox|Contents)\b/i.test(trimmed)) return true;
  if (/^<<.*>>$/.test(trimmed) || trimmed === '<<' || trimmed === '>>') return true;
  if (/^[xX][\x9C\u0153\u009c]/.test(trimmed)) return true; // Zlib deflate stream headers
  return false;
}

export function extractTargetedPdfSections(page1RawText: string): TargetedPdfSections {
  if (!page1RawText || !page1RawText.trim()) {
    return {
      projectHeader: '',
      projectDetails: '',
      targetedSnippet: '',
      projectNumber: '',
      study: '',
      region: '',
    };
  }

  // Strip page joiners/footers e.g. "-- 1 of 5 --"
  const cleanFull = page1RawText.replace(/\s*--\s*\d+\s*(?:of|\/)\s*\d+\s*--\s*/gi, '').trim();
  // Filter out any raw PDF internal bytecode syntax
  const rawLines = cleanFull
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !isPdfInternalSyntaxLine(l));

  // If text was purely raw PDF bytecode with no extracted text
  if (rawLines.length === 0) {
    return {
      projectHeader: '',
      projectDetails: '',
      targetedSnippet: '',
      projectNumber: '',
      study: '',
      region: '',
    };
  }

  // 1. Part 1: Project Number / Region Header (First lines of extracted text)
  const headerLines: string[] = [];
  let projectNumber = '';
  let cityState = '';
  let detectedRegion = '';

  for (let i = 0; i < Math.min(rawLines.length, 30); i++) {
    const rawLine = rawLines[i];
    const stripped = rawLine.replace(/[*#_~]/g, '').trim();
    if (!stripped) continue;

    // If we hit the PROJECT DETAILS section early, stop header
    if (/^PROJECT\s+DETAILS\b/i.test(stripped)) break;

    headerLines.push(stripped);

    // Look for ##-###### | City, State or ##-######
    const barMatch = stripped.match(/\b(\d{2}-\d{6})\s*(?:\||\-)\s*(.*)$/);
    if (barMatch) {
      projectNumber = barMatch[1];
      if (barMatch[2]) {
        cityState = barMatch[2].replace(/^[|\-:\s]+/, '').trim();
      }
      break;
    }

    const prjMatch = stripped.match(/\b(\d{2}-\d{6})\b/);
    if (prjMatch) {
      projectNumber = prjMatch[1];
      break;
    }
  }

  // Detect region from the first lines if present (e.g. "Massachusetts (Eastern)")
  for (const hl of headerLines) {
    if (!/\b\d{2}-\d{6}\b/.test(hl) && !/^(?:project|client|date|page|contact|billing)\b/i.test(hl)) {
      if (hl.length >= 3 && hl.length <= 50) {
        detectedRegion = hl;
        break;
      }
    }
  }

  // 2. Part 2: Study / Study Type part under PROJECT DETAILS
  // Where keywords in this lines section are matched
  const detailLines: string[] = [];
  const pdIndex = rawLines.findIndex((l) => {
    const stripped = l.replace(/[*#_~]/g, '').trim();
    return /^PROJECT\s+DETAILS\b/i.test(stripped);
  });

  if (pdIndex !== -1) {
    for (let i = pdIndex; i < rawLines.length; i++) {
      const rawLine = rawLines[i];
      const stripped = rawLine.replace(/[*#_~]/g, '').trim();
      if (!stripped) continue;

      // Stop when hitting next major section
      if (
        i > pdIndex &&
        /^(?:SPECIAL\s+INSTRUCTIONS|ATTACHMENTS|EQUIPMENT|SAFETY|NOTES|TERMS|SCHEDULE|BILLING|CONTACT)\b/i.test(
          stripped
        ) &&
        !/^(?:Location\(s\)|Locations?\s*:)/i.test(stripped)
      ) {
        break;
      }

      detailLines.push(stripped);
      if (detailLines.length >= 8) break;
    }
  }

  const projectHeader = headerLines.join('\n');
  const projectDetails = detailLines.join('\n');

  // Study extraction: strictly from the extracted PROJECT DETAILS line section
  let study = '';
  if (projectDetails) {
    study = extractStudyFromPage1Only(projectDetails);
  }
  // Fallback if not found in isolated details block
  if (!study) {
    study = extractStudyFromPage1Only(cleanFull);
  }

  // If projectNumber not in top lines, fallback to full page 1 scan
  if (!projectNumber) {
    const prjAny = cleanFull.match(/\b(\d{2}-\d{6})\b/);
    if (prjAny) projectNumber = prjAny[1];
  }

  // Format concise targeted snippet showing exactly the two isolated parts
  const snippetParts: string[] = [];
  if (projectHeader) {
    snippetParts.push(`[PROJECT HEADER]\n${projectHeader}`);
  }
  if (projectDetails) {
    if (snippetParts.length > 0) snippetParts.push('');
    snippetParts.push(`[PROJECT DETAILS]\n${projectDetails}`);
  }

  const targetedSnippet = snippetParts.length > 0 ? snippetParts.join('\n') : cleanFull.substring(0, 800);

  return {
    projectHeader,
    projectDetails,
    targetedSnippet,
    projectNumber,
    study,
    region: detectedRegion,
    cityState,
  };
}

