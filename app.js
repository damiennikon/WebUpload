// --- DLP FIELD UPLOADER v11.0 ---
// Rebranded to damienleydenphotography.au
// Added: Blog Post tab with draft/publish, featured image, live category fetch
// Preserved: EXIF strip, compression pipeline, Gemini SEO, XHR helper, error handling

const WP_BASE = 'https://damienleydenphotography.au/wp-json/wp/v2';

// ─────────────────────────────────────────
// CREDENTIALS
// ─────────────────────────────────────────
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    localStorage.setItem('wpUser', document.getElementById('settingUser').value.trim());
    localStorage.setItem('wpPass', document.getElementById('settingPass').value.trim());
    localStorage.setItem('geminiKey', document.getElementById('settingGemini').value.trim());
    const s = document.getElementById('settingsStatus');
    s.innerText = 'Credentials saved.';
    setTimeout(() => { s.innerText = ''; }, 3000);
});

// Credentials toggle
document.getElementById('credsToggle').addEventListener('click', () => {
    const btn = document.getElementById('credsToggle');
    const body = document.getElementById('credsBody');
    btn.classList.toggle('open');
    body.classList.toggle('open');
});

window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('wpUser')) document.getElementById('settingUser').value = localStorage.getItem('wpUser');
    if (localStorage.getItem('wpPass')) document.getElementById('settingPass').value = localStorage.getItem('wpPass');
    if (localStorage.getItem('geminiKey')) document.getElementById('settingGemini').value = localStorage.getItem('geminiKey');
    fetchPhotoCategories();
    fetchBlogCategories();
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
            alert('Error: WordPress credentials contain invalid characters.');
        }
    }
    const cleanGemini = gemini ? gemini.replace(/[\s\r\n]+/g, '').trim() : null;
    return { wpAuth: auth, gemini: cleanGemini };
}

// ─────────────────────────────────────────
// TABS
// ─────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    });
});

// ─────────────────────────────────────────
// CATEGORY LOADERS
// ─────────────────────────────────────────
const FALLBACK_PHOTO_CATEGORIES = [
    { id: 56, name: 'Aircraft' },
    { id: 57, name: 'Astrophotography' },
    { id: 58, name: 'Animals' },
    { id: 59, name: 'Landscape' },
    { id: 60, name: 'Cityscape' },
    { id: 61, name: 'Gear' }
];

async function fetchPhotoCategories() {
    const select = document.getElementById('categoryInput');
    select.innerHTML = FALLBACK_PHOTO_CATEGORIES
        .map(c => `<option value="${c.id}">${c.name}</option>`)
        .join('');
    try {
        const r = await fetch(`${WP_BASE}/attachment_category?per_page=100`);
        if (r.ok) {
            const cats = await r.json();
            if (cats.length > 0) {
                select.innerHTML = cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            }
        }
    } catch (e) {
        console.warn('Photo category fetch failed, using fallback:', e.message);
    }
}

async function fetchBlogCategories() {
    const select = document.getElementById('blogCategory');
    try {
        const r = await fetch(`${WP_BASE}/categories?per_page=100&orderby=name&order=asc`);
        if (r.ok) {
            const cats = await r.json();
            select.innerHTML = '<option value="">— None —</option>' +
                cats.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }
    } catch (e) {
        console.warn('Blog category fetch failed:', e.message);
    }
}

// ─────────────────────────────────────────
// EXIF STRIPPER (unchanged from v10)
// ─────────────────────────────────────────
function stripExif(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const src = new Uint8Array(e.target.result);
                if (src[0] !== 0xFF || src[1] !== 0xD8) { resolve(file); return; }
                const chunks = [src.slice(0, 2)];
                let i = 2, stripped = false;
                while (i < src.length - 3) {
                    if (src[i] !== 0xFF) { i++; continue; }
                    const marker = src[i + 1];
                    if (marker === 0xDA) { chunks.push(src.slice(i)); break; }
                    const segLen = (src[i + 2] << 8) | src[i + 3];
                    const segEnd = i + 2 + segLen;
                    if (marker === 0xE1) { stripped = true; }
                    else { chunks.push(src.slice(i, segEnd)); }
                    i = segEnd;
                }
                if (!stripped) { resolve(file); return; }
                const totalLen = chunks.reduce((sum, c) => sum + c.length, 0);
                const output = new Uint8Array(totalLen);
                let offset = 0;
                for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
                const cleanBlob = new Blob([output], { type: 'image/jpeg' });
                resolve(new File([cleanBlob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
            } catch (err) {
                console.warn('EXIF strip error:', err);
                resolve(file);
            }
        };
        reader.onerror = () => resolve(file);
        reader.readAsArrayBuffer(file);
    });
}

// ─────────────────────────────────────────
// COMPRESSION (unchanged from v10)
// ─────────────────────────────────────────
function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        stripExif(file).then((cleanFile) => {
            function getTargetDims(srcW, srcH) {
                let w = srcW, h = srcH;
                if (w > h) { if (w > maxWidth) { h = Math.round((h * maxWidth) / w); w = maxWidth; } }
                else { if (h > maxHeight) { w = Math.round((w * maxHeight) / h); h = maxHeight; } }
                return { w, h };
            }
            function drawAndExport(source, w, h) {
                return new Promise((res, rej) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(source, 0, 0, w, h);
                    canvas.toBlob((blob) => {
                        if (source.close) source.close();
                        if (!blob) return rej(new Error('Canvas failed to produce a blob.'));
                        const newName = file.name.replace(/\.[^/.]+$/, '.jpg');
                        res(new File([blob], newName, { type: 'image/jpeg', lastModified: Date.now() }));
                    }, 'image/jpeg', quality);
                });
            }
            function imageFallback() {
                return new Promise((res, rej) => {
                    const objectUrl = URL.createObjectURL(cleanFile);
                    const img = new Image();
                    img.onload = () => {
                        URL.revokeObjectURL(objectUrl);
                        const { w, h } = getTargetDims(img.naturalWidth, img.naturalHeight);
                        drawAndExport(img, w, h).then(res).catch(rej);
                    };
                    img.onerror = () => { URL.revokeObjectURL(objectUrl); rej(new Error('Image decode failed.')); };
                    img.src = objectUrl;
                });
            }
            if (window.createImageBitmap) {
                createImageBitmap(cleanFile)
                    .then((bitmap) => { const { w, h } = getTargetDims(bitmap.width, bitmap.height); return drawAndExport(bitmap, w, h); })
                    .then(resolve)
                    .catch(() => imageFallback().then(resolve).catch(reject));
            } else {
                imageFallback().then(resolve).catch(reject);
            }
        });
    });
}

// ─────────────────────────────────────────
// GEMINI BASE64 HELPER
// ─────────────────────────────────────────
function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.result) resolve({ inlineData: { data: reader.result.split(',')[1], mimeType: 'image/jpeg' } });
            else reject(new Error('FileReader returned empty result.'));
        };
        reader.onerror = () => reject(new Error('Browser blocked file read.'));
        reader.readAsDataURL(file);
    });
}

// ─────────────────────────────────────────
// XHR HELPER (unchanged from v10)
// ─────────────────────────────────────────
function xhrPost(url, headers, body, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', url, true);
        for (const key in headers) xhr.setRequestHeader(key, headers[key]);
        if (onProgress && xhr.upload) {
            xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
        }
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try { resolve(JSON.parse(xhr.responseText)); }
                catch (e) { reject(new Error('Server response was not valid JSON. Status: ' + xhr.status)); }
            } else {
                const friendlyErrors = {
                    400: 'Bad request (400) — check your credentials or file format.',
                    401: 'Unauthorised (401) — check your WordPress credentials.',
                    403: 'Forbidden (403) — check user permissions or security plugin settings.',
                    405: 'Method not allowed (405) — API endpoint may have changed.',
                    413: 'File too large (413) — try a smaller image.',
                    429: 'Rate limit hit (429) — wait a moment then try again.',
                    500: 'Server error (500) — WordPress server issue.',
                    503: 'Service unavailable (503) — try again shortly.'
                };
                reject(new Error(friendlyErrors[xhr.status] || 'Request failed with status ' + xhr.status));
            }
        };
        xhr.onerror = () => reject(new Error('Network error. Check connection or CORS policy.'));
        if (body instanceof FormData) { xhr.send(body); }
        else { xhr.setRequestHeader('Content-Type', 'application/json'); xhr.send(JSON.stringify(body)); }
    });
}

function setStatus(el, msg, type = '') {
    el.innerText = msg;
    el.className = 'status' + (type ? ' ' + type : '');
}

// ─────────────────────────────────────────
// PHOTO TAB — AI SEO
// ─────────────────────────────────────────
document.getElementById('seoBtn').addEventListener('click', async () => {
    const fileInput = document.getElementById('imageInput');
    const statusEl = document.getElementById('photoStatus');
    const creds = getCredentials();
    if (!creds.gemini) return setStatus(statusEl, 'Save your Gemini API key first.', 'error');
    if (!fileInput.files.length) return setStatus(statusEl, 'Select a photo first.', 'error');
    setStatus(statusEl, 'Compressing for AI analysis...');
    try {
        const aiThumb = await compressImage(fileInput.files[0], 1024, 1024, 0.75);
        const imagePart = await fileToGenerativePart(aiThumb);
        setStatus(statusEl, 'Generating SEO with Gemini...');
        const prompt = 'Analyze this image as an expert SEO specialist for a photography website. Generate an optimized image Title, descriptive Alt Text for accessibility, and a detailed description suitable for a photo gallery. Output your response strictly as a raw JSON object with the keys: "title", "alt_text", and "description". Do not include any markdown formatting, code blocks, or backticks.';
        const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + creds.gemini;
        const result = await xhrPost(geminiUrl, { 'Content-Type': 'application/json' }, { contents: [{ parts: [{ text: prompt }, imagePart] }] }, null);
        let aiText = result.candidates[0].content.parts[0].text;
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        const seoData = JSON.parse(aiText);
        document.getElementById('wpTitle').value = seoData.title || '';
        document.getElementById('wpAltText').value = seoData.alt_text || '';
        document.getElementById('wpDescription').value = seoData.description || '';
        setStatus(statusEl, 'SEO ready — review before uploading.', 'success');
    } catch (err) {
        setStatus(statusEl, 'SEO failed: ' + err.message, 'error');
    }
});

// ─────────────────────────────────────────
// PHOTO TAB — UPLOAD
// ─────────────────────────────────────────
document.getElementById('uploadButton').addEventListener('click', async () => {
    const fileInput = document.getElementById('imageInput');
    const statusEl = document.getElementById('photoStatus');
    const creds = getCredentials();
    if (!creds.wpAuth) return setStatus(statusEl, 'Save your WordPress credentials first.', 'error');
    if (!fileInput.files.length) return setStatus(statusEl, 'Select a file first.', 'error');
    let file = fileInput.files[0];
    const originalMb = (file.size / (1024 * 1024)).toFixed(2);
    setStatus(statusEl, `Compressing ${originalMb}MB...`);
    try {
        file = await compressImage(file, 2048, 2048, 0.85);
        const compressedMb = (file.size / (1024 * 1024)).toFixed(2);
        const formData = new FormData();
        formData.append('file', file, file.name);
        const imageData = await xhrPost(
            `${WP_BASE}/media`,
            { 'Authorization': creds.wpAuth },
            formData,
            (pct) => setStatus(statusEl, `Uploading: ${pct}%`)
        );
        setStatus(statusEl, 'Saving metadata...');
        const categoryId = parseInt(document.getElementById('categoryInput').value);
        await xhrPost(
            `${WP_BASE}/media/${imageData.id}`,
            { 'Authorization': creds.wpAuth },
            {
                title: document.getElementById('wpTitle').value.trim(),
                alt_text: document.getElementById('wpAltText').value.trim(),
                description: document.getElementById('wpDescription').value.trim(),
                attachment_category: [categoryId]
            },
            null
        );
        statusEl.innerHTML =
            `<div class="upload-preview">` +
            `<div style="color:var(--success);font-weight:600;margin-bottom:4px;">✓ Live in gallery</div>` +
            `<div class="upload-preview-meta">${originalMb}MB → ${compressedMb}MB</div>` +
            `<img src="${imageData.source_url}" alt="Upload preview">` +
            `</div>`;
        statusEl.className = 'status';
        document.getElementById('imageInput').value = '';
        document.getElementById('wpTitle').value = '';
        document.getElementById('wpAltText').value = '';
        document.getElementById('wpDescription').value = '';
        document.getElementById('categoryInput').selectedIndex = 0;
    } catch (err) {
        setStatus(statusEl, 'Upload failed: ' + err.message, 'error');
    }
});

// ─────────────────────────────────────────
// BLOG TAB — DRAFT FROM PHOTO WITH AI
// ─────────────────────────────────────────
document.getElementById('blogDraftFromPhotoBtn').addEventListener('click', async () => {
    const photoInput = document.getElementById('imageInput');
    const statusEl = document.getElementById('blogStatus');
    const creds = getCredentials();
    if (!creds.gemini) return setStatus(statusEl, 'Save your Gemini API key first.', 'error');
    if (!photoInput.files.length) return setStatus(statusEl, 'Select a photo in the Photo tab first.', 'error');
    setStatus(statusEl, 'Analysing photo with Gemini...');
    try {
        const aiThumb = await compressImage(photoInput.files[0], 1024, 1024, 0.75);
        const imagePart = await fileToGenerativePart(aiThumb);
        const prompt = 'You are writing a short field notes blog post for a photography website. The author is Damien Leyden, a Queensland-based photographer who shoots astrophotography, wildlife, aviation, and landscape photography — often in the Scenic Rim region. Analyse this photo and write a short, casual, first-person blog post (150-250 words) about it. Output strictly as a raw JSON object with two keys: "title" (a concise blog post title) and "content" (the post body as plain paragraphs separated by \\n\\n, no markdown, no HTML). No backticks, no code blocks.';
        const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + creds.gemini;
        const result = await xhrPost(geminiUrl, { 'Content-Type': 'application/json' }, { contents: [{ parts: [{ text: prompt }, imagePart] }] }, null);
        let aiText = result.candidates[0].content.parts[0].text;
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        const draft = JSON.parse(aiText);
        document.getElementById('blogTitle').value = draft.title || '';
        document.getElementById('blogContent').value = draft.content || '';
        setStatus(statusEl, 'Draft ready — edit before publishing.', 'success');
    } catch (err) {
        setStatus(statusEl, 'Draft failed: ' + err.message, 'error');
    }
});

// ─────────────────────────────────────────
// BLOG TAB — PUBLISH / DRAFT
// ─────────────────────────────────────────
document.getElementById('blogPublishBtn').addEventListener('click', async () => {
    const statusEl = document.getElementById('blogStatus');
    const creds = getCredentials();
    const title = document.getElementById('blogTitle').value.trim();
    const rawContent = document.getElementById('blogContent').value.trim();
    const isDraft = document.getElementById('blogDraftToggle').checked;
    const categoryId = document.getElementById('blogCategory').value;

    if (!creds.wpAuth) return setStatus(statusEl, 'Save your WordPress credentials first.', 'error');
    if (!title) return setStatus(statusEl, 'Add a title before publishing.', 'error');
    if (!rawContent) return setStatus(statusEl, 'Add some content before publishing.', 'error');

    // Convert plain paragraphs to basic HTML blocks
    const content = rawContent
        .split(/\n\n+/)
        .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
        .join('\n');

    const postStatus = isDraft ? 'draft' : 'publish';
    setStatus(statusEl, isDraft ? 'Saving draft...' : 'Publishing...');

    try {
        // Step 1: Upload featured image if provided
        let featuredMediaId = null;
        const featuredFile = document.getElementById('blogFeaturedImage').files[0];
        if (featuredFile) {
            setStatus(statusEl, 'Uploading featured image...');
            let imgFile = await compressImage(featuredFile, 2048, 2048, 0.85);
            const formData = new FormData();
            formData.append('file', imgFile, imgFile.name);
            const mediaData = await xhrPost(
                `${WP_BASE}/media`,
                { 'Authorization': creds.wpAuth },
                formData,
                (pct) => setStatus(statusEl, `Featured image: ${pct}%`)
            );
            featuredMediaId = mediaData.id;
            setStatus(statusEl, isDraft ? 'Saving draft...' : 'Publishing post...');
        }

        // Step 2: Create the post
        const postBody = {
            title,
            content,
            status: postStatus,
        };
        if (categoryId) postBody.categories = [parseInt(categoryId)];
        if (featuredMediaId) postBody.featured_media = featuredMediaId;

        const postData = await xhrPost(
            `${WP_BASE}/posts`,
            { 'Authorization': creds.wpAuth },
            postBody,
            null
        );

        const label = isDraft ? 'Draft saved' : 'Published';
        const link = postData.link || postData.guid?.rendered || '';
        statusEl.innerHTML = link
            ? `<span style="color:var(--success);font-weight:600;">✓ ${label}</span> — <a href="${link}" target="_blank" style="color:var(--amber);">View post ↗</a>`
            : `<span style="color:var(--success);font-weight:600;">✓ ${label}</span>`;
        statusEl.className = 'status';

        // Clear fields
        document.getElementById('blogTitle').value = '';
        document.getElementById('blogContent').value = '';
        document.getElementById('blogFeaturedImage').value = '';
        document.getElementById('blogCategory').selectedIndex = 0;
        document.getElementById('blogDraftToggle').checked = true;

    } catch (err) {
        setStatus(statusEl, 'Failed: ' + err.message, 'error');
    }
});
