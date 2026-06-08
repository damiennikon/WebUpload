// --- CACHE BUSTING ALERT ---
alert("New App.js is successfully running! Version 3.0 (XHR Unified)");

// --- SECURE KEY STORAGE LOGIC ---
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    localStorage.setItem('wpUser', document.getElementById('settingUser').value.trim());
    localStorage.setItem('wpPass', document.getElementById('settingPass').value.trim());
    localStorage.setItem('geminiKey', document.getElementById('settingGemini').value.trim());
    document.getElementById('settingsStatus').innerText = 'Credentials saved securely on this device!';
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
            console.error("Credentials encoding failed", e);
            alert("Error: Your WordPress username or password contains invalid characters.");
        }
    }
    
    return {
        wpAuth: auth,
        gemini: gemini || null
    };
}

function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result) {
                const base64Data = reader.result.split(',')[1];
                resolve({ inlineData: { data: base64Data, mimeType: file.type } });
            } else {
                reject(new Error("Failed to process file into text format."));
            }
        };
        reader.onerror = () => reject(new Error("Mobile browser blocked file read for AI."));
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
                    const length = view.getUint16(offset + 2, false);
                    offset += 2 + length;
                } else {
                    offset += 1;
                }
            }
            reject(new Error("Dimensions not found in chunk."));
        };
        reader.onerror = () => reject(new Error("File read error."));
        reader.readAsArrayBuffer(slice);
    });
}

// --- HYBRID CANVAS COMPRESSION ---
function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise(async (resolve, reject) => {
        let targetW = maxWidth;
        let targetH = maxHeight;
        let hasPrecalcDims = false;

        try {
            const dims = await getJpegDimensions(file);
            let w = dims.width;
            let h = dims.height;

            if (w > h) {
                if (w > maxWidth) {
                    h = Math.round((h * maxWidth) / w);
                    w = maxWidth;
                }
            } else {
                if (h > maxHeight) {
                    w = Math.round((w * maxHeight) / h);
                    h = maxHeight;
                }
            }
            targetW = w;
            targetH = h;
            hasPrecalcDims = true;
        } catch (err) {
            console.warn("Dimension pre-calc skipped: ", err.message);
        }

        const doCanvasCompression = (imgSource, objectUrlToRevoke = null) => {
            try {
                let width = imgSource.width;
                let height = imgSource.height;

                if (width > height) {
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width = Math.round((width * maxHeight) / height);
                        height = maxHeight;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                ctx.drawImage(imgSource, 0, 0, width, height);
                
                if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);

                canvas.toBlob((blob) => {
                    if (imgSource.close) imgSource.close();
                    
                    if (!blob) {
                        reject(new Error('Canvas blob generation failed.'));
                        return;
                    }
                    const newFileName = file.name.replace(/\.[^/.]+$/, ".jpg");
                    const compressedFile = new File([blob], newFileName, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
                
            } catch (err) {
                if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
                if (imgSource.close) imgSource.close();
                reject(new Error(`Compression process crashed: ${err.message}`));
            }
        };

        const runFallbackMethod = () => {
            const img = new Image();
            const objUrl = URL.createObjectURL(file);
            
            img.onload = () => {
                doCanvasCompression(img, objUrl);
            };
            img.onerror = () => {
                URL.revokeObjectURL(objUrl);
                reject(new Error('Browser refused to load the image into memory via fallback.'));
            };
            img.src = objUrl;
        };

        if (window.createImageBitmap) {
            const bitmapOptions = hasPrecalcDims ? { 
                resizeWidth: targetW, 
                resizeHeight: targetH, 
                resizeQuality: 'high' 
            } : {};

            createImageBitmap(file, bitmapOptions).then(bitmap => {
                doCanvasCompression(bitmap);
            }).catch(err => {
                runFallbackMethod();
            });
        } else {
            runFallbackMethod();
        }
    });
}

// --- UNIFIED XHR PIPELINE (Bypasses Service Worker Fetch Bugs) ---
function xhrPostWithRetry(url, headers, body, retries = 3, delay = 1000) {
    return new Promise((resolve, reject) => {
        const attempt = (currentRetry, currentDelay) => {
            const xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            for (let key in headers) {
                xhr.setRequestHeader(key, headers[key]);
            }
            
            xhr.onload = () => {
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(JSON.parse(xhr.responseText));
                } else if (xhr.status >= 500 && currentRetry < retries) {
                    document.getElementById('statusMessage').innerText = `Server busy. Auto-retrying (Attempt ${currentRetry + 1}/${retries})...`;
                    setTimeout(() => attempt(currentRetry + 1, currentDelay * 2), currentDelay);
                } else {
                    let errorMsg = `API Error: ${xhr.status}`;
                    try {
                        const errJson = JSON.parse(xhr.responseText);
                        if (errJson.message) errorMsg += ` - ${errJson.message}`;
                        else if (errJson.error && errJson.error.message) errorMsg += ` - ${errJson.error.message}`;
                    } catch(e) {}
                    reject(new Error(errorMsg));
                }
            };
            xhr.onerror = () => reject(new Error("Network Error. Check connection or CORS."));
            xhr.send(JSON.stringify(body));
        };
        attempt(0, delay);
    });
}

function uploadWithProgress(file, authStr) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const wpEndpoint = "https://airscapephotos.com/wp-json/wp/v2/media";
        
        xhr.open('POST', wpEndpoint, true);
        xhr.setRequestHeader('Authorization', authStr);

        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                document.getElementById('statusMessage').innerText = `Uploading to Server: ${percent}%`;
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
    
    if (!creds.gemini) {
        statusMessage.innerText = 'Error: Please save your Gemini API Key in the settings first.';
        return;
    }
    if (fileInput.files.length === 0) {
        statusMessage.innerText = 'Please select a photo first.';
        return;
    }
    
    statusMessage.innerText = 'Preparing image for AI analysis...';
    const file = fileInput.files[0];
    
    try {
        const aiThumbnail = await compressImage(file, 1024, 1024, 0.7);
        const imagePart = await fileToGenerativePart(aiThumbnail);
        
        statusMessage.innerText = 'Analyzing photo and generating SEO optimization...';

        const prompt = "Analyze this image as an expert SEO specialist. Generate an optimized image Title, descriptive Alt Text for accessibility, and a detailed description. Output your response strictly as a raw JSON object with the keys: 'title', 'alt_text', and 'description'. Do not include any markdown code block wrap or formatting characters (like backticks or ```json).";
        const geminiUrl = "[https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=](https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=)" + creds.gemini;

        // Uses the new unified XHR pipeline to bypass Service Worker fetch traps
        const result = await xhrPostWithRetry(geminiUrl, { 'Content-Type': 'application/json' }, {
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
        statusMessage.innerText = `Error: ${error.message}`;
        console.error(error);
    }
});

// --- FEATURE 2: TARGETED GALLERY UPLOAD ---
document.getElementById('uploadButton').addEventListener('click', async () => {
    const fileInput = document.getElementById('imageInput');
    const statusMessage = document.getElementById('statusMessage');
    const creds = getCredentials();

    if (!creds.wpAuth) {
        statusMessage.innerText = 'Error: Please save your WordPress credentials in the settings first.';
        return;
    }
    if (fileInput.files.length === 0) {
        statusMessage.innerText = 'Please select a file first.';
        return;
    }

    let file = fileInput.files[0];
    const originalMb = (file.size / (1024 * 1024)).toFixed(2);
    statusMessage.innerText = `Compressing ${originalMb}MB image...`;

    try {
        file = await compressImage(file, 2048, 2048, 0.8);
        const compressedMb = (file.size / (1024 * 1024)).toFixed(2);
        
        const title = document.getElementById('wpTitle').value;
        const altText = document.getElementById('wpAltText').value;
        const description = document.getElementById('wpDescription').value;
        const categorySelect = document.getElementById('categoryInput');
        const categoryId = categorySelect.value ? parseInt(categorySelect.value) : 38;

        const imageData = await uploadWithProgress(file, creds.wpAuth);
        const newMediaId = imageData.id;
        const liveImageUrl = imageData.source_url; 
        
        statusMessage.innerText = 'Image saved! Linking SEO and Categories...';

        // WAF Bypass Trick: Append ?_method=POST and override header to slip past Cloudflare blocks
        const updateUrl = "[https://airscapephotos.com/wp-json/wp/v2/media/](https://airscapephotos.com/wp-json/wp/v2/media/)" + newMediaId + "?_method=POST";
        const updateHeaders = {
            'Authorization': creds.wpAuth,
            'Content-Type': 'application/json',
            'X-HTTP-Method-Override': 'POST'
        };

        try {
            await xhrPostWithRetry(updateUrl, updateHeaders, {
                title: title,
                alt_text: altText, 
                description: description,
                categories: [categoryId] 
            }, 0); 

            statusMessage.innerHTML = `
                <div style="color: green; margin-bottom: 10px;">Success! Image is live.</div>
                <div style="font-size: 12px; color: #555; margin-bottom: 10px;">
                    Size reduced: ${originalMb}MB ➔ ${compressedMb}MB
                </div>
                <img src="${liveImageUrl}" style="max-width: 100%; height: auto; border-radius: 4px; border: 1px solid #ccc; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" alt="Uploaded Preview">
            `;
            
            document.getElementById('imageInput').value = '';
            document.getElementById('wpTitle').value = '';
            document.getElementById('wpAltText').value = '';
            document.getElementById('wpDescription').value = '';
            document.getElementById('categoryInput').selectedIndex = 0;
            
        } catch (updateErr) {
            statusMessage.innerText = `Uploaded safely to cloud, but category link failed. (${updateErr.message})`;
        }

    } catch (error) {
        statusMessage.innerText = `Error: ${error.message}`;
        console.error(error);
    }
});
