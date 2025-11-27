/**
 * PDFPageView - Renders a single PDF page with canvas and text layer.
 * Simplified version based on PDF.js pdf_page_view.js
 */
import type { PDFPageProxy, PageViewport, TextLayer } from 'pdfjs-dist';
import { setLayerDimensions } from 'pdfjs-dist';
import type { EventBus } from './EventBus.js';

export interface PDFPageViewOptions {
	container: HTMLElement;
	id: number;
	defaultViewport: PageViewport;
	eventBus: EventBus;
	scale?: number;
	rotation?: number;
}

export const RenderingStates = {
	INITIAL: 0,
	RUNNING: 1,
	PAUSED: 2,
	FINISHED: 3
} as const;

export type RenderingState = (typeof RenderingStates)[keyof typeof RenderingStates];

export class PDFPageView {
	readonly id: number;
	readonly eventBus: EventBus;

	private container: HTMLElement;
	private viewport: PageViewport;
	private pdfPage: PDFPageProxy | null = null;
	private scale: number;
	private rotation: number;
	private pdfPageRotate: number = 0;

	public div: HTMLDivElement;
	private canvas: HTMLCanvasElement | null = null;
	private canvasWrapper: HTMLDivElement | null = null;
	private textLayerDiv: HTMLDivElement | null = null;
	private loadingDiv: HTMLDivElement | null = null;

	public renderingState: RenderingState = RenderingStates.INITIAL;
	private renderTask: ReturnType<PDFPageProxy['render']> | null = null;

	// Text layer instance for updates
	private textLayer: TextLayer | null = null;
	private textLayerRendered = false;

	// Text layer data for search
	public textDivs: HTMLElement[] = [];
	public textContentItemsStr: string[] = [];

	constructor(options: PDFPageViewOptions) {
		this.id = options.id;
		this.container = options.container;
		this.eventBus = options.eventBus;
		this.scale = options.scale ?? 1.0;
		this.rotation = options.rotation ?? 0;
		this.viewport = options.defaultViewport;

		// Create page container
		this.div = document.createElement('div');
		this.div.className = 'page';
		this.div.setAttribute('data-page-number', String(this.id));
		this.div.setAttribute('role', 'region');

		this.setDimensions();
		this.container.appendChild(this.div);

		// Add loading indicator
		this.loadingDiv = document.createElement('div');
		this.loadingDiv.className = 'loadingIcon';
		this.loadingDiv.textContent = 'Loading...';
		this.div.appendChild(this.loadingDiv);
	}

	private setDimensions(): void {
		const { width, height } = this.viewport;
		this.div.style.width = `${Math.floor(width)}px`;
		this.div.style.height = `${Math.floor(height)}px`;

		// Set CSS variables for text layer scaling
		// viewport.scale already includes our scale factor
		this.div.style.setProperty('--scale-factor', String(this.viewport.scale));

		// Set rotation attribute for text layer
		const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
		this.div.setAttribute('data-main-rotation', String(totalRotation));

		// Update text layer dimensions if it exists
		// mustFlip=false because the text layer uses raw page coordinates
		// and rotation is handled via CSS transforms
		if (this.textLayerDiv) {
			setLayerDimensions(this.textLayerDiv, this.viewport, /* mustFlip */ false);
		}
	}

	setPdfPage(pdfPage: PDFPageProxy): void {
		this.pdfPage = pdfPage;
		this.pdfPageRotate = pdfPage.rotate;
		this.updateViewport();
	}

	private updateViewport(): void {
		if (!this.pdfPage) return;

		const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
		this.viewport = this.pdfPage.getViewport({
			scale: this.scale,
			rotation: totalRotation
		});
		this.setDimensions();
	}

	update({ scale, rotation }: { scale?: number; rotation?: number }): void {
		if (scale !== undefined) {
			this.scale = scale;
		}
		if (rotation !== undefined) {
			this.rotation = rotation;
		}
		this.updateViewport();

		// Re-render if already rendered
		if (this.renderingState === RenderingStates.FINISHED) {
			// Update text layer - TextLayer.update() handles both scale and rotation
			// Rotation is applied via CSS transforms based on data-main-rotation attribute
			if (this.textLayer && this.textLayerRendered) {
				this.textLayerDiv!.hidden = true;
				this.textLayer.update({
					viewport: this.viewport
				});
				this.textLayerDiv!.hidden = false;
			}
			// Re-render canvas
			this.resetCanvas();
			this.draw();
		}
	}

	private resetCanvas(): void {
		this.cancelRendering();
		this.renderingState = RenderingStates.INITIAL;

		// Clear canvas only
		if (this.canvas) {
			this.canvas.width = 0;
			this.canvas.height = 0;
			this.canvas.remove();
			this.canvas = null;
		}
		if (this.canvasWrapper) {
			this.canvasWrapper.remove();
			this.canvasWrapper = null;
		}
	}

	reset(): void {
		this.cancelRendering();
		this.renderingState = RenderingStates.INITIAL;

		// Clear canvas
		if (this.canvas) {
			this.canvas.width = 0;
			this.canvas.height = 0;
			this.canvas.remove();
			this.canvas = null;
		}
		if (this.canvasWrapper) {
			this.canvasWrapper.remove();
			this.canvasWrapper = null;
		}

		// Clear text layer
		if (this.textLayerDiv) {
			this.textLayerDiv.remove();
			this.textLayerDiv = null;
		}
		this.textLayer = null;
		this.textLayerRendered = false;
		this.textDivs = [];
		this.textContentItemsStr = [];

		// Show loading
		if (this.loadingDiv) {
			this.loadingDiv.style.display = '';
		}
	}

	async draw(): Promise<void> {
		if (!this.pdfPage || this.renderingState !== RenderingStates.INITIAL) {
			return;
		}

		this.renderingState = RenderingStates.RUNNING;

		try {
			// Hide loading indicator
			if (this.loadingDiv) {
				this.loadingDiv.style.display = 'none';
			}

			// Create canvas wrapper
			this.canvasWrapper = document.createElement('div');
			this.canvasWrapper.className = 'canvasWrapper';
			this.div.appendChild(this.canvasWrapper);

			// Create and render canvas
			this.canvas = document.createElement('canvas');
			this.canvas.className = 'pdf-canvas';
			this.canvasWrapper.appendChild(this.canvas);

			const outputScale = window.devicePixelRatio || 1;
			const { width, height } = this.viewport;

			this.canvas.width = Math.floor(width * outputScale);
			this.canvas.height = Math.floor(height * outputScale);
			this.canvas.style.width = `${Math.floor(width)}px`;
			this.canvas.style.height = `${Math.floor(height)}px`;

			const ctx = this.canvas.getContext('2d')!;
			ctx.scale(outputScale, outputScale);

			this.renderTask = this.pdfPage.render({
				canvasContext: ctx,
				viewport: this.viewport,
				canvas: this.canvas
			});

			await this.renderTask.promise;
			this.renderTask = null;

			// Render text layer for search (only if not already rendered)
			if (!this.textLayerRendered) {
				await this.renderTextLayer();
			}

			this.renderingState = RenderingStates.FINISHED;
			this.eventBus.dispatch('pagerendered', {
				pageNumber: this.id,
				source: this
			});
		} catch (error) {
			if ((error as Error).name === 'RenderingCancelledException') {
				return;
			}
			this.renderingState = RenderingStates.INITIAL;
			console.error('Error rendering page:', error);
		}
	}

	private async renderTextLayer(): Promise<void> {
		if (!this.pdfPage) return;

		// If text layer already rendered, just update it
		if (this.textLayerRendered && this.textLayer) {
			this.textLayerDiv!.hidden = true;
			this.textLayer.update({ viewport: this.viewport });
			this.textLayerDiv!.hidden = false;
			return;
		}

		// Create text layer div
		this.textLayerDiv = document.createElement('div');
		this.textLayerDiv.className = 'textLayer';
		this.div.appendChild(this.textLayerDiv);

		try {
			// Import TextLayer from pdfjs-dist
			const { TextLayer } = await import('pdfjs-dist');

			const textContent = await this.pdfPage.getTextContent();

			this.textDivs = [];
			this.textContentItemsStr = [];

			// Set text layer dimensions using PDF.js utility
			// mustFlip=false because text layer uses raw page coordinates
			// and rotation is handled via CSS transforms
			setLayerDimensions(this.textLayerDiv, this.viewport, /* mustFlip */ false);

			// Use PDF.js TextLayer for proper positioning
			this.textLayer = new TextLayer({
				textContentSource: textContent,
				container: this.textLayerDiv,
				viewport: this.viewport
			});

			await this.textLayer.render();
			this.textLayerRendered = true;

			// Collect text divs and their content for search highlighting
			// We extract text from the rendered spans to ensure 1:1 correspondence
			// between textDivs and textContentItemsStr
			const spans = this.textLayerDiv.querySelectorAll('span:not(.markedContent)');
			spans.forEach((span) => {
				this.textDivs.push(span as HTMLElement);
				this.textContentItemsStr.push(span.textContent || '');
			});

			this.eventBus.dispatch('textlayerrendered', {
				pageNumber: this.id,
				source: this
			});
		} catch (error) {
			console.error('Error rendering text layer:', error);
		}
	}

	cancelRendering(): void {
		if (this.renderTask) {
			this.renderTask.cancel();
			this.renderTask = null;
		}
	}

	destroy(): void {
		this.cancelRendering();
		this.reset();
		this.pdfPage?.cleanup();
		this.div.remove();
	}

	get width(): number {
		return this.viewport.width;
	}

	get height(): number {
		return this.viewport.height;
	}
}
