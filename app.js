const MAX_WIDTH = 800; // downscale guard for large phone photos

let src, dst, gray, blurred;
let openCvReady = false;
let lastImage = null;

function onOpenCvReady() {
    cv['onRuntimeInitialized'] = () => {
        openCvReady = true;
        document.getElementById('status').innerText = 'OpenCV.js is ready. Upload a photo!';
        src = new cv.Mat();
        dst = new cv.Mat();
        gray = new cv.Mat();
        blurred = new cv.Mat();
    };
}

function bindSlider(id, displayId) {
    const el = document.getElementById(id);
    const disp = document.getElementById(displayId);
    el.addEventListener('input', () => { disp.innerText = el.value; });
}
bindSlider('blockSize', 'blockSizeVal');
bindSlider('cValue', 'cValueVal');
bindSlider('cannyLow', 'cannyLowVal');
bindSlider('cannyHigh', 'cannyHighVal');
bindSlider('numColors', 'numColorsVal');
bindSlider('bilateralPasses', 'bilateralPassesVal');
bindSlider('minRegionArea', 'minRegionAreaVal');

document.getElementById('methodSelect').addEventListener('change', (e) => {
    const v = e.target.value;
    document.getElementById('adaptiveControls').classList.toggle('hidden', v !== 'adaptive');
    document.getElementById('cannyControls').classList.toggle('hidden', v !== 'canny');
    document.getElementById('regionControls').classList.toggle('hidden', v !== 'region');
});

document.getElementById('fileInput').addEventListener('change', (e) => {
    if (!openCvReady) return alert('OpenCV is still loading...');
    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        lastImage = img;
        drawInput(img);
        processImage();
        document.getElementById('reprocessBtn').disabled = false;
    };
    img.src = URL.createObjectURL(file);
});

// Draw image onto hidden canvas, downscaled and flattened onto white
function drawInput(img) {
    const canvasInput = document.getElementById('canvasInput');
    let w = img.width;
    let h = img.height;
    if (w > MAX_WIDTH) {
        h = Math.round(h * (MAX_WIDTH / w));
        w = MAX_WIDTH;
    }
    canvasInput.width = w;
    canvasInput.height = h;
    const ctx = canvasInput.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
}

document.getElementById('reprocessBtn').addEventListener('click', () => {
    if (!openCvReady || !lastImage) return;
    drawInput(lastImage);
    processImage();
});

function processImage() {
    const canvasInput = document.getElementById('canvasInput');
    src = cv.imread(canvasInput);
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const method = document.getElementById('methodSelect').value;

    if (method === 'adaptive') {
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        const blockSize = parseInt(document.getElementById('blockSize').value, 10);
        const cVal = parseInt(document.getElementById('cValue').value, 10);
        cv.adaptiveThreshold(blurred, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize, cVal);

    } else if (method === 'canny') {
        cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);
        const low = parseInt(document.getElementById('cannyLow').value, 10);
        const high = parseInt(document.getElementById('cannyHigh').value, 10);
        cv.Canny(blurred, dst, low, high);
        cv.bitwise_not(dst, dst);

    } else {
        processRegionBoundary();
    }

    cv.imshow('canvasOutput', dst);
    document.getElementById('downloadBtn').disabled = false;
}

function processRegionBoundary() {
    const numColors = parseInt(document.getElementById('numColors').value, 10);
    const passes = parseInt(document.getElementById('bilateralPasses').value, 10);
    const minAreaPct = parseFloat(document.getElementById('minRegionArea').value) / 100;

    // 1. Bilateral filter (repeated)
    let filtered = new cv.Mat();
    cv.bilateralFilter(gray, filtered, 9, 75, 75, cv.BORDER_DEFAULT);
    for (let i = 1; i < passes; i++) {
        const tmp = new cv.Mat();
        cv.bilateralFilter(filtered, tmp, 9, 75, 75, cv.BORDER_DEFAULT);
        filtered.delete();
        filtered = tmp;
    }

    // 2. Flatten to Nx1 float32 samples for k-means
    const totalPixels = filtered.rows * filtered.cols;
    const samples = new cv.Mat(totalPixels, 1, cv.CV_32F);
    let idx = 0;
    for (let y = 0; y < filtered.rows; y++) {
        const row = filtered.ucharPtr(y);
        for (let x = 0; x < filtered.cols; x++) {
            samples.data32F[idx++] = row[x];
        }
    }

    // 3. k-means
    const labels = new cv.Mat();
    const centers = new cv.Mat();
    const criteria = new cv.TermCriteria(
        cv.TERM_CRITERIA_EPS + cv.TERM_CRITERIA_MAX_ITER, 10, 1.0
    );
    cv.kmeans(samples, numColors, labels, criteria, 3, cv.KMEANS_PP_CENTERS, centers);

    // 4. Rebuild quantized grayscale from labels
    const quantized = new cv.Mat(filtered.rows, filtered.cols, cv.CV_8U);
    idx = 0;
    for (let y = 0; y < quantized.rows; y++) {
        const qRow = quantized.ucharPtr(y);
        for (let x = 0; x < quantized.cols; x++) {
            const label = labels.data32S ? labels.data32S[idx] : labels.data32F[idx];
            qRow[x] = Math.round(centers.data32F[label]);
            idx++;
        }
    }

    // 5. Boundary detection (4-neighbor label difference)
    const edges = new cv.Mat(quantized.rows, quantized.cols, cv.CV_8U, new cv.Scalar(0));
    for (let y = 1; y < quantized.rows - 1; y++) {
        const up = quantized.ucharPtr(y - 1);
        const cur = quantized.ucharPtr(y);
        const dn = quantized.ucharPtr(y + 1);
        const eRow = edges.ucharPtr(y);
        for (let x = 1; x < quantized.cols - 1; x++) {
            const v = cur[x];
            if (v !== up[x] || v !== dn[x] || v !== cur[x - 1] || v !== cur[x + 1]) {
                eRow[x] = 255;
            }
        }
    }

    // 6. Morphological closing to bridge gaps
    const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(3, 3));
    cv.morphologyEx(edges, edges, cv.MORPH_CLOSE, kernel);
    kernel.delete();

    // 7. Remove small connected components
    const labelsCC = new cv.Mat();
    const stats = new cv.Mat();
    const centroids = new cv.Mat();
    cv.connectedComponentsWithStats(edges, labelsCC, stats, centroids, 8, cv.CV_32S);
    const minArea = Math.max(4, Math.floor(edges.rows * edges.cols * minAreaPct));
    const cleaned = new cv.Mat(edges.rows, edges.cols, cv.CV_8U, new cv.Scalar(0));
    for (let y = 0; y < edges.rows; y++) {
        const lblRow = labelsCC.intPtr(y);
        const cRow = cleaned.ucharPtr(y);
        for (let x = 0; x < edges.cols; x++) {
            const lbl = lblRow[x];
            if (lbl > 0 && stats.intPtr(lbl, cv.CC_STAT_AREA)[0] >= minArea) {
                cRow[x] = 255;
            }
        }
    }

    // 8. Invert to black lines on white
    cv.bitwise_not(cleaned, dst);

    // Cleanup
    filtered.delete();
    samples.delete();
    labels.delete();
    centers.delete();
    quantized.delete();
    edges.delete();
    labelsCC.delete();
    stats.delete();
    centroids.delete();
    cleaned.delete();
}

document.getElementById('downloadBtn').addEventListener('click', () => {
    const canvas = document.getElementById('canvasOutput');
    const link = document.createElement('a');
    link.download = 'coloring-page.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
});