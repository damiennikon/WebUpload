// --- SECURE KEY STORAGE LOGIC ---
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    localStorage.setItem('wpUser', document.getElementById('settingUser').value.trim());
    localStorage.setItem('wpPass', document.getElementById('settingPass').value.trim());
    localStorage.setItem('geminiKey', document.getElementById('settingGemini').value.trim());
    document.getElementById('settingsStatus').innerText = 'Credentials saved securely on this device!';
    setTimeout(() => { document.getElementById('settingsStatus').innerText = ''; }, 3000);
});

// Auto-populate input boxes if credentials exist on this device
window.addEventListener('DOMContentLoaded', () => {
    if (localStorage.getItem('wpUser')) document.getElementById('settingUser').value = localStorage.getItem('wpUser');
    if (localStorage.getItem('wpPass')) document.getElementById('settingPass').value = localStorage.getItem('wpPass');
    if (localStorage.getItem('geminiKey')) document.getElementById('settingGemini').value = localStorage.getItem('geminiKey');
});

// Structural helper to safely grab dynamic keys
function getCredentials() {
    const user = localStorage.getItem('wpUser');
    const pass = localStorage.getItem('wpPass');
    const gemini = localStorage.getItem('geminiKey');
    
    return {
        wpAuth: user && pass ? 'Basic ' + btoa(`${user}:${pass}`) : null,
        gemini: gemini || null
    };
}

// Convert image binary to Base64 format for Gemini API pipeline
function fileToGenerativePart(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1];
            resolve({
                inlineData: { data: base64Data, mimeType: file.type }
            });
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// --- INVISIBLE CANVAS COMPRESSION (MOBILE MEMORY OPTIMIZED) ---
function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
            // Free up the memory pointer immediately to keep Android happy
            URL.revokeObjectURL(img.src);
            
            try {
                let width = img.width;
                let height = img.height;

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
                        reject(new Error('Mobile browser memory limit reached during final compression.'));
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
                reject(new Error(`Canvas processing crashed: ${err.message}`));
            }
        };

        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Browser refused to load the image into the canvas.'));
        };

        // Create a lightweight memory pointer instead of reading the massive file
        try {
            img.src = URL.createObjectURL(file);
        } catch (err) {
            reject(new Error(`Failed to create object URL: ${err.message}`));
        }
    });
}

// --- STANDARD UPLOAD LOGIC ---
function uploadWithProgress(file, authStr) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', "https://airscapephotos.com/wp-json/wp/v2/media", true);
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

// --- FEATURE 1: AI GENERATED SEO (WITH AUTO-RETRY) ---
async function fetchWithRetry(url, options, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        const response = await fetch(url, options);
        if (response.ok) return response;
        
        if (response.status >= 500 && response.status < 600) {
            document.getElementById('statusMessage').innerText = `Server busy. Auto-retrying (Attempt ${i + 1}/3)...`;
            await new Promise(res => setTimeout(res, delay));
            delay *= 2; 
        } else {
            throw new Error(`API Error: ${response.status}`);
        }
    }
    throw new Error('Google API servers are currently unreachable after multiple attempts.');
}

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
    
    statusMessage.innerText = 'Analyzing photo and generating SEO optimization...';
    const file = fileInput.files[0];
    
    try {
        const imagePart = await fileToGenerativePart(file);
        const prompt = "Analyze this image as an expert SEO specialist. Generate an optimized image Title, descriptive Alt Text for accessibility, and a detailed description. Output your response strictly as a raw JSON object with the keys: 'title', 'alt_text', and 'description'. Do not include any markdown code block wrap or formatting characters (like backticks or ```json).";

        const response = await fetchWithRetry(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${creds.gemini}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [ { text: prompt }, imagePart ] }]
            })
        });

        const result = await response.json();
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

        const updateUrl = `https://airscapephotos.com/wp-json/wp/v2/media/${newMediaId}`;
        const updateResponse = await fetch(updateUrl, {
            method: 'POST', 
            headers: {
                'Authorization': creds.wpAuth,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                alt_text: altText, 
                description: description,
                categories: [categoryId] 
            })
        });

        if (updateResponse.ok) {
            statusMessage.innerHTML = `
                <div style="color: green; margin-bottom: 10px;">Success! Image is live.</div>
                <div style="font-size: 12px; color: #555; margin-bottom: 10px;">
                    Size reduced: ${originalMb}MB ➔ ${compressedMb}MB
                </div>
                <img src="${liveImageUrl}" style="max-width: 100%; height: auto; border-radius: 4px; border: 1px solid #ccc; box-shadow: 0 2px 4px rgba(0,0,0,0.1);" alt="Uploaded Preview">
            `;
            
            // Clear the deck for the next shot
            document.getElementById('imageInput').value = '';
            document.getElementById('wpTitle').value = '';
            document.getElementById('wpAltText').value = '';
            document.getElementById('wpDescription').value = '';
            document.getElementById('categoryInput').selectedIndex = 0;
            
        } else {
            statusMessage.innerText = `Uploaded safely to cloud, but category link failed.`;
        }

    } catch (error) {
        statusMessage.innerText = `Error: ${error.message}`;
        console.error(error);
    }
});
