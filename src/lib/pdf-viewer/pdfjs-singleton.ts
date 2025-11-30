import { BROWSER } from 'esm-env';

// Global singleton state
let pdfjsLib: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null;
let pdfWorker: import('pdfjs-dist/legacy/build/pdf.mjs').PDFWorker | null = null;
let rawWorker: Worker | null = null;
let initPromise: Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null> | null = null;

/**
 * Get the PDF.js library instance. Creates the worker on first call.
 * Subsequent calls return the cached instance.
 */
export async function getPdfJs(): Promise<typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null> {
	if (!BROWSER) return null;

	// Return cached instance
	if (pdfjsLib && pdfWorker) return pdfjsLib;

	// If initialization is in progress, wait for it
	if (initPromise) return initPromise;

	// Start initialization
	initPromise = (async () => {
		pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

		// Create worker only once using import.meta.url for proper bundler resolution
		rawWorker = new Worker(new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url), {
			type: 'module'
		});
		pdfWorker = new pdfjsLib.PDFWorker({
			port: rawWorker as unknown as null
		});
		pdfjsLib.GlobalWorkerOptions.workerPort = pdfWorker.port;

		return pdfjsLib;
	})();

	return initPromise;
}

/**
 * Destroy the PDF.js worker and cleanup resources.
 * Call this when you're completely done with PDF viewing in your app.
 * Note: After calling this, the next getPdfJs() call will create a new worker.
 */
export function destroyPdfJs(): void {
	if (pdfWorker) {
		pdfWorker.destroy();
		pdfWorker = null;
	}
	if (rawWorker) {
		rawWorker.terminate();
		rawWorker = null;
	}
	pdfjsLib = null;
	initPromise = null;
}
