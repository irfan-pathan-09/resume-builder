const express = require('express');
const fs = require('fs').promises;
const path = require('path');
const helmet = require('helmet');
const sanitizeHtml = require('sanitize-html'); 
const { URL } = require('url');
const cors = require('cors');


process.on('uncaughtException', (err) => {
    console.error('🚨 Unhandled Exception 🚨:', err.message);
    console.error(err.stack);

});


process.on('unhandledRejection', (reason, promise) => {
    console.error('🚨 Unhandled Rejection 🚨:', reason);
    console.error(promise);

});

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');
const IMAGES_DIR = path.join(__dirname, 'public', 'images');
const ADMIN_API_KEY = 'your_secret_admin_key'; 


app.use((req, res, next) => {
    console.log('📡 Incoming Request URL:', req.url);
    console.log('📁 Incoming Request Path:', req.path);
    next();
});


let dbCache = {};
let isDbLocked = false;


const initialize = async () => {
    try {
        await fs.mkdir(IMAGES_DIR, { recursive: true });
        const data = await fs.readFile(DB_FILE, 'utf8');
        dbCache = JSON.parse(data);
        console.log('Database initialized successfully.');
    } catch (error) {
        if (error.code === 'ENOENT') {
  
            dbCache = {};
            await fs.writeFile(DB_FILE, '{}', 'utf8');
            console.log('db.json not found, created a new empty one.');
        } else {
            console.error('Error initializing DB:', error);
            dbCache = {}; 
        }
    }
};


const readDB = () => JSON.parse(JSON.stringify(dbCache));
const writeDB = async (data) => {
   
    if (isDbLocked) {
        console.warn('DB write attempted while locked, request skipped.');
        return;
    }
    isDbLocked = true;
    try {
        dbCache = data;
        await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log('Database written to db.json');
    } catch (error) {
        console.error('CRITICAL: Failed to write to db.json!', error);
    } finally {
        isDbLocked = false;
    }
};


const getNextId = () => {
    const ids = Object.keys(dbCache).map(Number).filter(id => !isNaN(id));
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
};

const saveBase64Image = async (id, base64Data, suffix) => {
    if (!base64Data || !base64Data.startsWith('data:image')) {
        
        return null; 
    }


    const matches = base64Data.match(/^data:(image\/(png|jpg|jpeg|gif|webp));base64,(.*)$/);
    if (!matches) {
        console.error("Invalid base64 image data format.");
        return null;
    }
    const mimeType = matches[1];
    const base64Image = matches[3];
    const extension = mimeType.split('/')[1]; 

    const imageName = `${id}-${suffix}.${extension}`;
    const imagePath = path.join(IMAGES_DIR, imageName);
    try {
        await fs.writeFile(imagePath, base64Image, { encoding: 'base64' });
        return `/images/${imageName}`; 
    } catch (error) {
        console.error(`Error saving image ${imageName}:`, error);
        return null;
    }
};

const deleteImageFiles = async (id) => {
    
    for (const suffix of ['original', 'cropped']) {
        for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'webp']) { 
            try {
                const imagePath = path.join(IMAGES_DIR, `${id}-${suffix}.${ext}`);
                await fs.unlink(imagePath);
                console.log(`Deleted image: ${imagePath}`);
            } catch (error) {
                if (error.code !== 'ENOENT') { 
                    console.error(`Failed to delete image for ${id}-${suffix}.${ext}:`, error);
                }
            }
        }
    }
};

// --- Middleware ---
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com", "https://cdn.jsdelivr.net", "data:"],
            imgSrc: ["'self'", "data:", "blob:", "https:"],
            connectSrc: ["'self'", "http://localhost:3000", "http://127.0.0.1:3000"],
        }
    }
})); // Security headers with CSP allowing frontend CDN assets
app.use(express.json({ limit: '10mb' })); // Parse JSON bodies, limit image size

// CORS configuration - Use the imported 'cors' middleware
app.use(cors({
    origin: '*', // Allow all origins for development as requested
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key'],
}));

// Add Cross-Origin-Resource-Policy header for static assets (especially images)
// This must come BEFORE express.static to apply to the static files
app.use('/images', (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
});

// Default landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public_resume_showcase.html'));
});

app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname))); // Also serve static files from root directory


// Admin API Key authentication middleware
const authenticateApiKey = (req, res, next) => {
    // Admin builder doesn't need auth logic as per user, but server still expects API key for protected routes
    if (req.headers['x-api-key'] !== ADMIN_API_KEY) {
        return res.status(401).json({ message: 'Unauthorized: Invalid API Key' });
    }
    next();
};

// --- Server-Side Validation ---
const validateResumeData = (data) => {
    const errors = [];

    // Personal Info Validations
    const personalInfo = data.personalInfo || {};
    if (!personalInfo.fullName || !/^[a-zA-ZÀ-ÿ\s'-]{2,100}$/.test(personalInfo.fullName.trim())) {
        errors.push('Full Name is required (2-100 characters, letters, spaces, hyphens, and apostrophes allowed).');
    }
    if (!personalInfo.email) {
        errors.push('Email is required.');
    } else {
        // Simple email format check
        const [emailPrefix, emailDomain] = personalInfo.email.split('@');
        if (!emailPrefix || !emailDomain || !/^[a-zA-Z0-9._%+-]+$/.test(emailPrefix) || !/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(emailDomain)) {
            errors.push('A valid email address is required.');
        }
    }

    // Phone number is optional, but if present, must be 7-15 digits
    // More robust check with country code specific lengths could be added here if needed
    if (personalInfo.phone && personalInfo.phone.trim() !== '' && !/^\d{7,15}$/.test(personalInfo.phone.trim())) {
        errors.push('Phone number must be between 7 and 15 digits if provided.');
    }
    if (personalInfo.phone && personalInfo.phone.trim() !== '' && !personalInfo.countryCode) {
        errors.push('Country code is required if phone number is provided.');
    }
    if (personalInfo.countryCode && personalInfo.countryCode.trim() !== '' && !personalInfo.phone) {
        errors.push('Phone number is required if country code is provided.');
    }


    if (!personalInfo.city || !/^[a-zA-ZÀ-ÿ\s'-]{2,50}$/.test(personalInfo.city.trim())) {
        errors.push('City is required (2-50 characters, letters, spaces, hyphens, and apostrophes allowed).');
    }
    if (!personalInfo.country || !personalInfo.country.trim()) {
        errors.push('Country is required.');
    }


    // LinkedIn URL is optional, but if present, must be valid
    if (personalInfo.linkedin && personalInfo.linkedin.trim() !== '' && !/^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/.test(personalInfo.linkedin.trim())) {
        errors.push('Invalid LinkedIn URL format (optional).');
    }

    // GitHub URL is optional, but if present, must be valid
    if (personalInfo.github && personalInfo.github.trim() !== '' && !/^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/.test(personalInfo.github.trim())) {
        errors.push('Invalid GitHub URL format (optional).');
    }

    // YouTube URL is optional, but if present, must be valid
    if (personalInfo.youtube && personalInfo.youtube.trim() !== '' && !/^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/.test(personalInfo.youtube.trim())) {
        errors.push('Invalid YouTube URL format (optional).');
    }

    // Rating field is now required
    const { rating } = personalInfo;
    if (rating === null || rating === undefined || rating === '') {
        errors.push('Rating is required.');
    } else {
        const ratingNum = parseFloat(rating);
        if (isNaN(ratingNum) || ratingNum < 0 || ratingNum > 5) {
            errors.push('Rating must be between 0.0 and 5.0.');
        }
    }

    // Education Validations (removed client-side, but good to have basic server-side if not too strict)
    (data.education || []).forEach((edu, index) => {
        if (!edu.degree || !edu.degree.trim()) errors.push(`Education #${index + 1}: Degree is required.`);
        if (!edu.institution || !edu.institution.trim()) errors.push(`Education #${index + 1}: Institution is required.`);

        const startYear = parseInt(edu.startYear);
        if (isNaN(startYear) || startYear < 1900 || startYear > 2100) errors.push(`Education #${index + 1}: Valid Start Year is required (e.g., 2018).`);

        if (edu.endYear && edu.endYear.trim()) {
            const endYear = parseInt(edu.endYear);
            if (isNaN(endYear) || endYear < 1900 || endYear > 2100) errors.push(`Education #${index + 1}: Valid End Year is required (e.g., 2022).`);
            if (!isNaN(startYear) && !isNaN(endYear) && endYear < startYear) errors.push(`Education #${index + 1}: End Year cannot be before Start Year.`);
        }
    });

    // Experience Validations (minimal client-side, but basic server-side checks remain)
    (data.experience || []).forEach((exp, index) => {
        if (!exp.jobTitle || !exp.jobTitle.trim()) errors.push(`Experience #${index + 1}: Job Title is required.`);
        if (!exp.company || !exp.company.trim()) errors.push(`Experience #${index + 1}: Company is required.`);
        if (!exp.startDate || !exp.startDate.trim()) errors.push(`Experience #${index + 1}: Start Date is required.`);

        if (exp.startDate && exp.endDate && exp.endDate.trim()) {
            const startDate = new Date(exp.startDate);
            const endDate = new Date(exp.endDate);
            if (endDate < startDate) errors.push(`Experience #${index + 1}: End Date cannot be before Start Date.`);
        }
        if (exp.description && exp.description.trim().length > 250) errors.push(`Experience #${index + 1}: Description cannot exceed 250 characters.`);
    });

    // Projects Validations (minimal client-side, but basic server-side checks remain)
    (data.projects || []).forEach((proj, index) => {
        if (!proj.projectName || !proj.projectName.trim()) errors.push(`Project #${index + 1}: Project Name is required.`);
        if (proj.projectUrl && proj.projectUrl.trim()) {
            try {
                new URL(proj.projectUrl.trim());
            } catch (_) {
                errors.push(`Project #${index + 1}: Invalid Project URL format.`);
            }
        }
        if (proj.projectYoutubeUrl && proj.projectYoutubeUrl.trim() && !/^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/.test(proj.projectYoutubeUrl.trim())) {
            errors.push(`Project #${index + 1}: Invalid Project YouTube URL format.`);
        }
        if (proj.description && proj.description.trim().length > 250) errors.push(`Project #${index + 1}: Description cannot exceed 250 characters.`);
    });

    // Skills Validations - Support both object format {name, rating} and legacy string format
    if (!data.skills || data.skills.length === 0) {
        errors.push('At least one skill is required.');
    } else {
        data.skills.forEach((skill, index) => {
            // Handle both object format {name, rating} and legacy string format "HTML"
            const skillName = typeof skill === 'object' ? (skill.name ? String(skill.name).trim() : '') : String(skill).trim();
            
            if (!skillName) {
                errors.push(`Skill #${index + 1}: Name is required.`);
                return;
            }

            // For new submissions with objects, validate rating; skip for legacy strings
            if (typeof skill === 'object') { 
                const skillRating = parseFloat(skill.rating);
                if (isNaN(skillRating) || skillRating < 0 || skillRating > 5) { 
                    errors.push(`Skill #${index + 1}: Rating must be between 0 and 5.`); 
                } 
            } 
        }); 
    }

    // Tags Validations
    if (!data.tags || data.tags.length === 0) {
        errors.push('At least one tag is required.');
    }

    return errors;
};

// --- Sanitization Middleware ---
const sanitizeResumeData = (req, res, next) => {
    const sanitizeConfig = {
        allowedTags: [], // No HTML tags allowed in most text fields by default
        allowedAttributes: {},
        // Add specific tags/attributes if you want to allow limited HTML in descriptions etc.
        // e.g., allowedTags: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'a'],
        // allowedAttributes: { 'a': ['href'] }
    };

    function deepSanitize(obj) {
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                if (typeof obj[key] === 'string') {
                    // Skip URLs from sanitization as they are validated separately
                    // and might contain characters that sanitizeHtml would remove (like & in query params)
                    if (key === 'linkedin' || key === 'github' || key === 'youtube' || key === 'projectUrl' || key.toLowerCase().includes('url')) {
                        // For URLs, we'll just trim and keep, validation handles validity
                        obj[key] = obj[key].trim();
                    } else {
                        obj[key] = sanitizeHtml(obj[key].trim(), sanitizeConfig);
                    }
                } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                    deepSanitize(obj[key]);
                }
            }
        }
    }

    if (req.body) {
        deepSanitize(req.body);
    }
    next();
};

app.use(sanitizeResumeData); // Apply sanitization to all incoming request bodies

// --- API Routes ---

// CREATE Resume
app.post('/api/resumes', authenticateApiKey, async (req, res) => {
    const validationErrors = validateResumeData(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
    }

    const db = readDB();
    const id = getNextId().toString();
    const { profilePhotoOriginalBase64, profilePhotoCroppedBase64, ...resumeData } = req.body;

    resumeData.id = id;
    // Ensure personalInfo exists before assigning image URLs
    resumeData.personalInfo = resumeData.personalInfo || {};

    // Save images and get their URLs
    resumeData.personalInfo.profilePhotoOriginalUrl = await saveBase64Image(id, profilePhotoOriginalBase64, 'original');
    resumeData.personalInfo.profilePhotoCroppedUrl = await saveBase64Image(id, profilePhotoCroppedBase64, 'cropped');

    db[id] = resumeData;
    await writeDB(db);
    res.status(201).json({ message: 'Resume created successfully', id });
});

// READ ALL Resumes (with filtering capability)
app.get('/api/resumes', (req, res) => {
    let resumes = Object.values(readDB());
    // Basic filtering from query parameters can be added here if needed
    // Example: /api/resumes?city=Delhi&skill=React
    const { city, skill, tag, name, degree } = req.query; // Added degree to query params

    let filteredResumes = resumes.filter(resume => {
        let match = true;
        if (city && resume.personalInfo.city) {
            match = match && resume.personalInfo.city.toLowerCase().includes(city.toLowerCase());
        }
        if (skill && resume.skills) {
            // Case-insensitive skill matching
            // Now checks for skill.name property for matching
            // Case-insensitive skill matching - handle both object and string formats
            match = match && resume.skills.some(s => {
                const skillName = typeof s === 'object' ? s.name : s;
                return skillName && skillName.toLowerCase().includes(skill.toLowerCase());
            });
        }
        if (tag && resume.tags) {
            // Case-insensitive tag matching
            match = match && resume.tags.map(t => t.toLowerCase()).includes(tag.toLowerCase());
        }
        if (name && resume.personalInfo.fullName) {
            match = match && resume.personalInfo.fullName.toLowerCase().includes(name.toLowerCase());
        }
        if (degree && resume.education) {
            // Case-insensitive degree matching, check if ANY education entry matches
            match = match && resume.education.some(edu => edu.degree.toLowerCase().includes(degree.toLowerCase()));
        }
        return match;
    });

    res.json(filteredResumes);
});

// READ ONE Resume by ID
// Added regex to ensure 'id' is always digits, preventing 'Missing parameter name' for malformed IDs
app.get('/api/resumes/:id(\\d+)', (req, res) => {
    const db = readDB();
    const resume = db[req.params.id];
    if (resume) {
        res.json(resume);
    } else {
        res.status(404).json({ message: 'Resume not found' });
    }
});

// UPDATE Resume by ID
app.put('/api/resumes/:id(\\d+)', authenticateApiKey, async (req, res) => {
    const db = readDB();
    const { id } = req.params;
    const existingResume = db[id]; // Get the resume as it currently is in the database

    if (!existingResume) {
        return res.status(404).json({ message: 'Resume not found' });
    }

    const validationErrors = validateResumeData(req.body);
    if (validationErrors.length > 0) {
        return res.status(400).json({ message: 'Validation failed', errors: validationErrors });
    }

    // Destructure base64 fields from req.body and get the rest of the resume data
    const { profilePhotoOriginalBase64, profilePhotoCroppedBase64, ...incomingResumeData } = req.body;

    // Ensure personalInfo exists in the incoming data
    incomingResumeData.personalInfo = incomingResumeData.personalInfo || {};

    // Get current image URLs from the existing resume in the database
    let currentOriginalUrl = existingResume.personalInfo.profilePhotoOriginalUrl;
    let currentCroppedUrl = existingResume.personalInfo.profilePhotoCroppedUrl;

    // Initialize new URLs with current ones, they will be updated if image data changes
    let newOriginalUrl = currentOriginalUrl;
    let newCroppedUrl = currentCroppedUrl;

    // --- Image Update Logic ---
    if (profilePhotoOriginalBase64) {
        // Scenario A: New original image uploaded (implies new cropped too)
        // Delete all old images (original and cropped) for this ID
        await deleteImageFiles(id);
        newOriginalUrl = await saveBase64Image(id, profilePhotoOriginalBase64, 'original');
        newCroppedUrl = await saveBase64Image(id, profilePhotoCroppedBase64, 'cropped');
    } else if (profilePhotoCroppedBase64) {
        // Scenario B: Existing original image, but new cropped image (re-cropped)
        // Keep the existing original image URL (newOriginalUrl already holds currentOriginalUrl)
        // Only delete the old *cropped* image and save the new cropped one
        for (const ext of ['jpg', 'jpeg', 'png', 'gif', 'webp']) { // Check common image extensions
            try {
                const imagePath = path.join(IMAGES_DIR, `${id}-cropped.${ext}`);
                await fs.unlink(imagePath);
            } catch (error) { /* ignore if not found */ } // Ignore if file not found
        }
        newCroppedUrl = await saveBase64Image(id, profilePhotoCroppedBase64, 'cropped');
    } else if (incomingResumeData.personalInfo.profilePhotoOriginalUrl === null && incomingResumeData.personalInfo.profilePhotoCroppedUrl === null) {
        // Scenario D: Image removed (frontend explicitly sent null for both URLs)
        // Delete any existing image files for this ID
        await deleteImageFiles(id);
        newOriginalUrl = null;
        newCroppedUrl = null;
    } else {
        // Scenario C: No new base64 image data and no explicit nulls from frontend.
        // This means either no image change, or the frontend sent existing URLs without new base64.
        // We ensure the URLs in the database are maintained unless explicitly changed.
        // If frontend sends a URL (even if it's the old one), we assume it's the desired state.
        if (incomingResumeData.personalInfo.profilePhotoOriginalUrl !== undefined) {
            newOriginalUrl = incomingResumeData.personalInfo.profilePhotoOriginalUrl;
        }
        if (incomingResumeData.personalInfo.profilePhotoCroppedUrl !== undefined) {
            newCroppedUrl = incomingResumeData.personalInfo.profilePhotoCroppedUrl;
        }
    }

    // Update image URLs in the incoming resume data object
    incomingResumeData.personalInfo.profilePhotoOriginalUrl = newOriginalUrl;
    incomingResumeData.personalInfo.profilePhotoCroppedUrl = newCroppedUrl;

    // Merge existing resume data with the incoming data
    // For arrays, the incoming data should completely replace the old data.
    const updatedResume = {
        ...existingResume, // Start with existing data
        ...incomingResumeData, // Overwrite top-level properties with incoming data
        personalInfo: {
            ...existingResume.personalInfo, // Merge personalInfo specifically
            ...incomingResumeData.personalInfo
        },
        // For array fields, replace entirely with incoming array if present
        education: incomingResumeData.education || [],
        experience: incomingResumeData.experience || [],
        projects: incomingResumeData.projects || [],
        skills: incomingResumeData.skills || [],
        tags: incomingResumeData.tags || [],
    };

    db[id] = updatedResume; // Update the database cache
    await writeDB(db); // Write the updated database to file
    res.status(200).json({ message: 'Resume updated successfully', id });
});

// DELETE Resume by ID
app.delete('/api/resumes/:id(\\d+)', authenticateApiKey, async (req, res) => {
    const db = readDB();
    const { id } = req.params;
    if (db[id]) {
        await deleteImageFiles(id); // Delete associated images
        delete db[id]; // Remove from DB
        await writeDB(db); // Write updated DB to file
        res.status(200).json({ message: 'Resume deleted successfully' });
    } else {
        res.status(404).json({ message: 'Resume not found' });
    }
});

// METADATA Endpoints (for skills, tags, degrees, etc.)
app.get('/api/metadata/:type([a-zA-Z0-9_-]+)', (req, res) => {
    const db = readDB();
    const { type } = req.params;
    const metadata = new Set();

    Object.values(db).forEach(resume => {
        if (type === 'skills' && resume.skills) {
            // For skills metadata, extract just the name
            resume.skills.forEach(s => {
                if (typeof s === 'object' && s !== null && s.name) {
                    metadata.add(s.name.trim());
                } else if (typeof s === 'string') { // Support old string format for now
                    metadata.add(s.trim());
                }
            });
        }
        if (type === 'tags' && resume.tags) resume.tags.forEach(t => metadata.add(t.trim()));
        if (type === 'degrees' && resume.education) resume.education.forEach(edu => {
            if (edu.degree && edu.degree.trim()) metadata.add(edu.degree.trim());
        });
    });

    // Return unique, sorted metadata
    res.json(Array.from(metadata).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))); // Case-insensitive sort
});

// --- Catch-all for undefined routes (404 Not Found) ---
app.use((req, res) => {
    console.warn(`404 Not Found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ message: 'Resource not found' });
});

// --- Global Express error handling middleware (must be the last middleware) ---
app.use((err, req, res, next) => {
    console.error('🚨 An unhandled server error occurred 🚨:', err.stack);
    res.status(500).json({ message: 'Internal Server Error', error: err.message });
});


// --- Start Server ---
initialize().then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
