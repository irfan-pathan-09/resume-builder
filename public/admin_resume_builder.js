document.addEventListener('DOMContentLoaded', () => {
    // --- Globals & State ---
    const APP_BASE_PATH = window.location.pathname.includes('/public/')
        ? window.location.pathname.split('/public/')[0]
        : '';
    const API_BASE_URL = `${window.location.origin}${APP_BASE_PATH}`;
    const ADMIN_API_KEY = 'your_secret_admin_key'; // Replace with your actual admin key
    let currentResumeId = null;
    let cropper = null;
    let originalImageDataURL = null; // Stores the base64 or URL of the original image
    let allSkills = []; // Cache for all available skills
    let allTags = [];   // Cache for all available tags
    // `allCountryCodes` now stores combined "Country Name (Code)" for the new input
    let allCountryCodes = [];

    // Phone number length map based on country code (common lengths) - Limited to 5 countries
    const phoneNumberLengths = {
        '+91': { min: 10, max: 10 }, // India
        '+1': { min: 10, max: 10 },  // USA/Canada (assuming +1 for USA only for simplicity here)
        '+44': { min: 10, max: 10 }, // UK
        '+49': { min: 10, max: 11 }, // Germany
        '+33': { min: 9, max: 9 },   // France
    };

    // Map to get country name from country code for synchronization - Limited to 5 countries
    const countryCodeToCountry = {
        '+91': 'India',
        '+1': 'USA',
        '+44': 'UK',
        '+49': 'Germany',
        '+33': 'France',
    };

    // --- UI Elements ---
    const form = document.getElementById('resumeForm');
    const saveBtn = document.getElementById('saveResumeBtn');
    const deleteBtn = document.getElementById('deleteResumeBtn');
    const clearBtn = document.getElementById('clearFormBtn');
    const loadBtn = document.getElementById('loadResumeByIdBtn');
    const loadIdInput = document.getElementById('loadResumeIdInput');
    const jsonOutput = document.getElementById('jsonOutput');
    const imageEditorTarget = document.getElementById('image-editor-target');
    const profilePicInput = document.getElementById('profilePictureInput');

    const confirmationModal = new bootstrap.Modal(document.getElementById('confirmationModal'));
    const confirmationModalBody = document.getElementById('confirmationModalBody');
    const confirmActionBtn = document.getElementById('confirmActionBtn');

    // Personal Info Fields for blur validation
    const fullNameInput = document.getElementById('fullName');
    const emailPrefixInput = document.getElementById('emailPrefix');
    const emailDomainSelect = document.getElementById('emailDomainSelect');
    const phoneInput = document.getElementById('phone');
    const ratingInput = document.getElementById('rating');
    const linkedinInput = document.getElementById('linkedin');
    const githubInput = document.getElementById('github');
    const youtubeInput = document.getElementById('youtube'); // New YouTube input
    const countryAndCodeInput = document.getElementById('countryAndCode'); // New combined input
    const cityInput = document.getElementById('city');

    const selectedSkillsContainer = document.getElementById('selectedSkillsContainer');
    const selectedTagsContainer = document.getElementById('selectedTagsContainer'); // Added this


    // --- Helper Functions ---
    let messageTimeoutId = null; // To store the timeout ID for messages

    const showMessage = (message, type = 'info') => {
        const appMessage = document.getElementById('appMessage');
        const appMessageText = document.getElementById('appMessageText');

        // Clear any existing timeout to prevent previous messages from disappearing prematurely
        if (messageTimeoutId) {
            clearTimeout(messageTimeoutId);
            messageTimeoutId = null;
        }

        appMessage.className = `app-message alert alert-${type} text-center show`;
        appMessageText.textContent = message;
        // Set a high z-index to ensure visibility above other elements
        appMessage.style.zIndex = '1100';

        // Automatically hide after 10 seconds for better visibility
        messageTimeoutId = setTimeout(() => {
            appMessage.classList.remove('show');
            appMessage.style.zIndex = ''; // Reset z-index when hidden
        }, 10000); // Changed from 4000 to 10000
    };

    const setLoading = (isLoading) => {
        document.getElementById('loadingIndicator').style.display = isLoading ? 'flex' : 'none';
    };

    const escapeHtml = (text) => {
        // Ensure text is a string before attempting replace
        if (typeof text !== 'string') return text;
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, (m) => map[m]);
    };

    // New: Debounce function to limit how often a function is called
    const debounce = (func, delay) => {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    };

    // Function to update phone input maxlength based on country code
    const updatePhoneInputMaxlength = () => {
        // Get the country code from the data-code attribute of the countryAndCodeInput
        const selectedCountryCode = countryAndCodeInput.getAttribute('data-code') || '';

        const lengths = phoneNumberLengths[selectedCountryCode];
        if (lengths) {
            phoneInput.maxLength = lengths.max;
            // Update placeholder to show example with min-max length
            // Using 'X' for digits to avoid implying actual numbers
            const exampleDigits = 'X'.repeat(lengths.min);
            const remaining = Math.max(0, lengths.max - lengths.min);
            const maxDigitsExample = 'X'.repeat(remaining);
            phoneInput.placeholder = `e.g., ${exampleDigits}${maxDigitsExample ? maxDigitsExample : ''}`;
        } else {
            phoneInput.maxLength = 15; // Default max length if no specific code is found
            phoneInput.placeholder = 'e.g., XXXXXXXXXX'; // Generic example
        }
    };

    // The syncCountryAndCode function is no longer needed as the countryAndCode input handles both.


    // --- Image Editor ---
    const toRelativeImagePath = (url = '') => {
        if (!url || typeof url !== 'string') return '';
        if (url.startsWith('/images/')) return url;
        if (url.startsWith(`${API_BASE_URL}/images/`)) return url.replace(API_BASE_URL, '');
        try {
            const parsed = new URL(url);
            if (parsed.pathname.startsWith('/images/')) return parsed.pathname;
        } catch (_) {
            // Not an absolute URL; keep original.
        }
        return url;
    };

    const isServerImagePath = (url = '') => toRelativeImagePath(url).startsWith('/images/');

    const initCropper = (imageUrl = 'https://placehold.co/800x400/f5f5f7/6e6e73?text=Upload+Image') => {
        if (cropper) cropper.destroy();
        const relativeImagePath = toRelativeImagePath(imageUrl);
        const fullImageUrl = relativeImagePath.startsWith('/images/') ? `${API_BASE_URL}${relativeImagePath}` : imageUrl;
        imageEditorTarget.crossOrigin = fullImageUrl.startsWith('http') ? 'anonymous' : '';
        imageEditorTarget.src = fullImageUrl;
        cropper = new Cropper(imageEditorTarget, {
            aspectRatio: 1, // Default to square for profile pictures
            viewMode: 1, // Restrict the crop box to not exceed the canvas
            background: false,
            autoCropArea: 0.8,
            responsive: true,
            // preview: '.img-preview', // If you have a preview element
        });
    };

    profilePicInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                originalImageDataURL = event.target.result; // This is a base64 string
                initCropper(originalImageDataURL); // Re-init cropper with new image
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('zoom-in-btn').addEventListener('click', () => cropper?.zoom(0.1));
    document.getElementById('zoom-out-btn').addEventListener('click', () => cropper?.zoom(-0.1));
    document.getElementById('zoom-reset-btn').addEventListener('click', () => cropper?.reset());
    document.getElementById('crop-square-btn').addEventListener('click', () => cropper?.setAspectRatio(1));
    // Removed the 'crop-circle-btn' event listener

    document.getElementById('remove-image-btn').addEventListener('click', () => {
        originalImageDataURL = null; // Clear the original image data
        initCropper(); // Reset cropper to placeholder image
        profilePicInput.value = ''; // Clear file input
        updateJsonViewDebounced(); // Use debounced version here
    });


    // --- Form Data Handling ---
    const getFormData = () => {
        let croppedImageBase64 = null;
        // Check if cropper is initialized and has a source image that's not the placeholder
        if (cropper && imageEditorTarget.src && !imageEditorTarget.src.startsWith('https://placehold.co')) {
            try {
                // Ensure the canvas is not too large for performance, but sufficient for quality
                croppedImageBase64 = cropper.getCroppedCanvas({
                    width: 400, // Standard size for cropped display
                    height: 400,
                    imageSmoothingEnabled: true,
                    imageSmoothingQuality: 'high'
                }).toDataURL('image/jpeg', 0.9); // JPEG for smaller file size, 90% quality
            } catch (error) {
                console.error("Error getting cropped canvas:", error);
                showMessage("Could not generate cropped image. Please try again.", "danger");
                croppedImageBase64 = null;
            }
        }

        // Parse country and country code from the combined input
        const selectedCountryAndCodeDisplay = countryAndCodeInput.value.trim(); // "India (+91)"
        const selectedCountryCode = countryAndCodeInput.getAttribute('data-code') || ''; // "+91"
        let countryName = '';

        // If a country code is explicitly set via data-code, use the countryCodeToCountry map to find the name
        if (selectedCountryCode) {
            countryName = countryCodeToCountry[selectedCountryCode] || '';
        } else if (selectedCountryAndCodeDisplay) {
            // Fallback if data-code is not set, try to parse from display value
            const match = selectedCountryAndCodeDisplay.match(/(.*)\s\(([^)]+)\)/);
            if (match) {
                countryName = match[1].trim();
                // We're already using selectedCountryCode, so this branch mainly for countryName
            } else {
                countryName = selectedCountryAndCodeDisplay;
            }
        }

        const formData = {
            personalInfo: {
                fullName: fullNameInput.value.trim(),
                email: `${emailPrefixInput.value.trim()}@${emailDomainSelect.value.trim()}`,
                countryCode: selectedCountryCode, // Now correctly parsed from data-code
                phone: phoneInput.value.trim(),
                linkedin: linkedinInput.value.trim(),
                github: githubInput.value.trim(),
                youtube: youtubeInput.value.trim(), // Added YouTube URL
                country: countryName, // Now correctly parsed
                city: cityInput.value.trim(),
                summary: document.getElementById('summary').value.trim(),
                rating: ratingInput.value ? parseFloat(ratingInput.value) : null,
                // These will be filled by the server after image save
                profilePhotoOriginalUrl: null, // Placeholder for existing or new URL
                profilePhotoCroppedUrl: null,  // Placeholder for existing or new URL
            },
            education: getDynamicSectionData('education'),
            experience: getDynamicSectionData('experience'),
            projects: getDynamicSectionData('projects'),
            // MODIFIED: Skills now collect objects with name and rating
            skills: Array.from(document.querySelectorAll('#selectedSkillsContainer .selected-skill-badge')).map(el => {
                const skillName = el.dataset.value.trim();
                const skillRating = parseFloat(el.querySelector('.skill-rating-input').value);
                return { name: skillName, rating: isNaN(skillRating) ? 0 : skillRating }; // Default to 0 if NaN
            }),
            // MODIFIED: Tags now collect only names, no rating
            tags: Array.from(document.querySelectorAll('#selectedTagsContainer .badge')).map(el => el.dataset.value.trim()),
        };

        // Keep phone optional: if phone is empty, do not send countryCode.
        if (!formData.personalInfo.phone) {
            formData.personalInfo.countryCode = '';
        }

        // Determine what image data to send based on originalImageDataURL (which holds the current image source)
        if (originalImageDataURL) {
            if (originalImageDataURL.startsWith('data:image')) {
                // Case 1: User uploaded a *new* image (originalImageDataURL is base64)
                formData.profilePhotoOriginalBase64 = originalImageDataURL;
                formData.profilePhotoCroppedBase64 = croppedImageBase64;
            } else if (isServerImagePath(originalImageDataURL)) {
                // Case 2: Existing image loaded from server (originalImageDataURL is a URL)
                const relativeOriginalUrl = toRelativeImagePath(originalImageDataURL);
                const relativeEditorUrl = toRelativeImagePath(imageEditorTarget.src);
                formData.personalInfo.profilePhotoOriginalUrl = relativeOriginalUrl; // Pass along the existing original URL
                if (croppedImageBase64 && relativeEditorUrl !== relativeOriginalUrl) { // Check if a new crop was made or source changed
                    // The existing image was re-cropped or replaced, send the new cropped base66
                    formData.profilePhotoCroppedBase64 = croppedImageBase64;
                } else {
                    // No re-cropping or image change, server should retain its existing cropped URL
                    formData.personalInfo.profilePhotoCroppedUrl = relativeEditorUrl; // send a normalized server path
                }
            }
        } else {
            // Case 3: No image (or image was removed). Explicitly set URLs to null
            formData.personalInfo.profilePhotoOriginalUrl = null;
            formData.personalInfo.profilePhotoCroppedUrl = null;
            // Also explicitly ensure no base64 fields are sent if image was removed
            delete formData.profilePhotoOriginalBase64;
            delete formData.profilePhotoCroppedBase64;
        }

        return formData;
    };

    const updateJsonView = () => {
        const data = getFormData();
        const cleanData = { ...data };
        // These are temporary base64 values for transfer, not part of final JSON structure
        delete cleanData.profilePhotoCroppedBase64;
        delete cleanData.profilePhotoOriginalBase64;
        jsonOutput.textContent = JSON.stringify(cleanData, null, 2);
        hljs.highlightElement(jsonOutput);
    };

    // Debounced version of updateJsonView
    const updateJsonViewDebounced = debounce(updateJsonView, 300); // 300ms delay

    // --- Dynamic Sections (Education, Experience, Projects) ---
    const addDynamicSection = (type, data = {}) => {
        const container = document.getElementById(`${type}Container`);
        const id = `${type}-${Date.now()}`;
        const div = document.createElement('div');
        div.className = 'p-3 mb-2 border rounded position-relative dynamic-section-item';
        div.id = `group-${id}`;

        let fieldsHtml = '';
        if (type === 'education') {
            fieldsHtml = `
                <div class="row g-2">
                    <div class="col-md-6">
                        <input type="text" class="form-control" name="degree" placeholder="Degree (e.g., Bachelor of Science)" value="${escapeHtml(data.degree || '')}" list="allDegreesList" required>
                        <div class="invalid-feedback">Degree is required.</div>
                    </div>
                    <div class="col-md-6">
                        <input type="text" class="form-control" name="institution" placeholder="Institution (e.g., University of XYZ)" value="${escapeHtml(data.institution || '')}" required>
                        <div class="invalid-feedback">Institution is required.</div>
                    </div>
                    <div class="col-md-6">
                        <input type="number" class="form-control" name="startYear" placeholder="Start Year (e.g., 2018)" value="${escapeHtml(data.startYear || '')}" min="1900" max="2100" required inputmode="numeric" pattern="[0-9]*">
                        <div class="invalid-feedback">Valid Start Year is required.</div>
                    </div>
                    <div class="col-md-6">
                        <input type="number" class="form-control" name="endYear" placeholder="End Year (e.g., 2022 or empty if ongoing)" value="${escapeHtml(data.endYear || '')}" min="1900" max="2100" inputmode="numeric" pattern="[0-9]*">
                        <div class="invalid-feedback">Valid End Year is required (or leave empty).</div>
                    </div>
                </div>`;
        } else if (type === 'experience') {
            fieldsHtml = `
                <div class="row g-2">
                    <div class="col-md-6">
                        <input type="text" class="form-control" name="jobTitle" placeholder="Job Title (e.g., Software Engineer)" value="${escapeHtml(data.jobTitle || '')}" required>
                        <div class="invalid-feedback">Job Title is required.</div>
                    </div>
                    <div class="col-md-6">
                        <input type="text" class="form-control" name="company" placeholder="Company (e.g., Tech Solutions Inc.)" value="${escapeHtml(data.company || '')}" required>
                        <div class="invalid-feedback">Company is required.</div>
                    </div>
                    <div class="col-md-6">
                        <label for="startDate-${id}" class="form-label visually-hidden">Start Date</label>
                        <input type="date" class="form-control" id="startDate-${id}" name="startDate" value="${escapeHtml(data.startDate || '')}" required>
                        <div class="invalid-feedback">Start Date is required.</div>
                    </div>
                    <div class="col-md-6">
                        <label for="endDate-${id}" class="form-label visually-hidden">End Date</label>
                        <input type="date" class="form-control" id="endDate-${id}" name="endDate" value="${escapeHtml(data.endDate || '')}">
                        <div class="invalid-feedback">End Date must be after Start Date (or leave empty if ongoing).</div>
                    </div>
                    <div class="col-12">
                        <textarea class="form-control" name="description" rows="2" placeholder="Description of responsibilities and achievements..." maxlength="250">${escapeHtml(data.description || '')}</textarea>
                    </div>
                </div>`;
        } else if (type === 'projects') {
            fieldsHtml = `
                <div class="row g-2">
                    <div class="col-md-6">
                        <input type="text" class="form-control" name="projectName" placeholder="Project Name (e.g., Portfolio Website)" value="${escapeHtml(data.projectName || '')}" required>
                        <div class="invalid-feedback">Project Name is required.</div>
                    </div>
                    <div class="col-md-6">
                        <input type="url" class="form-control" name="projectUrl" placeholder="Project URL (e.g., https://my-project.com)" value="${escapeHtml(data.projectUrl || '')}">
                        <div class="invalid-feedback">Valid Project URL is required (or leave empty).</div>
                    </div>
                    <div class="col-md-6">
                        <input type="url" class="form-control" name="projectYoutubeUrl" placeholder="Project YouTube URL (e.g., https://youtube.com/watch?v=...)" value="${escapeHtml(data.projectYoutubeUrl || '')}">
                        <div class="invalid-feedback">Valid YouTube URL is required (or leave empty).</div>
                    </div>
                    <div class="col-12">
                        <textarea class="form-control" name="description" rows="2" placeholder="Brief description of the project..." maxlength="250">${escapeHtml(data.description || '')}</textarea>
                    </div>
                </div>`;
        }

        div.innerHTML = `
            ${fieldsHtml}
            <button type="button" class="btn-close position-absolute top-0 end-0 p-2" aria-label="Close" onclick="this.parentElement.remove(); updateJsonViewDebounced();"></button>
        `;
        container.appendChild(div);

        // Add blur event listeners for validation on dynamically added fields
        div.querySelectorAll('input, textarea').forEach(input => {
            input.addEventListener('blur', (e) => validateField(e.target));
            // Add number-only restriction for dynamic numeric inputs
            if (input.type === 'number' || input.inputmode === 'numeric') {
                input.addEventListener('keydown', restrictToNumbers);
            }
        });
    };

    const getDynamicSectionData = (type) => {
        const data = [];
        document.querySelectorAll(`#${type}Container .dynamic-section-item`).forEach(group => {
            const entry = {};
            group.querySelectorAll('input, textarea').forEach(input => {
                entry[input.name] = input.value.trim();
            });

            data.push(entry);
        });
        return data;
    };

    document.getElementById('addEducation').addEventListener('click', () => { addDynamicSection('education'); updateJsonViewDebounced(); });
    document.getElementById('addExperience').addEventListener('click', () => { addDynamicSection('experience'); updateJsonViewDebounced(); });
    document.getElementById('addProject').addEventListener('click', () => { addDynamicSection('projects'); updateJsonViewDebounced(); });

    // --- Custom Autocomplete Dropdown Logic for Skills, Tags, CountryAndCode ---
    // Added an optional callback argument to handle selection specific logic
    const setupCustomAutocompleteDropdown = async (inputId, suggestionsDropdownId, selectedContainerId, metadataType, isMultiSelect = true, onSelectCallback = null) => {
        const input = document.getElementById(inputId);
        const suggestionsDropdown = document.getElementById(suggestionsDropdownId);
        const selectedContainer = document.getElementById(selectedContainerId); // Only for multi-select (skills/tags)
        let currentAllMetadata = []; // To store fetched metadata

        // For countryAndCode, combine country names and codes - Limited to 5 countries
        if (metadataType === 'countryAndCodes') {
            const allowedCountries = ['India', 'USA', 'UK', 'Germany', 'France'];
            currentAllMetadata = Object.entries(countryCodeToCountry)
                .filter(([, name]) => allowedCountries.includes(name))
                .map(([code, name]) => ({ display: `${name} (${code})`, value: code })) // Format { display: "Country Name (Code)", value: "+Code" }
                .sort((a, b) => a.display.localeCompare(b.display));
            allCountryCodes = currentAllMetadata.map(item => item.display); // Cache display values for validation
        } else { // For skills and tags, fetch from API
            try {
                const response = await fetch(`${API_BASE_URL}/api/metadata/${metadataType}`); // API calls still go to /api
                if (!response.ok) throw new Error(`Failed to fetch ${metadataType}`);
                const fetchedMetadata = await response.json();
                currentAllMetadata = fetchedMetadata.map(item => ({ display: item, value: item }));
            } catch (error) {
                console.error(`Error loading ${metadataType}:`, error);
                showMessage(`Could not load ${metadataType}. Some functionality may be limited.`, 'warning');
            }
        }

        let activeItemIndex = -1;

        const showSuggestions = (filter = '') => {
            suggestionsDropdown.innerHTML = '';
            const filteredSuggestions = currentAllMetadata.filter(item =>
                item.display.toLowerCase().includes(filter.toLowerCase())
            );

            if (filteredSuggestions.length > 0 && filter.length >= 0) { // Show all on empty filter
                filteredSuggestions.forEach((item, index) => {
                    const div = document.createElement('div');
                    div.className = 'dropdown-item';
                    div.textContent = item.display;
                    div.setAttribute('data-value', item.value); // Store the actual value (e.g., country code)
                    div.addEventListener('mousedown', (e) => { // Use mousedown to prevent blur from firing too early
                        e.preventDefault(); // Prevent input from losing focus immediately
                        handleSelection(item.display, item.value); // Pass both display and actual value
                        suggestionsDropdown.classList.remove('show');
                    });
                    suggestionsDropdown.appendChild(div);
                });
                suggestionsDropdown.classList.add('show');
                activeItemIndex = -1; // Reset active item
            } else {
                suggestionsDropdown.classList.remove('show');
            }
        };

        const handleSelection = (displayValue, actualValue, initialRating = 0) => { // Added initialRating
            if (isMultiSelect) {
                // For skills and tags (multi-select with badges)
                const trimmedValue = actualValue.trim(); // Use actualValue for storage
                const existingItems = Array.from(selectedContainer.children).map(el => el.dataset.value.toLowerCase());

                if (trimmedValue && !existingItems.includes(trimmedValue.toLowerCase())) {
                    const badge = document.createElement('span');
                    // Differentiate between skill and tag badges
                    if (metadataType === 'skills') {
                        badge.className = 'selected-skill-badge bg-primary me-1 mb-1'; // Use new class for skills
                        badge.dataset.value = trimmedValue;
                        badge.innerHTML = `
                            ${escapeHtml(displayValue)}
                            <input type="number" class="skill-rating-input" min="0" max="5" step="1" value="${initialRating}" aria-label="Skill rating">
                            <button type="button" class="btn-close btn-close-white ms-1" style="font-size: 0.6em;"></button>
                        `;
                        badge.querySelector('.btn-close').onclick = () => { badge.remove(); updateJsonViewDebounced(); validateField(input); };

                        const ratingInput = badge.querySelector('.skill-rating-input');
                        ratingInput.addEventListener('input', updateJsonViewDebounced); // Update JSON on rating change
                        ratingInput.addEventListener('blur', (e) => validateSkillRatingField(e.target)); // Validate on blur
                        ratingInput.addEventListener('keydown', restrictToNumbers); // Restrict to numbers
                    } else if (metadataType === 'tags') {
                        badge.className = 'badge bg-primary me-1 mb-1'; // Standard badge for tags
                        badge.dataset.value = trimmedValue;
                        badge.innerHTML = `${escapeHtml(displayValue)} <button type="button" class="btn-close btn-close-white ms-1" style="font-size: 0.6em;"></button>`;
                        badge.querySelector('.btn-close').onclick = () => { badge.remove(); updateJsonViewDebounced(); validateField(input); };
                    }
                    selectedContainer.appendChild(badge);
                    input.classList.remove('is-invalid'); // Clear validation on successful add
                    document.getElementById(`${inputId}-feedback`).textContent = '';
                    updateJsonViewDebounced();
                } else if (trimmedValue) {
                    input.classList.add('is-invalid');
                    document.getElementById(`${inputId}-feedback`).textContent = 'This item is already added or invalid.';
                }
                input.value = ''; // CHANGED: Clear input after adding for multi-select
            } else {
                // For single select (countryAndCode)
                input.value = displayValue; // Keep the full display value in the input
                input.setAttribute('data-code', actualValue); // Store the country code
                // Trigger an input event to let the rest of the form logic know the value has changed.
                input.dispatchEvent(new Event('input'));

                if (onSelectCallback) { // Execute callback if provided
                    onSelectCallback({ display: displayValue, value: actualValue });
                }
                updateJsonViewDebounced();
            }
            suggestionsDropdown.classList.remove('show');
            validateField(input); // Re-validate after adding/failing to add or selecting
        };

        input.addEventListener('input', () => showSuggestions(input.value));

        input.addEventListener('keydown', (e) => {
            const items = Array.from(suggestionsDropdown.children);
            if (!suggestionsDropdown.classList.contains('show') && ['ArrowDown', 'ArrowUp', 'Enter'].includes(e.key)) {
                // If dropdown is hidden and user presses arrow/enter, try to show suggestions
                showSuggestions(input.value);
                // After showing, re-get items if they were empty before
                const updatedItems = Array.from(suggestionsDropdown.children);
                if (updatedItems.length > 0) {
                    activeItemIndex = (e.key === 'ArrowDown') ? 0 : updatedItems.length - 1;
                    highlightActiveItem(updatedItems);
                    input.value = updatedItems[activeItemIndex].textContent;
                    input.setAttribute('data-code', updatedItems[activeItemIndex].getAttribute('data-value'));
                    input.dispatchEvent(new Event('input')); // Trigger input event on arrow key selection
                }
                e.preventDefault();
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                activeItemIndex = (activeItemIndex + 1) % items.length;
                highlightActiveItem(items);
                if (activeItemIndex > -1) {
                    input.value = items[activeItemIndex].textContent; // Fill input with highlighted display value
                    input.setAttribute('data-code', items[activeItemIndex].getAttribute('data-value')); // Set data-code for actual value
                    input.dispatchEvent(new Event('input')); // Trigger input event on arrow key selection
                }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                activeItemIndex = (activeItemIndex - 1 + items.length) % items.length;
                highlightActiveItem(items);
                if (activeItemIndex > -1) {
                    input.value = items[activeItemIndex].textContent; // Fill input with highlighted display value
                    input.setAttribute('data-code', items[activeItemIndex].getAttribute('data-value')); // Set data-code for actual value
                    input.dispatchEvent(new Event('input')); // Trigger input event on arrow key selection
                }
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeItemIndex > -1) {
                    // Simulate click on highlighted item, passing its display and actual value
                    handleSelection(items[activeItemIndex].textContent, items[activeItemIndex].getAttribute('data-value'));
                } else if (input.value.trim()) {
                    // If nothing highlighted, try to add/select based on current input value
                    const matchingItem = currentAllMetadata.find(item => item.display.toLowerCase() === input.value.trim().toLowerCase());
                    if (matchingItem) {
                        handleSelection(matchingItem.display, matchingItem.value);
                    } else if (isMultiSelect) { // Only allow manual entry for multi-select
                        handleSelection(input.value, input.value);
                    } else {
                        // For single-select, if typed value doesn't match, it will be cleared on blur.
                    }
                }
            } else if (e.key === ',' && isMultiSelect) {
                e.preventDefault();
                if (input.value.trim()) {
                    handleSelection(input.value, input.value);
                }
            }
        });

        input.addEventListener('focus', () => showSuggestions(input.value)); // Show on focus
        input.addEventListener('blur', (e) => {
            // Delay hiding to allow click on dropdown items
            setTimeout(() => {
                if (!suggestionsDropdown.contains(document.activeElement)) {
                    suggestionsDropdown.classList.remove('show');
                    const inputValue = input.value.trim();
                    const inputCode = input.getAttribute('data-code');

                    // For single-select, check if the current input value (and its data-code) matches a known item
                    const isInputValidSelection = currentAllMetadata.some(item =>
                        item.display.toLowerCase() === inputValue.toLowerCase() && item.value === inputCode
                    );

                    if (!isMultiSelect && inputValue && !isInputValidSelection) {
                        // If single-select and input is not a valid selection, clear it
                        input.value = '';
                        input.removeAttribute('data-code'); // Clear the data-code as well
                        if (onSelectCallback) {
                            onSelectCallback({ display: '', value: '' });
                        }
                        input.dispatchEvent(new Event('input')); // Dispatch input event for clearing
                    } else if (isMultiSelect && inputValue) {
                        // For multi-select (skills/tags), allow adding manual entry on blur if it's new
                        // This applies to both skills (without rating) and tags
                        const selectedItems = Array.from(selectedContainer.children).map(el => el.dataset.value.toLowerCase());
                        const trimmedInput = inputValue.toLowerCase();
                        if (!selectedItems.includes(trimmedInput)) {
                            // Call handleSelection to add the item as a badge
                            if (metadataType === 'skills') {
                                handleSelection(inputValue, inputValue, 0); // Add skill with default rating 0
                            } else if (metadataType === 'tags') {
                                handleSelection(inputValue, inputValue); // Add tag without rating
                            }
                        }
                    }
                }
                validateField(input); // Final validation on blur
            }, 150); // Increased delay
        });

        const highlightActiveItem = (items) => {
            items.forEach((item, index) => {
                if (index === activeItemIndex) {
                    item.classList.add('active');
                    item.scrollIntoView({ block: 'nearest' });
                } else {
                    item.classList.remove('active');
                }
            });
        };
    };

    // --- Validation Functions ---
    const isValidFullName = (name) => /^[a-zA-ZÀ-ÿ\s'-]{2,100}$/.test(name);
    const isValidEmailPrefix = (prefix) => /^[a-zA-Z0-9._%+-]+$/.test(prefix);
    const isValidPhone = (phone) => {
        // Get the country code from the data-code attribute
        const selectedCountryCode = countryAndCodeInput.getAttribute('data-code') || '';

        const lengths = phoneNumberLengths[selectedCountryCode];
        if (phone.trim() === '') return true; // Phone is optional
        if (lengths) {
            return /^\d+$/.test(phone) && phone.length >= lengths.min && phone.length <= lengths.max;
        }
        return /^\d{7,15}$/.test(phone); // Default validation
    };
    const isValidCity = (city) => /^[a-zA-ZÀ-ÿ\s'-]{2,50}$/.test(city);
    const isValidLinkedInUrl = (url) => url ? /^https:\/\/(www\.)?linkedin\.com\/in\/[a-zA-Z0-9_-]+\/?$/.test(url) : true;
    const isValidGithubUrl = (url) => url ? /^https:\/\/(www\.)?github\.com\/[a-zA-Z0-9_-]+\/?$/.test(url) : true;
    const isValidYoutubeUrl = (url) => url ? /^(https?:\/\/)?(www\.)?(m\.)?(youtube\.com|youtu\.be)\/.+$/.test(url) : true; // New YouTube URL validation
    const isValidUrl = (url) => {
        try {
            new URL(url);
            return true;
        } catch (e) {
            return false;
        }
    };
    const isValidRating = (ratingValue) => {
        if (ratingValue === "" || ratingValue === null) return false;
        const rating = parseFloat(ratingValue);
        return !isNaN(rating) && rating >= 0 && rating <= 5;
    };

    // New validation for skill ratings
    const isValidSkillRating = (ratingValue) => {
        const rating = parseFloat(ratingValue);
        return !isNaN(rating) && rating >= 0 && rating <= 5;
    };

    // New validation function specifically for skill rating inputs
    const validateSkillRatingField = (inputElement) => {
        let valid = true;
        let message = '';

        inputElement.classList.remove('is-invalid');
        const parentBadge = inputElement.closest('.selected-skill-badge');
        if (parentBadge) {
            parentBadge.classList.remove('is-invalid'); // Optional: Add a class to the badge itself
        }

        if (inputElement.value.trim() === '') {
            valid = false;
            message = 'Rating required.';
        } else if (!isValidSkillRating(inputElement.value)) {
            valid = false;
            message = 'Rating must be 0-5.';
        }

        if (!valid) {
            inputElement.classList.add('is-invalid');
            if (parentBadge) {
                // You might want to add a visible feedback element near the rating input if it's invalid
                // For simplicity, we'll just style the input for now.
            }
        }
        updateJsonViewDebounced(); // Re-render JSON on validation change
        return valid;
    };


    // New validation for the combined country and code field
    const isValidCountryAndCode = (value) => {
        // We now validate against the display value that is in the input field
        return value && allCountryCodes.some(item => item.toLowerCase() === value.toLowerCase());
    };


    const validateField = (inputElement) => {
        // Determine the correct feedback element for the input
        let feedbackElement = document.getElementById(`${inputElement.id}-feedback`);
        if (!feedbackElement && inputElement.id === 'emailPrefix') {
            feedbackElement = document.getElementById('email-feedback');
        } else if (!feedbackElement && inputElement.id === 'phone') {
            feedbackElement = document.getElementById('phone-feedback');
        } else if (!feedbackElement && inputElement.id === 'countryAndCode') {
            feedbackElement = document.getElementById('countryAndCode-feedback');
        }

        let valid = true;
        let message = '';

        // Clear previous validation state
        inputElement.classList.remove('is-invalid');
        if (feedbackElement) feedbackElement.textContent = '';
        const parentInputGroup = inputElement.closest('.input-group');
        if (parentInputGroup) {
            parentInputGroup.classList.remove('is-invalid');
        }


        if (inputElement.hasAttribute('required') && !inputElement.value.trim() && inputElement.id !== 'skillSearchInput' && inputElement.id !== 'tagSearchInput') {
            valid = false;
            message = `${inputElement.previousElementSibling?.textContent || inputElement.placeholder.split('(')[0].trim()} is required.`;
        } else {
            switch (inputElement.id) {
                case 'fullName':
                    if (!isValidFullName(inputElement.value.trim())) {
                        valid = false;
                        message = 'Full Name is required (2-100 chars, letters, spaces, -, \').';
                    }
                    break;
                case 'emailPrefix':
                    if (!isValidEmailPrefix(inputElement.value.trim())) {
                        valid = false;
                        message = 'Email prefix is required and must be valid.';
                    }
                    break;
                case 'countryAndCode':
                    // This validation now relies on the `data-code` attribute being set,
                    // which indicates a valid selection from the list, or a valid typed entry.
                    if (!inputElement.getAttribute('data-code') && inputElement.value.trim() !== '') {
                        valid = false;
                        message = 'Please select a valid Country & Phone Code from the list.';
                    } else if (inputElement.value.trim() === '' && phoneInput.value.trim() !== '') {
                        valid = false;
                        message = 'Country & Phone Code is required if phone number is provided.';
                    }
                    break;
                case 'phone':
                    if (!isValidPhone(inputElement.value.trim())) {
                        valid = false;
                        const selectedCode = countryAndCodeInput.getAttribute('data-code') || '';
                        const lengths = phoneNumberLengths[selectedCode];
                        if (lengths) {
                            message = `Phone number must be between ${lengths.min} and ${lengths.max} digits.`;
                        } else {
                            message = 'Phone number must be 7-15 digits if provided.';
                        }
                    } else if (inputElement.value.trim() !== '' && countryAndCodeInput.getAttribute('data-code') === '') {
                        valid = false;
                        message = 'Country & Phone Code is required if phone number is provided.';
                    }
                    break;
                case 'city':
                    if (!isValidCity(inputElement.value.trim())) {
                        valid = false;
                        message = 'City is required (2-50 chars, letters, spaces, -, \').';
                    }
                    break;
                case 'linkedin':
                    if (inputElement.value.trim() !== '' && !isValidLinkedInUrl(inputElement.value.trim())) {
                        valid = false;
                        message = 'Please enter a valid LinkedIn URL or leave empty.';
                    }
                    break;
                case 'github':
                    if (inputElement.value.trim() !== '' && !isValidGithubUrl(inputElement.value.trim())) {
                        valid = false;
                        message = 'Please enter a valid GitHub URL or leave empty.';
                    }
                    break;
                case 'youtube': // New YouTube URL validation
                    if (inputElement.value.trim() !== '' && !isValidYoutubeUrl(inputElement.value.trim())) {
                        valid = false;
                        message = 'Please enter a valid YouTube URL or leave empty.';
                    }
                    break;
                case 'rating':
                    if (!isValidRating(inputElement.value)) {
                        valid = false;
                        message = 'Rating must be between 0.0 and 5.0.';
                    }
                    break;
                case 'skillSearchInput':
                    // Validate if at least one skill is selected in the container AND all skills have valid ratings
                    let skillRatingsValid = true;
                    const skillBadges = document.querySelectorAll('#selectedSkillsContainer .selected-skill-badge');
                    if (skillBadges.length === 0) {
                        valid = false;
                        message = 'At least one skill is required.';
                    } else {
                        // Check each skill rating
                        skillBadges.forEach(badge => {
                            const ratingInputEl = badge.querySelector('.skill-rating-input');
                            if (ratingInputEl && !validateSkillRatingField(ratingInputEl)) {
                                skillRatingsValid = false;
                            }
                        });
                        if (!skillRatingsValid) {
                            valid = false;
                            message = 'Please fix invalid skill ratings.'; // CHANGED: More generic message here, specific styling on individual inputs
                        }
                    }
                    break;
                case 'tagSearchInput':
                    // Validate if at least one tag is selected in the container
                    if (document.querySelectorAll('#selectedTagsContainer .badge').length === 0) {
                        valid = false;
                        message = 'At least one tag is required.';
                    }
                    break;
                // Dynamic section fields (e.g., degree, institution, jobTitle)
                default:
                    if (inputElement.name === 'degree' || inputElement.name === 'institution' ||
                        inputElement.name === 'jobTitle' || inputElement.name === 'company' ||
                        inputElement.name === 'startDate' || inputElement.name === 'projectName') {
                        if (!inputElement.value.trim()) {
                            valid = false;
                            message = `${inputElement.placeholder.split('(')[0].trim()} is required.`;
                        }
                    } else if (inputElement.name === 'endYear' && inputElement.value.trim()) {
                        const startYearInput = inputElement.closest('.row')?.querySelector('[name="startYear"]');
                        if (startYearInput && parseInt(inputElement.value) < parseInt(startYearInput.value)) {
                            valid = false;
                            message = 'End Year cannot be before Start Year.';
                        }
                    } else if (inputElement.name === 'endDate' && inputElement.value.trim()) {
                        const startDateInput = inputElement.closest('.row')?.querySelector('[name="startDate"]');
                        if (startDateInput && new Date(inputElement.value) < new Date(startDateInput.value)) {
                            valid = false;
                            message = 'End Date cannot be before Start Date.';
                        }
                    } else if (inputElement.name === 'projectYoutubeUrl' && inputElement.value.trim() && !isValidYoutubeUrl(inputElement.value.trim())) {
                        valid = false;
                        message = 'Please enter a valid YouTube URL or leave empty.';
                    } else if (inputElement.type === 'url' && inputElement.value.trim() && !isValidUrl(inputElement.value.trim())) {
                        valid = false;
                        message = 'Please enter a valid URL.';
                    }
                    break;
            }
        }

        if (!valid) {
            inputElement.classList.add('is-invalid');
            if (parentInputGroup) {
                parentInputGroup.classList.add('is-invalid'); // Add to parent for input-group styling
            }
            if (feedbackElement) feedbackElement.textContent = message;
            else { // For dynamic fields, feedback is next sibling
                const nextSibling = inputElement.nextElementSibling;
                if (nextSibling && nextSibling.classList.contains('invalid-feedback')) {
                    nextSibling.textContent = message;
                }
            }
        } else {
            // If valid, ensure any existing invalid state is removed
            inputElement.classList.remove('is-invalid');
            if (parentInputGroup) {
                parentInputGroup.classList.remove('is-invalid');
            }
            if (feedbackElement) feedbackElement.textContent = '';
            else {
                const nextSibling = inputElement.nextElementSibling;
                if (nextSibling && nextSibling.classList.contains('invalid-feedback')) {
                    nextSibling.textContent = '';
                }
            }
        }
        return valid;
    };

    const validateForm = () => {
        let isValid = true;

        // Validate all static fields
        [fullNameInput, emailPrefixInput, phoneInput, ratingInput,
            linkedinInput, githubInput, youtubeInput, countryAndCodeInput, cityInput].forEach(input => {
                if (!validateField(input)) isValid = false;
            });

        // Validate dynamic sections
        document.querySelectorAll('.dynamic-section-item input, .dynamic-section-item textarea').forEach(input => {
            if (!validateField(input)) isValid = false;
        });

        // Validate skills and tags containers (this will internally validate skill ratings too)
        if (!validateField(document.getElementById('skillSearchInput'))) isValid = false;
        if (!validateField(document.getElementById('tagSearchInput'))) isValid = false;

        return isValid;
    };

    // Function to restrict input to numbers only (and a single decimal for rating)
    const restrictToNumbers = (e) => {
        // Allow digits, backspace, delete, arrow keys, tab, enter
        if (
            ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key) ||
            e.key === 'Backspace' || e.key === 'Delete' || e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' || e.key === 'Tab' || e.key === 'Enter' ||
            // Allow Ctrl/Cmd + A, C, V, X for copy-paste operations
            (e.ctrlKey || e.metaKey) && ['a', 'c', 'v', 'x'].includes(e.key.toLowerCase())
        ) {
            // Allow a single decimal point for the main rating input
            if (e.key === '.' && e.target.id === 'rating' && !e.target.value.includes('.')) {
                return true;
            } else if (e.key === '.' && e.target.id === 'rating' && e.target.value.includes('.')) {
                e.preventDefault(); // Prevent multiple decimal points
                return false;
            }
            // For skill rating inputs, prevent decimal points (since step="1")
            if (e.key === '.' && e.target.classList.contains('skill-rating-input')) {
                e.preventDefault();
                return false;
            }
            else if (e.key === '.') { // Prevent decimal points in other non-rating number fields
                e.preventDefault();
                return false;
            }
            return true;
        } else {
            e.preventDefault(); // Prevent all other keys
            return false;
        }
    };


    // Attach blur listeners to main form fields
    [fullNameInput, emailPrefixInput, phoneInput, ratingInput,
        linkedinInput, githubInput, youtubeInput, countryAndCodeInput, cityInput].forEach(input => {
            input.addEventListener('blur', (e) => validateField(e.target));
        });

    // Attach number restriction listeners
    phoneInput.addEventListener('keydown', restrictToNumbers);
    ratingInput.addEventListener('keydown', restrictToNumbers);

    // Listen for changes to countryAndCode input to update phone input length
    // This listener is crucial as `input.dispatchEvent(new Event('input'))` will trigger it
    countryAndCodeInput.addEventListener('input', updatePhoneInputMaxlength);


    // --- API Calls ---
    const saveResume = async () => {
        if (!validateForm()) {
            showMessage('Please fix the errors before saving.', 'danger');
            return;
        }
        setLoading(true);
        const data = getFormData();
        const url = currentResumeId ? `${API_BASE_URL}/api/resumes/${currentResumeId}` : `${API_BASE_URL}/api/resumes`; // API calls still go to /api
        const method = currentResumeId ? 'PUT' : 'POST';

        try {
            const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json', 'X-API-Key': ADMIN_API_KEY },
                body: JSON.stringify(data)
            });
            const result = await response.json();
            if (!response.ok) {
                if (result.errors && result.errors.length > 0) {
                    result.errors.forEach(errorMsg => showMessage(errorMsg, 'danger'));
                } else {
                    throw new Error(result.message || 'Save failed');
                }
            } else {
                showMessage(`Resume ${currentResumeId ? 'updated' : 'created'} successfully! ID: ${result.id}`, 'success');
                currentResumeId = result.id;
                loadIdInput.value = result.id;
                // Reload to get server-processed data like image URLs and ensure UI sync
                await loadResume(currentResumeId);
            }
        } catch (error) {
            console.error("Frontend Save Resume Error:", error); // Added for debugging
            showMessage(`Error: ${error.message}`, 'danger');
        } finally {
            setLoading(false);
        }
    };

    const loadResume = async (id) => {
        if (!id) {
            showMessage('Please enter a Resume ID to load.', 'warning');
            return;
        }
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/resumes/${id}`); // API calls still go to /api
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || 'Resume not found');

            resetForm(); // Clear the form before populating
            currentResumeId = data.id;
            loadIdInput.value = data.id;

            // Populate form fields
            const { personalInfo, education, experience, projects, skills, tags } = data;
            if (personalInfo) {
                // Populate all simple text fields
                Object.keys(personalInfo).forEach(key => {
                    const el = document.getElementById(key);
                    // Skip 'email', 'profilePhotoOriginalUrl', 'profilePhotoCroppedUrl', 'country', 'countryCode'
                    // as they are handled by the new combined field or reconstructed
                    if (el && key !== 'email' && key !== 'profilePhotoOriginalUrl' && key !== 'profilePhotoCroppedUrl' && key !== 'country' && key !== 'countryCode') {
                        el.value = personalInfo[key];
                    }
                });
                const emailParts = personalInfo.email.split('@');
                document.getElementById('emailPrefix').value = emailParts[0] || '';
                document.getElementById('emailDomainSelect').value = emailParts[1] || 'gmail.com'; // Default to gmail if not found

                // Set combined country and code field based on loaded data
                if (personalInfo.country && personalInfo.countryCode) {
                    countryAndCodeInput.value = `${personalInfo.country} (${personalInfo.countryCode})`;
                    countryAndCodeInput.setAttribute('data-code', personalInfo.countryCode); // Set the actual code
                } else {
                    countryAndCodeInput.value = '';
                    countryAndCodeInput.removeAttribute('data-code');
                }
                updatePhoneInputMaxlength(); // Update phone number max length based on loaded country code

                // Set YouTube URL field
                youtubeInput.value = personalInfo.youtube || '';


                // Set image for cropper to original URL
                if (personalInfo.profilePhotoOriginalUrl) {
                    originalImageDataURL = personalInfo.profilePhotoOriginalUrl;
                    initCropper(originalImageDataURL);
                } else {
                    originalImageDataURL = null;
                    initCropper(); // Use placeholder
                }
                profilePicInput.value = ''; // Clear file input as image is loaded from URL
            }

            education.forEach(item => addDynamicSection('education', item));
            experience.forEach(item => addDynamicSection('experience', item));
            projects.forEach(item => addDynamicSection('projects', item));

            // Populate skills with ratings
            selectedSkillsContainer.innerHTML = ''; // Clear existing skills before adding new ones
            skills.forEach(skill => {
                const badge = document.createElement('span');
                badge.className = 'selected-skill-badge bg-primary me-1 mb-1';
                badge.dataset.value = skill.name;
                badge.innerHTML = `
                    ${escapeHtml(skill.name)}
                    <input type="number" class="skill-rating-input" min="0" max="5" step="1" value="${skill.rating}" aria-label="Skill rating">
                    <button type="button" class="btn-close btn-close-white ms-1" style="font-size: 0.6em;"></button>
                `;
                badge.querySelector('.btn-close').onclick = () => { badge.remove(); updateJsonViewDebounced(); validateField(document.getElementById('skillSearchInput')); };
                const ratingInput = badge.querySelector('.skill-rating-input');
                ratingInput.addEventListener('input', updateJsonViewDebounced); // Update JSON on rating change
                ratingInput.addEventListener('blur', (e) => validateSkillRatingField(e.target)); // Validate on blur
                ratingInput.addEventListener('keydown', restrictToNumbers); // Restrict to numbers
                selectedSkillsContainer.appendChild(badge);
            });

            // Populate tags (without ratings)
            selectedTagsContainer.innerHTML = ''; // Clear existing tags before adding new ones
            tags.forEach(tag => {
                const badge = document.createElement('span');
                badge.className = 'badge bg-primary me-1 mb-1'; // Standard badge for tags
                badge.dataset.value = tag;
                badge.innerHTML = `${escapeHtml(tag)} <button type="button" class="btn-close btn-close-white ms-1" style="font-size: 0.6em;"></button>`;
                badge.querySelector('.btn-close').onclick = () => { badge.remove(); updateJsonViewDebounced(); validateField(document.getElementById('tagSearchInput')); };
                selectedTagsContainer.appendChild(badge);
            });

            updateJsonViewDebounced(); // Update JSON view after loading data
            showMessage(`Resume for ${personalInfo.fullName || 'ID ' + data.id} loaded.`, 'success');
        } catch (error) {
            console.error("Frontend Load Resume Error:", error); // Added for debugging
            showMessage(`Error loading resume: ${error.message}`, 'danger');
            if (!currentResumeId) {
                resetForm(); // Only reset if nothing was loaded before and it failed
            }
        } finally {
            setLoading(false);
        }
    };

    const deleteResume = async () => {
        if (!currentResumeId) {
            showMessage('No resume loaded to delete.', 'warning');
            return;
        }

        confirmationModalBody.textContent = 'Are you sure you want to delete this resume? This action cannot be undone.';
        confirmationModal.show();

        confirmActionBtn.onclick = async () => {
            confirmationModal.hide();
            setLoading(true);
            try {
                const response = await fetch(`${API_BASE_URL}/api/resumes/${currentResumeId}`, { // API calls still go to /api
                    method: 'DELETE',
                    headers: { 'X-API-Key': ADMIN_API_KEY }
                });
                if (!response.ok) throw new Error('Deletion failed');
                showMessage('Resume deleted successfully.', 'success');
                resetForm();
            } catch (error) {
                console.error("Frontend Delete Resume Error:", error); // Added for debugging
                showMessage(`Error: ${error.message}`, 'danger');
            } finally {
                setLoading(false);
            }
        };
    };

    // --- Form Initialization & Reset ---
    const resetForm = () => {
        form.reset();
        currentResumeId = null;
        loadIdInput.value = '';
        // Clear all dynamic content containers
        ['educationContainer', 'experienceContainer', 'projectsContainer', 'selectedSkillsContainer', 'selectedTagsContainer'].forEach(id => {
            document.getElementById(id).innerHTML = '';
        });
        // Remove image and reset cropper
        document.getElementById('remove-image-btn').click();

        // Clear all validation feedback
        document.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
        document.querySelectorAll('.invalid-feedback').forEach(el => el.textContent = '');
        document.querySelectorAll('.input-group.is-invalid').forEach(el => el.classList.remove('is-invalid')); // Clear for input groups


        // Re-set default country and email domain
        countryAndCodeInput.value = 'India (+91)'; // Default to India's combined display name
        countryAndCodeInput.setAttribute('data-code', '+91'); // Also set the data-code
        emailDomainSelect.value = 'gmail.com';
        youtubeInput.value = ''; // Clear YouTube input on reset
        updatePhoneInputMaxlength(); // Reset phone input maxlength

        updateJsonViewDebounced(); // Use debounced version here
    };

    const populateDropdowns = async () => {
        // Populate email domains (expanded list)
        const emailDomains = [
            'gmail.com', 'yahoo.com', 'outlook.com', 'icloud.com', 'protonmail.com', 'hotmail.com', 'aol.com',
            'mail.com', 'gmx.com', 'zoho.com', 'yandex.com', 'live.com', 'msn.com', 'comcast.net',
            'verizon.net', 'att.net', 'cox.net', 'sbcglobal.net', 'earthlink.net', 'frontier.com', 'suddenlink.net'
        ].sort();
        emailDomainSelect.innerHTML = emailDomains.map(d => `<option value="${d}">${d}</option>`).join('');
        emailDomainSelect.value = 'gmail.com'; // Default to gmail.com

        // Populate a global list of common degrees from server metadata
        try {
            const response = await fetch(`${API_BASE_URL}/api/metadata/degrees`); // API calls still go to /api
            if (!response.ok) throw new Error('Failed to fetch degrees');
            const allDegrees = await response.json();
            document.getElementById('allDegreesList').innerHTML = allDegrees.map(d => `<option value="${escapeHtml(d)}"></option>`).join('');
        } catch (error) {
            console.error("Error loading degrees:", error);
            // Fallback to static list if API fails
            const staticDegrees = [
                "Associate of Arts (AA)", "Associate of Science (AS)", "Associate of Applied Science (AAS)",
                "Bachelor of Arts (BA)", "Bachelor of Science (BS)", "Bachelor of Fine Arts (BFA)",
                "Bachelor of Engineering (BEng)", "Bachelor of Technology (BTech)", "Bachelor of Business Administration (BBA)",
                "Master of Arts (MA)", "Master of Science (MS)", "Master of Business Administration (MBA)",
                "Master of Fine Arts (MFA)", "Master of Engineering (MEng)", "Master of Public Administration (MPA)",
                "Doctor of Philosophy (PhD)", "Juris Doctor (JD)", "Doctor of Medicine (MD)", "Doctor of Dental Surgery (DDS)",
                "Doctor of Pharmacy (PharmD)", "High School Diploma", "GED"
            ].sort();
            document.getElementById('allDegreesList').innerHTML = staticDegrees.map(d => `<option value="${escapeHtml(d)}"></option>`).join('');
        }
    };

    // --- Event Listeners ---
    saveBtn.addEventListener('click', saveResume);
    deleteBtn.addEventListener('click', deleteResume);
    clearBtn.addEventListener('click', () => {
        confirmationModalBody.textContent = 'Are you sure you want to clear the form? Any unsaved changes will be lost.';
        confirmationModal.show();
        confirmActionBtn.onclick = () => {
            confirmationModal.hide();
            resetForm();
            showMessage('Form cleared.', 'info');
        };
    });
    loadBtn.addEventListener('click', () => loadResume(loadIdInput.value.trim()));
    // Use the debounced version for the form's input event
    form.addEventListener('input', updateJsonViewDebounced);

    // --- Initial Load ---
    populateDropdowns();
    initCropper(); // Initialize cropper without an image initially

    // Setup custom autocomplete for skills, tags, and the new combined country/code field
    setupCustomAutocompleteDropdown('skillSearchInput', 'skillSuggestionsDropdown', 'selectedSkillsContainer', 'skills', true);
    setupCustomAutocompleteDropdown('tagSearchInput', 'tagSuggestionsDropdown', 'selectedTagsContainer', 'tags', true);
    // Pass updatePhoneInputMaxlength as a callback for the new single-select countryAndCode dropdown
    setupCustomAutocompleteDropdown('countryAndCode', 'countryAndCodeSuggestionsDropdown', null, 'countryAndCodes', false, (selectedItem) => {
        // When countryAndCode is selected, immediately update the phone input's max length
        // The selectedItem.value here will be the actual country code (e.g., "+91")
        updatePhoneInputMaxlength();
    });

    updateJsonViewDebounced(); // Initial update with debounced version
    hljs.highlightAll(); // Initialize highlight.js for JSON syntax
    updatePhoneInputMaxlength(); // Initial call to set phone input maxlength
});
