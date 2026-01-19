<script lang="ts">
	import { BROWSER } from 'esm-env';
	import { onDestroy, onMount } from 'svelte';
	import {
		getPdfViewerContext,
		type PdfViewerActions,
		type PdfSource
	} from './pdf-viewer/context.js';
	import { getPdfJs } from './pdf-viewer/pdfjs-singleton.js';
	import { PdfPresentationMode } from './pdf-viewer/PdfPresentationMode.js';
	import { rendererStyles } from './pdf-viewer/renderer-styles.js';
	import BoundingBoxOverlay from './pdf-viewer/BoundingBoxOverlay.svelte';
	import type { BoundingBox } from './pdf-viewer/BoundingBoxLayer.js';

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

	const context = getPdfViewerContext();
	const { state: viewerState, _registerRenderer, _setSrcDataForDownload } = context;

	// Use prop src if provided, otherwise fall back to context src (via getter for reactivity)
	let src = $derived(srcProp ?? context.src);
	// Get bounding boxes from context - use $derived.by to ensure getter is tracked
	let boundingBoxes = $derived.by(() => context.boundingBoxes);

	let hostEl: HTMLDivElement | undefined = $state();
	let shadowRoot: ShadowRoot | null = null;
	let scrollContainerEl: HTMLDivElement | null = null;
	let mounted = $state(false);

	// Core instances
	let viewer: import('./pdf-viewer/PDFViewerCore.js').PDFViewerCore | null = null;
	let findController: import('./pdf-viewer/FindController.js').FindController | null = null;

	// Presentation mode
	const presentationMode = new PdfPresentationMode({
		onStateChange: (newState) => {
			viewerState.presentationMode = newState;
		},
		onPageChange: (pageNumber) => {
			// Sync page number back to main viewer when changed in presentation mode
			viewer?.scrollToPage(pageNumber);
		}
	});

	async function loadPdf(source: PdfSource) {
		if (!BROWSER || !scrollContainerEl) return;

		viewerState.loading = true;
		viewerState.error = null;

		// Cleanup previous viewer
		if (viewer) {
			viewer.destroy();
			viewer = null;
		}

		// Clear any orphaned elements in scroll container
		scrollContainerEl.innerHTML = '';

		let newViewer: import('./pdf-viewer/PDFViewerCore.js').PDFViewerCore | null = null;

		try {
			const pdfjs = await getPdfJs();
			if (!pdfjs) return;

			const { PDFViewerCore } = await import('./pdf-viewer/PDFViewerCore.js');
			const { FindController } = await import('./pdf-viewer/FindController.js');
			const { EventBus } = await import('./pdf-viewer/EventBus.js');

			const eventBus = new EventBus();

			newViewer = new PDFViewerCore({
				container: scrollContainerEl,
				eventBus,
				initialScale: viewerState.scale,
				initialRotation: viewerState.rotation,
				boundingBoxes: boundingBoxes,
				drawMode: context.state.drawMode,
				drawingStyle: context.drawingStyle,
				onBoundingBoxDrawn: context._onBoundingBoxDrawn
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

			eventBus.on('pagedimensions', (data: Record<string, unknown>) => {
				const pageNumber = data.pageNumber as number;
				const width = data.width as number;
				const height = data.height as number;
				// Update the Map with new page dimensions
				viewerState.pageDimensions.set(pageNumber, { width, height });
				// Trigger reactivity by reassigning
				viewerState.pageDimensions = new Map(viewerState.pageDimensions);
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
				_setSrcDataForDownload(null); // URL doesn't need copying
			} else if (source instanceof Blob) {
				// Convert Blob to ArrayBuffer
				const arrayBuffer = await source.arrayBuffer();
				_setSrcDataForDownload(arrayBuffer.slice(0)); // Store a copy for download
				documentSource = { data: arrayBuffer };
			} else if (source instanceof ArrayBuffer) {
				_setSrcDataForDownload(source.slice(0)); // Store a copy before PDF.js detaches it
				documentSource = { data: source };
			} else if (source instanceof Uint8Array) {
				_setSrcDataForDownload(new Uint8Array(source).buffer.slice(0) as ArrayBuffer); // Store a copy for download
				documentSource = { data: source };
			} else {
				throw new Error('Invalid PDF source type');
			}

			const loadingTask = pdfjs.getDocument(documentSource);
			const loadedPdfDocument = await loadingTask.promise;

			await newViewer.setDocument(loadedPdfDocument);
			findController.setDocument(loadedPdfDocument);

			// Set document on presentation mode
			presentationMode.setDocument(loadedPdfDocument);

			viewer = newViewer;
			viewerState.loading = false;
		} catch (e) {
			// Clean up the viewer that was created before the error
			if (newViewer) {
				newViewer.destroy();
				newViewer = null;
			}
			findController = null;

			const errorMessage = e instanceof Error ? e.message : 'Failed to load PDF';
			viewerState.error = errorMessage;
			viewerState.loading = false;
			// Call the error callback if provided
			context._onerror?.(errorMessage);
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
		download: async () => {}, // Download is handled by PdfViewer, not renderer
		enterPresentationMode: async () => {
			presentationMode.setCurrentPage(viewerState.currentPage);
			return presentationMode.request();
		},
		exitPresentationMode: async () => {
			await presentationMode.exit();
		},
		updateBoundingBoxes: (boxes) => {
			viewer?.updateBoundingBoxes(boxes);
		},
		updateDrawMode: (enabled) => {
			viewer?.updateDrawMode(enabled);
		},
		scrollToCoordinates: (page, x, y, scrollBehavior) => {
			viewer?.scrollToCoordinates(page, x, y, scrollBehavior);
		}
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

	// Update bounding boxes when they change
	$effect(() => {
		if (viewer && boundingBoxes) {
			viewer.updateBoundingBoxes(boundingBoxes);
		}
	});

	// Handle bounding box close
	function handleBoundingBoxClose(box: BoundingBox) {
		// Call the close callback from context if provided
		context._onBoundingBoxClose?.(box);
	}

	onDestroy(() => {
		if (viewer) {
			viewer.destroy();
			viewer = null;
		}
		findController = null;
		presentationMode.destroy();
		// Note: Worker is a global singleton, not cleaned up per-component
		// Use destroyPdfJs() from pdfjs-singleton.js if you need to fully cleanup
	});
</script>

<div class="pdf-renderer-wrapper">
	<div bind:this={hostEl} class="pdf-renderer-host"></div>
	{#if !viewerState.loading && mounted}
		<BoundingBoxOverlay
			boxes={boundingBoxes}
			scale={viewerState.scale}
			pageDimensions={viewerState.pageDimensions}
			{shadowRoot}
			onClose={handleBoundingBoxClose}
		/>
	{/if}
</div>

<style>
	.pdf-renderer-wrapper {
		position: relative;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.pdf-renderer-host {
		display: block;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}
</style>
