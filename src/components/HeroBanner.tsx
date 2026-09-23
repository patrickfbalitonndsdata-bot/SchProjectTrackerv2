import React from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  Sparkles,
  Zap,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';
import heroWorkspaceImg from '../assets/images/hero_workspace_bg_1790105338256.jpg';
import opsImg from '../assets/images/traffic_ops_card_1790102730492.jpg';
import sheetImg from '../assets/images/sheet_data_card_1790102743507.jpg';
import heroImg from '../assets/images/hero_banner_transport_1790102708525.jpg';
import { FIXED_SPREADSHEET_URL } from '../lib/sheetsApi';

interface HeroBannerProps {
  onLogPsuClick: () => void;
  onExploreSheetClick: () => void;
  onUploadClick: () => void;
  onViewRevisionsClick: () => void;
  appsScriptConnected: boolean;
  sheetUrl?: string;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  onLogPsuClick,
  onExploreSheetClick,
  onUploadClick,
  onViewRevisionsClick,
  appsScriptConnected,
  sheetUrl,
}) => {
  return (
    <section className="relative w-full overflow-hidden bg-neutral-950 text-white">
      {/* 1. Full Background Image with Integrated Multi-stop Fading Gradients */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <img
          src={heroWorkspaceImg}
          alt="PSU Tracking Operations Desk"
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover object-center transform scale-105 transition-transform duration-1000 opacity-60 filter contrast-125"
        />

        {/* Horizontal Gradient Overlay: Deep left for high typography contrast, smoothly fading right */}
        <div className="absolute inset-0 bg-gradient-to-r from-neutral-950 via-neutral-950/85 to-neutral-950/45" />

        {/* Ambient Top Subtle Vignette */}
        <div className="absolute top-0 inset-x-0 h-16 bg-gradient-to-b from-neutral-950/70 to-transparent" />

        {/* Bottom Seamless Gradient Fade: Melts directly into the page canvas (#F8F6F0) upon scrolling */}
        <div className="absolute bottom-0 inset-x-0 h-40 sm:h-56 bg-gradient-to-b from-transparent via-[#F8F6F0]/65 to-[#F8F6F0]" />
      </div>

      {/* Top Editorial Ribbon */}
      <div className="relative z-10 bg-neutral-950/80 backdrop-blur-xs text-neutral-300 px-4 sm:px-8 py-2.5 flex flex-wrap items-center justify-between text-[10px] sm:text-[11px] font-bold tracking-[0.2em] uppercase border-b border-white/10">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white">PRECISION TRAFFIC LOGISTICS &bull; ASIA PACIFIC</span>
          <span className="hidden md:inline text-neutral-400">&bull; REAL-TIME REVISION DISPATCH</span>
        </div>
        <div className="flex items-center space-x-4 text-neutral-300">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${appsScriptConnected ? 'bg-emerald-400' : 'bg-amber-400'}`} />
            {appsScriptConnected ? 'API SYNCHRONIZED' : 'API STANDBY'}
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 sm:pt-14 pb-20 sm:pb-28">
        <div className="max-w-2xl space-y-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 backdrop-blur-md text-white border border-white/15 rounded-full text-[10px] font-bold tracking-[0.25em] uppercase shadow-xs">
              <Sparkles className="w-3 h-3 text-[#DFC772]" />
              <span>PSU TRACKING AUTOMATION</span>
            </div>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-[-0.03em] text-white leading-[0.98] uppercase drop-shadow-xs">
              PROJECT LOGISTIC
              <br />
              <span className="text-neutral-300">AND TRACKER</span>
            </h1>

            <div className="w-14 h-1 bg-[#DFC772] mt-4 mb-3" />

            <p className="text-sm sm:text-base text-neutral-300 leading-relaxed font-normal max-w-lg drop-shadow-xs">
              Instant Outlook email extraction (.msg &amp; .eml), automated multi-project recognition, and direct real-time synchronization to your Google Sheet.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              id="hero-log-psu-btn"
              type="button"
              onClick={onLogPsuClick}
              className="px-7 py-3.5 bg-white hover:bg-neutral-100 active:bg-neutral-200 text-neutral-950 text-xs font-bold uppercase tracking-[0.2em] rounded-sm transition-all shadow-lg hover:shadow-xl active:scale-[0.98] flex items-center gap-2 group cursor-pointer"
            >
              <span>LOG PSU NOW</span>
              <ArrowRight className="w-3.5 h-3.5 text-neutral-950 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              id="hero-explore-sheet-btn"
              type="button"
              onClick={onExploreSheetClick}
              className="px-6 py-3.5 bg-neutral-900/60 hover:bg-neutral-900/90 text-white border border-white/20 hover:border-white/40 text-xs font-bold uppercase tracking-[0.2em] rounded-sm transition-all backdrop-blur-md active:scale-[0.98] flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#DFC772]" />
              <span>EXPLORE LIVE SHEET</span>
            </button>
          </div>

          {/* Quick Micro Status Badges */}
          <div className="pt-2 flex items-center gap-6 text-[11px] font-bold uppercase tracking-wider text-neutral-300">
            <div className="flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>100% OCR ACCURACY</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-[#DFC772]" />
              <span>ZERO-LATENCY SYNC</span>
            </div>
          </div>
        </div>

        {/* Floating Module Cards Over the Gradient Transition */}
        <div className="mt-12 sm:mt-16 grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {/* Card 1: Outlook Email Parser */}
          <div
            onClick={onUploadClick}
            className="group cursor-pointer bg-neutral-950/70 hover:bg-neutral-900/90 backdrop-blur-md border border-white/10 hover:border-white/25 p-4 sm:p-5 rounded-2xl transition-all flex items-center gap-4 shadow-md hover:shadow-xl"
          >
            <div className="w-16 h-20 sm:w-18 sm:h-22 rounded-xl overflow-hidden shrink-0 border border-white/15 bg-neutral-950">
              <img
                src={opsImg}
                alt="Outlook Email Parser"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover filter grayscale contrast-125 group-hover:scale-110 transition-transform duration-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#DFC772]">
                MODULE 01
              </div>
              <h3 className="font-display font-bold text-sm sm:text-base uppercase tracking-tight text-white group-hover:text-[#FDEDD4] transition-colors">
                EMAIL &amp; PDF PARSER
              </h3>
              <p className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                Automated extraction of projects, schedules &amp; targeted Page 1 OCR crop.
              </p>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-white flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                <span>START PARSING</span>
                <ArrowRight className="w-3 h-3 text-[#DFC772]" />
              </div>
            </div>
          </div>

          {/* Card 2: Live Sheet Mirror */}
          <div
            onClick={onExploreSheetClick}
            className="group cursor-pointer bg-neutral-950/70 hover:bg-neutral-900/90 backdrop-blur-md border border-white/10 hover:border-white/25 p-4 sm:p-5 rounded-2xl transition-all flex items-center gap-4 shadow-md hover:shadow-xl"
          >
            <div className="w-16 h-20 sm:w-18 sm:h-22 rounded-xl overflow-hidden shrink-0 border border-white/15 bg-neutral-950">
              <img
                src={sheetImg}
                alt="Google Sheet Mirror"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover filter grayscale contrast-125 group-hover:scale-110 transition-transform duration-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#DFC772]">
                MODULE 02
              </div>
              <h3 className="font-display font-bold text-sm sm:text-base uppercase tracking-tight text-white group-hover:text-[#FDEDD4] transition-colors">
                GOOGLE SHEET MIRROR
              </h3>
              <p className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                Direct 13-column bidirectional Apps Script reflection with instant metrics.
              </p>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-white flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                <span>OPEN MIRROR</span>
                <ArrowRight className="w-3 h-3 text-[#DFC772]" />
              </div>
            </div>
          </div>

          {/* Card 3: Re-PSU & Revision Monitor */}
          <div
            onClick={onViewRevisionsClick}
            className="group cursor-pointer bg-neutral-950/70 hover:bg-neutral-900/90 backdrop-blur-md border border-white/10 hover:border-white/25 p-4 sm:p-5 rounded-2xl transition-all flex items-center gap-4 shadow-md hover:shadow-xl"
          >
            <div className="w-16 h-20 sm:w-18 sm:h-22 rounded-xl overflow-hidden shrink-0 border border-white/15 bg-neutral-950">
              <img
                src={heroImg}
                alt="Re-PSU Revision Engine"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover object-bottom filter grayscale contrast-125 group-hover:scale-110 transition-transform duration-500"
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-bold tracking-[0.2em] uppercase text-[#DFC772]">
                MODULE 03
              </div>
              <h3 className="font-display font-bold text-sm sm:text-base uppercase tracking-tight text-white group-hover:text-[#FDEDD4] transition-colors">
                RE-PSU &amp; AUDIT LOGS
              </h3>
              <p className="text-xs text-neutral-400 mt-1 line-clamp-2 leading-relaxed">
                Smart version tracking (Initial, v1, v2+) with automated revision validation.
              </p>
              <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-white flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                <span>VIEW REVISIONS</span>
                <ArrowRight className="w-3 h-3 text-[#DFC772]" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
