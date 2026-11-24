let src, dst, gray, blurred;
let openCvReady = false;
let lastImage = null; // keep the loaded Image element for re-processing

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

// Wire up slider value displays
function bindSlider(id, displayId) {
    const el = document.getElementById(id);
    const disp = document.getElementById(displayId);
    el.addEventListener('input', () => { disp.innerText = el.value; });
}
bindSlider('blockSize', 'blockSizeVal');
bindSlider('cValue', 'cValueVal');
bindSlider('cannyLow', 'cannyLowVal');
bindSlider('cannyHigh', 'cannyHighVal');

// Toggle which slider group is shown
document.getElementById('methodSelect').addEventListener('change', (e) => {
    const isAdaptive = e.target.value === 'adaptive';
    document.getElementById('adaptiveControls').classList.toggle('hidden', !isAdaptive);
    document.getElementById('cannyControls').classList.toggle('hidden', isAdaptive);
});

// File upload
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

// Draw the image onto the hidden canvas, flattened onto white
function drawInput(img) {
    const canvasInput = document.getElementById('canvasInput');
    canvasInput.width = img.width;
    canvasInput.height = img.height;
    const ctx = canvasInput.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasInput.width, canvasInput.height);
    ctx.drawImage(img, 0, 0);
}

// Re-process with current settings
document.getElementById('reprocessBtn').addEventListener('click', () => {
    if (!openCvReady || !lastImage) return;
    drawInput(lastImage);
    processImage();
});

// Core pipeline
function processImage() {
    const canvasInput = document.getElementById('canvasInput');
    src = cv.imread(canvasInput);

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT);

    const method = document.getElementById('methodSelect').value;

    if (method === 'adaptive') {
        let blockSize = parseInt(document.getElementById('blockSize').value, 10);
        let cVal = parseInt(document.getElementById('cValue').value, 10);
        cv.adaptiveThreshold(
            blurred, dst, 255,
            cv.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv.THRESH_BINARY,
            blockSize, cVal
        );
    } else {
        let low = parseInt(document.getElementById('cannyLow').value, 10);
        let high = parseInt(document.getElementById('cannyHigh').value, 10);
        // Canny outputs white edges on black; invert so it looks like a coloring page
        cv.Canny(blurred, dst, low, high);
        cv.bitwise_not(dst, dst);
    }

    cv.imshow('canvasOutput', dst);
    document.getElementById('downloadBtn').disabled = false;
}

// Download
document.getElementById('downloadBtn').addEventListener('click', () => {
    const canvas = document.getElementById('canvasOutput');
    const link = document.createElement('a');
    link.download = 'coloring-page.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
});