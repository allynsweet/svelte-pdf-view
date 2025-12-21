/**
 * PDF Viewer Context - Shared state between toolbar and renderer
 */
import { getContext, setContext } from 'svelte';

const PDF_VIEWER_CONTEXT_KEY = Symbol('pdf-viewer');

/** PDF source - can be a URL string, ArrayBuffer, Uint8Array, or Blob */
export type PdfSource = string | ArrayBuffer | Uint8Array | Blob;

/** Presentation mode state */
export enum PresentationModeState {
	UNKNOWN = 0,
	NORMAL = 1,
	CHANGING = 2,
	FULLSCREEN = 3
}

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

	// Presentation mode state
	presentationMode: PresentationModeState;
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
	download: (filename?: string) => Promise<void>;
	/** Enter fullscreen presentation mode */
	enterPresentationMode: () => Promise<boolean>;
	/** Exit fullscreen presentation mode */
	exitPresentationMode: () => Promise<void>;
}

export interface PdfViewerContext {
	state: PdfViewerState;
	actions: PdfViewerActions;
	/** The PDF source - shared from PdfViewer to PdfRenderer */
	src: PdfSource;
	// For internal use - allows renderer to register itself
	_registerRenderer: (renderer: PdfViewerActions) => void;
	// For internal use - error callback from PdfViewer
	_onerror?: (error: string) => void;
	// For internal use - store binary data copy for download (ArrayBuffer gets detached by PDF.js)
	_setSrcDataForDownload: (data: ArrayBuffer | null) => void;
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
