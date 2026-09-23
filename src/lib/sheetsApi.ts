import { SheetEntryRow, PsuFormData, SheetConfig, AppendResult } from '../types';
import { getManilaNow } from './dateUtils';

export const FIXED_SPREADSHEET_ID = '1zJGQYdRbqcD6GlYmPO72sdgcZV4cob12KtgxnQy8Zxk';
export const FIXED_SHEET_NAME = 'Project Tracker';
export const FIXED_SPREADSHEET_URL = 'https://docs.google.com/spreadsheets/d/1zJGQYdRbqcD6GlYmPO72sdgcZV4cob12KtgxnQy8Zxk/edit';
export const FIXED_SPREADSHEET_TITLE = 'SCH - Project Tracker 2.0';
export const FIXED_APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycby7Jj8CsavEF9LBiTR4eg_Pl0tosLMqCfl7cUDLK7OStwCFF9TjwretZfVUOdRyr8TlcQ/exec';
export const STORAGE_KEY_APPS_SCRIPT_URL = 'psu_apps_script_web_app_url';

export const FIXED_SHEET_CONFIG: SheetConfig = {
  spreadsheetId: FIXED_SPREADSHEET_ID,
  spreadsheetUrl: FIXED_SPREADSHEET_URL,
  sheetName: FIXED_SHEET_NAME,
  availableSheets: [FIXED_SHEET_NAME],
  spreadsheetTitle: FIXED_SPREADSHEET_TITLE,
  appsScriptUrl: FIXED_APPS_SCRIPT_URL,
};

export const DEFAULT_HEADERS = [
  'Email Address',
  'Timestamp (MNL)',
  'Scheduler',
  'Region',
  'PSU Received Date (MNL)',
  'PSU Received Time (MNL)',
  'Project Number',
  'Version',
  'Job Type',
  'Study Type',
  'Email Category',
  'Email Sub-Category / Description',
  'Remarks',
];

/**
 * The Google Apps Script template code to paste into the Google Sheet's script editor.
 * (Extensions > Apps Script > Code.gs)
 */
export const APPS_SCRIPT_TEMPLATE_CODE = `/**
 * PSU Email Parser & Sheet Logger - Google Apps Script Web App API
 * 
 * Instructions:
 * 1. Open your target Google Sheet and go to: Extensions > Apps Script
 * 2. Delete any default code in "Code.gs", paste this entire script, and click Save (disk icon).
 * 3. Click "Deploy" (top right blue button) > "New deployment"
 *    (or "Manage deployments" > Edit > "New version" if updating).
 * 4. Select type: "Web app".
 * 5. Set Description to "PSU Sheet API".
 * 6. Set "Execute as": "Me" (your Google account).
 * 7. Set "Who has access": "Anyone"  <--- (CRITICAL: allows the app to append without user sign-in!)
 * 8. Click "Deploy", authorize permissions, and copy the Web App URL (ends in /exec).
 * 9. Paste that URL into the app's "Google Apps Script API" setup box!
 */

const HEADERS = [
  'Email Address',
  'Timestamp (MNL)',
  'Scheduler',
  'Region',
  'PSU Received Date (MNL)',
  'PSU Received Time (MNL)',
  'Project Number',
  'Version',
  'Job Type',
  'Study Type',
  'Email Category',
  'Email Sub-Category / Description',
  'Remarks'
];

/**
 * Resolves the target spreadsheet.
 * Supports opening by explicit Spreadsheet ID, Spreadsheet URL,
 * or defaults to the container spreadsheet.
 */
function getTargetSpreadsheet(payloadOrParams) {
  var targetId = "";
  var targetUrl = "";
  
  if (payloadOrParams) {
    targetId = (payloadOrParams.spreadsheetId || "").toString().trim();
    targetUrl = (payloadOrParams.spreadsheetUrl || "").toString().trim();
  }
  
  // 1. Try opening by explicit Spreadsheet ID
  if (targetId) {
    try {
      return SpreadsheetApp.openById(targetId);
    } catch (e1) {
      console.warn("Could not open spreadsheet by ID (" + targetId + "): " + e1);
    }
  }
  
  // 2. Try opening by explicit Spreadsheet URL
  if (targetUrl) {
    try {
      return SpreadsheetApp.openByUrl(targetUrl);
    } catch (e2) {
      console.warn("Could not open spreadsheet by URL: " + e2);
    }
  }
  
  // 3. Fallback to active container spreadsheet
  try {
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) return active;
  } catch (e3) {
    console.warn("No active container spreadsheet: " + e3);
  }
  
  throw new Error("Unable to access Google Sheet (ID: " + (targetId || "none") + "). Please verify the spreadsheet ID or ensure Apps Script is created via Extensions > Apps Script of the target sheet.");
}

/**
 * Finds or creates the target sheet tab (supports case-insensitive & trimmed matching)
 */
function getTargetSheet(ss, requestedSheetName) {
  var name = (requestedSheetName || "Project Tracker").toString().trim();
  
  // 1. Exact match
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  
  // 2. Case-insensitive & trimmed match
  var lower = name.toLowerCase();
  var allSheets = ss.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    if (allSheets[i].getName().trim().toLowerCase() === lower) {
      return allSheets[i];
    }
  }
  
  // 3. If not found, insert sheet with requested name
  try {
    sheet = ss.insertSheet(name);
  } catch (err) {
    sheet = allSheets[0];
  }
  
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || "ping";
  var params = (e && e.parameter) || {};
  var requestedSheetName = params.sheetName || "Project Tracker";

  if (action === "ping") {
    try {
      var ss = getTargetSpreadsheet(params);
      var allTabs = ss.getSheets().map(function(s) { return s.getName(); });
      var targetSheet = getTargetSheet(ss, requestedSheetName);

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: "Connected to Google Sheet: " + ss.getName(),
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        sheetName: targetSheet.getName(),
        sheetTabs: allTabs,
        totalRows: targetSheet.getLastRow(),
        activeSheetTitle: ss.getName()
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: err.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "getRecent") {
    try {
      var ss = getTargetSpreadsheet(params);
      var sheet = getTargetSheet(ss, requestedSheetName);
      var data = sheet.getDataRange().getValues();
      var rows = [];
      var limit = parseInt(params.limit || "40", 10);

      // Read from bottom (newest first), skip header row index 0
      for (var i = data.length - 1; i >= 1 && rows.length < limit; i--) {
        var r = data[i];
        rows.push({
          rowNumber: i + 1,
          emailAddress: r[0] ? r[0].toString() : "",
          timestampMnl: r[1] ? r[1].toString() : "",
          scheduler: r[2] ? r[2].toString() : "",
          region: r[3] ? r[3].toString() : "",
          psuReceivedDateMnl: r[4] ? r[4].toString() : "",
          psuReceivedTimeMnl: r[5] ? r[5].toString() : "",
          projectNumber: r[6] ? r[6].toString() : "",
          version: r[7] ? r[7].toString() : "",
          jobType: r[8] ? r[8].toString() : "",
          studyType: r[9] ? r[9].toString() : "",
          emailCategory: r[10] ? r[10].toString() : "",
          emailSubCategory: r[11] ? r[11].toString() : "",
          remarks: r[12] ? r[12].toString() : ""
        });
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        rows: rows,
        total: data.length > 1 ? data.length - 1 : 0,
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId(),
        sheetName: sheet.getName()
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: err.toString()
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  if (action === "getVersion") {
    try {
      var projectNumber = params.projectNumber || "";
      var region = (params.region || "").toString().trim().toLowerCase();
      var cleanProject = projectNumber.toString().trim().toLowerCase();
      var cleanPrjAlphaNum = cleanProject.replace(/[^a-z0-9]/g, "");

      var ss = getTargetSpreadsheet(params);
      var sheet = getTargetSheet(ss, requestedSheetName);
      var data = sheet.getDataRange().getValues();
      var count = 0;

      for (var j = 1; j < data.length; j++) {
        var cellVal = (data[j][6] || "").toString().trim().toLowerCase();
        if (
          cellVal === cleanProject ||
          cellVal.replace(/[^a-z0-9]/g, "") === cleanPrjAlphaNum
        ) {
          count++;
        }
      }

      var isSouthCentral = region === "south central";
      var nextVersion = "Initial";
      if (count === 0) {
        nextVersion = "Initial";
      } else if (isSouthCentral) {
        nextVersion = "v" + count;
      } else {
        nextVersion = "v" + (count + 1);
      }

      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        version: nextVersion,
        existingCount: count,
        spreadsheetName: ss.getName(),
        sheetName: sheet.getName()
      })).setMimeType(ContentService.MimeType.JSON);
    } catch (err) {
      return ContentService.createTextOutput(JSON.stringify({
        status: "error",
        message: err.toString(),
        version: "Initial",
        existingCount: 0
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    status: "unknown_action",
    action: action
  })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) || "{}";
    var payload = JSON.parse(raw);
    
    var ss = getTargetSpreadsheet(payload);
    var sheetName = payload.sheetName || "Project Tracker";
    var sheet = getTargetSheet(ss, sheetName);

    // Support multiple projects in one payload
    if (Array.isArray(payload.rows) && payload.rows.length > 0) {
      var addedRows = [];
      for (var r = 0; r < payload.rows.length; r++) {
        var rowItem = payload.rows[r];
        var rowVals = [
          rowItem.emailAddress || payload.emailAddress || "",
          rowItem.timestampMnl || payload.timestampMnl || "",
          rowItem.scheduler || payload.scheduler || "",
          rowItem.region || payload.region || "",
          rowItem.psuReceivedDate || payload.psuReceivedDate || "",
          rowItem.psuReceivedTime || payload.psuReceivedTime || "",
          rowItem.projectNumber || "",
          rowItem.version || "",
          rowItem.jobType || "",
          rowItem.study || "",
          rowItem.category || payload.category || "",
          rowItem.reason || payload.reason || "",
          rowItem.remarks || payload.remarks || "N/A"
        ];
        sheet.appendRow(rowVals);
        addedRows.push({
          projectNumber: rowItem.projectNumber || "",
          version: rowItem.version || "",
          jobType: rowItem.jobType || "",
          study: rowItem.study || "",
          rowNumber: sheet.getLastRow()
        });
      }
      var lastRow = sheet.getLastRow();
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        message: payload.rows.length + " project rows appended to " + sheet.getName() + " in " + ss.getName(),
        updatedRange: sheet.getName() + "!A" + (lastRow - payload.rows.length + 1) + ":M" + lastRow,
        updatedRows: payload.rows.length,
        rowNumber: lastRow,
        loggedProjects: addedRows,
        spreadsheetName: ss.getName(),
        spreadsheetId: ss.getId(),
        spreadsheetUrl: ss.getUrl(),
        sheetName: sheet.getName()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    var rowValues = [
      payload.emailAddress || "",
      payload.timestampMnl || "",
      payload.scheduler || "",
      payload.region || "",
      payload.psuReceivedDate || "",
      payload.psuReceivedTime || "",
      payload.projectNumber || "",
      payload.version || "",
      payload.jobType || "",
      payload.study || "",
      payload.category || "",
      payload.reason || "",
      payload.remarks || "N/A"
    ];

    sheet.appendRow(rowValues);
    var lastRow = sheet.getLastRow();

    return ContentService.createTextOutput(JSON.stringify({
      status: "success",
      message: "Row appended to " + sheet.getName() + " in " + ss.getName(),
      updatedRange: sheet.getName() + "!A" + lastRow + ":M" + lastRow,
      updatedRows: 1,
      rowNumber: lastRow,
      loggedProjects: [{
        projectNumber: payload.projectNumber || "",
        version: payload.version || "",
        jobType: payload.jobType || "",
        study: payload.study || "",
        rowNumber: lastRow
      }],
      spreadsheetName: ss.getName(),
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl(),
      sheetName: sheet.getName()
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

/**
 * Tests connection to the Google Apps Script Web App
 */
export async function testAppsScriptConnection(
  webAppUrl: string,
  spreadsheetId?: string,
  spreadsheetUrl?: string,
  sheetName?: string
): Promise<{
  ok: boolean;
  message: string;
  spreadsheetName?: string;
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  sheetTabs?: string[];
  activeSheetName?: string;
  isDynamicOpenSupported?: boolean;
}> {
  if (!webAppUrl || !webAppUrl.trim()) {
    return { ok: false, message: 'Apps Script URL is empty' };
  }

  try {
    const cleanUrl = webAppUrl.trim();
    let url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=ping`;
    if (spreadsheetId && spreadsheetId.trim()) {
      url += `&spreadsheetId=${encodeURIComponent(spreadsheetId.trim())}`;
    }
    if (spreadsheetUrl && spreadsheetUrl.trim()) {
      url += `&spreadsheetUrl=${encodeURIComponent(spreadsheetUrl.trim())}`;
    }
    if (sheetName && sheetName.trim()) {
      url += `&sheetName=${encodeURIComponent(sheetName.trim())}`;
    }

    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    
    if (!res.ok) {
      return { ok: false, message: `Server responded with HTTP ${res.status}` };
    }

    const json = await res.json();
    if (json.status === 'success') {
      return {
        ok: true,
        message: json.message || 'Connected successfully!',
        spreadsheetName: json.spreadsheetName || json.activeSheetTitle,
        spreadsheetId: json.spreadsheetId,
        spreadsheetUrl: json.spreadsheetUrl,
        sheetTabs: Array.isArray(json.sheetTabs) ? json.sheetTabs : undefined,
        activeSheetName: json.sheetName,
        isDynamicOpenSupported: Boolean(json.spreadsheetId),
      };
    }
    return { ok: false, message: json.message || 'Unexpected response status' };
  } catch (err: any) {
    return {
      ok: false,
      message: err?.message || 'Could not connect to Google Apps Script. Check URL and ensure "Who has access" is set to "Anyone".',
    };
  }
}

/**
 * Appends a row to the Google Sheet via the Apps Script Web App API
 * (Does NOT require user Google sign-in)
 */
export async function appendPsuEntryViaAppsScript(
  webAppUrl: string,
  sheetName: string,
  formData: PsuFormData,
  userEmail: string,
  spreadsheetId?: string,
  spreadsheetUrl?: string
): Promise<AppendResult> {
  const { fullTimestamp } = getManilaNow();

  const payload = {
    action: 'append',
    spreadsheetId: spreadsheetId || '',
    spreadsheetUrl: spreadsheetUrl || '',
    sheetName: sheetName || FIXED_SHEET_NAME,
    emailAddress: formData.emailAddress || userEmail || 'user@company.com',
    timestampMnl: fullTimestamp,
    scheduler: formData.scheduler || '',
    region: formData.region || '',
    psuReceivedDate: formData.psuReceivedDate || '',
    psuReceivedTime: formData.psuReceivedTime || '',
    projectNumber: formData.projectNumber || '',
    version: (formData.version && formData.version.toLowerCase() === 'initial' ? 'Initial' : formData.version) || 'Initial',
    jobType: formData.jobType || '',
    study: formData.study || '',
    category: formData.category || '',
    reason: formData.reason || '',
    remarks: formData.remarks?.trim() || 'N/A',
  };

  // 1. First try the server-side proxy which runs in Node.js (bypasses browser CORS, iframes, adblockers)
  try {
    const proxyRes = await fetch('/api/sheets/append', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        appsScriptUrl: webAppUrl.trim(),
        payload,
      }),
    });

    if (proxyRes.ok) {
      const result = await proxyRes.json();
      if (result.status === 'success') {
        return {
          updatedRange: result.updatedRange || `${sheetName || FIXED_SHEET_NAME}!A:M`,
          updatedRows: 1,
          spreadsheetName: result.spreadsheetName,
          spreadsheetId: result.spreadsheetId,
          spreadsheetUrl: result.spreadsheetUrl,
          sheetName: result.sheetName || sheetName || FIXED_SHEET_NAME,
          rowNumber: result.rowNumber,
        };
      } else if (result.message) {
        console.warn('Server proxy reported Sheets error:', result.message);
      }
    }
  } catch (proxyErr) {
    console.warn('Server proxy unavailable, attempting direct fetch:', proxyErr);
  }

  // 2. Fallback: Direct client-side fetch using text/plain to avoid CORS preflight
  const res = await fetch(webAppUrl.trim(), {
    method: 'POST',
    mode: 'cors',
    redirect: 'follow',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Google Apps Script API error (${res.status}): ${res.statusText}`);
  }

  const result = await res.json();
  if (result.status !== 'success') {
    throw new Error(result.message || 'Failed to append row via Google Apps Script API');
  }

  return {
    updatedRange: result.updatedRange || `${sheetName || FIXED_SHEET_NAME}!A:M`,
    updatedRows: 1,
    spreadsheetName: result.spreadsheetName,
    spreadsheetId: result.spreadsheetId,
    spreadsheetUrl: result.spreadsheetUrl,
    sheetName: result.sheetName || sheetName || FIXED_SHEET_NAME,
    rowNumber: result.rowNumber,
  };
}

/**
 * Reads recent entries via Google Apps Script Web App API
 */
export async function readRecentEntriesViaAppsScript(
  webAppUrl: string,
  sheetName: string,
  limit: number = 40,
  spreadsheetId?: string,
  spreadsheetUrl?: string
): Promise<SheetEntryRow[]> {
  const targetSheet = sheetName || FIXED_SHEET_NAME;

  // 1. Try server proxy first
  try {
    const proxyUrl = `/api/sheets/getRecent?appsScriptUrl=${encodeURIComponent(webAppUrl.trim())}&sheetName=${encodeURIComponent(
      targetSheet
    )}&limit=${limit}${spreadsheetId ? `&spreadsheetId=${encodeURIComponent(spreadsheetId.trim())}` : ''}`;
    const proxyRes = await fetch(proxyUrl);
    if (proxyRes.ok) {
      const result = await proxyRes.json();
      if (result.status === 'success' && Array.isArray(result.rows)) {
        return result.rows;
      }
    }
  } catch (proxyErr) {
    console.warn('Server proxy getRecent failed, trying direct fetch:', proxyErr);
  }

  // 2. Direct client-side fetch
  const cleanUrl = webAppUrl.trim();
  let url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=getRecent&sheetName=${encodeURIComponent(
    targetSheet
  )}&limit=${limit}`;

  if (spreadsheetId && spreadsheetId.trim()) {
    url += `&spreadsheetId=${encodeURIComponent(spreadsheetId.trim())}`;
  }
  if (spreadsheetUrl && spreadsheetUrl.trim()) {
    url += `&spreadsheetUrl=${encodeURIComponent(spreadsheetUrl.trim())}`;
  }

  const res = await fetch(url, { method: 'GET', redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Failed to fetch recent entries (${res.status})`);
  }

  const result = await res.json();
  if (result.status === 'success' && Array.isArray(result.rows)) {
    return result.rows;
  }
  return [];
}

/**
 * Formats the project version according to regional business rules:
 * - If Region is "South Central":
 *     0 prior entries -> "Initial"
 *     1 prior entry   -> "v1"
 *     2 prior entries -> "v2"
 *     3 prior entries -> "v3"
 *     ...
 * - For all other Regions:
 *     0 prior entries -> "initial"
 *     1 prior entry   -> "v2"
 *     2 prior entries -> "v3"
 *     3 prior entries -> "v4"
 *     ...
 */
export function formatProjectVersion(existingCount: number, region?: string): string {
  const isSouthCentral = (region || '').trim().toLowerCase() === 'south central';
  if (existingCount <= 0) {
    return 'Initial';
  }
  if (isSouthCentral) {
    return `v${existingCount}`;
  }
  return `v${existingCount + 1}`;
}

/**
 * Calculates project version via Google Apps Script Web App API
 */
export async function calculateProjectVersionViaAppsScript(
  webAppUrl: string,
  sheetName: string,
  projectNumber: string,
  spreadsheetId?: string,
  region?: string
): Promise<{ version: string; existingCount: number }> {
  if (!projectNumber || !projectNumber.trim() || !webAppUrl) {
    return { version: formatProjectVersion(0, region), existingCount: 0 };
  }

  try {
    const cleanUrl = webAppUrl.trim();
    let url = `${cleanUrl}${cleanUrl.includes('?') ? '&' : '?'}action=getVersion&sheetName=${encodeURIComponent(
      sheetName || FIXED_SHEET_NAME
    )}&projectNumber=${encodeURIComponent(projectNumber.trim())}`;

    if (region && region.trim()) {
      url += `&region=${encodeURIComponent(region.trim())}`;
    }
    if (spreadsheetId && spreadsheetId.trim()) {
      url += `&spreadsheetId=${encodeURIComponent(spreadsheetId.trim())}`;
    }

    const res = await fetch(url, { method: 'GET', redirect: 'follow' });
    if (!res.ok) {
      return { version: formatProjectVersion(0, region), existingCount: 0 };
    }

    const result = await res.json();
    if (result.status === 'success') {
      const existingCount = typeof result.existingCount === 'number' ? result.existingCount : 0;
      return {
        version: formatProjectVersion(existingCount, region),
        existingCount: existingCount,
      };
    }
    return { version: formatProjectVersion(0, region), existingCount: 0 };
  } catch (err) {
    console.warn('Apps Script auto version check notice:', err);
    return { version: formatProjectVersion(0, region), existingCount: 0 };
  }
}

/**
 * Unified appendPsuEntry:
 * Routes directly to Apps Script Web App API if appsScriptUrl is present.
 */
export async function appendPsuEntry(
  spreadsheetId: string,
  sheetName: string,
  formData: PsuFormData,
  userEmail: string,
  accessToken?: string | null,
  appsScriptUrl?: string | null,
  spreadsheetUrl?: string | null
): Promise<AppendResult> {
  if (appsScriptUrl && appsScriptUrl.trim()) {
    return appendPsuEntryViaAppsScript(
      appsScriptUrl,
      sheetName,
      formData,
      userEmail,
      spreadsheetId,
      spreadsheetUrl || undefined
    );
  }

  if (!accessToken) {
    throw new Error('Google Apps Script Web App API URL is required to save entries.');
  }

  // Direct Google Sheets API fallback (if access token provided)
  const { fullTimestamp } = getManilaNow();
  const rowValues = [
    formData.emailAddress || userEmail || '',
    fullTimestamp,
    formData.scheduler || '',
    formData.region || '',
    formData.psuReceivedDate || '',
    formData.psuReceivedTime || '',
    formData.projectNumber || '',
    formData.version || '',
    formData.jobType || '',
    formData.study || '',
    formData.category || '',
    formData.reason || '',
    formData.remarks?.trim() || 'N/A',
  ];

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(sheetName)}!A:M:append?valueInputOption=USER_ENTERED`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      range: `${sheetName}!A:M`,
      majorDimension: 'ROWS',
      values: [rowValues],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    let message = `Failed to append entry to Google Sheet (${res.status})`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed.error?.message) message = parsed.error.message;
    } catch {}
    throw new Error(message);
  }

  const result = await res.json();
  return {
    updatedRange: result.updates?.updatedRange || '',
    updatedRows: result.updates?.updatedRows || 1,
    spreadsheetId: spreadsheetId,
    sheetName: sheetName,
  };
}

/**
 * Appends multiple PSU project entries to Google Sheets.
 * Handles both single-project and multi-project submissions,
 * preserving compatibility with all Google Apps Script deployments.
 */
export async function appendPsuEntries(
  spreadsheetId: string,
  sheetName: string,
  formData: PsuFormData,
  userEmail: string,
  accessToken?: string | null,
  appsScriptUrl?: string | null,
  spreadsheetUrl?: string | null
): Promise<AppendResult> {
  const activeProjects = (formData.projects || []).filter((p) => p.projectNumber && p.projectNumber.trim());

  // Fallback to top-level project fields if no projects in array
  const projectList = activeProjects.length > 0
    ? activeProjects
    : [
        {
          id: 'proj-1',
          projectNumber: formData.projectNumber,
          study: formData.study,
          version: formData.version,
          jobType: formData.jobType,
        },
      ];

  const loggedProjects: Array<{
    projectNumber: string;
    version: string;
    jobType?: string;
    study?: string;
    rowNumber?: number;
  }> = [];

  let lastResult: AppendResult | null = null;
  let totalRows = 0;

  for (const proj of projectList) {
    const singleData: PsuFormData = {
      ...formData,
      projectNumber: proj.projectNumber,
      study: proj.study,
      version: proj.version,
      jobType: proj.jobType || formData.jobType,
    };

    const res = await appendPsuEntry(
      spreadsheetId,
      sheetName,
      singleData,
      userEmail,
      accessToken,
      appsScriptUrl,
      spreadsheetUrl
    );

    lastResult = res;
    totalRows += res.updatedRows || 1;
    loggedProjects.push({
      projectNumber: proj.projectNumber,
      version: proj.version,
      jobType: proj.jobType || formData.jobType,
      study: proj.study,
      rowNumber: res.rowNumber,
    });
  }

  return {
    updatedRange: lastResult?.updatedRange || '',
    updatedRows: totalRows,
    spreadsheetName: lastResult?.spreadsheetName,
    spreadsheetId: lastResult?.spreadsheetId || spreadsheetId,
    spreadsheetUrl: lastResult?.spreadsheetUrl,
    sheetName: lastResult?.sheetName || sheetName,
    rowNumber: lastResult?.rowNumber,
    loggedProjects,
  };
}


/**
 * Unified readRecentPsuEntries
 */
export async function readRecentPsuEntries(
  spreadsheetId: string,
  sheetName: string,
  accessToken?: string | null,
  limit: number = 30,
  appsScriptUrl?: string | null
): Promise<SheetEntryRow[]> {
  if (appsScriptUrl && appsScriptUrl.trim()) {
    return readRecentEntriesViaAppsScript(appsScriptUrl, sheetName, limit, spreadsheetId);
  }

  if (!accessToken || !spreadsheetId) {
    return [];
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    spreadsheetId
  )}/values/${encodeURIComponent(sheetName)}!A:M`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) return [];

  const data = await res.json();
  const rows: any[][] = data.values || [];
  if (rows.length <= 1) return [];

  const entries: SheetEntryRow[] = [];
  for (let i = rows.length - 1; i >= 1 && entries.length < limit; i--) {
    const r = rows[i];
    entries.push({
      rowNumber: i + 1,
      emailAddress: r[0] || '',
      timestampMnl: r[1] || '',
      scheduler: r[2] || '',
      region: r[3] || '',
      psuReceivedDateMnl: r[4] || '',
      psuReceivedTimeMnl: r[5] || '',
      projectNumber: r[6] || '',
      version: r[7] || '',
      jobType: r[8] || '',
      studyType: r[9] || '',
      emailCategory: r[10] || '',
      emailSubCategory: r[11] || '',
      remarks: r[12] || '',
    });
  }

  return entries;
}

/**
 * Unified calculateProjectVersion
 */
/**
 * Calculates the next version for a given Project Number:
 * - If Region is "South Central":
 *     0 prior entries -> "Initial"
 *     1 prior entry   -> "v1"
 *     2 prior entries -> "v2"
 *     3 prior entries -> "v3"
 *     ...
 * - For all other Regions:
 *     0 prior entries -> "initial"
 *     1 prior entry   -> "v2"
 *     2 prior entries -> "v3"
 *     3 prior entries -> "v4"
 *     ...
 */
export async function calculateProjectVersion(
  spreadsheetId: string,
  sheetName: string,
  projectNumber: string,
  accessToken?: string | null,
  appsScriptUrl?: string | null,
  fallbackEntries?: SheetEntryRow[],
  region?: string
): Promise<{ version: string; existingCount: number }> {
  if (!projectNumber || !projectNumber.trim()) {
    return { version: formatProjectVersion(0, region), existingCount: 0 };
  }

  const cleanProject = projectNumber.trim().toLowerCase();
  const cleanPrjAlphaNum = cleanProject.replace(/[^a-z0-9]/g, '');

  // 1. Try Google Apps Script Web App API
  if (appsScriptUrl && appsScriptUrl.trim()) {
    try {
      const res = await calculateProjectVersionViaAppsScript(appsScriptUrl, sheetName, projectNumber, spreadsheetId, region);
      return res;
    } catch (err) {
      console.warn('Apps Script version check notice:', err);
    }
  }

  // 2. Try Google Sheets API with OAuth token if present
  if (accessToken && spreadsheetId) {
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values/${encodeURIComponent(sheetName)}!G2:G`;

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (res.ok) {
        const data = await res.json();
        const rows: any[][] = data.values || [];
        let count = 0;

        for (const row of rows) {
          if (!row || !row[0]) continue;
          const cellVal = row[0].toString().trim().toLowerCase();
          if (
            cellVal === cleanProject ||
            cellVal.replace(/[^a-z0-9]/g, '') === cleanPrjAlphaNum
          ) {
            count++;
          }
        }

        const nextVersion = formatProjectVersion(count, region);
        return { version: nextVersion, existingCount: count };
      }
    } catch (err) {
      console.warn('Error calculating project version from sheet:', err);
    }
  }

  // 3. Fallback: check in-memory / locally cached entries
  if (fallbackEntries && fallbackEntries.length > 0) {
    let localCount = 0;
    for (const entry of fallbackEntries) {
      const p = (entry.projectNumber || '').trim().toLowerCase();
      if (p === cleanProject || p.replace(/[^a-z0-9]/g, '') === cleanPrjAlphaNum) {
        localCount++;
      }
    }
    const nextVersion = formatProjectVersion(localCount, region);
    return { version: nextVersion, existingCount: localCount };
  }

  return { version: formatProjectVersion(0, region), existingCount: 0 };
}

export interface SpreadsheetMetadata {
  spreadsheetId: string;
  title: string;
  sheets: {
    sheetId: number;
    title: string;
    index: number;
  }[];
}

export async function fetchSpreadsheetMetadata(
  spreadsheetId: string,
  accessToken: string
): Promise<SpreadsheetMetadata> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const errorText = await res.text();
    let message = `Failed to access spreadsheet (${res.status})`;
    try {
      const parsed = JSON.parse(errorText);
      if (parsed.error?.message) message = parsed.error.message;
    } catch {}
    throw new Error(message);
  }

  const data = await res.json();
  return {
    spreadsheetId: data.spreadsheetId || spreadsheetId,
    title: data.properties?.title || 'Google Sheet',
    sheets: (data.sheets || []).map((s: any) => ({
      sheetId: s.properties?.sheetId || 0,
      title: s.properties?.title || 'Sheet1',
      index: s.properties?.index || 0,
    })),
  };
}

export async function checkOrInitializeHeader(
  spreadsheetId: string,
  sheetName: string,
  accessToken: string
): Promise<boolean> {
  if (!accessToken || !spreadsheetId) return false;
  try {
    const getUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(sheetName)}!A1:M1`;
    const getRes = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (getRes.ok) {
      const data = await getRes.json();
      if (data.values && data.values.length > 0 && data.values[0].length > 0) {
        return true;
      }
    }

    // Initialize headers if empty
    const putUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(sheetName)}!A1:M1?valueInputOption=USER_ENTERED`;
    await fetch(putUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        range: `${sheetName}!A1:M1`,
        majorDimension: 'ROWS',
        values: [DEFAULT_HEADERS],
      }),
    });
    return true;
  } catch (err) {
    console.warn('Notice checking or writing header:', err);
    return false;
  }
}
