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

    statusMessage.innerText = 'Uploading to website gallery...';
    const file = fileInput.files[0];

    const title = document.getElementById('wpTitle').value;
    const altText = document.getElementById('wpAltText').value;
    const description = document.getElementById('wpDescription').value;
    const categoryId = document.getElementById('categoryInput').value;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', title);
    formData.append('alt_text', altText);
    formData.append('description', description);
    formData.append('media_category', categoryId);

    try {
        const response = await fetch('https://airscapephotos.com/wp-json/wp/v2/media', {
            method: 'POST',
            headers: { 'Authorization': creds.wpAuth },
            body: formData
        });

        // Read the raw response from the server FIRST so it doesn't crash on HTML
        const responseText = await response.text();

        if (response.ok) {
            const data = JSON.parse(responseText);
            statusMessage.innerText = `Success! Image pushed to gallery. Media ID: ${data.id}`;
        } else {
            // Check if the server threw an HTML webpage at us instead of a proper error
            if (responseText.trim().startsWith('<')) {
                // Extract just the <title> of the HTML page to find the real error
                const titleMatch = responseText.match(/<title>(.*?)<\/title>/i);
                const errorTitle = titleMatch ? titleMatch[1] : "Unknown Server HTML Error";
                statusMessage.innerText = `Server Blocked Upload: ${errorTitle}`;
            } else {
                // If it's a standard WordPress JSON error, parse it normally
                const err = JSON.parse(responseText);
                statusMessage.innerText = `WP Error: ${err.message}`;
            }
        }
    } catch (error) {
        statusMessage.innerText = `Network connection error: ${error.message}`;
    }
});
