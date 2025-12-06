<script lang="ts">
	import { BROWSER } from 'esm-env';
	import { onDestroy, onMount } from 'svelte';
	import {
		getPdfViewerContext,
		type PdfViewerActions,
		type PdfSource
	} from './pdf-viewer/context.js';
	import { getPdfJs } from './pdf-viewer/pdfjs-singleton.js';
	import { rendererStyles } from './pdf-viewer/renderer-styles.js';

	interface Props {
		/** PDF source - URL string, ArrayBuffer, Uint8Array, or Blob. If not provided, uses src from PdfViewer context. */
		src?: PdfSource;
		/** Background color of the scroll container */
		backgroundColor?: string;
		/** Page shadow style */
		pageShadow?: string;
		/** Scrollbar track color */
		scrollbarTrackColor?: string;
		/** Scrollbar thumb color */
		scrollbarThumbColor?: string;
		/** Scrollbar thumb hover color */
		scrollbarThumbHoverColor?: string;
		/** Scrollbar width */
		scrollbarWidth?: string;
	}

	let {
		src: srcProp,
		backgroundColor = '#e8e8e8',
		pageShadow = '0 2px 8px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.08)',
		scrollbarTrackColor = '#f1f1f1',
		scrollbarThumbColor = '#c1c1c1',
		scrollbarThumbHoverColor = '#a1a1a1',
		scrollbarWidth = '10px'
	}: Props = $props();

	const { state: viewerState, src: contextSrc, _registerRenderer } = getPdfViewerContext();

	// Use prop src if provided, otherwise fall back to context src
	let src = $derived(srcProp ?? contextSrc);

	let hostEl: HTMLDivElement | undefined = $state();
	let shadowRoot: ShadowRoot | null = null;
	let scrollContainerEl: HTMLDivElement | null = null;
	let mounted = $state(false);

	// Core instances
	let viewer: import('./pdf-viewer/PDFViewerCore.js').PDFViewerCore | null = null;
	let findController: import('./pdf-viewer/FindController.js').FindController | null = null;

	async function loadPdf(source: PdfSource) {
		if (!BROWSER || !scrollContainerEl) return;

		viewerState.loading = true;
		viewerState.error = null;

		try {
			const pdfjs = await getPdfJs();
			if (!pdfjs) return;

			const { PDFViewerCore } = await import('./pdf-viewer/PDFViewerCore.js');
			const { FindController } = await import('./pdf-viewer/FindController.js');
			const { EventBus } = await import('./pdf-viewer/EventBus.js');

			if (viewer) {
				viewer.destroy();
			}

			const eventBus = new EventBus();

			const newViewer = new PDFViewerCore({
				container: scrollContainerEl,
				eventBus,
				initialScale: viewerState.scale,
				initialRotation: viewerState.rotation
			});

			findController = new FindController(newViewer, eventBus);

			// Setup event listeners
			eventBus.on('scalechanged', (data: Record<string, unknown>) => {
				viewerState.scale = data.scale as number;
			});

			eventBus.on('rotationchanged', (data: Record<string, unknown>) => {
				viewerState.rotation = data.rotation as number;
			});

			eventBus.on('updateviewarea', (data: Record<string, unknown>) => {
				const location = data.location as { pageNumber: number };
				viewerState.currentPage = location.pageNumber;
			});

			eventBus.on('pagesloaded', (data: Record<string, unknown>) => {
				viewerState.totalPages = data.pagesCount as number;
			});

			eventBus.on('updatefindmatchescount', (data: Record<string, unknown>) => {
				const matchesCount = data.matchesCount as { current: number; total: number };
				viewerState.searchCurrent = matchesCount.current;
				viewerState.searchTotal = matchesCount.total;
			});

			// Handle different source types
			let documentSource: string | { data: ArrayBuffer } | { data: Uint8Array };

			if (typeof source === 'string') {
				// URL string
				documentSource = source;
			} else if (source instanceof Blob) {
				// Convert Blob to ArrayBuffer
				const arrayBuffer = await source.arrayBuffer();
				documentSource = { data: arrayBuffer };
			} else if (source instanceof ArrayBuffer) {
				documentSource = { data: source };
			} else if (source instanceof Uint8Array) {
				documentSource = { data: source };
			} else {
				throw new Error('Invalid PDF source type');
			}

			const loadingTask = pdfjs.getDocument(documentSource);
			const pdfDocument = await loadingTask.promise;

			await newViewer.setDocument(pdfDocument);
			findController.setDocument(pdfDocument);

			viewer = newViewer;
			viewerState.loading = false;
		} catch (e) {
			viewerState.error = e instanceof Error ? e.message : 'Failed to load PDF';
			viewerState.loading = false;
		}
	}

	// Register actions with context
	const rendererActions: PdfViewerActions = {
		zoomIn: () => viewer?.zoomIn(),
		zoomOut: () => viewer?.zoomOut(),
		setScale: (scale: number) => {
			if (viewer) viewer.scale = scale;
		},
		rotateClockwise: () => viewer?.rotateClockwise(),
		rotateCounterClockwise: () => viewer?.rotateCounterClockwise(),
		goToPage: (page: number) => viewer?.scrollToPage(page),
		search: async (query: string) => {
			if (!findController) return;
			viewerState.isSearching = true;
			viewerState.searchQuery = query;
			await findController.find({
				query,
				highlightAll: true,
				caseSensitive: false
			});
			viewerState.isSearching = false;
		},
		searchNext: () => findController?.findNext(),
		searchPrevious: () => findController?.findPrevious(),
		clearSearch: () => {
			if (findController) {
				findController.reset();
				viewerState.searchQuery = '';
				viewerState.searchCurrent = 0;
				viewerState.searchTotal = 0;
			}
		},
		download: () => {} // Download is handled by PdfViewer, not renderer
	};

	onMount(async () => {
		if (BROWSER && hostEl) {
			// Create shadow root for style isolation
			shadowRoot = hostEl.attachShadow({ mode: 'open' });

			// Inject styles
			const styleEl = document.createElement('style');
			styleEl.textContent = rendererStyles;
			shadowRoot.appendChild(styleEl);

			// Create container structure inside shadow DOM
			const container = document.createElement('div');
			container.className = 'pdf-renderer-container';

			// Apply CSS custom properties for customization
			container.style.setProperty('--pdf-background-color', backgroundColor);
			container.style.setProperty('--pdf-page-shadow', pageShadow);
			container.style.setProperty('--pdf-scrollbar-track-color', scrollbarTrackColor);
			container.style.setProperty('--pdf-scrollbar-thumb-color', scrollbarThumbColor);
			container.style.setProperty('--pdf-scrollbar-thumb-hover-color', scrollbarThumbHoverColor);
			container.style.setProperty('--pdf-scrollbar-width', scrollbarWidth);

			scrollContainerEl = document.createElement('div');
			scrollContainerEl.className = 'pdf-scroll-container';
			container.appendChild(scrollContainerEl);

			shadowRoot.appendChild(container);

			// Register actions
			_registerRenderer(rendererActions);

			mounted = true;
		}
	});

	// Load PDF when src changes
	$effect(() => {
		if (BROWSER && src && scrollContainerEl && mounted) {
			loadPdf(src);
		}
	});

	onDestroy(() => {
		if (viewer) {
			viewer.destroy();
			viewer = null;
		}
		findController = null;
		// Note: Worker is a global singleton, not cleaned up per-component
		// Use destroyPdfJs() from pdfjs-singleton.js if you need to fully cleanup
	});
</script>

<div bind:this={hostEl} class="pdf-renderer-host"></div>

<style>
	.pdf-renderer-host {
		display: block;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
</style>
