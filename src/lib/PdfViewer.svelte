<script lang="ts">
	import { browser } from '$app/environment';
	import { onDestroy, onMount } from 'svelte';

	interface Props {
		/** URL or path to the PDF file */
		src: string;
		/** Initial scale (default: 1.0) */
		scale?: number;
		/** CSS class for the container */
		class?: string;
	}

	let { src, scale: initialScale = 1.0, class: className = '' }: Props = $props();

	let containerEl: HTMLDivElement | undefined = $state();
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
	let pdfjsLib: typeof import('pdfjs-dist') | null = null;

	async function initPdfJs() {
		if (!browser) return null;

		pdfjsLib = await import('pdfjs-dist');
		const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
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

<div class="pdf-viewer-container {className}" bind:this={containerEl}>
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
				<button onclick={handleZoomOut} aria-label="Zoom out" title="Zoom Out">−</button>
				<span class="zoom-level">{Math.round(currentScale * 100)}%</span>
				<button onclick={handleZoomIn} aria-label="Zoom in" title="Zoom In">+</button>
			</div>

			<!-- Rotation controls -->
			<div class="pdf-toolbar-group">
				<button onclick={handleRotateLeft} aria-label="Rotate counter-clockwise" title="Rotate Left"
					>↺</button
				>
				<button onclick={handleRotateRight} aria-label="Rotate clockwise" title="Rotate Right"
					>↻</button
				>
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
					🔍
				</button>
				{#if searchTotal > 0}
					<button onclick={handleSearchPrev} aria-label="Previous match" title="Previous">◀</button
					>
					<button onclick={handleSearchNext} aria-label="Next match" title="Next">▶</button>
					<span class="match-info">{searchCurrent}/{searchTotal}</span>
				{/if}
			</div>
		</div>
	{/if}

	<!-- PDF scroll container -->
	<div class="pdf-scroll-container" bind:this={scrollContainerEl}></div>
</div>

<style>
	/* Container */
	.pdf-viewer-container {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		background-color: #525659;
		overflow: hidden;
	}

	/* Toolbar */
	:global(.pdf-toolbar) {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 1rem;
		background-color: #323639;
		color: white;
		flex-shrink: 0;
		flex-wrap: wrap;
	}

	:global(.pdf-toolbar-group) {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	:global(.pdf-toolbar button) {
		padding: 0.4rem 0.75rem;
		border: none;
		background-color: #4a4d50;
		color: white;
		border-radius: 4px;
		cursor: pointer;
		font-size: 0.9rem;
		transition: background-color 0.2s;
		min-width: 36px;
	}

	:global(.pdf-toolbar button:hover:not(:disabled)) {
		background-color: #5a5d60;
	}

	:global(.pdf-toolbar button:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}

	:global(.pdf-toolbar input[type='text']),
	:global(.pdf-toolbar input[type='number']) {
		padding: 0.4rem 0.5rem;
		border: 1px solid #4a4d50;
		border-radius: 4px;
		background-color: #4a4d50;
		color: white;
		font-size: 0.9rem;
	}

	:global(.pdf-toolbar input[type='number']) {
		width: 50px;
		text-align: center;
	}

	:global(.pdf-toolbar .search-input) {
		width: 150px;
	}

	:global(.pdf-toolbar .zoom-level) {
		min-width: 50px;
		text-align: center;
		font-size: 0.85rem;
	}

	:global(.pdf-toolbar .page-info) {
		font-size: 0.85rem;
	}

	:global(.pdf-toolbar .match-info) {
		font-size: 0.8rem;
		color: #aaa;
		min-width: 80px;
	}

	/* Scroll container */
	.pdf-scroll-container {
		flex: 1;
		overflow: auto;
		position: relative;
	}

	/* Viewer - dynamically created */
	:global(.pdfViewer) {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 10px;
		gap: 10px;
	}

	/* Page - dynamically created with CSS variables for text layer */
	:global(.page) {
		--user-unit: 1;
		--total-scale-factor: calc(var(--scale-factor, 1) * var(--user-unit));
		--scale-round-x: 1px;
		--scale-round-y: 1px;

		position: relative;
		background-color: white;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
		margin: 0;
		direction: ltr;
	}

	:global(.page .loadingIcon) {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		color: #666;
		font-size: 14px;
	}

	:global(.page .canvasWrapper) {
		position: absolute;
		inset: 0;
		overflow: hidden;
		z-index: 0;
	}

	:global(.page .pdf-canvas) {
		display: block;
	}

	/* Text layer - essential styles from PDF.js */
	:global(.textLayer) {
		position: absolute;
		text-align: initial;
		inset: 0;
		overflow: clip;
		opacity: 1;
		line-height: 1;
		-webkit-text-size-adjust: none;
		-moz-text-size-adjust: none;
		text-size-adjust: none;
		forced-color-adjust: none;
		transform-origin: 0 0;
		caret-color: CanvasText;
		z-index: 2;
	}

	/* Text layer rotation transforms - text is rendered in raw page coordinates,
   then rotated via CSS to match the canvas orientation */
	:global(.textLayer[data-main-rotation='90']) {
		transform: rotate(90deg) translateY(-100%);
	}

	:global(.textLayer[data-main-rotation='180']) {
		transform: rotate(180deg) translate(-100%, -100%);
	}

	:global(.textLayer[data-main-rotation='270']) {
		transform: rotate(270deg) translateX(-100%);
	}

	:global(.textLayer :is(span, br)) {
		color: transparent;
		position: absolute;
		white-space: pre;
		cursor: text;
		transform-origin: 0% 0%;
	}

	:global(.textLayer > :not(.markedContent)),
	:global(.textLayer .markedContent span:not(.markedContent)) {
		z-index: 1;
	}

	:global(.textLayer span.markedContent) {
		top: 0;
		height: 0;
	}

	:global(.textLayer ::-moz-selection) {
		background: rgba(0, 0, 255, 0.25);
	}

	:global(.textLayer ::selection) {
		background: rgba(0, 0, 255, 0.25);
	}

	:global(.textLayer br::-moz-selection),
	:global(.textLayer br::selection) {
		background: transparent;
	}

	/* Search highlights */
	:global(.textLayer .highlight) {
		margin: -1px;
		padding: 1px;
		background-color: rgba(255, 255, 0, 0.4);
		border-radius: 4px;
	}

	:global(.textLayer .highlight.selected) {
		background-color: rgba(255, 128, 0, 0.6);
	}

	:global(.textLayer .highlight.begin) {
		border-radius: 4px 0 0 4px;
	}

	:global(.textLayer .highlight.end) {
		border-radius: 0 4px 4px 0;
	}

	:global(.textLayer .highlight.middle) {
		border-radius: 0;
	}

	/* Loading state */
	.pdf-loading,
	.pdf-error {
		display: flex;
		justify-content: center;
		align-items: center;
		height: 100%;
		min-height: 200px;
		color: white;
		font-size: 1.25rem;
	}

	.pdf-error {
		color: #ff6b6b;
	}
</style>
