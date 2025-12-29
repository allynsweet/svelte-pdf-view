/* Copyright 2024 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * PDFViewerCore - Main viewer that manages all pages in a scroll container.
 * This is a derivative work based on PDF.js pdf_viewer.js
 */
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { EventBus } from './EventBus.js';
import { PDFPageView, RenderingStates } from './PDFPageView.js';
import { SimpleLinkService } from './SimpleLinkService.js';

export interface PDFViewerOptions {
	container: HTMLElement;
	eventBus?: EventBus;
	initialScale?: number;
	initialRotation?: number;
}

const DEFAULT_SCALE = 1.0;
const MIN_SCALE = 0.1;
const MAX_SCALE = 10.0;
const DEFAULT_SCALE_DELTA = 0.1;

// Number of pages to render around the visible ones
const PAGES_TO_PRERENDER = 2;

export class PDFViewerCore {
	readonly container: HTMLElement;
	readonly viewer: HTMLDivElement;
	readonly eventBus: EventBus;

	private pdfDocument: PDFDocumentProxy | null = null;
	private pages: PDFPageView[] = [];
	private currentScale: number;
	private currentRotation: number;
	private scrollAbortController: AbortController | null = null;
	private renderingQueue: Set<number> = new Set();
	private isRendering = false;

	// Link service for annotation navigation
	private linkService: SimpleLinkService;

	constructor(options: PDFViewerOptions) {
		this.container = options.container;
		this.eventBus = options.eventBus ?? new EventBus();
		this.currentScale = options.initialScale ?? DEFAULT_SCALE;
		this.currentRotation = options.initialRotation ?? 0;

		// Create viewer div inside container
		this.viewer = document.createElement('div');
		this.viewer.className = 'pdfViewer';
		this.container.appendChild(this.viewer);

		// Create link service for annotation navigation
		this.linkService = new SimpleLinkService({
			eventBus: this.eventBus
		});

		// Setup scroll listener for lazy rendering
		this.setupScrollListener();
	}

	private setupScrollListener(): void {
		this.scrollAbortController?.abort();
		this.scrollAbortController = new AbortController();

		let scrollTimeout: ReturnType<typeof setTimeout> | null = null;

		this.container.addEventListener(
			'scroll',
			() => {
				if (scrollTimeout) {
					clearTimeout(scrollTimeout);
				}
				scrollTimeout = setTimeout(() => {
					this.updateVisiblePages();
				}, 100);
			},
			{ signal: this.scrollAbortController.signal }
		);
	}

	async setDocument(pdfDocument: PDFDocumentProxy): Promise<void> {
		// Cleanup previous document
		this.cleanup();

		this.pdfDocument = pdfDocument;
		const numPages = pdfDocument.numPages;

		// Setup link service with document and viewer
		this.linkService.setDocument(pdfDocument);
		this.linkService.setViewer(this);

		// Create page views
		for (let i = 1; i <= numPages; i++) {
			const page = await pdfDocument.getPage(i);
			const viewport = page.getViewport({
				scale: this.currentScale,
				rotation: this.currentRotation
			});

			const pageView = new PDFPageView({
				container: this.viewer,
				id: i,
				defaultViewport: viewport,
				eventBus: this.eventBus,
				scale: this.currentScale,
				rotation: this.currentRotation,
				linkService: this.linkService
			});

			pageView.setPdfPage(page);
			this.pages.push(pageView);
		}

		this.eventBus.dispatch('pagesloaded', { pagesCount: numPages });

		// Initial render of visible pages
		this.updateVisiblePages();
	}

	private getVisiblePages(): { first: number; last: number; ids: Set<number> } {
		const containerRect = this.container.getBoundingClientRect();
		const containerTop = this.container.scrollTop;
		const containerBottom = containerTop + containerRect.height;

		let firstVisible = -1;
		let lastVisible = -1;
		const visibleIds = new Set<number>();

		let currentTop = 0;
		for (let i = 0; i < this.pages.length; i++) {
			const page = this.pages[i];
			const pageBottom = currentTop + page.height + 10; // 10px margin

			if (pageBottom >= containerTop && currentTop <= containerBottom) {
				if (firstVisible === -1) {
					firstVisible = i;
				}
				lastVisible = i;
				visibleIds.add(i + 1); // Page numbers are 1-indexed
			}

			currentTop = pageBottom;
		}

		return {
			first: firstVisible === -1 ? 0 : firstVisible,
			last: lastVisible === -1 ? 0 : lastVisible,
			ids: visibleIds
		};
	}

	private updateVisiblePages(): void {
		if (!this.pdfDocument || this.pages.length === 0) return;

		const visible = this.getVisiblePages();

		// Calculate which pages to render (visible + buffer)
		const startPage = Math.max(0, visible.first - PAGES_TO_PRERENDER);
		const endPage = Math.min(this.pages.length - 1, visible.last + PAGES_TO_PRERENDER);

		// Queue pages for rendering
		for (let i = startPage; i <= endPage; i++) {
			const page = this.pages[i];
			if (page.renderingState === RenderingStates.INITIAL) {
				this.renderingQueue.add(i);
			}
		}

		this.processRenderingQueue();

		this.eventBus.dispatch('updateviewarea', {
			location: {
				pageNumber: visible.first + 1,
				scale: this.currentScale,
				rotation: this.currentRotation
			}
		});
	}

	private async processRenderingQueue(): Promise<void> {
		if (this.isRendering || this.renderingQueue.size === 0) return;

		this.isRendering = true;

		while (this.renderingQueue.size > 0) {
			const pageIndex = this.renderingQueue.values().next().value as number;
			this.renderingQueue.delete(pageIndex);

			const page = this.pages[pageIndex];
			if (page && page.renderingState === RenderingStates.INITIAL) {
				await page.draw();
			}
		}

		this.isRendering = false;
	}

	get scale(): number {
		return this.currentScale;
	}

	set scale(value: number) {
		const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, value));
		if (newScale === this.currentScale) return;

		this.currentScale = newScale;

		// Update all pages
		for (const page of this.pages) {
			page.update({ scale: newScale });
		}

		this.eventBus.dispatch('scalechanged', { scale: newScale });
		this.updateVisiblePages();
	}

	get rotation(): number {
		return this.currentRotation;
	}

	set rotation(value: number) {
		const newRotation = ((value % 360) + 360) % 360;
		if (newRotation === this.currentRotation) return;

		this.currentRotation = newRotation;

		// Update all pages
		for (const page of this.pages) {
			page.update({ rotation: newRotation });
		}

		this.eventBus.dispatch('rotationchanged', { rotation: newRotation });
		this.updateVisiblePages();
	}

	zoomIn(): void {
		this.scale = this.currentScale + DEFAULT_SCALE_DELTA;
	}

	zoomOut(): void {
		this.scale = this.currentScale - DEFAULT_SCALE_DELTA;
	}

	rotateClockwise(): void {
		this.rotation = this.currentRotation + 90;
	}

	rotateCounterClockwise(): void {
		this.rotation = this.currentRotation - 90;
	}

	scrollToPage(pageNumber: number): void {
		if (pageNumber < 1 || pageNumber > this.pages.length) return;

		const pageView = this.pages[pageNumber - 1];
		pageView.div.scrollIntoView({ behavior: 'smooth', block: 'start' });

		this.eventBus.dispatch('pagechanged', { pageNumber });
	}

	get pagesCount(): number {
		return this.pages.length;
	}

	get currentPageNumber(): number {
		const visible = this.getVisiblePages();
		return visible.first + 1;
	}

	getPageView(pageIndex: number): PDFPageView | undefined {
		return this.pages[pageIndex];
	}

	cleanup(): void {
		// Cancel all rendering
		for (const page of this.pages) {
			page.destroy();
		}
		this.pages = [];
		this.renderingQueue.clear();

		// Clear viewer
		this.viewer.innerHTML = '';

		this.pdfDocument = null;
	}

	destroy(): void {
		this.scrollAbortController?.abort();
		this.cleanup();
		this.eventBus.destroy();
		this.viewer.remove();
	}
}
