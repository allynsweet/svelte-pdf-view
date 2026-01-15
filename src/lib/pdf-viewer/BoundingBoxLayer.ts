/**
 * BoundingBoxLayer - Renders bounding boxes on PDF pages
 * Handles coordinate transformations and respects zoom/rotation
 */
import type { PageViewport } from 'pdfjs-dist/legacy/build/pdf.mjs';

/** Normalized bounding box with percentage-based coordinates (0-100) */
export interface NormalizedBoundingBox {
	/** Page number (1-indexed) */
	page: number;
	/** Minimum X coordinate (0-100, percentage of page width) */
	x_min: number;
	/** Maximum X coordinate (0-100, percentage of page width) */
	x_max: number;
	/** Minimum Y coordinate (0-100, percentage of page height, from top) */
	y_min: number;
	/** Maximum Y coordinate (0-100, percentage of page height, from top) */
	y_max: number;
	/** Optional border color (CSS color string) */
	borderColor?: string;
	/** Optional fill color (CSS color string) */
	fillColor?: string;
	/** Optional opacity (0-1) */
	opacity?: number;
	/** Optional border width in pixels */
	borderWidth?: number;
	/** Optional border radius in pixels */
	borderRadius?: number;
	/** Optional custom class name for styling */
	className?: string;
	/** Optional ID for programmatic access */
	id?: string;
}

/** Bounding box definition with coordinates and optional styles */
export interface BoundingBox {
	/** Page number (1-indexed) */
	page: number;
	/** X coordinate in PDF coordinate space (points, origin at bottom-left) */
	x: number;
	/** Y coordinate in PDF coordinate space (points, origin at bottom-left) */
	y: number;
	/** Width in PDF coordinate space (points) */
	width: number;
	/** Height in PDF coordinate space (points) */
	height: number;
	/** Optional border color (CSS color string) */
	borderColor?: string;
	/** Optional fill color (CSS color string) */
	fillColor?: string;
	/** Optional opacity (0-1) */
	opacity?: number;
	/** Optional border width in pixels */
	borderWidth?: number;
	/** Optional border radius in pixels */
	borderRadius?: number;
	/** Optional custom class name for styling */
	className?: string;
	/** Optional ID for programmatic access */
	id?: string;
}

/** Options for BoundingBoxLayer construction */
export interface BoundingBoxLayerOptions {
	/** Container element to append the layer to */
	container: HTMLElement;
	/** PDF viewport for coordinate transformation */
	viewport: PageViewport;
	/** Array of bounding boxes to render */
	boxes: BoundingBox[];
	/** Page number this layer belongs to */
	pageNumber: number;
}

/** Default styles for bounding boxes */
const DEFAULT_STYLES = {
	borderColor: '#ff0000',
	fillColor: 'transparent',
	opacity: 1.0,
	borderWidth: 2
} as const;

/**
 * BoundingBoxLayer renders bounding boxes on a PDF page
 * Similar to AnnotationLayer but specifically for custom overlays
 */
export class BoundingBoxLayer {
	private container: HTMLElement;
	private viewport: PageViewport;
	private boxes: BoundingBox[];
	private pageNumber: number;
	private layerDiv: HTMLDivElement | null = null;
	private boxElements: Map<string, HTMLDivElement> = new Map();

	constructor(options: BoundingBoxLayerOptions) {
		this.container = options.container;
		this.viewport = options.viewport;
		this.boxes = options.boxes;
		this.pageNumber = options.pageNumber;
	}

	/**
	 * Render all bounding boxes for this page
	 */
	render(): void {
		// Create layer div if it doesn't exist
		if (!this.layerDiv) {
			this.layerDiv = document.createElement('div');
			this.layerDiv.className = 'boundingBoxLayer';
			this.container.appendChild(this.layerDiv);
		}

		// Clear existing boxes
		this.clear();

		// Filter boxes for this page only
		const pageBoxes = this.boxes.filter((box) => box.page === this.pageNumber);

		// Render each box
		for (const box of pageBoxes) {
			this.renderBox(box);
		}
	}

	/**
	 * Render a single bounding box
	 */
	private renderBox(box: BoundingBox): void {
		if (!this.layerDiv) return;

		const boxDiv = document.createElement('div');
		boxDiv.className = `boundingBox ${box.className || ''}`.trim();
		if (box.id) {
			boxDiv.setAttribute('data-box-id', box.id);
		}

		// Transform PDF coordinates to viewport coordinates
		// PDF coordinates: origin at bottom-left
		// Viewport coordinates: origin at top-left
		const [x1, y1, x2, y2] = this.viewport.convertToViewportRectangle([
			box.x,
			box.y,
			box.x + box.width,
			box.y + box.height
		]);

		// Calculate position and size in viewport space
		// convertToViewportRectangle returns [x1, y1, x2, y2] where:
		// - For 0° rotation: x1 < x2, y1 > y2 (y is flipped)
		// - For other rotations: coordinates are transformed accordingly
		const left = Math.min(x1, x2);
		const top = Math.min(y1, y2);
		const width = Math.abs(x2 - x1);
		const height = Math.abs(y2 - y1);

		// Apply positioning
		boxDiv.style.position = 'absolute';
		boxDiv.style.left = `${left}px`;
		boxDiv.style.top = `${top}px`;
		boxDiv.style.width = `${width}px`;
		boxDiv.style.height = `${height}px`;

		// Apply styles
		const borderColor = box.borderColor ?? DEFAULT_STYLES.borderColor;
		const fillColor = box.fillColor ?? DEFAULT_STYLES.fillColor;
		const opacity = box.opacity ?? DEFAULT_STYLES.opacity;
		const borderWidth = box.borderWidth ?? DEFAULT_STYLES.borderWidth;

		boxDiv.style.border = `${borderWidth}px solid ${borderColor}`;
		boxDiv.style.backgroundColor = fillColor;
		boxDiv.style.opacity = String(opacity);
		boxDiv.style.pointerEvents = 'none'; // Don't interfere with PDF interaction
		boxDiv.style.boxSizing = 'border-box';

		// Apply border radius if specified
		if (box.borderRadius !== undefined) {
			boxDiv.style.borderRadius = `${box.borderRadius}px`;
		}

		this.layerDiv.appendChild(boxDiv);

		// Store reference if box has an ID
		if (box.id) {
			this.boxElements.set(box.id, boxDiv);
		}
	}

	/**
	 * Update the layer with new viewport (for zoom/rotation changes)
	 */
	update(viewport: PageViewport, boxes?: BoundingBox[]): void {
		this.viewport = viewport;
		if (boxes !== undefined) {
			this.boxes = boxes;
		}
		this.render();
	}

	/**
	 * Clear all rendered boxes
	 */
	private clear(): void {
		if (this.layerDiv) {
			this.layerDiv.innerHTML = '';
		}
		this.boxElements.clear();
	}

	/**
	 * Destroy the layer and clean up
	 */
	destroy(): void {
		this.clear();
		if (this.layerDiv) {
			this.layerDiv.remove();
			this.layerDiv = null;
		}
		this.boxElements.clear();
	}

	/**
	 * Get a box element by ID
	 */
	getBoxElement(id: string): HTMLDivElement | undefined {
		return this.boxElements.get(id);
	}
}

/**
 * Convert normalized bounding boxes (0-100 percentage) to PDF coordinate space
 * @param normalizedBoxes - Array of normalized bounding boxes
 * @param pageWidth - Width of the PDF page in points
 * @param pageHeight - Height of the PDF page in points
 * @returns Array of bounding boxes in PDF coordinate space
 */
export function convertNormalizedBoundingBoxes(
	normalizedBoxes: NormalizedBoundingBox[],
	pageWidth: number,
	pageHeight: number
): BoundingBox[] {
	return normalizedBoxes.map((box) => {
		// Convert percentage (0-100) to PDF points
		const x_min_points = (box.x_min / 100) * pageWidth;
		const x_max_points = (box.x_max / 100) * pageWidth;
		const y_min_points = (box.y_min / 100) * pageHeight;
		const y_max_points = (box.y_max / 100) * pageHeight;

		// Note: y_min/y_max are typically from top in screen coordinates
		// We need to convert to PDF coordinates (origin at bottom-left)
		// So y_min from top = pageHeight - y_min_points
		const width = x_max_points - x_min_points;
		const height = y_max_points - y_min_points;

		return {
			page: box.page,
			x: x_min_points,
			// Convert from top-origin to bottom-origin
			y: pageHeight - y_max_points,
			width,
			height,
			borderColor: box.borderColor,
			fillColor: box.fillColor,
			opacity: box.opacity,
			borderWidth: box.borderWidth,
			borderRadius: box.borderRadius,
			className: box.className,
			id: box.id
		};
	});
}
