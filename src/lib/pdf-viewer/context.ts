/**
 * PDF Viewer Context - Shared state between toolbar and renderer
 */
import { BROWSER } from 'esm-env';
import { getContext, setContext, onDestroy } from 'svelte';

const PDF_VIEWER_CONTEXT_KEY = Symbol('pdf-viewer');
const PDF_WORKER_CONTEXT_KEY = Symbol('pdf-worker');

export interface PdfViewerState {
	// Document state
	loading: boolean;
	error: string | null;
	totalPages: number;
	currentPage: number;

	// View state
	scale: number;
	rotation: number;

	// Search state
	searchQuery: string;
	searchCurrent: number;
	searchTotal: number;
	isSearching: boolean;
}

export interface PdfViewerActions {
	zoomIn: () => void;
	zoomOut: () => void;
	setScale: (scale: number) => void;
	rotateClockwise: () => void;
	rotateCounterClockwise: () => void;
	goToPage: (page: number) => void;
	search: (query: string) => Promise<void>;
	searchNext: () => void;
	searchPrevious: () => void;
	clearSearch: () => void;
}

export interface PdfViewerContext {
	state: PdfViewerState;
	actions: PdfViewerActions;
	// For internal use - allows renderer to register itself
	_registerRenderer: (renderer: PdfViewerActions) => void;
}

export function setPdfViewerContext(ctx: PdfViewerContext): void {
	setContext(PDF_VIEWER_CONTEXT_KEY, ctx);
}

export function getPdfViewerContext(): PdfViewerContext {
	const ctx = getContext<PdfViewerContext>(PDF_VIEWER_CONTEXT_KEY);
	if (!ctx) {
		throw new Error('PdfToolbar must be used inside a PdfViewer component');
	}
	return ctx;
}

// Worker context for PDF.js
export interface PdfWorkerContext {
	worker: import('pdfjs-dist/legacy/build/pdf.mjs').PDFWorker;
}

export function setPdfWorkerContext(worker: PdfWorkerContext['worker']): void {
	setContext(PDF_WORKER_CONTEXT_KEY, { worker });
}

export function getPdfWorkerContext(): PdfWorkerContext | undefined {
	return getContext<PdfWorkerContext>(PDF_WORKER_CONTEXT_KEY);
}

/**
 * Initialize PDF.js worker and set it in context.
 * Call this in your root layout or page component.
 *
 * @example
 * ```svelte
 * <script>
 *   import { initPdfWorker } from 'svelte-pdf-view';
 *   initPdfWorker();
 * </script>
 * ```
 */
export function initPdfWorker(): void {
	if (!BROWSER) return;

	import('pdfjs-dist/legacy/build/pdf.mjs').then((pdfjs) => {
		const worker = new pdfjs.PDFWorker({
			port: new Worker(new URL('pdfjs-dist/legacy/build/pdf.worker.mjs', import.meta.url), {
				type: 'module'
			}) as unknown as null
		});
		setPdfWorkerContext(worker);
		onDestroy(() => worker.destroy());
	});
}
