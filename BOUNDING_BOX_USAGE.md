# Bounding Box Overlay Usage Guide

This document explains how to use the new bounding box overlay functionality added to svelte-pdf-view.

## Overview

The bounding box overlay system allows you to render custom rectangular overlays on PDF pages. This is useful for highlighting regions, marking areas of interest, or displaying annotations.

## Features

- Render bounding boxes with custom coordinates on any PDF page
- Support for custom styles (border color, fill color, opacity, border width)
- Automatically respects zoom and rotation transformations
- Dynamic updates (add/remove boxes on the fly)
- PDF coordinate space support (origin at bottom-left)

## Basic Usage

### 1. Import the Types

```typescript
import { PdfViewer, PdfRenderer, type BoundingBox } from 'svelte-pdf-view';
```

### 2. Define Bounding Boxes

```typescript
const boundingBoxes: BoundingBox[] = [
  {
    page: 1,           // Page number (1-indexed)
    x: 100,            // X coordinate in PDF points (origin at bottom-left)
    y: 200,            // Y coordinate in PDF points (origin at bottom-left)
    width: 150,        // Width in PDF points
    height: 100,       // Height in PDF points
    borderColor: '#ff0000',  // Optional: border color (default: red)
    fillColor: 'rgba(255, 0, 0, 0.1)',  // Optional: fill color (default: transparent)
    opacity: 1.0,      // Optional: opacity (default: 1.0)
    borderWidth: 2,    // Optional: border width in pixels (default: 2)
    className: 'my-custom-box',  // Optional: custom CSS class
    id: 'box-1'        // Optional: ID for programmatic access
  },
  {
    page: 1,
    x: 300,
    y: 400,
    width: 200,
    height: 150,
    borderColor: '#0000ff',
    fillColor: 'rgba(0, 0, 255, 0.2)'
  }
];
```

### 3. Use with PdfViewer

```svelte
<script lang="ts">
  import { PdfViewer, PdfRenderer, type BoundingBox } from 'svelte-pdf-view';

  let pdfSource = '/path/to/document.pdf';

  // Define bounding boxes
  let boxes: BoundingBox[] = [
    {
      page: 1,
      x: 100,
      y: 200,
      width: 150,
      height: 100,
      borderColor: '#ff0000',
      fillColor: 'rgba(255, 0, 0, 0.1)'
    }
  ];
</script>

<div style="height: 100vh;">
  <PdfViewer src={pdfSource} boundingBoxes={boxes}>
    <PdfRenderer />
  </PdfViewer>
</div>
```

## Advanced Usage

### Dynamic Updates

You can dynamically update bounding boxes using the context API:

```svelte
<script lang="ts">
  import { PdfViewer, PdfRenderer, getPdfViewerContext, type BoundingBox } from 'svelte-pdf-view';

  let pdfSource = '/path/to/document.pdf';
  let boxes: BoundingBox[] = [];

  function addBoundingBox() {
    const newBox: BoundingBox = {
      page: 1,
      x: Math.random() * 400,
      y: Math.random() * 600,
      width: 100,
      height: 80,
      borderColor: '#00ff00'
    };

    boxes = [...boxes, newBox];
  }
</script>

<div style="height: 100vh;">
  <button onclick={addBoundingBox}>Add Box</button>

  <PdfViewer src={pdfSource} boundingBoxes={boxes}>
    <PdfRenderer />
  </PdfViewer>
</div>
```

### Programmatic Updates via Context

```svelte
<script lang="ts">
  import { getPdfViewerContext, type BoundingBox } from 'svelte-pdf-view';

  const { actions } = getPdfViewerContext();

  function updateBoxes() {
    const newBoxes: BoundingBox[] = [
      {
        page: 2,
        x: 50,
        y: 100,
        width: 200,
        height: 150,
        borderColor: '#ff00ff'
      }
    ];

    actions.updateBoundingBoxes(newBoxes);
  }
</script>

<button onclick={updateBoxes}>Update Boxes</button>
```

## Coordinate System

**Important:** PDF coordinates use a different origin than typical screen coordinates:

- **PDF Coordinate Space:** Origin at bottom-left, Y increases upward
- **Screen Coordinate Space:** Origin at top-left, Y increases downward

The bounding box system automatically handles this transformation. When you specify coordinates:

```typescript
{
  page: 1,
  x: 100,    // 100 points from the left edge
  y: 200,    // 200 points from the BOTTOM edge (not top!)
  width: 150,
  height: 100
}
```

## Styling Options

All style properties are optional and have sensible defaults:

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `borderColor` | `string` | `'#ff0000'` | CSS color for border |
| `fillColor` | `string` | `'transparent'` | CSS color for fill |
| `opacity` | `number` | `1.0` | Opacity (0-1) |
| `borderWidth` | `number` | `2` | Border width in pixels |
| `className` | `string` | `undefined` | Custom CSS class |
| `id` | `string` | `undefined` | Unique identifier |

## Multiple Pages

You can render boxes on multiple pages by specifying different page numbers:

```typescript
const boxes: BoundingBox[] = [
  { page: 1, x: 100, y: 200, width: 150, height: 100 },
  { page: 2, x: 50, y: 300, width: 200, height: 120 },
  { page: 3, x: 150, y: 250, width: 180, height: 90 }
];
```

## Behavior with Zoom and Rotation

The bounding box overlay automatically:
- Scales with zoom level
- Rotates with page rotation
- Maintains correct positioning relative to PDF content

No additional code is needed to handle these transformations!

## Example: Highlighting Search Results

```svelte
<script lang="ts">
  import { PdfViewer, PdfRenderer, type BoundingBox } from 'svelte-pdf-view';

  let pdfSource = '/document.pdf';
  let searchResults: Array<{page: number, rect: [number, number, number, number]}> = [];

  $: boundingBoxes = searchResults.map((result, index) => ({
    page: result.page,
    x: result.rect[0],
    y: result.rect[1],
    width: result.rect[2] - result.rect[0],
    height: result.rect[3] - result.rect[1],
    borderColor: '#ffff00',
    fillColor: 'rgba(255, 255, 0, 0.3)',
    id: `search-result-${index}`
  }));
</script>

<PdfViewer src={pdfSource} boundingBoxes={boundingBoxes}>
  <PdfRenderer />
</PdfViewer>
```

## Notes

- Bounding boxes are rendered above the text layer but can be customized via CSS
- Boxes have `pointer-events: none` by default, so they don't interfere with PDF interaction
- Coordinates are in PDF points (1/72 inch)
- The system uses PDF.js viewport transformations for accurate positioning
