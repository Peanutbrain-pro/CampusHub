/**
 * @file pdfCompressor.ts
 * @description On-demand client-side PDF compression, document inspection, and preview utility.
 *              Supports Smart Mode (selective embedded Image XObject compression preserving vector text)
 *              and Flatten Mode (full-page canvas rasterization for scanned notes).
 *              Lazy-loads pdf-lib and pdfjs-dist from public CDN only when requested,
 *              maintaining 0 KB impact on the initial application bundle.
 *              Everything executes locally in the browser with zero external transmission.
 * @owner Communities Team
 */

const PDF_LIB_CDN = "https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm";
const PDFJS_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs";
const PDFJS_WORKER_CDN = "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs";

export type CompressionMode = "smart" | "flatten";

export interface CompressionProgress {
  percent: number;
  step: string;
}

export interface CompressionOptions {
  maxDimension?: number;
  quality?: number;
  grayscale?: boolean;
  mode?: CompressionMode;
}

export interface CompressionPreset {
  id: string;
  name: string;
  shortLabel: string;
  description: string;
  maxDimension: number;
  quality: number;
  grayscale: boolean;
}

export interface PdfAnalysis {
  numPages: number;
  hasVectorText: boolean;
  totalTextChars: number;
  imageCount: number;
  totalImageBytes: number;
  recommendedMode: CompressionMode;
}

export const COMPRESSION_PRESETS: CompressionPreset[] = [
  {
    id: "low",
    name: "Low Compression (Sharp)",
    shortLabel: "Low",
    description: "Highest visual clarity (1920px, 85% quality). Ideal for complex math, diagrams, and figures.",
    maxDimension: 1920,
    quality: 0.85,
    grayscale: false,
  },
  {
    id: "balanced",
    name: "Balanced (Recommended)",
    shortLabel: "Balanced",
    description: "Recommended (1400px, 70% quality). Crisp legibility with ~50-70% file size reduction.",
    maxDimension: 1400,
    quality: 0.70,
    grayscale: false,
  },
  {
    id: "high",
    name: "High Compression",
    shortLabel: "High",
    description: "Strong compression (1080px, 52% quality). ~75-85% size reduction, great for 5 MB limit.",
    maxDimension: 1080,
    quality: 0.52,
    grayscale: false,
  },
  {
    id: "extreme",
    name: "Extreme (B&W Notes)",
    shortLabel: "Extreme",
    description: "Maximum space savings (900px, 40% quality, Grayscale). Best for camera scans and monochrome notes.",
    maxDimension: 900,
    quality: 0.40,
    grayscale: true,
  },
];

export const DEFAULT_MAX_DIMENSION = 1400;
export const DEFAULT_QUALITY = 0.70;

let cachedPdfLib: any = null;
let cachedPdfJs: any = null;

/**
 * Lazy loads pdf-lib and pdfjs-dist on-demand from CDN
 */
export async function loadPdfTools(onProgress?: (progress: CompressionProgress) => void) {
  if (cachedPdfLib && cachedPdfJs) {
    return { PDFLib: cachedPdfLib, pdfjsLib: cachedPdfJs };
  }

  onProgress?.({ percent: 5, step: "Loading local PDF engine..." });

  const [pdfLibModule, pdfjsModule] = await Promise.all([
    /* @vite-ignore */ import(/* webpackIgnore: true */ PDF_LIB_CDN),
    /* @vite-ignore */ import(/* webpackIgnore: true */ PDFJS_CDN),
  ]);

  cachedPdfLib = pdfLibModule;
  cachedPdfJs = pdfjsModule;

  if (cachedPdfJs?.GlobalWorkerOptions) {
    cachedPdfJs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN;
  }

  return { PDFLib: cachedPdfLib, pdfjsLib: cachedPdfJs };
}

/**
 * Parse a PDF file and return the pdfjs document proxy and page count
 */
export async function getPdfDocument(file: File) {
  const { pdfjsLib } = await loadPdfTools();
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  return {
    pdfDoc,
    numPages: pdfDoc.numPages as number,
  };
}

/**
 * Inspects a PDF's internal structure:
 * - Detects presence of real vector text streams
 * - Counts embedded image XObjects and calculates their cumulative byte weight
 * - Recommends Smart Mode (vector-preserving) vs Flatten Mode (scanned documents)
 */
export async function inspectPdfDocument(file: File): Promise<PdfAnalysis> {
  const { PDFLib, pdfjsLib } = await loadPdfTools();
  const arrayBuffer = await file.arrayBuffer();

  // 1. Text inspection via pdfjs-dist
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfjsDoc = await loadingTask.promise;
  const numPages = pdfjsDoc.numPages as number;

  let totalTextChars = 0;
  const samplePages = Math.min(numPages, 5);
  for (let i = 1; i <= samplePages; i++) {
    try {
      const page = await pdfjsDoc.getPage(i);
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        if ("str" in item && typeof item.str === "string") {
          totalTextChars += item.str.trim().length;
        }
      }
    } catch {
      // Ignore individual page parsing issues
    }
  }

  // 2. Embedded image inspection via pdf-lib
  let imageCount = 0;
  let totalImageBytes = 0;
  try {
    const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
    const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
    for (const [, obj] of indirectObjects) {
      if (obj instanceof PDFLib.PDFStream) {
        const subtype = obj.dict?.get(PDFLib.PDFName.of("Subtype"));
        if (subtype && subtype.toString() === "/Image") {
          imageCount++;
          const contents = typeof obj.getContents === "function" ? obj.getContents() : (obj as any).contents;
          totalImageBytes += contents?.length || 0;
        }
      }
    }
  } catch {
    // Fallback if structure enumeration is restricted
  }

  const hasVectorText = totalTextChars >= 40;
  const recommendedMode: CompressionMode = hasVectorText || imageCount === 0 ? "smart" : "flatten";

  return {
    numPages,
    hasVectorText,
    totalTextChars,
    imageCount,
    totalImageBytes,
    recommendedMode,
  };
}

/**
 * Re-encodes raw image bytes: downscales dimension and compresses to JPEG
 */
async function reencodeImageBytes(
  rawBytes: Uint8Array,
  options: { maxDimension: number; quality: number; grayscale: boolean }
): Promise<{ bytes: Uint8Array; width: number; height: number } | null> {
  try {
    const blob = new Blob([rawBytes as unknown as BlobPart]);
    let bitmap: ImageBitmap | HTMLImageElement;
    let width = 0;
    let height = 0;

    if (typeof createImageBitmap === "function") {
      try {
        bitmap = await createImageBitmap(blob);
        width = bitmap.width;
        height = bitmap.height;
      } catch {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        await new Promise((res, rej) => {
          img.onload = () => res(null);
          img.onerror = rej;
          img.src = url;
        });
        URL.revokeObjectURL(url);
        bitmap = img;
        width = img.naturalWidth || img.width;
        height = img.naturalHeight || img.height;
      }
    } else {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      await new Promise((res, rej) => {
        img.onload = () => res(null);
        img.onerror = rej;
        img.src = url;
      });
      URL.revokeObjectURL(url);
      bitmap = img;
      width = img.naturalWidth || img.width;
      height = img.naturalHeight || img.height;
    }

    if (!width || !height) return null;

    let targetWidth = width;
    let targetHeight = height;
    if (targetWidth > options.maxDimension || targetHeight > options.maxDimension) {
      if (targetWidth > targetHeight) {
        targetHeight = Math.round((targetHeight * options.maxDimension) / targetWidth);
        targetWidth = options.maxDimension;
      } else {
        targetWidth = Math.round((targetWidth * options.maxDimension) / targetHeight);
        targetHeight = options.maxDimension;
      }
    }

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: Boolean(options.grayscale) });
    if (!ctx) return null;

    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
    if ("close" in bitmap && typeof (bitmap as any).close === "function") {
      (bitmap as any).close();
    }

    if (options.grayscale) {
      const imgData = ctx.getImageData(0, 0, targetWidth, targetHeight);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const avg = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        d[i] = avg;
        d[i + 1] = avg;
        d[i + 2] = avg;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const dataUrl = canvas.toDataURL("image/jpeg", options.quality);
    const base64 = dataUrl.split(",")[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return { bytes, width: targetWidth, height: targetHeight };
  } catch {
    return null;
  }
}

/**
 * Smart Mode: Selectively compresses embedded Image XObjects inside the PDF in-place.
 * Native text streams, fonts, vector paths, annotations, and hyperlinks are 100% preserved.
 */
async function compressPdfSmart(
  file: File,
  options: CompressionOptions,
  onProgress?: (progress: CompressionProgress) => void
): Promise<{ file: File; originalBytes: number; compressedBytes: number; savedBytes: number }> {
  const { PDFLib } = await loadPdfTools(onProgress);
  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });

  const maxDim = options.maxDimension || DEFAULT_MAX_DIMENSION;
  const quality = Math.max(0.1, Math.min(1.0, options.quality ?? DEFAULT_QUALITY));
  const grayscale = Boolean(options.grayscale);
  const originalBytes = file.size;

  onProgress?.({ percent: 15, step: "Scanning for embedded image objects..." });

  const indirectObjects = pdfDoc.context.enumerateIndirectObjects();
  const imageEntries: Array<{ ref: any; obj: any }> = [];

  for (const [ref, obj] of indirectObjects) {
    if (obj instanceof PDFLib.PDFStream) {
      const subtype = obj.dict?.get(PDFLib.PDFName.of("Subtype"));
      if (subtype && subtype.toString() === "/Image") {
        imageEntries.push({ ref, obj });
      }
    }
  }

  const totalImages = imageEntries.length;

  if (totalImages === 0) {
    onProgress?.({ percent: 50, step: "Preserving vector text and packing object streams..." });
    const compressedUint8Array = await pdfDoc.save({ useObjectStreams: true });
    const compressedBytes = compressedUint8Array.byteLength;
    onProgress?.({ percent: 100, step: "Vector optimization complete!" });

    if (compressedBytes < originalBytes) {
      const blob = new Blob([compressedUint8Array], { type: "application/pdf" });
      const compressedFile = new File([blob], file.name, {
        type: "application/pdf",
        lastModified: Date.now(),
      });
      return {
        file: compressedFile,
        originalBytes,
        compressedBytes,
        savedBytes: originalBytes - compressedBytes,
      };
    }
    return { file, originalBytes, compressedBytes: originalBytes, savedBytes: 0 };
  }

  onProgress?.({ percent: 25, step: `Optimizing ${totalImages} embedded image(s)...` });

  let imagesOptimized = 0;
  for (let idx = 0; idx < totalImages; idx++) {
    const { obj } = imageEntries[idx];
    const origBytes = typeof obj.getContents === "function" ? obj.getContents() : ((obj as any).contents || new Uint8Array());
    const origLength = origBytes.length;
    if (origLength < 1024) continue; // Skip tiny 1px masks or icons

    const pct = Math.round(25 + ((idx + 1) / totalImages) * 60);
    onProgress?.({
      percent: pct,
      step: `Compressing image ${idx + 1} of ${totalImages} (preserving text)...`,
    });

    const reencoded = await reencodeImageBytes(origBytes, {
      maxDimension: maxDim,
      quality,
      grayscale,
    });

    if (reencoded && reencoded.bytes.length < origLength) {
      if ("contents" in obj) {
        (obj as any).contents = reencoded.bytes;
      }
      obj.dict.set(PDFLib.PDFName.of("Length"), pdfDoc.context.obj(reencoded.bytes.length));
      obj.dict.set(PDFLib.PDFName.of("Filter"), PDFLib.PDFName.of("DCTDecode"));
      obj.dict.set(PDFLib.PDFName.of("Width"), pdfDoc.context.obj(reencoded.width));
      obj.dict.set(PDFLib.PDFName.of("Height"), pdfDoc.context.obj(reencoded.height));
      obj.dict.set(PDFLib.PDFName.of("ColorSpace"), PDFLib.PDFName.of("DeviceRGB"));
      obj.dict.delete(PDFLib.PDFName.of("DecodeParms"));
      imagesOptimized++;
    }
  }

  onProgress?.({ percent: 90, step: "Finalizing optimized vector PDF package..." });
  const compressedUint8Array = await pdfDoc.save({ useObjectStreams: true });
  const compressedBytes = compressedUint8Array.byteLength;

  onProgress?.({ percent: 100, step: "Optimization complete!" });

  if (compressedBytes < originalBytes) {
    const blob = new Blob([compressedUint8Array], { type: "application/pdf" });
    const compressedFile = new File([blob], file.name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });
    return {
      file: compressedFile,
      originalBytes,
      compressedBytes,
      savedBytes: originalBytes - compressedBytes,
    };
  }

  return { file, originalBytes, compressedBytes: originalBytes, savedBytes: 0 };
}

/**
 * Renders a specific PDF page to an HTML Canvas with optional scaling and grayscale
 */
export async function renderPdfPageToCanvas(
  page: any,
  canvas: HTMLCanvasElement,
  options: {
    maxDimension?: number;
    scaleMultiplier?: number;
    grayscale?: boolean;
  } = {}
) {
  const baseViewport = page.getViewport({ scale: 1.0 });
  const maxDim = options.maxDimension || 2048;

  let { width, height } = baseViewport;
  if (width > maxDim || height > maxDim) {
    if (width > height) {
      height = Math.round((height * maxDim) / width);
      width = maxDim;
    } else {
      width = Math.round((width * maxDim) / height);
      height = maxDim;
    }
  }

  const scale = (width / baseViewport.width) * (options.scaleMultiplier || 1.0);
  const viewport = page.getViewport({ scale });

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext("2d", { willReadFrequently: Boolean(options.grayscale) });
  if (!ctx) throw new Error("Canvas rendering context unavailable.");

  await page.render({
    canvasContext: ctx,
    viewport,
  }).promise;

  if (options.grayscale) {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const avg = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      d[i] = avg;
      d[i + 1] = avg;
      d[i + 2] = avg;
    }
    ctx.putImageData(imgData, 0, 0);
  }
}

/**
 * Renders a page preview to a JPEG Data URL at the specified compression settings.
 * If isCompressedPreview is true and the page contains zero images, renders crisp vector text
 * without applying destructive lossy JPEG downsampling.
 */
export async function renderPagePreviewDataUrl(
  pdfDoc: any,
  pageNumber: number,
  options: CompressionOptions = {},
  isCompressedPreview: boolean = false
): Promise<{ dataUrl: string; byteEstimate: number; width: number; height: number; hasImages: boolean }> {
  const page = await pdfDoc.getPage(pageNumber);
  const canvas = document.createElement("canvas");

  const { pdfjsLib } = await loadPdfTools();
  let hasImages = false;
  try {
    const ops = await page.getOperatorList();
    const imageOps = new Set([
      pdfjsLib.OPS.paintImageXObject,
      pdfjsLib.OPS.paintInlineImageXObject,
      pdfjsLib.OPS.paintImageMaskXObject,
      pdfjsLib.OPS.paintImageXObjectRepeat,
      pdfjsLib.OPS.paintImageMaskXObjectRepeat,
      pdfjsLib.OPS.paintImageMaskXObjectGroup,
    ]);
    hasImages = ops.fnArray.some((fn: number) => imageOps.has(fn));
  } catch {
    hasImages = true;
  }

  // If this is a compressed preview for a page that has NO images:
  // Text is NOT converted to JPEG by the compressor! Text remains sharp vector.
  // Render cleanly at high fidelity with zero JPEG compression ringing!
  if (isCompressedPreview && !hasImages) {
    await renderPdfPageToCanvas(page, canvas, {
      maxDimension: 2048,
      grayscale: false,
    });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.96);
    return {
      dataUrl,
      byteEstimate: 45000,
      width: canvas.width,
      height: canvas.height,
      hasImages: false,
    };
  }

  await renderPdfPageToCanvas(page, canvas, {
    maxDimension: options.maxDimension || DEFAULT_MAX_DIMENSION,
    grayscale: options.grayscale,
  });

  const quality = Math.max(0.1, Math.min(1.0, options.quality ?? DEFAULT_QUALITY));
  const dataUrl = canvas.toDataURL("image/jpeg", quality);

  const base64Length = dataUrl.length - "data:image/jpeg;base64,".length;
  const byteEstimate = Math.round((base64Length * 3) / 4);

  return {
    dataUrl,
    byteEstimate,
    width: canvas.width,
    height: canvas.height,
    hasImages,
  };
}

/**
 * Flatten Mode: Full-page canvas rasterization.
 * Re-encodes each page as a photo. Best for scanned handwritten documents or camera photos.
 */
async function compressPdfFlatten(
  file: File,
  options: CompressionOptions = {},
  onProgress?: (progress: CompressionProgress) => void
): Promise<{ file: File; originalBytes: number; compressedBytes: number; savedBytes: number }> {
  const maxDim = options.maxDimension || DEFAULT_MAX_DIMENSION;
  const quality = Math.max(0.1, Math.min(1.0, options.quality ?? DEFAULT_QUALITY));
  const grayscale = Boolean(options.grayscale);
  const originalBytes = file.size;

  onProgress?.({ percent: 10, step: "Initializing PDF tools..." });

  const { PDFLib, pdfjsLib } = await loadPdfTools(onProgress);

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const srcPdf = await loadingTask.promise;
  const numPages = srcPdf.numPages;

  onProgress?.({ percent: 20, step: `Rasterizing ${numPages} page(s)...` });

  const targetPdf = await PDFLib.PDFDocument.create();

  for (let i = 1; i <= numPages; i++) {
    const pageProgress = Math.round(20 + ((i - 0.5) / numPages) * 70);
    onProgress?.({
      percent: pageProgress,
      step: `Compressing page ${i} of ${numPages}...`,
    });

    const page = await srcPdf.getPage(i);
    const canvas = document.createElement("canvas");

    await renderPdfPageToCanvas(page, canvas, {
      maxDimension: maxDim,
      grayscale,
    });

    const imgDataUrl = canvas.toDataURL("image/jpeg", quality);
    const imgBytes = await fetch(imgDataUrl).then((res) => res.arrayBuffer());

    const embeddedImage = await targetPdf.embedJpg(imgBytes);
    const newPage = targetPdf.addPage([embeddedImage.width, embeddedImage.height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: embeddedImage.width,
      height: embeddedImage.height,
    });
  }

  onProgress?.({ percent: 95, step: "Finalizing compressed PDF package..." });

  const compressedUint8Array = await targetPdf.save({ useObjectStreams: true });
  const compressedBytes = compressedUint8Array.byteLength;

  onProgress?.({ percent: 100, step: "Optimization complete!" });

  if (compressedBytes < originalBytes) {
    const compressedBlob = new Blob([compressedUint8Array], { type: "application/pdf" });
    const compressedFile = new File([compressedBlob], file.name, {
      type: "application/pdf",
      lastModified: Date.now(),
    });

    return {
      file: compressedFile,
      originalBytes,
      compressedBytes,
      savedBytes: originalBytes - compressedBytes,
    };
  }

  return {
    file,
    originalBytes,
    compressedBytes: originalBytes,
    savedBytes: 0,
  };
}

/**
 * Universal PDF Compression entry point:
 * Directs to Smart Mode (preserves vector text) or Flatten Mode (canvas rasterization).
 */
export async function compressPdf(
  file: File,
  options: CompressionOptions = {},
  onProgress?: (progress: CompressionProgress) => void
): Promise<{ file: File; originalBytes: number; compressedBytes: number; savedBytes: number }> {
  const mode = options.mode ?? "smart";
  if (mode === "flatten") {
    return compressPdfFlatten(file, options, onProgress);
  }
  return compressPdfSmart(file, options, onProgress);
}

/**
 * Stable Document Size Estimator:
 * Computes a stable document-wide estimate that does NOT fluctuate when flipping preview pages.
 */
export async function estimateDocumentSize(
  file: File,
  analysis: PdfAnalysis | null,
  options: CompressionOptions = {}
): Promise<{ totalBytes: number; savingsPercent: number }> {
  const originalBytes = file.size;
  const quality = Math.max(0.1, Math.min(1.0, options.quality ?? DEFAULT_QUALITY));
  const maxDim = options.maxDimension || DEFAULT_MAX_DIMENSION;
  const grayscale = Boolean(options.grayscale);

  // Responsive scaling factors matching the preset/slider settings
  const resFactor = Math.min(1.0, (maxDim / 1800) ** 1.5);
  const qualityFactor = 0.20 + (quality ** 1.3) * 0.75;
  const grayFactor = grayscale ? 0.72 : 1.0;
  const compressionRatio = Math.max(0.12, Math.min(0.92, resFactor * qualityFactor * grayFactor));

  const totalImageBytes = analysis?.totalImageBytes || 0;

  // If known embedded images exist:
  if (totalImageBytes > 0 && totalImageBytes < originalBytes) {
    const nonImageBytes = originalBytes - totalImageBytes;
    const compressedImages = Math.round(totalImageBytes * compressionRatio);
    const estTotal = Math.max(1024, nonImageBytes + compressedImages);
    const savings = Math.max(
      0,
      Math.min(95, Math.round(((originalBytes - estTotal) / originalBytes) * 100))
    );
    return { totalBytes: estTotal, savingsPercent: savings };
  }

  // Document-wide responsive estimation
  const estTotal = Math.max(1024, Math.round(originalBytes * compressionRatio));
  const savings = Math.max(
    0,
    Math.min(95, Math.round(((originalBytes - estTotal) / originalBytes) * 100))
  );
  return { totalBytes: estTotal, savingsPercent: savings };
}
