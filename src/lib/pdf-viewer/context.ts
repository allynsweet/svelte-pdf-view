/**
 * PDF Viewer Context - Shared state between toolbar and renderer
 */
import { getContext, setContext } from 'svelte';

const PDF_VIEWER_CONTEXT_KEY = Symbol('pdf-viewer');

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
