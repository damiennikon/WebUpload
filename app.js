// --- VERSION 6.0 ---
// Key fix: Replaced broken hybrid compression with a reliable blob URL + Image element
// decode pipeline that handles Samsung Galaxy EXIF-rotated, high-res camera JPEGs.

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
    fetchCategories();
});

function getCredentials() {
    const user = localStorage.getItem('wpUser');
    const pass = localStorage.getItem('wpPass');
    const gemini = localStorage.getItem('geminiKey');

    let auth = null;
    if (user && pass) {
        try {
            auth = 'Basic ' + btoa(unescape(encodeURIComponent(user + ':' + pass)));
        } catch (e) {
            alert("Error: WordPress credentials contain invalid characters.");
        }
    }
    const cleanGemini = gemini ? gemini.replace(/[\s\r\n]+/g, '').trim() : null;
    return { wpAuth: auth, gemini: cleanGemini };
}

// --- DYNAMIC CATEGORY LOADER ---
async function fetchCategories() {
    try {
        const response = await fetch("https://airscapephotos.com/wp-json/wp/v2/media_category?per_page=100");
        if (response.ok) {
            const categories = await response.json();
            const select = document.getElementById('categoryInput');
            if (categories.length > 0) {
                select.innerHTML = categories
                    .map(cat => '<option value="' + cat.id + '">' + cat.name + '</option>')
                    .join('');
            }
        } else {
            console.warn("Could not fetch dynamic categories, keeping defaults.");
        }
    } catch (error) {
        console.error("Category fetch error:", error);
    }
}

// --- CORE IMAGE COMPRESSION ---
// Uses blob URL + HTMLImageElement for the decode step.
// This is the most compatible method across Android Chrome and Samsung Browser,
// handling EXIF rotation, high-res files, and unusual colour profiles without crashing.
function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();

        img.onload = () => {
            URL.revokeObjectURL(objectUrl);

            let width = img.naturalWidth;
            let height = img.naturalHeight;

            // Scale down proportionally to fit within maxWidth x maxHeight
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
            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob((blob) => {
                if (!blob) {
                    return reject(new Error('Canvas failed to produce a blob. File may be corrupted.'));
                }
                const newFileName = file.name.replace(/\.[^/.]+$/, '.jpg');
                resolve(new File([blob], newFileName, { type: 'image/jpeg', lastModified: Date.now() }));
            }, 'image/jpeg', quality);
        };

        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Image decode failed. The file may be unsupported or corrupted.'));
        };

        img.src = objectUrl;
    });
}

// --- BASE64 CONVERTER FOR GEMINI ---
function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result) {
                resolve({ inlineData: { data: reader.result.split(',')[1], mimeType: 'image/jpeg' } });
            } else {
                reject(new Error("FileReader returned empty result."));
            }
        };
        reader.onerror = () => reject(new Error("Browser blocked file read."));
        reader.readAsDataURL(file);
    });
}

// --- UNIFIED XHR HELPER ---
// Handles both FormData (multipart) and plain objects (JSON).
// Progress callback is optional — pass null if not needed.
function xhrPost(url, headers, body, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);

        for (const key in headers) {
            xhr.setRequestHeader(key, headers[key]);
        }

        if (onProgress && xhr.upload) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    resolve(JSON.parse(xhr.responseText));
                } catch (e) {
                    reject(new Error('Server response was not valid JSON. Status: ' + xhr.status));
                }
            } else {
                reject(new Error('Server error: ' + xhr.status + ' on ' + url));
            }
        };

        xhr.onerror = () => reject(new Error("Network error. Check connection or CORS policy."));

        if (body instanceof FormData) {
            xhr.send(body);
        } else {
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.send(JSON.stringify(body));
        }
    });
}

// --- FEATURE 1: AI GENERATED SEO ---
document.getElementById('seoBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('imageInput');
    const statusMessage = document.getElementById('statusMessage');
    const creds = getCredentials();

    if (!creds.gemini) return (statusMessage.innerText = 'Error: Please save your Gemini API Key first.');
    if (fileInput.files.length === 0) return (statusMessage.innerText = 'Please select a photo first.');

    statusMessage.innerText = 'Compressing image for AI analysis...';

    try {
        // Compress to a small thumbnail before sending to Gemini — avoids base64 memory limits on mobile
        const aiThumbnail = await compressImage(fileInput.files[0], 1024, 1024, 0.75);
        const imagePart = await fileToGenerativePart(aiThumbnail);

        statusMessage.innerText = 'Generating SEO data with Gemini...';

        const prompt = "Analyze this image as an expert SEO specialist for a photography website. Generate an optimized image Title, descriptive Alt Text for accessibility, and a detailed description suitable for a photo gallery. Output your response strictly as a raw JSON object with the keys: 'title', 'alt_text', and 'description'. Do not include any markdown formatting, code blocks, or backticks.";

        const geminiUrl = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" + creds.gemini;

        const result = await xhrPost(geminiUrl, { 'Content-Type': 'application/json' }, {
            contents: [{ parts: [{ text: prompt }, imagePart] }]
        }, null);

        let aiText = result.candidates[0].content.parts[0].text;
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

        const seoData = JSON.parse(aiText);
        document.getElementById('wpTitle').value = seoData.title || '';
        document.getElementById('wpAltText').value = seoData.alt_text || '';
        document.getElementById('wpDescription').value = seoData.description || '';

        statusMessage.innerText = 'SEO data ready — review and edit before uploading.';
    } catch (error) {
        statusMessage.innerText = 'SEO Failed: ' + error.message;
        console.error(error);
    }
});

// --- FEATURE 2: TARGETED GALLERY UPLOAD ---
document.getElementById('uploadButton').addEventListener('click', async () => {
    const fileInput = document.getElementById('imageInput');
    const statusMessage = document.getElementById('statusMessage');
    const creds = getCredentials();

    if (!creds.wpAuth) return (statusMessage.innerText = 'Error: Please save your WordPress credentials first.');
    if (fileInput.files.length === 0) return (statusMessage.innerText = 'Please select a file first.');

    let file = fileInput.files[0];
    const originalMb = (file.size / (1024 * 1024)).toFixed(2);
    statusMessage.innerText = 'Compressing ' + originalMb + 'MB image...';

    try {
        // Step 1: Compress to 2048px for upload
        file = await compressImage(file, 2048, 2048, 0.85);
        const compressedMb = (file.size / (1024 * 1024)).toFixed(2);
        console.log('Compression: ' + originalMb + 'MB → ' + compressedMb + 'MB');

        // Step 2: Upload image binary to WordPress media library
        const formData = new FormData();
        formData.append('file', file, file.name);

        const imageData = await xhrPost(
            "https://airscapephotos.com/wp-json/wp/v2/media",
            { 'Authorization': creds.wpAuth },
            formData,
            (percent) => { statusMessage.innerText = 'Uploading: ' + percent + '%'; }
        );

        const newMediaId = imageData.id;
        const liveImageUrl = imageData.source_url;
        statusMessage.innerText = 'Image uploaded! Saving metadata...';

        // Step 3: Patch title, alt text, description, and category
        const categoryId = parseInt(document.getElementById('categoryInput').value);

        const metaPatch = {
            title: document.getElementById('wpTitle').value.trim(),
            alt_text: document.getElementById('wpAltText').value.trim(),
            description: document.getElementById('wpDescription').value.trim(),
            media_category: [categoryId]
        };

        const updateUrl = "https://airscapephotos.com/wp-json/wp/v2/media/" + newMediaId;
        await xhrPost(updateUrl, { 'Authorization': creds.wpAuth }, metaPatch, null);

        // Step 4: Show success with preview
        statusMessage.innerHTML =
            '<div style="color: green; font-weight: bold; margin-bottom: 8px;">✓ Image live in gallery!</div>' +
            '<div style="font-size: 12px; color: #666; margin-bottom: 10px;">' + originalMb + 'MB → ' + compressedMb + 'MB</div>' +
            '<img src="' + liveImageUrl + '" style="max-width:100%; border-radius:4px; border:1px solid #ccc;" alt="Upload preview">';

        // Clear inputs for next upload
        document.getElementById('imageInput').value = '';
        document.getElementById('wpTitle').value = '';
        document.getElementById('wpAltText').value = '';
        document.getElementById('wpDescription').value = '';
        document.getElementById('categoryInput').selectedIndex = 0;

    } catch (error) {
        statusMessage.innerText = 'Upload Failed: ' + error.message;
        console.error(error);
    }
});
