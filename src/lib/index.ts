// Reexport your entry components here
export {
	default as PdfViewer,
	Toolbar as PdfToolbar,
	Renderer as PdfRenderer
} from './PdfViewer.svelte';

// Export types from context (PdfSource is the canonical source)
export type { PdfSource } from './pdf-viewer/context.js';

// Export context for custom toolbars
export {
	getPdfViewerContext,
	type PdfViewerState,
	type PdfViewerActions,
	type PdfViewerContext
} from './pdf-viewer/context.js';

// Export PDF.js singleton utilities
export { destroyPdfJs } from './pdf-viewer/pdfjs-singleton.js';
