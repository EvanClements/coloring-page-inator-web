let src, dst, gray, blurred;
let openCvReady = false;

// 1. Wait for OpenCV to load
function onOpenCvReady() {
    // Wait for the runtime to truly initialize
    cv['onRuntimeInitialized'] = () => {
        openCvReady = true;
        document.getElementById('status').innerText = 'OpenCV.js is ready. Upload a photo!';
        
        src = new cv.Mat();
        dst = new cv.Mat();
        gray = new cv.Mat();
        blurred = new cv.Mat();
    };
}

// 2. Handle File Upload
document.getElementById('fileInput').addEventListener('change', (e) => {
    if (!openCvReady) return alert('OpenCV is still loading...');

    const file = e.target.files[0];
    if (!file) return;

    const img = new Image();
    img.onload = () => {
        const canvasInput = document.getElementById('canvasInput');
        canvasInput.width = img.width;
        canvasInput.height = img.height;
        const ctx = canvasInput.getContext('2d');

        // --- THE KEY CHANGE: flatten transparency onto white ---
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvasInput.width, canvasInput.height);
        ctx.drawImage(img, 0, 0);
        // --------------------------------------------------------

        processImage();
    };
    img.src = URL.createObjectURL(file);
});

// 3. The Core OpenCV Pipeline
function processImage() {
    const canvasInput = document.getElementById('canvasInput');

    // Now reads a clean 3-channel image with a white background
    src = cv.imread(canvasInput);

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    let ksize = new cv.Size(5, 5);
    cv.GaussianBlur(gray, blurred, ksize, 0, 0, cv.BORDER_DEFAULT);

    // Adaptive thresholding: good for bold, kid-friendly outlines
    cv.adaptiveThreshold(blurred, dst, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 11, 2);

    cv.imshow('canvasOutput', dst);
    document.getElementById('downloadBtn').disabled = false;
}

// 4. Download
document.getElementById('downloadBtn').addEventListener('click', () => {
    const canvas = document.getElementById('canvasOutput');
    const link = document.createElement('a');
    link.download = 'coloring-page.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
});