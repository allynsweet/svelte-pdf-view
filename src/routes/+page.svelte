<script lang="ts">
	import { PdfViewer, PdfToolbar, PdfRenderer } from '$lib/index.js';

	let pdfUrl = $state('https://texpile.com/pdf/Texpile_TOS.pdf');
</script>

<div class="demo">
	<h1>PDF Viewer Demo</h1>

	<div class="url-input">
		<label for="pdf-url">PDF URL:</label>
		<input id="pdf-url" type="text" bind:value={pdfUrl} placeholder="Enter PDF URL..." />
	</div>

	<div class="viewer-container">
		<!-- Option 1: Use default layout -->
		<!-- <PdfViewer src={pdfUrl} /> -->

		<!-- Option 2: Modular layout with compound components -->
		<PdfViewer src={pdfUrl}>
			<PdfToolbar />
			<PdfRenderer src={pdfUrl} />
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

	.url-input {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-bottom: 1rem;
	}

	.url-input input {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
	}

	.viewer-container {
		flex: 1;
		min-height: 0;
		border: 1px solid #ccc;
		border-radius: 4px;
		overflow: hidden;
	}
</style>
