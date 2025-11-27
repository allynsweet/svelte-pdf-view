<script lang="ts" module>
	// Export compound components
	export { default as Toolbar } from './PdfToolbar.svelte';
	export { default as Renderer } from './PdfRenderer.svelte';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import { setPdfViewerContext, type PdfViewerState, type PdfViewerActions } from './pdf-viewer/context.js';

	interface Props {
		/** URL or path to the PDF file */
		src: string;
		/** Initial scale (default: 1.0) */
		scale?: number;
		/** CSS class for the container */
		class?: string;
		/** Children (toolbar and renderer) */
		children?: Snippet;
	}

	let { src, scale: initialScale = 1.0, class: className = '', children }: Props = $props();

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
		clearSearch: () => rendererActions?.clearSearch()
	};

	// Set up context
	setPdfViewerContext({
		state,
		actions,
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

