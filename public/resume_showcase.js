document.addEventListener('DOMContentLoaded', () => {
    // --- Globals & State ---
    const API_BASE_URL = window.location.origin;
    let allResumes = []; // Stores all fetched resumes
    let currentlyExpandedCard = null; // Tracks the currently expanded resume card
    let originalCardDetailsContent = {}; // Store original HTML content for each card ID
    let currentViewMode = 'cards-view'; // Default view mode

    // --- UI Elements ---
    const resultsContainer = document.getElementById('searchResultsContainer');
    const resultsCountDisplay = document.getElementById('resultsCountDisplay');
    const initialMessage = document.getElementById('initialMessage');
    const searchBtn = document.getElementById('searchBtn');
    const clearBtn = document.getElementById('clearBtn');
    const limitInput = document.getElementById('limitInput'); // Changed from limitSelect
    const showAllBtn = document.getElementById('showAllBtn'); // New button for "All"
    const viewToggleSwitch = document.getElementById('viewToggleSwitch'); // New view toggle switch
    const cardsViewLabel = document.getElementById('cardsViewLabel'); // Reference to the Cards View label
    const listViewLabel = document.getElementById('listViewLabel');   // Reference to the List View label


    // --- Helper Functions ---
    let messageTimeoutId = null; // To store the timeout ID for messages

    const showMessage = (message, type = 'danger') => {
        const appMessage = document.getElementById('appMessage');
        // Clear any existing timeout to prevent previous messages from disappearing prematurely
        if (messageTimeoutId) {
            clearTimeout(messageTimeoutId);
            messageTimeoutId = null;
        }

        appMessage.className = `app-message alert alert-${type} text-center show`;
        appMessage.textContent = message;
        // Ensure the message is visible on top
        appMessage.style.zIndex = '1100';

        // Automatically hide after 10 seconds for better visibility
        messageTimeoutId = setTimeout(() => {
            appMessage.classList.remove('show');
            // Reset z-index once hidden, or keep it high if it's always needed
            appMessage.style.zIndex = '';
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

    // Debounce function to limit how often a function is called
    const debounce = (func, delay) => {
        let timeout;
        return function (...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    };

    // --- PDF Generation (using jsPDF) ---
    const downloadResumeAsPdf = (resume) => {
        if (typeof window.jspdf === 'undefined' || !window.jspdf.jsPDF) {
            showMessage('PDF generation library not loaded. Please ensure jspdf.umd.min.js is included.', 'danger');
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const { personalInfo, education, projects, experience, skills, tags } = resume;

        let yPos = 10;
        const margin = 10;
        const lineHeight = 5;
        const addText = (text, size = 12, style = 'normal', x = margin) => {
            if (yPos > doc.internal.pageSize.height - margin) {
                doc.addPage();
                yPos = margin;
            }
            doc.setFont('helvetica', style);
            doc.setFontSize(size);
            doc.text(text, x, yPos);
            yPos += lineHeight; // Adjust line height for better spacing
        };

        const addSectionTitle = (title) => {
            yPos += 5; // Extra spacing before title
            addText(title, 16, 'bold');
            yPos += 2;
        };

        // Name and Summary
        addText(escapeHtml(personalInfo.fullName), 24, 'bold');
        addText(escapeHtml(personalInfo.summary), 12);
        yPos += 5;

        // Contact Info
        addSectionTitle('Contact & Online');
        addText(`Email: ${escapeHtml(personalInfo.email)}`);
        addText(`Phone: ${escapeHtml(personalInfo.countryCode || '')} ${escapeHtml(personalInfo.phone || '')}`);
        addText(`Location: ${escapeHtml(personalInfo.city || '')}, ${escapeHtml(personalInfo.country || '')}`);
        if (personalInfo.linkedin) addText(`LinkedIn: ${escapeHtml(personalInfo.linkedin)}`);
        if (personalInfo.github) addText(`GitHub: ${escapeHtml(personalInfo.github)}`);
        if (personalInfo.youtube) addText(`YouTube: ${escapeHtml(personalInfo.youtube)}`);
        yPos += 5;

        // Skills (Modified to include ratings)
        if (skills.length > 0) {
            addSectionTitle('Skills');
            skills.forEach(skill => {
                // Ensure skill.name exists before displaying
                if (skill.name) {
                    const skillName = escapeHtml(skill.name);
                    const skillRating = skill.rating !== undefined ? ` (Rating: ${skill.rating}/5)` : '';
                    addText(`${skillName}${skillRating}`);
                }
            });
            yPos += 5;
        }

        // Tags
        if (tags.length > 0) {
            addSectionTitle('Tags');
            addText(tags.map(t => escapeHtml(t)).join(', '));
            yPos += 5;
        }

        // Education
        if (education.length > 0) {
            addSectionTitle('Education');
            education.forEach(edu => {
                addText(`${escapeHtml(edu.degree)} at ${escapeHtml(edu.institution)}`, 12, 'bold');
                addText(`${escapeHtml(edu.startYear || '')} - ${escapeHtml(edu.endYear || 'Present')}`, 10, 'normal', margin + 5);
                yPos += 3;
            });
            yPos += 5;
        }

        // Experience
        if (experience.length > 0) {
            addSectionTitle('Experience');
            experience.forEach(exp => {
                addText(`${escapeHtml(exp.jobTitle)} at ${escapeHtml(exp.company)}`, 12, 'bold');
                addText(`${escapeHtml(exp.startDate || '')} - ${escapeHtml(exp.endDate || 'Present')}`, 10, 'normal', margin + 5);
                if (exp.description) addText(escapeHtml(exp.description), 10, 'normal', margin + 5);
                yPos += 3;
            });
            yPos += 5;
        }

        // Projects
        if (projects.length > 0) {
            addSectionTitle('Projects');
            projects.forEach(proj => {
                addText(escapeHtml(proj.projectName), 12, 'bold');
                if (proj.projectUrl) addText(`URL: ${escapeHtml(proj.projectUrl)}`, 10, 'normal', margin + 5);
                if (proj.projectYoutubeUrl) addText(`YouTube: ${escapeHtml(proj.projectYoutubeUrl)}`, 10, 'normal', margin + 5);
                if (proj.description) addText(escapeHtml(proj.description), 10, 'normal', margin + 5);
                yPos += 3;
            });
        }

        doc.save(`${escapeHtml(personalInfo.fullName.replace(/\s/g, '_'))}_Resume.pdf`);
    };

    // --- Card Rendering & Interaction ---
    const createResumeCard = (resume) => {
        const card = document.createElement('div');
        card.className = 'resume-card';
        card.dataset.id = resume.id;

        const { personalInfo, education, skills, tags } = resume;
        // Use profilePhotoCroppedUrl for the summary card, prepend API_BASE_URL
       const profilePhotoUrl = personalInfo.profilePhotoCroppedUrl ? personalInfo.profilePhotoCroppedUrl : '';
        const degree = education.length > 0 ? education[0].degree : 'N/A';

        // Display skills with their ratings
        const displaySkills = skills.filter(s => s.name).slice(0, 3).map(s => { // Filter out skills without a name
            const skillName = escapeHtml(s.name);
            const skillRating = Math.max(0, Math.min(5, Math.floor(s.rating || 0))); // Ensure rating is 0-5 integer
            const stars = [...Array(skillRating)].map(() => '<i class="bi bi-star-fill text-warning"></i>').join('');
            const emptyStars = [...Array(5 - skillRating)].map(() => '<i class="bi bi-star text-warning"></i>').join('');
            return `<span class="badge bg-secondary me-1 skill-badge-with-rating">${skillName} ${stars}${emptyStars}</span>`;
        }).join(' ');

        const displayTags = tags.slice(0, 2).map(t => `<span class="badge bg-info text-dark me-1">${escapeHtml(t)}</span>`).join(' ');

        card.innerHTML = `
            <div class="card-summary d-flex align-items-center gap-3">
                ${profilePhotoUrl ? `<img src="${escapeHtml(profilePhotoUrl)}" alt="Profile Photo" class="profile-photo" onerror="this.onerror=null;this.src=''; this.style.display='none';">` : ''}
                <div class="card-info">
                    <div class="name">${escapeHtml(personalInfo.fullName)}</div>
                    <div class="qualification">${escapeHtml(degree)}</div>
                    <div class="rating mt-1">
                        ${[...Array(Math.floor(personalInfo.rating || 0))].map(() => '<i class="bi bi-star-fill text-warning"></i>').join('')}
                        ${(personalInfo.rating % 1 !== 0) ? '<i class="bi bi-star-half text-warning"></i>' : ''}
                        ${[...Array(5 - Math.ceil(personalInfo.rating || 0))].map(() => '<i class="bi bi-star text-warning"></i>').join('')}
                        <span class="ms-1 text-muted">(${personalInfo.rating !== null ? personalInfo.rating.toFixed(1) : 'N/A'})</span>
                    </div>
                    ${displaySkills ? `<div class="skills mt-2">Skills: ${displaySkills}</div>` : ''}
                    ${displayTags ? `<div class="tags mt-1">Tags: ${displayTags}</div>` : ''}
                </div>
            </div>
            <div class="card-details">
                <!-- Detailed content will be injected on expand -->
            </div>
        `;

        // Attach click listener to the entire card
        card.addEventListener('click', (event) => {
            // Prevent clicks on nested links/buttons from triggering the card expansion
            // This ensures that links (like email, phone, LinkedIn, GitHub, YouTube) and the
            // "View Original Image" / "Back to Details" buttons work without collapsing the card.
            if (event.target.closest('a') || event.target.closest('button')) {
                return;
            }
            toggleCardExpansion(card, resume);
        });
        return card;
    };

    const toggleCardExpansion = (card, resume) => {
        // If there's an already expanded card and it's not the one being clicked
        if (currentlyExpandedCard && currentlyExpandedCard !== card) {
            currentlyExpandedCard.classList.remove('expanded');
            // Immediately remove content when collapsing to avoid content flash during transition
            const oldDetailsContainer = currentlyExpandedCard.querySelector('.card-details');
            if (originalCardDetailsContent[currentlyExpandedCard.dataset.id]) {
                oldDetailsContainer.innerHTML = originalCardDetailsContent[currentlyExpandedCard.dataset.id];
            } else {
                oldDetailsContainer.innerHTML = '';
            }
        }

        // Toggle the clicked card
        card.classList.toggle('expanded');

        if (card.classList.contains('expanded')) {
            currentlyExpandedCard = card;
            // Store original content before injecting new view (details or image)
            const detailsContainer = card.querySelector('.card-details');
            originalCardDetailsContent[card.dataset.id] = detailsContainer.innerHTML;
            // Always inject content when expanding
            injectDetailedContent(card, resume);

            // SCROLL THE EXPANDED CARD INTO VIEW
            // Use setTimeout to ensure the card has fully expanded and rendered its content
            // before attempting to scroll, which gives a more accurate scroll position.
            setTimeout(() => {
                card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100); // A small delay (e.g., 100ms) can often help with rendering calculations
        } else {
            currentlyExpandedCard = null;
            // When collapsing, immediately clear content to allow CSS transition to finish smoothly
            card.querySelector('.card-details').innerHTML = '';
            delete originalCardDetailsContent[card.dataset.id]; // Clean up stored content
        }
    };

    const injectDetailedContent = (card, resume) => {
        const detailsContainer = card.querySelector('.card-details');

        const { personalInfo, education, projects, experience, skills, tags } = resume;

        let educationHtml = education.length > 0 ? `
            <div class="col-12 col-md-6 mt-3">
                <h5>Education</h5>
                ${education.map(edu => `
                    <p class="mb-1"><strong>${escapeHtml(edu.degree)}</strong> at ${escapeHtml(edu.institution)}</p>
                    <p class="text-muted ms-3">${escapeHtml(edu.startYear || '')} - ${escapeHtml(edu.endYear || 'Present')}</p>
                `).join('')}
            </div>
        ` : '';

        let experienceHtml = experience.length > 0 ? `
            <div class="col-12 col-md-6 mt-3">
                <h5>Experience</h5>
                ${experience.map(exp => `
                    <p class="mb-1"><strong>${escapeHtml(exp.jobTitle)}</strong> at ${escapeHtml(exp.company)}</p>
                    <p class="text-muted ms-3">${escapeHtml(exp.startDate || '')} - ${escapeHtml(exp.endDate || 'Present')}</p>
                    <p class="ms-3">${escapeHtml(exp.description)}</p>
                `).join('')}
            </div>
        ` : '';

        let projectsHtml = projects.length > 0 ? `
            <div class="col-12 mt-3">
                <h5>Projects</h5>
                ${projects.map(proj => `
                    <p class="mb-1"><strong>${escapeHtml(proj.projectName)}</strong></p>
                    <p class="text-muted ms-3">${proj.projectUrl ? `<a href="${escapeHtml(proj.projectUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(proj.projectUrl)}</a>` : 'N/A'}</p>
                    ${proj.projectYoutubeUrl ? `<p class="text-muted ms-3">YouTube: <a href="${escapeHtml(proj.projectYoutubeUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(proj.projectYoutubeUrl)}</a></p>` : ''}
                    <p class="ms-3">${escapeHtml(proj.description)}</p>
                `).join('')}
            </div>
        ` : '';

        const generateDetailsViewHtml = () => {
            let html = `
                <h4 class="mb-3">${escapeHtml(personalInfo.summary)}</h4>
                <hr>
                
                <div class="row g-3">
                    <div class="col-12 col-md-6">
                        <h5>Contact & Online</h5>
                        <p class="mb-1">Email: <a href="mailto:${escapeHtml(personalInfo.email)}">${escapeHtml(personalInfo.email)}</a></p>
                        <p class="mb-1">Phone: ${escapeHtml(personalInfo.countryCode || '')} ${escapeHtml(personalInfo.phone || '')}</p>
                        <p class="mb-1">Location: ${escapeHtml(personalInfo.city || '')}, ${escapeHtml(personalInfo.country || '')}</p>
                        ${personalInfo.linkedin ? `<p class="mb-1">LinkedIn: <a href="${escapeHtml(personalInfo.linkedin)}" target="_blank">View Profile</a></p>` : ''}
                        ${personalInfo.github ? `<p class="mb-1">GitHub: <a href="${escapeHtml(personalInfo.github)}" target="_blank">View Profile</a></p>` : ''}
                        ${personalInfo.youtube ? `<p class="mb-1">YouTube: <a href="${escapeHtml(personalInfo.youtube)}" target="_blank">View Channel</a></p>` : ''}
                    </div>

                    <div class="col-12 col-md-6">
                        <h5>Skills</h5>
                        <p>${skills.filter(s => s.name).map(s => { // Filter out skills without a name
                const skillName = escapeHtml(s.name);
                const skillRating = Math.max(0, Math.min(5, Math.floor(s.rating || 0)));
                const stars = [...Array(skillRating)].map(() => '<i class="bi bi-star-fill text-warning"></i>').join('');
                const emptyStars = [...Array(5 - skillRating)].map(() => '<i class="bi bi-star text-warning"></i>').join('');
                return `<span class="badge bg-secondary me-1 mb-1">${skillName} ${stars}${emptyStars}</span>`;
            }).join(' ')}</p>
                        <h5 class="mt-3">Tags</h5>
                        <p>${tags.map(t => `<span class="badge bg-info text-dark me-1 mb-1">${escapeHtml(t)}</span>`).join(' ')}</p>
                    </div>
                </div>
                <div class="row g-3">
                    ${educationHtml}
                    ${experienceHtml}
                </div>
                <div class="row g-3">
                    ${projectsHtml}
                </div>
                <div class="mt-3 d-flex gap-2 justify-content-end">
                    <!-- CHANGED: Use solid btn-success instead of outline for visibility -->
                    <button class="btn btn-sm btn-success download-pdf-btn"><i class="bi bi-file-earmark-arrow-down"></i> Download PDF</button>
                </div>
            `;
            return html;
        };

        detailsContainer.innerHTML = generateDetailsViewHtml(); // Default to details view

        // Attach event listener for "Download PDF"
        const downloadPdfBtn = detailsContainer.querySelector('.download-pdf-btn');
        if (downloadPdfBtn) {
            downloadPdfBtn.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent card from collapsing
                downloadResumeAsPdf(resume);
            });
        }
    };

    // Collapse card if clicking outside (but not on the card summary)
    document.addEventListener('click', (e) => {
        if (currentlyExpandedCard) {
            const isClickInsideExpandedCard = currentlyExpandedCard.contains(e.target);
            const isClickOnCardButton = e.target.closest('.download-pdf-btn');

            if (!isClickInsideExpandedCard && !isClickOnCardButton) {
                // Click is outside the card entirely and not on any of its specific buttons, so collapse it.
                currentlyExpandedCard.classList.remove('expanded');
                // Immediately clear content to allow CSS transition to finish
                currentlyExpandedCard.querySelector('.card-details').innerHTML = '';
                delete originalCardDetailsContent[currentlyExpandedCard.dataset.id];
                currentlyExpandedCard = null;
            }
            // The logic for collapsing when clicking on the card summary when already expanded
            // is now handled by the card's own click listener to prevent double-toggling.
        }
    });

    /**
     * Toggles the display mode of the resume cards between 'cards-view' (grid) and 'list-view' (full-width stacked).
     * @param {string} mode - The desired view mode: 'cards-view' or 'list-view'.
     */
    const toggleViewMode = (mode) => {
        currentViewMode = mode;
        resultsContainer.classList.remove('cards-view', 'list-view');
        resultsContainer.classList.add(currentViewMode);

        // Update active class on external labels
        cardsViewLabel.classList.toggle('active-view', mode === 'cards-view');
        listViewLabel.classList.toggle('active-view', mode === 'list-view');


        // Collapse any expanded card when switching view modes for better UI consistency
        if (currentlyExpandedCard) {
            currentlyExpandedCard.classList.remove('expanded');
            // Immediately clear content to allow CSS transition to finish
            currentlyExpandedCard.querySelector('.card-details').innerHTML = '';
            delete originalCardDetailsContent[currentlyExpandedCard.dataset.id];
            currentlyExpandedCard = null;
        }
    };


    // --- Data Fetching & Filtering ---
    const displayResumes = (resumes) => {
        resultsContainer.innerHTML = '';
        initialMessage.style.display = 'none';

        if (resumes.length === 0) {
            resultsContainer.innerHTML = '<p class="text-muted text-center col-12">No resumes found matching your criteria.</p>';
            initialMessage.style.display = 'block'; // Show initial message if no results
            initialMessage.textContent = 'No resumes found matching your criteria.';
        } else {
            // Use a DocumentFragment to minimize DOM reflows when appending multiple elements
            const fragment = document.createDocumentFragment();
            resumes.forEach(resume => {
                fragment.appendChild(createResumeCard(resume));
            });
            resultsContainer.appendChild(fragment);
        }
    };

    const filterAndDisplay = () => {
        const nameQuery = document.getElementById('searchByName').value.toLowerCase();
        const cityQuery = document.getElementById('searchByCity').value.toLowerCase();
        const skillQuery = document.getElementById('searchBySkill').value.toLowerCase(); // Now matching skill.name
        const tagQuery = document.getElementById('searchByTag').value.toLowerCase(); // Ensure tag query is lowercased
        const degreeQuery = document.getElementById('searchByDegree').value.toLowerCase(); // New degree filter

        let limit = parseInt(limitInput.value);
        // Ensure limit is a positive number. If not, default to 9.
        // If "All" button sets limitInput.value to a large number, respect that.
        if (isNaN(limit) || limit < 1) {
            limit = 9;
            limitInput.value = 9;
        }


        let filtered = allResumes.filter(r => {
            const p = r.personalInfo;
            // Case-insensitive checks for name and city
            const matchesName = p.fullName.toLowerCase().includes(nameQuery);
            const matchesCity = p.city.toLowerCase().includes(cityQuery);

            // MODIFIED: Skill matching now checks skill.name
            const matchesSkill = skillQuery ? r.skills.some(s => s.name && s.name.toLowerCase().includes(skillQuery)) : true;
            // Case-insensitive tag matching
            const matchesTag = tagQuery ? r.tags.some(t => t.toLowerCase().includes(tagQuery)) : true;

            // New: Filter by degree
            const matchesDegree = degreeQuery ?
                r.education.some(edu => edu.degree && edu.degree.toLowerCase().includes(degreeQuery)) :
                true;

            return matchesName && matchesCity && matchesSkill && matchesTag && matchesDegree;
        });

        resultsCountDisplay.textContent = `Showing ${Math.min(limit, filtered.length)} of ${filtered.length} results.`;

        const limited = filtered.slice(0, limit);
        displayResumes(limited);
    };

    // Debounced version of filterAndDisplay
    const filterAndDisplayDebounced = debounce(filterAndDisplay, 300); // 300ms delay


    const fetchAllData = async () => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/api/resumes`);
            if (!response.ok) throw new Error(`Failed to fetch resumes (${response.status})`);
            const data = await response.json();
            allResumes = Object.values(data || {});
            filterAndDisplay();
        } catch (error) {
            console.error("Error fetching resumes:", error);
            showMessage(`Error fetching resumes: ${error.message}`, 'danger');
        } finally {
            setLoading(false);
        }
    };

    const fetchMetadata = async (type) => {
        const response = await fetch(`${API_BASE_URL}/api/metadata/${type}`);
        if (!response.ok) throw new Error(`Failed to fetch ${type}`);
        return response.json();
    };

    const populateFilters = async () => {
        try {
            const [skills, tags, degrees] = await Promise.all([
                fetchMetadata('skills'),
                fetchMetadata('tags'),
                fetchMetadata('degrees')
            ]);

            const skillSelect = document.getElementById('searchBySkill');
            skillSelect.innerHTML = '<option value="">All Skills</option>';
            skillSelect.innerHTML += skills.map(s => `<option value="${s}">${s}</option>`).join('');

            const tagSelect = document.getElementById('searchByTag');
            tagSelect.innerHTML = '<option value="">All Tags</option>';
            tagSelect.innerHTML += tags.map(t => `<option value="${t}">${t}</option>`).join('');

            const degreeSelect = document.getElementById('searchByDegree');
            degreeSelect.innerHTML = '<option value="">All Degrees</option>';
            degreeSelect.innerHTML += degrees.map(d => `<option value="${d}">${d}</option>`).join('');
        } catch (error) {
            console.error("Error fetching filter metadata:", error);
            showMessage(`Metadata load failed: ${error.message}`, 'warning');
        }
    };

    // --- Event Listeners ---
    searchBtn.addEventListener('click', filterAndDisplay);
    clearBtn.addEventListener('click', () => {
        document.getElementById('searchByName').value = '';
        document.getElementById('searchByCity').value = '';
        document.getElementById('searchBySkill').value = '';
        document.getElementById('searchByTag').value = '';
        document.getElementById('searchByDegree').value = ''; // Clear degree filter
        limitInput.value = '9'; // Reset limit to default
        filterAndDisplay(); // Re-filter and display with cleared values
    });
    // Add input event listener for immediate filtering when typing in search fields (debounced)
    document.getElementById('searchByName').addEventListener('input', filterAndDisplayDebounced);
    document.getElementById('searchByCity').addEventListener('input', filterAndDisplayDebounced);
    // Change events for select dropdowns don't need debouncing as they are discrete actions
    document.getElementById('searchBySkill').addEventListener('change', filterAndDisplay);
    document.getElementById('searchByTag').addEventListener('change', filterAndDisplay);
    document.getElementById('searchByDegree').addEventListener('change', filterAndDisplay);


    limitInput.addEventListener('input', filterAndDisplayDebounced); // Re-filter when limit input changes (debounced)
    showAllBtn.addEventListener('click', () => { // "Show All" button logic
        limitInput.value = allResumes.length > 0 ? allResumes.length : 1; // Set limit to total resumes or 1 if empty
        filterAndDisplay(); // Not debounced for explicit button click
    });

    // Event listener for the view toggle switch
    viewToggleSwitch.addEventListener('change', (event) => {
        if (event.target.checked) {
            // If checked, it's "Cards view" (default state for the switch)
            toggleViewMode('cards-view');
        } else {
            // If unchecked, it's "List view"
            toggleViewMode('list-view');
        }
        filterAndDisplay(); // Re-display resumes with the new view mode (not debounced)
    });

    // --- Initial Load ---
    fetchAllData(); // Fetch all resumes first
    populateFilters(); // Then populate the filter dropdowns
    viewToggleSwitch.checked = true; // Ensure the switch starts in the "Cards View" position
    toggleViewMode('cards-view'); // Set initial view mode on load and apply active class
});
