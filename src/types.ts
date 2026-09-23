export interface ProjectItem {
  id: string;
  projectNumber: string;
  study: string;
  version: string;
  jobType: string;
  sourceFile?: string;
}

export interface PsuFormData {
  emailAddress: string;
  scheduler: string;
  region: string;
  psuReceivedDate: string; // YYYY-MM-DD
  psuReceivedTime: string; // HH:mm (or HH:mm:ss)
  projectNumber: string;
  study: string;
  jobType: string;
  version: string;
  projects?: ProjectItem[];
  category: string;
  reason: string;
  remarks: string;
}

export interface AttachmentInfo {
  fileName: string;
  contentType: string;
  size: number;
  isPdf: boolean;
  base64Data?: string;
  screenshotDataUrl?: string; // High-res screenshot of the Page 1 Project Header & PROJECT DETAILS crop
  extractedTextSnippet?: string;
  projectNumber?: string;
  study?: string;
  region?: string;
  cityState?: string;
}

export interface EmailMetadata {
  fileName: string;
  subject: string;
  from: string;
  to: string;
  dateSentReceivedRaw?: string;
  dateMnl: string; // e.g. 2026-09-10
  timeMnl: string; // e.g. 16:45:00
  bodyTextPreview: string;
  attachments: AttachmentInfo[];
}

export interface ParseResult {
  success: boolean;
  metadata: EmailMetadata;
  extractedData: Partial<PsuFormData>;
  aiConfidence?: {
    overall: 'high' | 'medium' | 'low';
    notes?: string;
  };
  error?: string;
}

export interface SheetConfig {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  availableSheets: string[];
  spreadsheetTitle?: string;
  appsScriptUrl?: string;
}

export interface SheetEntryRow {
  rowNumber: number;
  emailAddress: string;
  timestampMnl: string;
  scheduler: string;
  region: string;
  psuReceivedDateMnl: string;
  psuReceivedTimeMnl: string;
  projectNumber: string;
  version: string;
  jobType: string;
  studyType: string;
  emailCategory: string;
  emailSubCategory: string;
  remarks: string;
}

export interface AppendResult {
  updatedRange: string;
  updatedRows: number;
  spreadsheetName?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sheetName?: string;
  rowNumber?: number;
  loggedProjects?: Array<{
    projectNumber: string;
    version: string;
    jobType?: string;
    study?: string;
    rowNumber?: number;
  }>;
}
