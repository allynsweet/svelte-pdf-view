<script lang="ts" module>
	// Export compound components
	export { default as Toolbar } from './PdfToolbar.svelte';
	export { default as Renderer } from './PdfRenderer.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import {
		setPdfViewerContext,
		type PdfViewerState,
		type PdfViewerActions,
		type PdfSource
	} from './pdf-viewer/context.js';

	interface Props {
		/** PDF source - URL string, ArrayBuffer, Uint8Array, or Blob */
		src: PdfSource;
		/** Initial scale (default: 1.0) */
		scale?: number;
		/** Custom filename for PDF download (default: extracted from URL or 'document.pdf') */
		downloadFilename?: string;
		/** CSS class for the container */
		class?: string;
		/** Children (toolbar and renderer) */
		children?: Snippet;
	}

	let {
		src,
		scale: initialScale = 1.0,
		downloadFilename,
		class: className = '',
		children
	}: Props = $props();

	// Reactive state that will be shared via context
	let state = $state<PdfViewerState>({
		loading: true,
		error: null,
		totalPages: 0,
		currentPage: 1,
		scale: initialScale,
		rotation: 0,
		searchQuery: '',
		searchCurrent: 0,
		searchTotal: 0,
		isSearching: false
	});

	// Renderer actions - will be populated when renderer mounts
	let rendererActions: PdfViewerActions | null = null;

	// Download helper function
	function downloadPdf(filenameOverride?: string) {
		const downloadName =
			filenameOverride ||
			downloadFilename ||
			(typeof src === 'string' ? src.split('/').pop() : 'document.pdf') ||
			'document.pdf';

		if (typeof src === 'string') {
			// URL - fetch and download
			const link = document.createElement('a');
			link.href = src;
			link.download = downloadName;
			link.click();
		} else if (src instanceof Blob) {
			// Blob - create object URL
			const url = URL.createObjectURL(src);
			const link = document.createElement('a');
			link.href = url;
			link.download = downloadName;
			link.click();
			URL.revokeObjectURL(url);
		} else if (src instanceof ArrayBuffer) {
			// ArrayBuffer
			const blob = new Blob([src], { type: 'application/pdf' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = downloadName;
			link.click();
			URL.revokeObjectURL(url);
		} else {
			// Uint8Array - create a copy as ArrayBuffer
			const blob = new Blob([new Uint8Array(src)], { type: 'application/pdf' });
			const url = URL.createObjectURL(blob);
			const link = document.createElement('a');
			link.href = url;
			link.download = downloadName;
			link.click();
			URL.revokeObjectURL(url);
		}
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
		download: downloadPdf
	};

	// Set up context
	setPdfViewerContext({
		state,
		actions,
		src,
		_registerRenderer: (renderer: PdfViewerActions) => {
			rendererActions = renderer;
		}
	});
</script>

<div class="pdf-viewer-container {className}">
	{#if state.loading}
		<div class="pdf-loading">Loading PDF...</div>
	{:else if state.error}
		<div class="pdf-error">Error: {state.error}</div>
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
