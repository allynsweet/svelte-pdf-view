<script lang="ts">
	import {
		ZoomIn,
		ZoomOut,
		RotateCcw,
		RotateCw,
		Search,
		ChevronLeft,
		ChevronRight
	} from '@lucide/svelte';
	import { getPdfViewerContext } from './pdf-viewer/context.js';

	const { state: viewerState, actions } = getPdfViewerContext();

	let searchInput = $state('');

	function handlePageChange(e: Event) {
		const input = e.target as HTMLInputElement;
		const pageNum = parseInt(input.value, 10);
		if (pageNum >= 1 && pageNum <= viewerState.totalPages) {
			actions.goToPage(pageNum);
		}
	}

	async function handleSearch() {
		if (!searchInput.trim()) {
			actions.clearSearch();
			return;
		}
		await actions.search(searchInput);
	}

	function handleSearchKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			if (e.shiftKey) {
				actions.searchPrevious();
			} else if (viewerState.searchTotal > 0) {
				actions.searchNext();
			} else {
				handleSearch();
			}
		}
	}
</script>

<div class="pdf-toolbar">
	<!-- Page navigation -->
	<div class="pdf-toolbar-group">
		<input
			type="number"
			value={viewerState.currentPage}
			min="1"
			max={viewerState.totalPages}
			onchange={handlePageChange}
			aria-label="Current page"
		/>
		<span class="page-info">/ {viewerState.totalPages}</span>
	</div>

	<!-- Zoom controls -->
	<div class="pdf-toolbar-group">
		<button onclick={() => actions.zoomOut()} aria-label="Zoom out" title="Zoom Out">
			<ZoomOut size={18} />
		</button>
		<span class="zoom-level">{Math.round(viewerState.scale * 100)}%</span>
		<button onclick={() => actions.zoomIn()} aria-label="Zoom in" title="Zoom In">
			<ZoomIn size={18} />
		</button>
	</div>

	<!-- Rotation controls -->
	<div class="pdf-toolbar-group">
		<button
			onclick={() => actions.rotateCounterClockwise()}
			aria-label="Rotate counter-clockwise"
			title="Rotate Left"
		>
			<RotateCcw size={18} />
		</button>
		<button onclick={() => actions.rotateClockwise()} aria-label="Rotate clockwise" title="Rotate Right">
			<RotateCw size={18} />
		</button>
	</div>

	<!-- Search -->
	<div class="pdf-toolbar-group">
		<input
			type="text"
			class="search-input"
			placeholder="Search..."
			bind:value={searchInput}
			onkeydown={handleSearchKeydown}
			aria-label="Search in document"
		/>
		<button onclick={handleSearch} disabled={viewerState.isSearching} aria-label="Search" title="Search">
			<Search size={18} />
		</button>
		{#if viewerState.searchTotal > 0}
			<button onclick={() => actions.searchPrevious()} aria-label="Previous match" title="Previous">
				<ChevronLeft size={18} />
			</button>
			<button onclick={() => actions.searchNext()} aria-label="Next match" title="Next">
				<ChevronRight size={18} />
			</button>
			<span class="match-info">{viewerState.searchCurrent}/{viewerState.searchTotal}</span>
		{/if}
	</div>
</div>

<style>
	/* Toolbar */
	.pdf-toolbar {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 1rem;
		padding: 0.625rem 1rem;
		background-color: #ffffff;
		color: #333;
		flex-shrink: 0;
		flex-wrap: wrap;
		border-bottom: 1px solid #e0e0e0;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
	}

	.pdf-toolbar-group {
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.pdf-toolbar button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		padding: 0;
		border: 1px solid #e0e0e0;
		background-color: #fafafa;
		color: #555;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.pdf-toolbar button:hover:not(:disabled) {
		background-color: #f0f0f0;
		border-color: #d0d0d0;
		color: #333;
	}

	.pdf-toolbar button:active:not(:disabled) {
		background-color: #e8e8e8;
	}

	.pdf-toolbar button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pdf-toolbar input[type='text'],
	.pdf-toolbar input[type='number'] {
		height: 28px;
		padding: 0 0.5rem;
		border: 1px solid #e0e0e0;
		border-radius: 6px;
		background-color: #fff;
		color: #333;
		font-size: 0.8rem;
		outline: none;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.pdf-toolbar input[type='text']:focus,
	.pdf-toolbar input[type='number']:focus {
		border-color: #0066cc;
		box-shadow: 0 0 0 2px rgba(0, 102, 204, 0.15);
	}

	.pdf-toolbar input[type='number'] {
		width: 40px;
		text-align: center;
		appearance: textfield;
		-moz-appearance: textfield;
	}

	.pdf-toolbar input[type='number']::-webkit-outer-spin-button,
	.pdf-toolbar input[type='number']::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.pdf-toolbar .search-input {
		width: 160px;
	}

	.pdf-toolbar .zoom-level {
		min-width: 48px;
		text-align: center;
		font-size: 0.8rem;
		color: #666;
		font-weight: 500;
	}

	.pdf-toolbar .page-info {
		font-size: 0.8rem;
		color: #888;
		margin-left: 0.25rem;
	}

	.pdf-toolbar .match-info {
		font-size: 0.75rem;
		color: #888;
		min-width: 60px;
		margin-left: 0.25rem;
	}
</style>
