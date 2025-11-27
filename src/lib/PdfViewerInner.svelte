<script lang="ts">
	import { onDestroy, onMount } from 'svelte';

	const browser = typeof window !== 'undefined';
	import {
		ZoomIn,
		ZoomOut,
		RotateCcw,
		RotateCw,
		Search,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';

	interface Props {
		/** URL or path to the PDF file */
		src: string;
		/** Initial scale (default: 1.0) */
		scale?: number;
		/** CSS class for the container */
		class?: string;
	}

	let { src, scale: initialScale = 1.0, class: className = '' }: Props = $props();

	let scrollContainerEl: HTMLDivElement | undefined = $state();
	let mounted = $state(false);

	// Viewer state
	let loading = $state(true);
	let error = $state<string | null>(null);
	let currentScale = $state(initialScale);
	let currentRotation = $state(0);
	let currentPage = $state(1);
	let totalPages = $state(0);

	// Search state
	let searchQuery = $state('');
	let searchCurrent = $state(0);
	let searchTotal = $state(0);
	let isSearching = $state(false);

	// Core instances (loaded dynamically)
	let viewer: import('./pdf-viewer/PDFViewerCore.js').PDFViewerCore | null = null;
	let findController: import('./pdf-viewer/FindController.js').FindController | null = null;
	let pdfjsLib: typeof import('pdfjs-dist/legacy/build/pdf.mjs') | null = null;

	async function initPdfJs() {
		if (!browser) return null;

		pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
		const pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url');
		pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker.default;

		return pdfjsLib;
	}

	async function loadPdf(url: string) {
		if (!browser || !scrollContainerEl) return;

		loading = true;
		error = null;

		try {
			// Initialize PDF.js
			const pdfjs = await initPdfJs();
			if (!pdfjs) return;

			// Initialize viewer
			const { PDFViewerCore } = await import('./pdf-viewer/PDFViewerCore.js');
			const { FindController } = await import('./pdf-viewer/FindController.js');
			const { EventBus } = await import('./pdf-viewer/EventBus.js');

			// Cleanup existing viewer
			if (viewer) {
				viewer.destroy();
			}

			const eventBus = new EventBus();

			const newViewer = new PDFViewerCore({
				container: scrollContainerEl,
				eventBus,
				initialScale: currentScale,
				initialRotation: currentRotation
			});

			findController = new FindController(newViewer, eventBus);

			// Setup event listeners
			eventBus.on('scalechanged', (data: Record<string, unknown>) => {
				currentScale = data.scale as number;
			});

			eventBus.on('rotationchanged', (data: Record<string, unknown>) => {
				currentRotation = data.rotation as number;
			});

			eventBus.on('updateviewarea', (data: Record<string, unknown>) => {
				const location = data.location as { pageNumber: number };
				currentPage = location.pageNumber;
			});

			eventBus.on('pagesloaded', (data: Record<string, unknown>) => {
				totalPages = data.pagesCount as number;
			});

			eventBus.on('updatefindmatchescount', (data: Record<string, unknown>) => {
				const matchesCount = data.matchesCount as { current: number; total: number };
				searchCurrent = matchesCount.current;
				searchTotal = matchesCount.total;
			});

			// Load document
			const loadingTask = pdfjs.getDocument(url);
			const pdfDocument = await loadingTask.promise;

			await newViewer.setDocument(pdfDocument);

			// Set document on find controller for text extraction
			findController.setDocument(pdfDocument);

			viewer = newViewer;

			loading = false;
		} catch (e) {
			error = e instanceof Error ? e.message : 'Failed to load PDF';
			loading = false;
		}
	}

	function handleZoomIn() {
		if (viewer) {
			viewer.zoomIn();
		}
	}

	function handleZoomOut() {
		if (viewer) {
			viewer.zoomOut();
		}
	}

	function handleRotateRight() {
		if (viewer) {
			viewer.rotateClockwise();
		}
	}

	function handleRotateLeft() {
		if (viewer) {
			viewer.rotateCounterClockwise();
		}
	}

	function handlePageChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const pageNum = parseInt(input.value, 10);
		if (viewer && pageNum >= 1 && pageNum <= totalPages) {
			viewer.scrollToPage(pageNum);
		}
	}

	async function handleSearch() {
		if (!findController || !searchQuery.trim()) {
			searchCurrent = 0;
			searchTotal = 0;
			return;
		}

		isSearching = true;
		await findController.find({
			query: searchQuery,
			highlightAll: true,
			caseSensitive: false
		});
		isSearching = false;
	}

	function handleSearchNext() {
		if (findController) {
			findController.findNext();
		}
	}

	function handleSearchPrev() {
		if (findController) {
			findController.findPrevious();
		}
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (e.shiftKey) {
				handleSearchPrev();
			} else if (searchTotal > 0) {
				handleSearchNext();
			} else {
				handleSearch();
			}
		}
	}

	// Load PDF when src changes
	$effect(() => {
		if (browser && src && scrollContainerEl && mounted) {
			loadPdf(src);
		}
	});

	onMount(() => {
		mounted = true;
	});

	onDestroy(() => {
		if (viewer) {
			viewer.destroy();
			viewer = null;
		}
		findController = null;
	});
</script>

<div class="pdf-viewer-container {className}">
	{#if loading}
		<div class="pdf-loading">
			<span>Loading PDF...</span>
		</div>
	{:else if error}
		<div class="pdf-error">
			<span>Error: {error}</span>
		</div>
	{:else}
		<!-- Toolbar -->
		<div class="pdf-toolbar">
			<!-- Page navigation -->
			<div class="pdf-toolbar-group">
				<input
					type="number"
					value={currentPage}
					min="1"
					max={totalPages}
					onchange={handlePageChange}
					aria-label="Current page"
				/>
				<span class="page-info">/ {totalPages}</span>
			</div>

			<!-- Zoom controls -->
			<div class="pdf-toolbar-group">
				<button onclick={handleZoomOut} aria-label="Zoom out" title="Zoom Out"
					><ZoomOut size={18} /></button
				>
				<span class="zoom-level">{Math.round(currentScale * 100)}%</span>
				<button onclick={handleZoomIn} aria-label="Zoom in" title="Zoom In"
					><ZoomIn size={18} /></button
				>
			</div>

			<!-- Rotation controls -->
			<div class="pdf-toolbar-group">
				<button
					onclick={handleRotateLeft}
					aria-label="Rotate counter-clockwise"
					title="Rotate Left"
				>
					<RotateCcw size={18} />
				</button>
				<button onclick={handleRotateRight} aria-label="Rotate clockwise" title="Rotate Right">
					<RotateCw size={18} />
				</button>
			</div>

			<!-- Search -->
			<div class="pdf-toolbar-group">
				<input
					type="text"
					class="search-input"
					placeholder="Search..."
					bind:value={searchQuery}
					onkeydown={handleSearchKeydown}
					aria-label="Search in document"
				/>
				<button onclick={handleSearch} disabled={isSearching} aria-label="Search" title="Search">
					<Search size={18} />
				</button>
				{#if searchTotal > 0}
					<button onclick={handleSearchPrev} aria-label="Previous match" title="Previous">
						<ChevronLeft size={18} />
					</button>
					<button onclick={handleSearchNext} aria-label="Next match" title="Next">
						<ChevronRight size={18} />
					</button>
					<span class="match-info">{searchCurrent}/{searchTotal}</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- PDF scroll container -->
	<div class="pdf-scroll-container" bind:this={scrollContainerEl}></div>
</div>
