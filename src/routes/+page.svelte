<script lang="ts">
	import { base } from '$app/paths';
	import {
		PdfViewer,
		PdfToolbar,
		PdfRenderer,
		type PdfSource,
		type BoundingBox,
		type NormalizedBoundingBox,
		convertNormalizedBoundingBoxes
	} from '$lib/index.js';

	const defaultPdf = `${base}/Demo.pdf`;
	let pdfSource: PdfSource = $state(defaultPdf);
	let sourceType = $state<'url' | 'arraybuffer' | 'uint8array' | 'blob'>('url');
	let loadError = $state<string | null>(null);

	// Bounding boxes demo
	let showBoundingBoxes = $state(true);
	let boundingBoxes = $state<BoundingBox[]>([
		{
			page: 1,
			x: 100,
			y: 500,
			width: 200,
			height: 100,
			borderColor: '#ff0000',
			fillColor: 'rgba(255, 0, 0, 0.1)',
			borderWidth: 2,
			borderRadius: 8,
			id: 'demo-box-1'
		},
		{
			page: 1,
			x: 350,
			y: 300,
			width: 150,
			height: 80,
			borderColor: '#0000ff',
			fillColor: 'rgba(0, 0, 255, 0.2)',
			borderWidth: 2,
			borderRadius: 12,
			id: 'demo-box-2'
		}
	]);

	/* Example: Using Normalized Bounding Boxes (0-100 coordinates)
	 * If you have bounding boxes in percentage format (0-100), you can convert them:
	 *
	 * const normalizedBoxes: NormalizedBoundingBox[] = [
	 *   {
	 *     page: 1,
	 *     x_min: 10,   // 10% from left
	 *     x_max: 40,   // 40% from left
	 *     y_min: 20,   // 20% from top
	 *     y_max: 35,   // 35% from top
	 *     borderColor: '#00ff00',
	 *     fillColor: 'rgba(0, 255, 0, 0.2)',
	 *     borderRadius: 8
	 *   }
	 * ];
	 *
	 * // Convert to PDF coordinates (assuming standard US Letter: 612x792 points)
	 * const convertedBoxes = convertNormalizedBoundingBoxes(normalizedBoxes, 612, 792);
	 * boundingBoxes = convertedBoxes;
	 *
	 * Note: Page dimensions vary by PDF. Common sizes:
	 * - US Letter: 612 x 792 points
	 * - A4: 595 x 842 points
	 * - Legal: 612 x 1008 points
	 */

	function resetToDefault() {
		pdfSource = defaultPdf;
		sourceType = 'url';
		loadError = null;
	}

	async function rotateSourceType() {
		loadError = null;
		const types: Array<'url' | 'arraybuffer' | 'uint8array' | 'blob'> = [
			'url',
			'arraybuffer',
			'uint8array',
			'blob'
		];
		const currentIndex = types.indexOf(sourceType);
		const nextType = types[(currentIndex + 1) % types.length];

		try {
			// Fetch the PDF and convert to the next type
			const response = await fetch(defaultPdf);
			const arrayBuffer = await response.arrayBuffer();

			switch (nextType) {
				case 'url':
					pdfSource = defaultPdf;
					break;
				case 'arraybuffer':
					pdfSource = arrayBuffer;
					break;
				case 'uint8array':
					pdfSource = new Uint8Array(arrayBuffer);
					break;
				case 'blob':
					pdfSource = new Blob([arrayBuffer], { type: 'application/pdf' });
					break;
			}
			sourceType = nextType;
		} catch (e) {
			loadError = e instanceof Error ? e.message : 'Failed to convert PDF';
		}
	}

	async function loadInvalidPdf() {
		loadError = null;
		// This should trigger an error in the viewer
		pdfSource = 'https://invalid-url-that-does-not-exist.com/fake.pdf';
		sourceType = 'url';
	}

	function handlePdfError(error: string) {
		console.error('PDF Error (from callback):', error);
		loadError = `Callback received: ${error}`;
	}

	function toggleBoundingBoxes() {
		showBoundingBoxes = !showBoundingBoxes;
	}

	function addRandomBoundingBox() {
		const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'];
		const randomColor = colors[Math.floor(Math.random() * colors.length)];

		const newBox: BoundingBox = {
			page: 1,
			x: Math.random() * 400 + 50,
			y: Math.random() * 500 + 100,
			width: Math.random() * 150 + 50,
			height: Math.random() * 100 + 50,
			borderColor: randomColor,
			fillColor: `${randomColor}33`,
			borderWidth: 2,
			borderRadius: Math.floor(Math.random() * 20),
			id: `box-${Date.now()}`
		};

		boundingBoxes = [...boundingBoxes, newBox];
	}

	function clearBoundingBoxes() {
		boundingBoxes = [];
	}

	function resetBoundingBoxes() {
		boundingBoxes = [
			{
				page: 1,
				x: 100,
				y: 500,
				width: 200,
				height: 100,
				borderColor: '#ff0000',
				fillColor: 'rgba(255, 0, 0, 0.1)',
				borderWidth: 2,
				borderRadius: 8,
				id: 'demo-box-1'
			},
			{
				page: 1,
				x: 350,
				y: 300,
				width: 150,
				height: 80,
				borderColor: '#0000ff',
				fillColor: 'rgba(0, 0, 255, 0.2)',
				borderWidth: 2,
				borderRadius: 12,
				id: 'demo-box-2'
			}
		];
	}
</script>

<div class="demo">
	<h1>PDF Viewer Demo</h1>

	<div class="controls">
		<div class="url-input">
			<label for="pdf-url">PDF URL:</label>
			<input
				id="pdf-url"
				type="text"
				value={typeof pdfSource === 'string' ? pdfSource : `[${sourceType}]`}
				oninput={(e) => {
					pdfSource = e.currentTarget.value;
					sourceType = 'url';
				}}
				placeholder="Enter PDF URL..."
			/>
		</div>
		<div class="buttons">
			<button onclick={resetToDefault}>Reset</button>
			<button onclick={rotateSourceType}>
				Rotate Source Type (current: {sourceType})
			</button>
			<button onclick={loadInvalidPdf} class="error-btn">Test Error Handling</button>
		</div>
		<div class="bounding-box-controls">
			<strong>Bounding Boxes:</strong>
			<button onclick={toggleBoundingBoxes} class="bbox-btn">
				{showBoundingBoxes ? 'Hide' : 'Show'} Boxes ({boundingBoxes.length})
			</button>
			<button onclick={addRandomBoundingBox} class="bbox-btn">Add Random Box</button>
			<button onclick={resetBoundingBoxes} class="bbox-btn">Reset Boxes</button>
			<button onclick={clearBoundingBoxes} class="bbox-btn">Clear All</button>
		</div>
		{#if loadError}
			<div class="local-error">Local Error: {loadError}</div>
		{/if}
	</div>

	<div class="viewer-container">
		<PdfViewer
			src={pdfSource}
			onerror={handlePdfError}
			boundingBoxes={showBoundingBoxes ? boundingBoxes : []}
		>
			<PdfToolbar />
			<PdfRenderer
				backgroundColor="#e8e8e8"
				scrollbarThumbColor="#c1c1c1"
				scrollbarTrackColor="#f1f1f1"
			/>
		</PdfViewer>
	</div>
</div>

<style>
	.demo {
		display: flex;
		flex-direction: column;
		height: 100vh;
		padding: 1rem;
		box-sizing: border-box;
	}

	h1 {
		margin: 0 0 1rem 0;
	}

	.controls {
		margin-bottom: 1rem;
	}

	.url-input {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.url-input input {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.buttons {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.buttons button {
		padding: 0.5rem 1rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		background: #f5f5f5;
		cursor: pointer;
	}

	.buttons button:hover {
		background: #e5e5e5;
	}

	.bounding-box-controls {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.5rem;
		flex-wrap: wrap;
	}

	.bbox-btn {
		padding: 0.5rem 1rem;
		border: 1px solid #4f46e5;
		border-radius: 4px;
		background: #eef2ff;
		cursor: pointer;
		color: #4f46e5;
	}

	.bbox-btn:hover {
		background: #ddd6fe;
	}

	.error-btn {
		background: #fee2e2 !important;
		border-color: #fca5a5 !important;
	}

	.error-btn:hover {
		background: #fecaca !important;
	}

	.local-error {
		margin-top: 0.5rem;
		padding: 0.5rem;
		background: #fee2e2;
		border: 1px solid #fca5a5;
		border-radius: 4px;
		color: #b91c1c;
	}

	.viewer-container {
		flex: 1;
		min-height: 0;
		border: 1px solid #ccc;
		border-radius: 4px;
		overflow: hidden;
	}
</style>
