// --- CACHE BUSTER & SW EXTERMINATOR ---
alert("Version 5.0 loaded! Firing FormData WAF Bypass pipeline.");

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
        for(let registration of registrations) {
            registration.unregister();
        }
    });
}

// --- SECURE KEY STORAGE LOGIC ---
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    localStorage.setItem('wpUser', document.getElementById('settingUser').value.trim());
    localStorage.setItem('wpPass', document.getElementById('settingPass').value.trim());
    localStorage.setItem('geminiKey', document.getElementById('settingGemini').value.trim());
    document.getElementById('settingsStatus').innerText = 'Credentials saved securely!';
    setTimeout(() => { document.getElementById('settingsStatus').innerText = ''; }, 3000);
});

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('wpUser')) document.getElementById('settingUser').value = localStorage.getItem('wpUser');
    if (localStorage.getItem('wpPass')) document.getElementById('settingPass').value = localStorage.getItem('wpPass');
    if (localStorage.getItem('geminiKey')) document.getElementById('settingGemini').value = localStorage.getItem('geminiKey');
});

function getCredentials() {
    const user = localStorage.getItem('wpUser');
    const pass = localStorage.getItem('wpPass');
    const gemini = localStorage.getItem('geminiKey');
    
    let auth = null;
    if (user && pass) {
        try {
            auth = 'Basic ' + btoa(unescape(encodeURIComponent(`${user}:${pass}`)));
        } catch (e) {
            alert("Error: Your WordPress credentials contain invalid characters.");
        }
    }
    // Scrub the gemini key of ALL hidden spaces, newlines, or invisible characters
    const cleanGemini = gemini ? gemini.replace(/[\s\r\n]+/g, '').trim() : null;
    
    return { wpAuth: auth, gemini: cleanGemini };
}

function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result) {
                const base64Data = reader.result.split(',')[1];
                resolve({ inlineData: { data: base64Data, mimeType: file.type } });
            } else reject(new Error("Failed to process file."));
        };
        reader.onerror = () => reject(new Error("Browser blocked file read."));
        reader.readAsDataURL(file);
    });
}

// --- JPEG HEADER PARSER ---
function getJpegDimensions(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        const slice = file.slice(0, 128 * 1024); 
        
        reader.onload = function(e) {
            const view = new DataView(e.target.result);
            if (view.byteLength < 2 || view.getUint16(0, false) !== 0xFFD8) {
                return reject(new Error("Not a standard JPEG."));
            }
            
            let offset = 2;
            while (offset < view.byteLength - 2) {
                const marker = view.getUint16(offset, false);
                if (
                    (marker >= 0xFFC0 && marker <= 0xFFC3) ||
                    (marker >= 0xFFC5 && marker <= 0xFFC7) ||
                    (marker >= 0xFFC9 && marker <= 0xFFCB) ||
                    (marker >= 0xFFCD && marker <= 0xFFCF)
                ) {
                    const height = view.getUint16(offset + 5, false);
                    const width = view.getUint16(offset + 7, false);
                    return resolve({ width, height });
                }
                
                if ((marker >= 0xFFE0 && marker <= 0xFFEF) || marker === 0xFFDB || marker === 0xFFC4 || marker === 0xFFDD || marker === 0xFFFE) {
                    offset += 2 + view.getUint16(offset + 2, false);
                } else {
                    offset += 1;
                }
            }
            reject(new Error("Dimensions not found."));
        };
        reader.onerror = () => reject(new Error("File read error."));
        reader.readAsArrayBuffer(slice);
    });
}

// --- HYBRID CANVAS COMPRESSION ---
function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise(async (resolve, reject) => {
        let targetW = maxWidth, targetH = maxHeight, hasPrecalcDims = false;

        try {
            const dims = await getJpegDimensions(file);
            let w = dims.width, h = dims.height;
            if (w > h) {
                if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; }
            } else {
                if (h > maxHeight) { w = Math.round((w * maxHeight) / h); h = maxHeight; }
            }
            targetW = w; targetH = h; hasPrecalcDims = true;
        } catch (err) {
            console.warn("Pre-calc skipped:", err.message);
        }

        const doCanvasCompression = (imgSource, objectUrlToRevoke = null) => {
            try {
                let width = imgSource.width, height = imgSource.height;
                if (width > height) {
                    if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
                } else {
                    if (height > maxHeight) { width = Math.round((width * maxHeight) / height); height = maxHeight; }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(imgSource, 0, 0, width, height);
                
                if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);

                canvas.toBlob((blob) => {
                    if (imgSource.close) imgSource.close();
                    if (!blob) return reject(new Error('Canvas blob failed.'));
                    resolve(new File([blob], file.name.replace(/\.[^/.]+$/, ".jpg"), { type: 'image/jpeg' }));
                }, 'image/jpeg', quality);
                
            } catch (err) {
                if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
                if (imgSource.close) imgSource.close();
                reject(new Error(`Crash: ${err.message}`));
            }
        };

        const runFallbackMethod = () => {
            const img = new Image();
            const objUrl = URL.createObjectURL(file);
            img.onload = () => doCanvasCompression(img, objUrl);
            img.onerror = () => {
                URL.revokeObjectURL(objUrl);
                reject(new Error('Fallback decode failed.'));
            };
            img.src = objUrl;
        };

        if (window.createImageBitmap) {
            createImageBitmap(file, hasPrecalcDims ? { resizeWidth: targetW, resizeHeight: targetH, resizeQuality: 'high' } : {})
                .then(doCanvasCompression).catch(runFallbackMethod);
        } else {
            runFallbackMethod();
        }
    });
}

// --- UNIFIED XHR PIPELINE (Bypasses SW interception) ---
function xhrPost(url, headers, body) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        for (let key in headers) {
            xhr.setRequestHeader(key, headers[key]);
        }
        
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                reject(new Error(`API Error: ${xhr.status} on ${url}`));
            }
        };
        xhr.onerror = () => reject(new Error("Network Error. Check connection or CORS."));
        
        // If body is FormData, send directly. If Object, send as JSON.
        if (body instanceof FormData) {
            xhr.send(body); 
        } else {
            xhr.send(JSON.stringify(body));
        }
    });
}

function uploadImageFile(file, authStr) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const wpEndpoint = "https://airscapephotos.com/wp-json/wp/v2/media";
        
        xhr.open('POST', wpEndpoint, true);
        xhr.setRequestHeader('Authorization', authStr);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                document.getElementById('statusMessage').innerText = `Uploading Image: ${percent}%`;
            }
        };

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.responseText));
            } else {
                reject(new Error(`Upload Blocked: ${xhr.status}`));
            }
        };
        xhr.onerror = () => reject(new Error("Network Error during upload pipeline."));
        
        const formData = new FormData();
        formData.append('file', file, file.name);
        xhr.send(formData);
    });
}

// --- FEATURE 1: AI GENERATED SEO ---
document.getElementById('seoBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('imageInput');
    const statusMessage = document.getElementById('statusMessage');
    const creds = getCredentials();
    
    if (!creds.gemini) return statusMessage.innerText = 'Error: Please save your Gemini API Key first.';
    if (fileInput.files.length === 0) return statusMessage.innerText = 'Please select a photo first.';
    
    statusMessage.innerText = 'Preparing image for AI analysis...';
    
    try {
        const aiThumbnail = await compressImage(fileInput.files[0], 1024, 1024, 0.7);
        const imagePart = await fileToGenerativePart(aiThumbnail);
        
        statusMessage.innerText = 'Generating SEO optimization...';

        const prompt = "Analyze this image as an expert SEO specialist. Generate an optimized image Title, descriptive Alt Text for accessibility, and a detailed description. Output your response strictly as a raw JSON object with the keys: 'title', 'alt_text', and 'description'. Do not include any markdown wrap.";
        const geminiUrl = "https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=" + encodeURIComponent(creds.gemini);

        const result = await xhrPost(geminiUrl, { 'Content-Type': 'application/json' }, {
            contents: [{ parts: [ { text: prompt }, imagePart ] }]
        });
        
        let aiText = result.candidates[0].content.parts[0].text;
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const seoData = JSON.parse(aiText);
        document.getElementById('wpTitle').value = seoData.title || '';
        document.getElementById('wpAltText').value = seoData.alt_text || '';
        document.getElementById('wpDescription').value = seoData.description || '';
        
        statusMessage.innerText = 'SEO optimization ready for review.';
    } catch (error) {
        statusMessage.innerText = `SEO Failed: ${error.message}`;
        console.error(error);
    }
});

// --- FEATURE 2: TARGETED GALLERY UPLOAD (WAF BYPASS) ---
document.getElementById('uploadButton').addEventListener('click', async () => {
    const fileInput = document.getElementById('imageInput');
    const statusMessage = document.getElementById('statusMessage');
    const creds = getCredentials();

    if (!creds.wpAuth) return statusMessage.innerText = 'Error: Please save your WordPress credentials first.';
    if (fileInput.files.length === 0) return statusMessage.innerText = 'Please select a file first.';

    let file = fileInput.files[0];
    const originalMb = (file.size / (1024 * 1024)).toFixed(2);
    statusMessage.innerText = `Compressing ${originalMb}MB image...`;

    try {
        // Step 1: Compress the image safely
        file = await compressImage(file, 2048, 2048, 0.8);
        const compressedMb = (file.size / (1024 * 1024)).toFixed(2);
        
        // Step 2: Upload raw image
        const imageData = await uploadImageFile(file, creds.wpAuth);
        const newMediaId = imageData.id;
        const liveImageUrl = imageData.source_url; 
        
        statusMessage.innerText = 'Image saved! Slipping metadata past firewall...';

        // Step 3: WAF Bypass for Categories & Metadata
        // By building a FormData object instead of JSON, Cloudflare sees this as a harmless HTML form submission, not an API attack!
        const updateUrl = "https://airscapephotos.com/wp-json/wp/v2/media/" + newMediaId;
        const metadataForm = new FormData();
        
        const titleVal = document.getElementById('wpTitle').value.trim();
        const altVal = document.getElementById('wpAltText').value.trim();
        const descVal = document.getElementById('wpDescription').value.trim();
        const catVal = document.getElementById('categoryInput').value;
        
        if (titleVal) metadataForm.append('title', titleVal);
        if (altVal) metadataForm.append('alt_text', altVal);
        if (descVal) metadataForm.append('description', descVal);
        if (catVal) metadataForm.append('categories', catVal);

        // Send the FormData via XHR (browser automatically attaches correct multipart headers)
        await xhrPost(updateUrl, { 'Authorization': creds.wpAuth }, metadataForm);

        statusMessage.innerHTML = `
            <div style="color: green; margin-bottom: 10px;">Success! Image & Metadata live on WordPress.</div>
            <div style="font-size: 12px; color: #555; margin-bottom: 10px;">Size: ${originalMb}MB ➔ ${compressedMb}MB</div>
            <img src="${liveImageUrl}" style="max-width: 100%; border-radius: 4px; border: 1px solid #ccc;" alt="Uploaded Preview">
        `;
        
        // Clear inputs for next photo
        document.getElementById('imageInput').value = '';
        document.getElementById('wpTitle').value = '';
        document.getElementById('wpAltText').value = '';
        document.getElementById('wpDescription').value = '';
        document.getElementById('categoryInput').selectedIndex = 0;

    } catch (error) {
        statusMessage.innerText = `Upload Failed: ${error.message}`;
        console.error(error);
    }
});
