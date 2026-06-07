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

// --- INVISIBLE CANVAS COMPRESSION ---
function compressImage(file, maxWidth, maxHeight, quality) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                // Calculate new dimensions while keeping the exact aspect ratio
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

                // Draw the resized image onto an invisible canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Convert the canvas back into a lightweight JPEG file
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Canvas compression failed.'));
                        return;
                    }
                    // Force the filename to end in .jpg so WordPress accepts it smoothly
                    const newFileName = file.name.replace(/\.[^/.]+$/, ".jpg");
                    const compressedFile = new File([blob], newFileName, {
                        type: 'image/jpeg',
                        lastModified: Date.now()
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', quality);
            };
            img.onerror = error => reject(error);
        };
        reader.onerror = error => reject(error);
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
    
    statusMessage.innerText = 'Analyzing photo and generating SEO optimization...';
    const file = fileInput.files[0];
    
    try {
        const imagePart = await fileToGenerativePart(file);
        const prompt = "Analyze this image as an expert SEO specialist. Generate an optimized image Title, descriptive Alt Text for accessibility, and a detailed description. Output your response strictly as a raw JSON object with the keys: 'title', 'alt_text', and 'description'. Do not include any markdown code block wrap or formatting characters (like backticks or ```json).";

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${creds.gemini}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [ { text: prompt }, imagePart ] }]
            })
        });

        if (!response.ok) throw new Error('Failed to reach Gemini API backend.');

        const result = await response.json();
        let aiText = result.candidates[0].content.parts[0].text;
        
        // Minor clean up safety pass to remove any markdown wrapping artifacts if present
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const seoData = JSON.parse(aiText);
        document.getElementById('wpTitle').value = seoData.title || '';
        document.getElementById('wpAltText').value = seoData.alt_text || '';
        document.getElementById('wpDescription').value = seoData.description || '';
        
        statusMessage.innerText = 'SEO optimization ready for review.';
    } catch (error) {
        statusMessage.innerText = 'Error generating SEO data. Verify your key or console logs.';
        console.error(error);
    }
});

// --- FEATURE 2: TARGETED GALLERY UPLOAD (TWO-STEP FIREWALL BYPASS) ---
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

    statusMessage.innerText = 'Compressing image for upload...';
    let file = fileInput.files[0];

    try {
        // Compress the image before uploading
        file = await compressImage(file, 2048, 2048, 0.8);
        statusMessage.innerText = 'Uploading optimized image...';

        const title = document.getElementById('wpTitle').value;
        const altText = document.getElementById('wpAltText').value;
        const description = document.getElementById('wpDescription').value;
        const categoryId = document.getElementById('categoryInput').value;

        // STEP 1: Upload Raw Binary Image (Sneaks right past server firewalls)
        const imageResponse = await fetch('[https://airscapephotos.com/wp-json/wp/v2/media](https://airscapephotos.com/wp-json/wp/v2/media)', {
            method: 'POST',
            headers: {
                'Authorization': creds.wpAuth,
                'Content-Disposition': `attachment; filename="${file.name}"`,
                'Content-Type': 'image/jpeg'
            },
            body: file
        });

        if (!imageResponse.ok) {
            const errText = await imageResponse.text();
            throw new Error(`Upload Blocked: ${imageResponse.status}.`);
        }

        const imageData = await imageResponse.json();
        const newMediaId = imageData.id;
        statusMessage.innerText = 'Image saved! Linking to gallery...';

        // STEP 2: Update the uploaded image with SEO and Category data via JSON
        const updateResponse = await fetch(`https://airscapephotos.com/wp-json/wp/v2/media/${newMediaId}`, {
            method: 'POST',
            headers: {
                'Authorization': creds.wpAuth,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                title: title,
                alt_text: altText,
                description: description,
                media_category: [parseInt(categoryId)]
            })
        });

        if (updateResponse.ok) {
            statusMessage.innerText = `Success! Image is now live in the gallery.`;
        } else {
            statusMessage.innerText = `Uploaded safely, but category link failed.`;
        }

    } catch (error) {
        statusMessage.innerText = `Network Error: ${error.message}`;
        console.error(error);
    }
});
