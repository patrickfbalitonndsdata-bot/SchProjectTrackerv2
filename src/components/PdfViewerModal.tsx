import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Copy,
  Check,
  Download,
  ExternalLink,
  Sparkles,
  Maximize2,
  Minimize2,
  RefreshCw,
  Search,
  CheckCircle2,
  Camera,
  ScanLine,
} from 'lucide-react';
import { AttachmentInfo } from '../types';
import { capturePage1HeaderScreenshot } from '../lib/pdfScreenshot';

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: AttachmentInfo | null;
  onUpdateExtracted?: (updated: {
    projectNumber?: string;
    study?: string;
    region?: string;
    cityState?: string;
    page1Text?: string;
  }) => void;
}

export const PdfViewerModal: React.FC<PdfViewerModalProps> = ({
  isOpen,
  onClose,
  attachment,
  onUpdateExtracted,
}) => {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'screenshot' | 'both' | 'pdf' | 'text'>('screenshot');
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [isScanningScreenshot, setIsScanningScreenshot] = useState(false);
  const [reExtractError, setReExtractError] = useState<string | null>(null);
  const [reExtractSuccess, setReExtractSuccess] = useState<string | null>(null);
  const [localSnippet, setLocalSnippet] = useState<string>('');
  const [localProjectNumber, setLocalProjectNumber] = useState<string>('');
  const [localStudy, setLocalStudy] = useState<string>('');
  const [localRegion, setLocalRegion] = useState<string>('');
  const [localCityState, setLocalCityState] = useState<string>('');
  const [localScreenshotUrl, setLocalScreenshotUrl] = useState<string>('');

  useEffect(() => {
    if (attachment) {
      setLocalSnippet(attachment.extractedTextSnippet || '');
      setLocalProjectNumber(attachment.projectNumber || '');
      setLocalStudy(attachment.study || '');
      setLocalRegion(attachment.region || '');
      setLocalCityState(attachment.cityState || '');
      setLocalScreenshotUrl(attachment.screenshotDataUrl || '');
      setReExtractError(null);
      setReExtractSuccess(null);

      // If screenshot hasn't been generated yet but binary is available, capture it
      if (!attachment.screenshotDataUrl && attachment.base64Data) {
        capturePage1HeaderScreenshot(attachment.base64Data, {
          cropHeightRatio: 0.46,
          cropWidthRatio: 0.62,
          cropXRatio: 0.0,
          cropYRatio: 0.0,
        })
          .then((res) => {
            if (res.screenshotDataUrl) {
              setLocalScreenshotUrl(res.screenshotDataUrl);
              attachment.screenshotDataUrl = res.screenshotDataUrl;
            }
          })
          .catch((e) => {
            console.warn('Auto capture screenshot failed in modal:', e);
          });
      }
    }
  }, [attachment]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !attachment) return null;

  const pdfDataUrl = attachment.base64Data
    ? `data:application/pdf;base64,${attachment.base64Data}`
    : '';

  const handleCopyText = async () => {
    if (!localSnippet) return;
    try {
      await navigator.clipboard.writeText(localSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = () => {
    if (!pdfDataUrl) return;
    const a = document.createElement('a');
    a.href = pdfDataUrl;
    a.download = attachment.fileName || 'attachment.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenNewTab = () => {
    if (!pdfDataUrl) return;
    // Create a blob URL to safely open in new tab
    try {
      const byteCharacters = atob(attachment.base64Data || '');
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch {
      window.open(pdfDataUrl, '_blank');
    }
  };

  const handleReExtractWithGemini = async () => {
    if (!attachment.base64Data) {
      setReExtractError('PDF binary data not available for re-extraction.');
      return;
    }

    setIsReExtracting(true);
    setReExtractError(null);
    setReExtractSuccess(null);

    try {
      const res = await fetch('/api/extract-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          base64: attachment.base64Data,
          fileName: attachment.fileName,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.page1Text) setLocalSnippet(data.page1Text);
        if (data.projectNumber) setLocalProjectNumber(data.projectNumber);
        if (data.study) setLocalStudy(data.study);
        if (data.region || data.cityState) setLocalRegion(data.region || data.cityState);

        setReExtractSuccess('Successfully re-read and extracted Page 1 with AI!');
        if (onUpdateExtracted) {
          onUpdateExtracted({
            projectNumber: data.projectNumber,
            study: data.study,
            region: data.region || data.cityState,
            page1Text: data.page1Text,
          });
        }
      } else {
        setReExtractError(data.error || 'Failed to re-extract PDF.');
      }
    } catch (err: any) {
      setReExtractError(err.message || 'Error communicating with extraction server.');
    } finally {
      setIsReExtracting(false);
    }
  };

  const handleScanScreenshotCrop = async () => {
    let shotImg = localScreenshotUrl;
    if (!shotImg && attachment.base64Data) {
      try {
        const shot = await capturePage1HeaderScreenshot(attachment.base64Data, {
          cropHeightRatio: 0.46,
          cropWidthRatio: 0.62,
          cropXRatio: 0.0,
          cropYRatio: 0.0,
        });
        shotImg = shot.screenshotDataUrl;
        setLocalScreenshotUrl(shotImg);
      } catch (err: any) {
        setReExtractError('Failed to capture Page 1 screenshot from PDF: ' + err.message);
        return;
      }
    }

    if (!shotImg) {
      setReExtractError('No screenshot available to scan. Please ensure the PDF file is loaded.');
      return;
    }

    setIsScanningScreenshot(true);
    setReExtractError(null);
    setReExtractSuccess(null);

    try {
      const res = await fetch('/api/extract-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: shotImg,
          fileName: attachment.fileName,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        if (data.projectNumber) setLocalProjectNumber(data.projectNumber);
        if (data.study) setLocalStudy(data.study);
        if (data.region) setLocalRegion(data.region);
        if (data.cityState) setLocalCityState(data.cityState);
        if (data.verbatimText) setLocalSnippet(data.verbatimText);

        setReExtractSuccess('Successfully scanned Project Number & Study Type from Header Screenshot!');
        if (onUpdateExtracted) {
          onUpdateExtracted({
            projectNumber: data.projectNumber,
            study: data.study,
            region: data.region || data.cityState,
            cityState: data.cityState,
            page1Text: data.verbatimText || localSnippet,
          });
        }
      } else {
        setReExtractError(data.error || 'Failed to scan text from screenshot.');
      }
    } catch (err: any) {
      setReExtractError(err.message || 'Error communicating with screenshot OCR server.');
    } finally {
      setIsScanningScreenshot(false);
    }
  };

  return (
    <div
      id="pdf-viewer-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-neutral-900/80 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        id="pdf-viewer-modal"
        className="bg-white border border-neutral-200 rounded-2xl w-full max-w-6xl h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 flex flex-wrap items-center justify-between gap-3 bg-neutral-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <span className="p-2 bg-rose-100 text-rose-700 rounded-xl shrink-0">
              <FileText className="w-5 h-5" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-neutral-900 truncate">
                  {attachment.fileName}
                </h3>
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-800 border border-blue-200 rounded-md shrink-0 flex items-center gap-1">
                  <Camera className="w-2.5 h-2.5 text-blue-600" /> Header Crop
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-neutral-500 mt-0.5 flex-wrap">
                <span>{Math.round(attachment.size / 1024)} KB</span>
                {localProjectNumber && (
                  <>
                    <span>•</span>
                    <span className="font-mono font-bold text-neutral-800 bg-neutral-100 px-1.5 py-0.2 rounded">
                      Project: {localProjectNumber}
                    </span>
                  </>
                )}
                {localStudy && (
                  <>
                    <span>•</span>
                    <span className="font-bold text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                      Study: {localStudy}
                    </span>
                  </>
                )}
                {localRegion && (
                  <>
                    <span>•</span>
                    <span className="text-neutral-700">Region: {localRegion}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="hidden sm:flex items-center bg-neutral-200/70 p-0.5 rounded-lg text-xs font-medium text-neutral-700">
              <button
                type="button"
                onClick={() => setActiveTab('screenshot')}
                className={`px-2.5 py-1 rounded-md transition-all flex items-center gap-1 ${
                  activeTab === 'screenshot' ? 'bg-white shadow-2xs text-neutral-900 font-semibold' : 'hover:text-neutral-900'
                }`}
              >
                <Camera className="w-3 h-3 text-blue-600" />
                <span>Screenshot Crop</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('both')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  activeTab === 'both' ? 'bg-white shadow-2xs text-neutral-900 font-semibold' : 'hover:text-neutral-900'
                }`}
              >
                Split View
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pdf')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  activeTab === 'pdf' ? 'bg-white shadow-2xs text-neutral-900 font-semibold' : 'hover:text-neutral-900'
                }`}
              >
                Full PDF
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('text')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  activeTab === 'text' ? 'bg-white shadow-2xs text-neutral-900 font-semibold' : 'hover:text-neutral-900'
                }`}
              >
                Extracted Text
              </button>
            </div>

            {/* Scan Screenshot Crop Button */}
            <button
              type="button"
              onClick={handleScanScreenshotCrop}
              disabled={isScanningScreenshot}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
              title="Scan Project Number & Study Type from the Page 1 Screenshot Crop"
            >
              <ScanLine className={`w-3.5 h-3.5 ${isScanningScreenshot ? 'animate-spin' : ''}`} />
              <span>{isScanningScreenshot ? 'Scanning Crop...' : 'Scan Screenshot'}</span>
            </button>

            {/* Re-read with AI */}
            <button
              type="button"
              onClick={handleReExtractWithGemini}
              disabled={isReExtracting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors disabled:opacity-50"
              title="Full Page 1 multimodal re-read"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isReExtracting ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">{isReExtracting ? 'Reading...' : 'Full Page OCR'}</span>
            </button>

            {pdfDataUrl && (
              <>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-lg transition-colors"
                  title="Download PDF"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleOpenNewTab}
                  className="p-1.5 text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-lg transition-colors"
                  title="Open PDF in new browser tab"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-200/60 rounded-lg transition-colors"
              title="Close viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Feedback banners */}
        {reExtractSuccess && (
          <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{reExtractSuccess}</span>
          </div>
        )}
        {reExtractError && (
          <div className="px-5 py-2 bg-rose-50 border-b border-rose-200 text-rose-800 text-xs flex items-center gap-2">
            <X className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{reExtractError}</span>
          </div>
        )}

        {/* Mobile View Toggle */}
        <div className="sm:hidden px-4 py-2 border-b border-neutral-200 bg-neutral-50 flex items-center justify-center gap-2 text-xs font-medium flex-wrap">
          <button
            type="button"
            onClick={() => setActiveTab('screenshot')}
            className={`px-3 py-1 rounded-md ${activeTab === 'screenshot' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
          >
            Screenshot
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('pdf')}
            className={`px-3 py-1 rounded-md ${activeTab === 'pdf' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
          >
            Full PDF
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('text')}
            className={`px-3 py-1 rounded-md ${activeTab === 'text' ? 'bg-neutral-900 text-white' : 'text-neutral-600'}`}
          >
            Extracted Text
          </button>
        </div>

        {/* Body Split / Content Area */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden bg-neutral-100">
          {/* Screenshot View Tab */}
          {activeTab === 'screenshot' && (
            <>
              {/* Left Column: The Screenshot Printshot */}
              <div className="md:col-span-8 h-full flex flex-col bg-neutral-900 overflow-hidden border-r border-neutral-200">
                <div className="px-4 py-2 bg-neutral-800/90 border-b border-neutral-700 flex items-center justify-between text-xs text-neutral-300">
                  <span className="flex items-center gap-1.5 font-semibold text-white">
                    <Camera className="w-3.5 h-3.5 text-blue-400" />
                    Page 1 Targeted Screenshot (Project # &amp; Study Section)
                  </span>
                  <span className="text-[11px] font-mono text-blue-300 bg-blue-950/60 px-2 py-0.5 rounded border border-blue-800">
                    Project # &amp; Study Type Crop
                  </span>
                </div>
                <div className="flex-1 p-4 flex items-center justify-center overflow-auto bg-neutral-950/80">
                  {localScreenshotUrl ? (
                    <div className="max-w-full max-h-full rounded-lg overflow-hidden border border-neutral-700 shadow-2xl bg-white">
                      <img
                        src={localScreenshotUrl}
                        alt="Header screenshot crop"
                        className="max-w-full max-h-[72vh] object-contain block mx-auto"
                      />
                    </div>
                  ) : (
                    <div className="text-center p-8 text-neutral-400">
                      <Camera className="w-12 h-12 mx-auto mb-3 opacity-40 text-neutral-300" />
                      <p className="text-sm font-semibold text-white">Capturing Screenshot Crop...</p>
                      <p className="text-xs text-neutral-400 mt-1">Rendering Page 1 top crop from PDF buffer.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Scanned metadata and OCR values */}
              <div className="md:col-span-4 h-full flex flex-col bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between">
                  <span className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                    <ScanLine className="w-3.5 h-3.5 text-blue-600" />
                    Values Scanned From Screenshot
                  </span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded">
                    OCR Active
                  </span>
                </div>

                <div className="p-4 space-y-3 overflow-y-auto flex-1">
                  <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                    <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                      Project Number
                    </span>
                    <div className="text-lg font-mono font-bold text-neutral-900 mt-0.5">
                      {localProjectNumber || <span className="text-neutral-400 text-sm font-normal italic">None detected</span>}
                    </div>
                  </div>

                  <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200">
                    <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider">
                      Study / Study Type (From PROJECT DETAILS)
                    </span>
                    <div className="text-base font-bold text-amber-950 mt-0.5">
                      {localStudy || <span className="text-neutral-400 text-sm font-normal italic">None detected</span>}
                    </div>
                  </div>

                  {localRegion && (
                    <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                        Region / Market
                      </span>
                      <div className="text-sm font-semibold text-neutral-800 mt-0.5">
                        {localRegion}
                      </div>
                    </div>
                  )}

                  {localCityState && (
                    <div className="bg-neutral-50 p-3 rounded-xl border border-neutral-200">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">
                        City, State
                      </span>
                      <div className="text-sm font-semibold text-neutral-800 mt-0.5">
                        {localCityState}
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleScanScreenshotCrop}
                      disabled={isScanningScreenshot}
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
                    >
                      <ScanLine className={`w-3.5 h-3.5 ${isScanningScreenshot ? 'animate-spin' : ''}`} />
                      <span>{isScanningScreenshot ? 'Extracting with Gemini Vision...' : 'Re-scan Screenshot With AI'}</span>
                    </button>
                  </div>

                  {/* Verbatim lines from crop */}
                  {localSnippet && (
                    <div className="mt-3">
                      <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider block mb-1">
                        Verbatim Text in Screenshot
                      </span>
                      <pre className="text-[11px] font-mono p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg max-h-48 overflow-y-auto whitespace-pre-wrap text-neutral-700 leading-relaxed select-text">
                        {localSnippet}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Bottom apply */}
                {onUpdateExtracted && (
                  <div className="p-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-neutral-500">Apply to PSU form</span>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdateExtracted({
                          projectNumber: localProjectNumber,
                          study: localStudy,
                          region: localRegion,
                          cityState: localCityState,
                          page1Text: localSnippet,
                        });
                        onClose();
                      }}
                      className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                    >
                      Apply &amp; Close
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Full PDF Embed / Split View */}
          {(activeTab === 'both' || activeTab === 'pdf') && (
            <div
              className={`${
                activeTab === 'both' ? 'md:col-span-7 border-r border-neutral-200' : 'md:col-span-12'
              } h-full flex flex-col bg-neutral-200/50 relative overflow-hidden`}
            >
              {pdfDataUrl ? (
                <iframe
                  id="pdf-embed-frame"
                  src={`${pdfDataUrl}#page=1&view=FitH`}
                  title={attachment.fileName}
                  className="w-full h-full border-0 bg-neutral-200"
                />
              ) : localScreenshotUrl ? (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center bg-neutral-900">
                  <img src={localScreenshotUrl} alt="Screenshot preview" className="max-h-96 object-contain rounded border border-neutral-700" />
                  <p className="text-xs text-neutral-300 mt-2">Showing Page 1 Screenshot Crop</p>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-neutral-500">
                  <FileText className="w-12 h-12 text-neutral-400 mb-2" />
                  <p className="text-sm font-semibold text-neutral-700">PDF Preview Not Available</p>
                  <p className="text-xs text-neutral-400 max-w-sm mt-1">
                    The PDF binary buffer was not retained in browser memory.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Extracted Text Column in Split View / Text Tab */}
          {(activeTab === 'both' || activeTab === 'text') && (
            <div
              className={`${
                activeTab === 'both' ? 'md:col-span-5' : 'md:col-span-12'
              } h-full flex flex-col bg-white overflow-hidden`}
            >
              {/* Toolbar */}
              <div className="px-4 py-2.5 border-b border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800">
                  <FileText className="w-3.5 h-3.5 text-neutral-500" />
                  <span>Page 1 Extracted Text</span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyText}
                  className="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:text-neutral-900 px-2 py-1 bg-white border border-neutral-200 hover:bg-neutral-50 rounded-md shadow-2xs transition-colors"
                  title="Copy full text to clipboard"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      <span className="text-emerald-700 font-semibold">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 text-neutral-500" />
                      <span>Copy Text</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Key Field Highlights Bar */}
              <div className="p-3 border-b border-neutral-100 bg-neutral-50/50 grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white p-2 rounded-lg border border-neutral-200 shadow-2xs">
                  <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                    Project Number
                  </div>
                  <div className="text-xs font-bold text-neutral-900 font-mono mt-0.5 truncate">
                    {localProjectNumber || '(Not detected)'}
                  </div>
                </div>

                <div className="bg-white p-2 rounded-lg border border-neutral-200 shadow-2xs">
                  <div className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">
                    Study / Study Type
                  </div>
                  <div className="text-xs font-bold text-neutral-900 mt-0.5 truncate">
                    {localStudy || '(Not detected)'}
                  </div>
                </div>
              </div>

              {/* Verbatim Monospace Content */}
              <div className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-relaxed text-neutral-800 select-text whitespace-pre-wrap bg-white">
                {localSnippet ? (
                  localSnippet
                ) : (
                  <div className="text-neutral-400 italic py-8 text-center">
                    No text extracted from this PDF. Click &quot;Scan Screenshot&quot; above to scan directly.
                  </div>
                )}
              </div>

              {/* Bottom apply bar if update callback provided */}
              {onUpdateExtracted && (
                <div className="p-3 border-t border-neutral-200 bg-neutral-50 flex items-center justify-between gap-2">
                  <span className="text-[11px] text-neutral-500">
                    Apply detected values to form
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateExtracted({
                        projectNumber: localProjectNumber,
                        study: localStudy,
                        region: localRegion,
                        cityState: localCityState,
                        page1Text: localSnippet,
                      });
                      onClose();
                    }}
                    className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-semibold shadow-2xs transition-colors"
                  >
                    Apply &amp; Close
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
