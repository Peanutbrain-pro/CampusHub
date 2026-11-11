/**
 * @file PdfOptimizerModal.tsx
 * @description Local PDF viewer & compression studio modal.
 *              Maximizes visual preview canvas area, automatically preserves vector text,
 *              and provides smooth 2D drag-to-pan & zoom controls.
 * @owner Communities Team
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Split,
  Eye,
  Move,
} from "lucide-react";
import {
  COMPRESSION_PRESETS,
  DEFAULT_MAX_DIMENSION,
  DEFAULT_QUALITY,
  getPdfDocument,
  inspectPdfDocument,
  renderPagePreviewDataUrl,
  compressPdf,
  estimateDocumentSize,
  type CompressionProgress,
  type CompressionOptions,
  type PdfAnalysis,
} from "../utils/pdfCompressor";

interface PdfOptimizerModalProps {
  isOpen: boolean;
  file: File | null;
  onClose: () => void;
  onApply: (compressedFile: File, stats: { originalSize: number; compressedSize: number }) => void;
}

type ViewMode = "split" | "single";
type ActivePreviewTab = "compressed" | "original";

export function PdfOptimizerModal({
  isOpen,
  file,
  onClose,
  onApply,
}: PdfOptimizerModalProps) {
  // Document state
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [numPages, setNumPages] = useState<number>(1);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(false);
  const [docLoadError, setDocLoadError] = useState<string | null>(null);
  const [pdfAnalysis, setPdfAnalysis] = useState<PdfAnalysis | null>(null);

  // Compression settings
  const [activePresetId, setActivePresetId] = useState<string>("balanced");
  const [quality, setQuality] = useState<number>(DEFAULT_QUALITY);
  const [maxDimension, setMaxDimension] = useState<number>(DEFAULT_MAX_DIMENSION);
  const [grayscale, setGrayscale] = useState<boolean>(false);
  const [showCustomSliders, setShowCustomSliders] = useState<boolean>(false);

  // Live preview state
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [compressedPreviewUrl, setCompressedPreviewUrl] = useState<string | null>(null);
  const [isRenderingPreview, setIsRenderingPreview] = useState<boolean>(false);

  // Document-wide stable size estimate (independent of currentPage)
  const [docEstimate, setDocEstimate] = useState<{ totalBytes: number; savingsPercent: number }>({
    totalBytes: file?.size || 0,
    savingsPercent: 0,
  });

  // Viewer controls: 2D Pan & Zoom
  const [viewMode, setViewMode] = useState<ViewMode>("single");
  const [singleTab, setSingleTab] = useState<ActivePreviewTab>("compressed");
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isWheeling, setIsWheeling] = useState<boolean>(false);

  // Compression processing
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const [compressionProgress, setCompressionProgress] = useState<CompressionProgress | null>(null);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const estimateDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const initialPanRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // 1. Load Document when modal opens
  useEffect(() => {
    if (!isOpen || !file) {
      setPdfDoc(null);
      setOriginalPreviewUrl(null);
      setCompressedPreviewUrl(null);
      setPdfAnalysis(null);
      setZoomScale(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    let isMounted = true;
    setIsLoadingDoc(true);
    setDocLoadError(null);
    setCurrentPage(1);
    setZoomScale(1);
    setPan({ x: 0, y: 0 });

    Promise.all([
      getPdfDocument(file),
      inspectPdfDocument(file).catch(() => null),
    ])
      .then(([{ pdfDoc: loadedDoc, numPages: totalPages }, analysis]) => {
        if (!isMounted) return;
        setPdfDoc(loadedDoc);
        setNumPages(totalPages);
        setPdfAnalysis(analysis);
        setIsLoadingDoc(false);
      })
      .catch((err) => {
        if (!isMounted) return;
        console.error("Failed to load PDF locally:", err);
        setDocLoadError(err.message || "Failed to parse PDF document.");
        setIsLoadingDoc(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, file]);

  // 2. Compute Stable Document-Wide Size Estimate (does NOT jump on page turns)
  useEffect(() => {
    if (!file) return;

    if (estimateDebounceRef.current) {
      clearTimeout(estimateDebounceRef.current);
    }

    estimateDebounceRef.current = setTimeout(() => {
      estimateDocumentSize(file, pdfAnalysis, {
        quality,
        maxDimension,
        grayscale,
      })
        .then(setDocEstimate)
        .catch(() => {
          setDocEstimate({ totalBytes: file.size, savingsPercent: 0 });
        });
    }, 150);

    return () => {
      if (estimateDebounceRef.current) clearTimeout(estimateDebounceRef.current);
    };
  }, [file, pdfAnalysis, quality, maxDimension, grayscale]);

  // 3. Render Page Previews (High-fidelity vector text, compresses only images)
  const renderPreviews = useCallback(
    async (pageNumber: number, options: CompressionOptions) => {
      if (!pdfDoc) return;
      setIsRenderingPreview(true);

      try {
        const origResult = await renderPagePreviewDataUrl(
          pdfDoc,
          pageNumber,
          { maxDimension: 2048, quality: 0.95, grayscale: false },
          false
        );
        setOriginalPreviewUrl(origResult.dataUrl);

        // Compressed preview: if page has no images, stays pure vector without JPEG ringing
        const compResult = await renderPagePreviewDataUrl(
          pdfDoc,
          pageNumber,
          options,
          true
        );
        setCompressedPreviewUrl(compResult.dataUrl);
      } catch (err) {
        console.error("Preview rendering error:", err);
      } finally {
        setIsRenderingPreview(false);
      }
    },
    [pdfDoc]
  );

  useEffect(() => {
    if (!pdfDoc) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      renderPreviews(currentPage, { quality, maxDimension, grayscale });
    }, 100);

    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    };
  }, [pdfDoc, currentPage, quality, maxDimension, grayscale, renderPreviews]);

  // 4. Smooth 2D Pan and Wheel Zoom Listener
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      setIsWheeling(true);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
      wheelTimeoutRef.current = setTimeout(() => setIsWheeling(false), 120);

      if (e.ctrlKey) {
        const zoomFactor = Math.exp(-e.deltaY * 0.005);
        setZoomScale((prev) => {
          const next = Math.min(Math.max(Number((prev * zoomFactor).toFixed(3)), 0.5), 4);
          if (next <= 1) setPan({ x: 0, y: 0 });
          return next;
        });
      } else {
        if (zoomScale > 1) {
          setPan((prev) => ({
            x: prev.x - e.deltaX,
            y: prev.y - e.deltaY,
          }));
        } else if (e.deltaY < 0) {
          setZoomScale((prev) => Math.min(Number((prev + 0.2).toFixed(2)), 4));
        } else if (e.deltaY > 0) {
          setZoomScale((prev) => {
            const next = Math.max(Number((prev - 0.2).toFixed(2)), 0.5);
            if (next <= 1) setPan({ x: 0, y: 0 });
            return next;
          });
        }
      }
    };

    viewport.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", handleWheel);
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    };
  }, [zoomScale]);

  // Mouse Drag to Pan
  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoomScale <= 1 && e.button !== 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    initialPanRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: initialPanRef.current.x + dx,
      y: initialPanRef.current.y + dy,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleDoubleClick = () => {
    if (zoomScale > 1) {
      setZoomScale(1);
      setPan({ x: 0, y: 0 });
    } else {
      setZoomScale(1.75);
    }
  };

  // Preset Selection
  const handleSelectPreset = (presetId: string) => {
    const preset = COMPRESSION_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setActivePresetId(preset.id);
    setQuality(preset.quality);
    setMaxDimension(preset.maxDimension);
    setGrayscale(preset.grayscale);
  };

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${Math.round(bytes / 1024)} KB`;
  };

  // Execute full client-side compression
  const handleApply = async () => {
    if (!file || isCompressing) return;

    try {
      setIsCompressing(true);
      setCompressionProgress({ percent: 0, step: "Compressing..." });

      const result = await compressPdf(
        file,
        { quality, maxDimension, grayscale },
        (progress) => setCompressionProgress(progress)
      );

      onApply(result.file, {
        originalSize: result.originalBytes,
        compressedSize: result.compressedBytes,
      });
      onClose();
    } catch (err: any) {
      console.error("Compression execution failed:", err);
    } finally {
      setIsCompressing(false);
      setCompressionProgress(null);
    }
  };

  if (!isOpen) return null;

  const originalBytes = file?.size || 0;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !isCompressing && onClose()}>
      <DialogContent className="max-w-5xl! w-[95vw] h-[92vh] max-h-[92vh] p-0 flex flex-col gap-0 overflow-hidden bg-background border shadow-2xl">
        {/* Minimal Header (Single Line) */}
        <DialogHeader className="px-5 py-2.5 border-b shrink-0 flex flex-row items-center justify-between space-y-0 bg-muted/20">
          <div className="flex items-center gap-2.5">
            <Sparkles className="h-4 w-4 text-primary" />
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <span className="truncate max-w-xs sm:max-w-md">{file?.name || "Document"}</span>
              {file && (
                <Badge variant="outline" className="text-[11px] font-normal px-2 py-0">
                  {formatSize(originalBytes)}
                </Badge>
              )}
              {numPages > 0 && (
                <Badge variant="secondary" className="text-[11px] font-normal px-2 py-0">
                  {numPages} {numPages === 1 ? "page" : "pages"}
                </Badge>
              )}
            </DialogTitle>
          </div>
        </DialogHeader>

        {/* Compact Single-Row Controls Bar */}
        <div className="px-5 py-2 border-b bg-card/60 flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs">
          {/* Presets & Custom Sliders Button */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-muted-foreground mr-1">Preset:</span>
            {COMPRESSION_PRESETS.map((preset) => {
              const isSelected = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectPreset(preset.id)}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all cursor-pointer border ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-xs"
                      : "bg-background text-muted-foreground hover:text-foreground border-border hover:bg-muted/50"
                  }`}
                  title={preset.description}
                >
                  {preset.shortLabel}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowCustomSliders(!showCustomSliders)}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all cursor-pointer border flex items-center gap-1.5 ${
                showCustomSliders
                  ? "bg-secondary text-foreground border-primary/50"
                  : "bg-background text-muted-foreground hover:text-foreground border-border"
              }`}
            >
              <Sliders className="h-3 w-3" />
              <span>Sliders</span>
            </button>
          </div>

          {/* Stable Document-Wide Size Metric */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-muted/50 border px-2.5 py-1 rounded-md">
              <span className="text-muted-foreground text-[11px]">Est. Total:</span>
              <span className="font-semibold text-foreground">
                ~{formatSize(docEstimate.totalBytes)}
              </span>
              {docEstimate.savingsPercent > 0 && (
                <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1 rounded">
                  -{docEstimate.savingsPercent}%
                </span>
              )}
            </div>

            {docEstimate.totalBytes <= 5 * 1024 * 1024 ? (
              <Badge variant="outline" className="text-[11px] text-emerald-600 border-emerald-500/30 gap-1 bg-emerald-500/5">
                <CheckCircle2 className="h-3 w-3" />
                Fits &lt; 5 MB
              </Badge>
            ) : (
              <Badge variant="destructive" className="text-[11px] gap-1">
                <AlertTriangle className="h-3 w-3" />
                Exceeds 5 MB
              </Badge>
            )}
          </div>
        </div>

        {/* Collapsible Sliders Drawer (Only when clicked) */}
        {showCustomSliders && (
          <div className="px-5 py-2 border-b bg-card/40 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs shrink-0">
            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Quality</span>
                <span className="font-semibold text-foreground">{Math.round(quality * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.15"
                max="0.95"
                step="0.01"
                value={quality}
                onChange={(e) => {
                  setActivePresetId("custom");
                  setQuality(parseFloat(e.target.value));
                }}
                className="w-full accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
              />
            </div>

            <div className="flex flex-col gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Max Resolution</span>
                <span className="font-semibold text-foreground">{maxDimension}px</span>
              </div>
              <input
                type="range"
                min="800"
                max="2200"
                step="50"
                value={maxDimension}
                onChange={(e) => {
                  setActivePresetId("custom");
                  setMaxDimension(parseInt(e.target.value, 10));
                }}
                className="w-full accent-primary h-1.5 bg-secondary rounded-lg cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-start gap-2 pt-2 md:pt-0">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] font-medium text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  checked={grayscale}
                  onChange={(e) => {
                    setActivePresetId("custom");
                    setGrayscale(e.target.checked);
                  }}
                  className="accent-primary rounded h-3.5 w-3.5"
                />
                <span>Monochrome (Grayscale)</span>
              </label>
            </div>
          </div>
        )}

        {/* Slim Floating Toolbar for Navigation & Zoom */}
        <div className="px-5 py-1.5 border-b bg-muted/10 flex items-center justify-between gap-2 shrink-0 text-xs">
          {/* Page Navigation */}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1 || isCompressing}
              className="h-6 w-6 p-0"
            >
              <ChevronLeft className="h-3 w-3" />
            </Button>
            <span className="text-[11px] font-medium px-1 text-muted-foreground">
              Page <span className="text-foreground font-semibold">{currentPage}</span> of{" "}
              <span className="text-foreground font-semibold">{numPages}</span>
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))}
              disabled={currentPage >= numPages || isCompressing}
              className="h-6 w-6 p-0"
            >
              <ChevronRight className="h-3 w-3" />
            </Button>
          </div>

          {/* View Mode: Single vs Split */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-secondary/80 rounded p-0.5 border">
              <button
                type="button"
                onClick={() => setViewMode("single")}
                className={`px-2 py-0.5 text-[11px] font-medium rounded flex items-center gap-1 cursor-pointer transition-all ${
                  viewMode === "single"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Eye className="h-3 w-3" />
                <span>Single</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={`px-2 py-0.5 text-[11px] font-medium rounded flex items-center gap-1 cursor-pointer transition-all ${
                  viewMode === "split"
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Split className="h-3 w-3" />
                <span>Side-by-Side</span>
              </button>
            </div>

            {viewMode === "single" && (
              <div className="flex items-center bg-secondary/80 rounded p-0.5 border">
                <button
                  type="button"
                  onClick={() => setSingleTab("original")}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded cursor-pointer transition-all ${
                    singleTab === "original"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Original
                </button>
                <button
                  type="button"
                  onClick={() => setSingleTab("compressed")}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded cursor-pointer transition-all ${
                    singleTab === "compressed"
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Compressed
                </button>
              </div>
            )}
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                setZoomScale((prev) => {
                  const next = Math.max(prev - 0.25, 0.5);
                  if (next <= 1) setPan({ x: 0, y: 0 });
                  return next;
                })
              }
              disabled={zoomScale <= 0.5}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="Zoom Out"
            >
              <ZoomOut className="h-3 w-3" />
            </Button>
            <span className="text-[11px] font-mono text-muted-foreground w-10 text-center">
              {Math.round(zoomScale * 100)}%
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoomScale((prev) => Math.min(prev + 0.25, 4))}
              disabled={zoomScale >= 4.0}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="Zoom In"
            >
              <ZoomIn className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setZoomScale(1);
                setPan({ x: 0, y: 0 });
              }}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
              title="Reset Zoom & Pan (100%)"
            >
              <RotateCcw className="h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Maximized Visual Preview Canvas (Fills entire remaining window) */}
        <div
          ref={viewportRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={handleDoubleClick}
          className="flex-1 overflow-hidden bg-neutral-900/95 dark:bg-black p-3 sm:p-4 flex items-center justify-center relative select-none"
          style={{
            cursor: zoomScale > 1 ? (isDragging ? "grabbing" : "grab") : "default",
          }}
        >
          {isLoadingDoc ? (
            <div className="flex flex-col items-center justify-center gap-2 text-neutral-300">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <span className="text-xs">Loading PDF document...</span>
            </div>
          ) : docLoadError ? (
            <div className="flex flex-col items-center justify-center gap-2 text-destructive max-w-sm text-center">
              <AlertTriangle className="h-8 w-8" />
              <span className="text-xs font-medium">{docLoadError}</span>
            </div>
          ) : (
            <div
              className="flex items-center justify-center will-change-transform max-h-full max-w-full"
              style={{
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoomScale})`,
                transformOrigin: "center center",
                transition: isDragging || isWheeling ? "none" : "transform 140ms ease-out",
              }}
            >
              {viewMode === "split" ? (
                /* Side-by-Side View */
                <div className="flex flex-row items-center justify-center gap-4 sm:gap-6 max-h-full max-w-full">
                  {/* Left: Original */}
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-neutral-400 bg-neutral-800/80 px-2 py-0.5 rounded shadow">
                      Original
                    </span>
                    <div className="flex items-center justify-center">
                      {originalPreviewUrl ? (
                        <img
                          src={originalPreviewUrl}
                          alt={`Original Page ${currentPage}`}
                          className="h-[calc(88vh-200px)] max-h-full w-auto max-w-[45vw] object-contain shadow-2xl rounded border border-neutral-700 bg-white block pointer-events-none"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-[380px] h-[calc(88vh-200px)] flex items-center justify-center bg-neutral-800/50 rounded">
                          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Compressed */}
                  <div className="flex flex-col items-center gap-1.5">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded shadow flex items-center gap-1">
                      <span>Compressed</span>
                      {isRenderingPreview && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
                    </span>
                    <div className="flex items-center justify-center">
                      {compressedPreviewUrl ? (
                        <img
                          src={compressedPreviewUrl}
                          alt={`Compressed Page ${currentPage}`}
                          className="h-[calc(88vh-200px)] max-h-full w-auto max-w-[45vw] object-contain shadow-2xl rounded border border-neutral-700 bg-white block pointer-events-none"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-[380px] h-[calc(88vh-200px)] flex items-center justify-center bg-neutral-800/50 rounded">
                          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Single Page View (Immersive & Large) */
                <div className="flex flex-col items-center justify-center gap-1.5 max-h-full max-w-full">
                  <div className="flex items-center justify-center">
                    {singleTab === "original" ? (
                      originalPreviewUrl ? (
                        <img
                          src={originalPreviewUrl}
                          alt={`Original Page ${currentPage}`}
                          className="h-[calc(88vh-180px)] max-h-full w-auto max-w-[85vw] object-contain shadow-2xl rounded border border-neutral-700 bg-white block pointer-events-none"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-[450px] h-[calc(88vh-180px)] flex items-center justify-center bg-neutral-800/50 rounded">
                          <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
                        </div>
                      )
                    ) : compressedPreviewUrl ? (
                      <img
                        src={compressedPreviewUrl}
                        alt={`Compressed Page ${currentPage}`}
                        className="h-[calc(88vh-180px)] max-h-full w-auto max-w-[85vw] object-contain shadow-2xl rounded border border-neutral-700 bg-white block pointer-events-none"
                        draggable={false}
                      />
                    ) : (
                      <div className="w-[450px] h-[calc(88vh-180px)] flex items-center justify-center bg-neutral-800/50 rounded">
                        <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Floating Pan Hint when Zoomed */}
          {zoomScale > 1 && (
            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-black/75 text-neutral-300 text-[10px] px-2.5 py-1 rounded-full shadow pointer-events-none flex items-center gap-1.5 backdrop-blur-xs">
              <Move className="h-3 w-3 text-primary" />
              <span>Drag to pan • Double-click to reset</span>
            </div>
          )}
        </div>

        {/* Minimal Footer */}
        <div className="px-5 py-2.5 border-t bg-card shrink-0 flex items-center justify-between gap-3">
          {/* Progress Indicator */}
          <div className="flex-1 max-w-sm">
            {isCompressing && compressionProgress ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <Loader2 className="h-3 w-3 animate-spin text-primary" />
                    {compressionProgress.step}
                  </span>
                  <span className="font-semibold text-primary">{compressionProgress.percent}%</span>
                </div>
                <div className="w-full bg-secondary h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-primary h-full transition-all duration-200 rounded-full"
                    style={{ width: `${compressionProgress.percent}%` }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onClose}
              disabled={isCompressing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={isCompressing || isLoadingDoc || Boolean(docLoadError)}
              className="gap-1.5 font-medium"
            >
              {isCompressing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Compressing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>
                    Apply Compression
                    {docEstimate.savingsPercent > 0 ? ` (-${docEstimate.savingsPercent}%)` : ""}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
