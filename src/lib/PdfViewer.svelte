<script lang="ts" module>
	// Export compound components
	export { default as Toolbar } from './PdfToolbar.svelte';
	export { default as Renderer } from './PdfRenderer.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		setPdfViewerContext,
		PresentationModeState,
		type PdfViewerState,
		type PdfViewerActions,
		type PdfSource,
		type TextHighlightData
	} from './pdf-viewer/context.js';

	interface Props {
		/** PDF source - URL string, ArrayBuffer, Uint8Array, or Blob */
		src: PdfSource;
		/** Initial scale (default: 1.0) */
		scale?: number;
		/** Custom filename for PDF download (default: extracted from URL or 'document.pdf') */
		downloadFilename?: string;
		/** Callback when PDF fails to load */
		onerror?: (error: string) => void;
		/** Callback when text is highlighted in the PDF */
		onTextHighlighted?: (data: TextHighlightData) => void;
		/** CSS class for the container */
		class?: string;
		/** Children (toolbar and renderer) */
		children?: Snippet;
	}

	let {
		src,
		scale: initialScale = 1.0,
		downloadFilename,
		onerror,
		onTextHighlighted,
		class: className = '',
		children
	}: Props = $props();

	// Keep a copy of binary source data for download (PDF.js transfers/detaches ArrayBuffers)
	// This is set by PdfRenderer before it passes data to PDF.js
	let srcDataForDownload = $state<ArrayBuffer | null>(null);

	// Reactive state that will be shared via context
	let viewerState = $state<PdfViewerState>({
		loading: true,
		error: null,
		totalPages: 0,
		currentPage: 1,
		scale: initialScale,
		rotation: 0,
		searchQuery: '',
		searchCurrent: 0,
		searchTotal: 0,
		isSearching: false,
		presentationMode: PresentationModeState.NORMAL
	});

	// Renderer actions - will be populated when renderer mounts
	let rendererActions: PdfViewerActions | null = null;

	// Download helper function
	async function downloadPdf(filenameOverride?: string) {
		const downloadName =
			filenameOverride ||
			downloadFilename ||
			(typeof src === 'string' ? src.split('/').pop() : 'document.pdf') ||
			'document.pdf';

		let blob: Blob;

		if (typeof src === 'string') {
			// URL - fetch first to handle cross-origin URLs (e.g., Firebase Storage)
			// The download attribute is ignored for cross-origin URLs
			try {
				const response = await fetch(src);
				blob = await response.blob();
			} catch {
				// Fallback for same-origin URLs if fetch fails
				const link = document.createElement('a');
				link.href = src;
				link.download = downloadName;
				link.click();
				return;
			}
		} else if (src instanceof Blob) {
			blob = src;
		} else if (srcDataForDownload) {
			// Use the pre-copied data (original ArrayBuffer/Uint8Array gets detached by PDF.js)
			blob = new Blob([srcDataForDownload], { type: 'application/pdf' });
		} else {
			console.error('Cannot download: no valid source data available');
			return;
		}

		const url = URL.createObjectURL(blob);
		const link = document.createElement('a');
		link.href = url;
		link.download = downloadName;
		link.click();
		URL.revokeObjectURL(url);
	}

	// Actions that proxy to the renderer
	const actions: PdfViewerActions = {
		zoomIn: () => rendererActions?.zoomIn(),
		zoomOut: () => rendererActions?.zoomOut(),
		setScale: (scale: number) => rendererActions?.setScale(scale),
		rotateClockwise: () => rendererActions?.rotateClockwise(),
		rotateCounterClockwise: () => rendererActions?.rotateCounterClockwise(),
		goToPage: (page: number) => rendererActions?.goToPage(page),
		search: async (query: string) => {
			if (rendererActions) {
				await rendererActions.search(query);
			}
		},
		searchNext: () => rendererActions?.searchNext(),
		searchPrevious: () => rendererActions?.searchPrevious(),
		clearSearch: () => rendererActions?.clearSearch(),
		download: downloadPdf,
		enterPresentationMode: async () => {
			if (rendererActions) {
				return rendererActions.enterPresentationMode();
			}
			return false;
		},
		exitPresentationMode: async () => {
			if (rendererActions) {
				await rendererActions.exitPresentationMode();
			}
		}
	};

	// Set up context
	setPdfViewerContext({
		state: viewerState,
		actions,
		get src() {
			return src;
		},
		_registerRenderer: (renderer: PdfViewerActions) => {
			rendererActions = renderer;
		},
		get _onerror() {
			return onerror;
		},
		_setSrcDataForDownload: (data: ArrayBuffer | null) => {
			srcDataForDownload = data;
		},
		get _onTextHighlighted() {
			return onTextHighlighted;
		}
	});
</script>

<div class="pdf-viewer-container {className}">
	{#if viewerState.loading}
		<div class="pdf-loading">Loading PDF...</div>
	{:else if viewerState.error}
		<div class="pdf-error">Error: {viewerState.error}</div>
	{/if}

	{#if children}
		{@render children()}
	{:else}
		<!-- Default layout if no children provided -->
		{#await import('./PdfToolbar.svelte') then { default: Toolbar }}
			<Toolbar />
		{/await}
		{#await import('./PdfRenderer.svelte') then { default: Renderer }}
			<Renderer {src} />
		{/await}
	{/if}
</div>

<style>
	.pdf-viewer-container {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background-color: #f0f0f0;
		overflow: hidden;
	}

	.pdf-loading,
	.pdf-error {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: #666;
		font-size: 1rem;
		z-index: 10;
	}

	.pdf-error {
		color: #dc3545;
	}
</style>
