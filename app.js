// DOM Elements
const video = document.getElementById('camera-feed');
const canvas = document.getElementById('capture-canvas');
const shutterBtn = document.getElementById('shutter-btn');
const galleryBtn = document.getElementById('gallery-btn');
const fileInput = document.getElementById('file-input');
const loadingOverlay = document.getElementById('loading-overlay');
const scanLine = document.getElementById('scan-line');
const resultsDrawer = document.getElementById('results-drawer');
const closeDrawerBtn = document.getElementById('close-drawer');
const resultsContent = document.getElementById('results-content');
const flashToggle = document.getElementById('flash-toggle');

// State
let stream = null;
let isProcessing = false;

// Initialize Camera
async function initCamera() {
    try {
        const constraints = {
            video: {
                facingMode: 'environment', // Rear camera
                width: { ideal: 1920 },
                height: { ideal: 1080 }
            }
        };

        stream = await navigator.mediaDevices.getUserMedia(constraints);
        video.srcObject = stream;

        // Check flash capability
        const track = stream.getVideoTracks()[0];
        const capabilities = track.getCapabilities();
        if (capabilities.torch) {
            flashToggle.classList.remove('hidden');
        }

    } catch (err) {
        console.error("Camera access error:", err);
        // Only alert if we really can't get it (e.g. not on localhost)
        // console.log("Camera might be blocked or not available");
    }
}

// Flash Toggle
let flashOn = false;
flashToggle.addEventListener('click', () => {
    if (stream) {
        const track = stream.getVideoTracks()[0];
        flashOn = !flashOn;
        track.applyConstraints({
            advanced: [{ torch: flashOn }]
        }).catch(e => console.error("Flash error", e));

        flashToggle.classList.toggle('bg-white/30', flashOn);
        flashToggle.querySelector('i').classList.toggle('text-yellow-400', flashOn);
        flashToggle.querySelector('i').classList.toggle('fill-yellow-400', flashOn);
    }
});

// Capture & Process
shutterBtn.addEventListener('click', async () => {
    if (isProcessing) return;
    captureImage();
});

galleryBtn.addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
        processUploadedImage(e.target.files[0]);
    }
});

function preprocessCanvas(sourceCanvas) {
    const ctx = sourceCanvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const data = imageData.data;

    // Grayscale only - Let Tesseract handle binarization (it uses adaptive thresholding)
    for (let i = 0; i < data.length; i += 4) {
        // Grayscale (luminance)
        const avg = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);

        data[i] = avg; // R
        data[i + 1] = avg; // G
        data[i + 2] = avg; // B
        // Alpha (data[i+3]) remains unchanged
    }

    ctx.putImageData(imageData, 0, 0);
    return sourceCanvas.toDataURL('image/png');
}

function captureImage() {
    startProcessing();

    // Draw current video frame to canvas
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Calculate crop area (center box)
    const cropWidth = canvas.width * 0.8;
    const cropHeight = canvas.height * 0.3;
    const startX = (canvas.width - cropWidth) / 2;
    const startY = (canvas.height - cropHeight) / 2;

    const cropCanvas = document.createElement('canvas');
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;
    const cropCtx = cropCanvas.getContext('2d');

    // Draw cropped area
    cropCtx.drawImage(canvas, startX, startY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    // Preprocess
    const processedImage = preprocessCanvas(cropCanvas);

    // Run OCR
    runOCR(processedImage);
}

function processUploadedImage(file) {
    startProcessing();
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            // Draw to canvas for preprocessing
            // Limit max dimension to avoid crashing browser/worker with 4k+ images
            const maxDim = 2000;
            let width = img.width;
            let height = img.height;

            if (width > maxDim || height > maxDim) {
                if (width > height) {
                    height = Math.round(height * (maxDim / width));
                    width = maxDim;
                } else {
                    width = Math.round(width * (maxDim / height));
                    height = maxDim;
                }
            }

            const procCanvas = document.createElement('canvas');
            procCanvas.width = width;
            procCanvas.height = height;
            const ctx = procCanvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Preprocess (Grayscale + Threshold)
            const processedImage = preprocessCanvas(procCanvas);

            runOCR(processedImage);
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function runOCR(imageSrc) {
    try {
        const worker = await Tesseract.createWorker('eng');
        // Setting whitelist to help Tesseract focus on digits
        // PSM 6: Assume a single uniform block of text. Good for lists.
        await worker.setParameters({
            tessedit_char_whitelist: '0123456789+()- ',
            tessedit_pageseg_mode: '6',
        });

        const ret = await worker.recognize(imageSrc);
        console.log("Raw OCR Text:", ret.data.text);

        const extractedNumbers = parsePhoneNumbers(ret.data.text);
        showResults(extractedNumbers);

        await worker.terminate();
    } catch (err) {
        console.error("OCR Error:", err);
        alert("Failed to process image.");
    } finally {
        stopProcessing();
    }
}

function parsePhoneNumbers(text) {
    // 1. treat newlines as potential separators
    let cleanText = text.replace(/[\n\r]/g, '|');

    // 2. Also replace other non-phone chars (letters, etc) with separator
    // Keep digits, +, (, ), -, ., and spaces
    cleanText = cleanText.replace(/[^0-9+\(\)\.\-\s]/g, '|');

    // 3. Split into chunks
    const chunks = cleanText.split('|').filter(c => c && c.trim().length >= 7);

    const validNumbers = [];

    chunks.forEach(chunk => {
        const trimmed = chunk.trim();
        // Count digits
        const digitCount = (trimmed.match(/\d/g) || []).length;

        // Validation: 7 to 15 digits
        if (digitCount >= 7 && digitCount <= 16) {
            // Check density: a valid phone number shouldn't correspond to "1   2   3" spread out
            // It should be reasonably compact. 
            // We can check if the ratio of digits to total length is decent.
            if (digitCount / trimmed.length > 0.4) {
                validNumbers.push(trimmed);
            }
        }
    });

    return [...new Set(validNumbers)];
}

// UI States
function startProcessing() {
    isProcessing = true;
    loadingOverlay.classList.remove('hidden');
    scanLine.classList.remove('hidden');
}

function stopProcessing() {
    isProcessing = false;
    loadingOverlay.classList.add('hidden');
    scanLine.classList.add('hidden');
}

function showResults(numbers) {
    resultsContent.innerHTML = '';

    if (numbers.length === 0) {
        resultsContent.innerHTML = `
            <div class="text-center py-8">
                <i data-lucide="scan-search" class="w-12 h-12 text-gray-600 mx-auto mb-3"></i>
                <p class="text-gray-400">No phone numbers detected.</p>
                <p class="text-xs text-gray-500 mt-2">Try moving closer or editing the image for better contrast.</p>
            </div>
        `;
    } else {
        numbers.forEach(num => {
            const cleanNum = num.replace(/[^0-9+]/g, '');
            const el = document.createElement('div');
            el.className = 'bg-white/5 p-4 rounded-xl flex items-center justify-between border border-white/10 mb-3';
            el.innerHTML = `
                <div class="flex-1 mr-4">
                    <input type="text" value="${num}" class="w-full bg-transparent text-lg font-mono text-white focus:outline-none border-b border-transparent focus:border-brand-accent transition-colors">
                </div>
                <div class="flex items-center gap-2">
                    <a href="tel:${cleanNum}" class="p-3 rounded-lg bg-green-500/20 text-green-400 hover:bg-green-500/30 transition">
                        <i data-lucide="phone-call" class="w-5 h-5"></i>
                    </a>
                    <button onclick="navigator.clipboard.writeText('${cleanNum}')" class="p-3 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition">
                        <i data-lucide="copy" class="w-5 h-5"></i>
                    </button>
                </div>
            `;
            resultsContent.appendChild(el);
        });
    }

    // Refresh icons for new elements
    lucide.createIcons();

    // Open drawer
    resultsDrawer.classList.remove('translate-y-full');
}

// Drawer Logic
closeDrawerBtn.addEventListener('click', () => {
    resultsDrawer.classList.add('translate-y-full');
});

// Start
initCamera();
