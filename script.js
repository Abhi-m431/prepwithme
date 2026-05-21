let examState = {
    questions: [],
    responses: {}, // questionId: selectedOption
    marked: new Set(),
    visited: new Set(),
    currentIndex: 0,
    timeLeft: 0,
    timerId: null
};

// Centralized DOM element cache
const ui = {
    get sidebar() { return document.querySelector('.sidebar'); },
    get sidebarOverlay() { return document.getElementById('sidebar-overlay'); },
    get mainContent() { return document.getElementById('main-content'); },
    get userName() { return document.getElementById('user-name'); },
    get questionsList() { return document.getElementById('questions-list'); },
    get breadcrumbCat() { return document.getElementById('bread-cat'); },
    get displayTitle() { return document.getElementById('display-title'); },
    get mockResult() { return document.getElementById('mock-result'); }
};

// Helper to create navigation items dynamically
function createNavItemElement(text, classes = [], onClickHandler = null, id = null) {
    const element = document.createElement('div');
    element.className = 'nav-item ' + classes.join(' ');
    element.innerHTML = text;
    if (onClickHandler) element.onclick = onClickHandler;
    if (id) element.id = id;
    return element;
}

// Smooth scroll to section
function scrollToSection(id) {
  document.getElementById(id).scrollIntoView({ behavior: 'smooth' });
}

const motivationalQuotes = [
    "Success is the sum of small efforts, repeated day in and day out.",
    "The secret of getting ahead is getting started.",
    "Believe you can and you're halfway there.",
    "It always seems impossible until it's done.",
    "Don't stop when you're tired. Stop when you're done."
];

// Efficient multi-page theory rendering using theory.json, with pagination for each subcategory and dynamic sidebar generation
let theoryData = null;
let currentTheory = { category: null, subcat: null };

// Performance Optimization: Cache for fetched questions
let questionsCache = {};
let activeCharts = {};

function toggleSidebar() {
    if (ui.sidebar && ui.sidebarOverlay) {
        ui.sidebar.classList.toggle('show');
        ui.sidebarOverlay.classList.toggle('show');
    }
}

function closeSidebarOnMobile() {
    if (window.innerWidth <= 900 && ui.sidebar && ui.sidebarOverlay) {
        ui.sidebar.classList.remove('show');
        ui.sidebarOverlay.classList.remove('show');
    }
}

// Helper to remove 'active' class from all nav items
function clearActiveNavItems() {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
}

if (!theoryData) {
    fetch('theory.json')
      .then(res => {
          if (!res.ok) throw new Error("Failed to load theory.json");
          return res.json();
      })
      .then(json => {
        theoryData = json;
        renderSidebar();
        handleInitialRouting();
      })
      .catch(err => console.error("Initialization error:", err));
}

// Helper to ensure Dashboard layout is restored when exiting Exam Mode
function ensureDashboardShell() {
    document.body.classList.remove('exam-mode-active');
    const main = ui.mainContent;
    if (!main) return console.error("Main content container not found.");

    const existingQuestionsList = document.getElementById('questions-list');
    if (!existingQuestionsList) {
        main.innerHTML = `
            <div class="header-meta">
                <div class="breadcrumb">Dashboard / <span id="bread-cat"></span></div>
                <h1 class="page-title" id="display-title"></h1>
            </div>
            <div id="questions-list"></div>
            <div id="mock-result"></div>
        `;
    }

    if (ui.mockResult) ui.mockResult.innerHTML = ""; 
}

// Helper to find which category a specific topic (tag) belongs to
function findCategoryByTopic(topicName) {
    if (!theoryData) return null;
    return Object.keys(theoryData).find(cat => 
        Object.keys(theoryData[cat].topics).some(t => t.toLowerCase() === topicName.toLowerCase())
    );
}

function handleInitialRouting() {
    const path = window.location.hash || '#/';
    // Normalize path by removing #/ and splitting into parts
    const routeParts = path.replace(/^#\/?/, '').split('/').filter(Boolean);
    
    if (history.state && history.state.view) {
        const state = history.state;
        switch(state.view) {
            case 'theory': return renderTheory(state.category, state.subcat, false);
            case 'practice': 
                currentTheory.category = state.category;
                return startPractice(state.tag, false);
            case 'profile': return showProfileDetails(false);
            case 'stats': return showStatistics(false);
            case 'mockInstr': return showMockInstructions(state.mockNum, null, false);
            case 'mockSelect': return chooseMockTest(false);
            case 'mockActive': return startMockTest(state.mockNum, false, state.seed);
        }
    }

    if (routeParts.length === 0 || routeParts[0] === 'index.html') {
        if (!history.state) history.replaceState({ view: 'home' }, "", "#/");
        renderHome(false);
    } else if (routeParts[0] === 'theory') {
        const catName = routeParts[1] ? routeParts[1].replace(/-/g, ' ') : null;
        const subName = routeParts[2] ? routeParts[2].replace(/-/g, ' ') : null;
        const categoryKey = Object.keys(theoryData).find(k => k.toLowerCase() === catName?.toLowerCase());
        if (categoryKey) {
            renderTheory(categoryKey, subName, false);
        } else {
            renderHome(false);
        }
    } else if (routeParts[0] === 'practice') {
        const tagName = routeParts[1] ? routeParts[1].replace(/-/g, ' ') : null;
        const categoryKey = findCategoryByTopic(tagName);
        if (categoryKey && tagName) {
            currentTheory.category = categoryKey;
            startPractice(tagName, false);
        } else { renderHome(false); }
    } else if (routeParts[0] === 'statistics') {
        showStatistics(false);
     } else if (routeParts[0] === 'profile') {
        showProfileDetails(false);
    } else if (routeParts[0] === 'mock-test') {
        chooseMockTest(false);
        if (routeParts[1]) {
            const mockNum = parseInt(routeParts[1]);
            if (routeParts[2] === 'active') {
                const topicName = routeParts[3] ? routeParts[3].replace(/-/g, ' ') : (history.state?.topicName || null);
                const seed = history.state?.seed || null;
                startMockTest(mockNum, false, seed, topicName);
            } else {
                showMockInstructions(mockNum, null, false);
            }
        }
    } else {
        // Default to home for unknown paths
        history.replaceState({ view: 'home' }, "", "#/");
        renderHome(false);
    }
}
function renderHome(push = true) {
    ensureDashboardShell();
    closeSidebarOnMobile();
    
    const quote = motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)];
    // Improvement: Fallback to "Student" only if the name is explicitly missing
    let firstName = ui.userName?.innerText;
    if (!firstName || firstName === "") {
        firstName = "Student";
    }

    if (ui.breadcrumbCat) ui.breadcrumbCat.innerText = "Home";
    if (ui.displayTitle) ui.displayTitle.innerText = "Student Dashboard";
    if (ui.mockResult) ui.mockResult.innerHTML = "";
    
    if (ui.questionsList) {
        ui.questionsList.innerHTML = `
        <div class="welcome-container focused-mode">
            <h2 class="section-heading">Welcome back, ${firstName}</h2>
            
            <div class="quote-card">
                <p class="quote-text">"${quote}" — <em>Focus on your goals.</em></p>
            </div>
            
            <div class="dashboard-grid">
                <div class="question-card" style="cursor: pointer; text-align: left;" onclick="renderTheory('Quantitative Aptitude')">
                    <h3 style="color: var(--primary); margin-bottom: 0.5rem;">Study Topics</h3>
                    <p style="font-size: 0.95rem; color: var(--text-muted);">Browse detailed formulas and concepts for your upcoming exams.</p>
                </div>
                <div class="question-card" style="cursor: pointer; text-align: left;" onclick="chooseMockTest()">
                    <h3 style="color: var(--primary); margin-bottom: 0.5rem;">Mock Tests</h3>
                    <p style="font-size: 0.95rem; color: var(--text-muted);">Jump straight into a mock test to test your current knowledge.</p>
                </div>
            </div>
        </div>
    `;
    }
    currentTheory = { category: null, subcat: null };
    if (push) history.pushState({ view: 'home' }, "", "#/");
    clearActiveNavItems(); // Remove active class from all nav items
    document.getElementById('nav-home')?.classList.add('active'); // Set home as active
}

function renderTheory(category, subcat = null, push = true) {
    ensureDashboardShell();
    if (!theoryData || !ui.questionsList) return;
    closeSidebarOnMobile();
    const cat = theoryData[category]; // Get category data
    if (!cat) return;
    let title = cat.title;
    
    // Default "At a Glance" view for the Main Category
    let content = `
        <div class="category-glance">
            <p class="theory-overview">${cat.overview || ''}</p>
            <h3 class="curriculum-title">Module Curriculum</h3>
            <div class="glance-grid">
                ${Object.keys(cat.topics).map(topic => `
                    <div class="glance-card" onclick="renderTheory('${category}', '${topic}')">
                        <span class="glance-topic-name">${topic}</span>
                        <span class="glance-arrow">➔</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    let breadcrumb = category;
    // Robust Case-Insensitive Sub-Topic Lookup
    const subcatKey = subcat ? Object.keys(cat.topics).find(k => k.toLowerCase() === subcat.toLowerCase()) : null;

    if (subcatKey) {
        const topicsList = cat.topics[subcatKey];
        if (!topicsList || !topicsList.length) return;
        
        title = subcatKey;
        breadcrumb = `${category} / ${subcatKey}`;

        content = `
            <div class="theory-header">
                <h2 class="theory-title-focused">${subcatKey}</h2>
                <button class='btn btn-primary' onclick='startPractice("${subcatKey}")'>Take Practice Test ➔</button>
            </div>`;
        topicsList.forEach(topicData => {
            content += `
                <section class="theory-section">
                    <h3>${topicData.title}</h3>
                    <div class="theory-content">${topicData.content}</div>
                </section>
            `;
        });

        content += `<div class="cta-footer">
            <button class='btn btn-primary btn-lg' onclick='startPractice("${subcatKey}")'>Start ${subcatKey} Practice Test ➔</button>
        </div>`;
    }

    if (ui.breadcrumbCat) ui.breadcrumbCat.innerText = breadcrumb;
    if (ui.displayTitle) ui.displayTitle.innerText = title;
    
    // Revert logic: Main Category glance uses full-width container, sub-topics use Focused Reader
    const wrapperClass = subcatKey ? "theory-reader-container" : "question-card";
    ui.questionsList.innerHTML = `<div class="${wrapperClass}">${content}</div>`;
    
    currentTheory = { category, subcat: subcatKey };
    if (push) { // Push state to history
        const urlPath = subcatKey
            ? `#/theory/${category.replace(/\s+/g, '-').toLowerCase()}/${subcatKey.replace(/\s+/g, '-').toLowerCase()}`
            : `#/theory/${category.replace(/\s+/g, '-').toLowerCase()}`;
        history.pushState({ view: 'theory', category, subcat }, "", urlPath);
    }
}

async function startPractice(tag, push = true) {
    // Redirect to start a topic-specific mock test (Mock Test 4)
    // This will use the mock_pool.json for questions and the exam mode layout.
    // The 'tag' parameter becomes the topicName for the mock test.
    startMockTest(4, push, null, tag);
}

function renderSidebar() {
    const nav = document.getElementById('category-nav');
    if (!nav || !theoryData) return;
    nav.innerHTML = "";

    const isAdmin = localStorage.getItem('admin_bypass') === 'true' || window.location.search.includes('admin=true');

    // 1. Populate Theory Topics
    Object.keys(theoryData).forEach(catKey => {
        const cat = theoryData[catKey];
        const safeId = catKey.replace(/[^a-z0-9]/gi, '_');
        // Main Category Item
        const item = document.createElement('div');
        item.className = 'nav-item';
        item.innerHTML = `<span>${cat.title}</span><span class=\"chevron\">▸</span>`;
        item.onclick = (e) => toggleSubMenu(catKey, safeId, item);
        nav.appendChild(item);
        // Sub-navigation container
        const subNav = document.createElement('div');
        subNav.className = 'sub-nav';
        subNav.id = `sub-${safeId}`;
        Object.keys(cat.topics).forEach(topic => {
            const subItem = document.createElement('div');
            subItem.className = 'nav-item sub-item';
            subItem.innerText = topic;
            subItem.onclick = (e) => {
                e.stopPropagation();
                switchTab(catKey, subItem, topic);
            };
            subNav.appendChild(subItem);
        });
        nav.appendChild(subNav);
    });

    // 2. Mock Tests Section
    const mockGroup = document.createElement('div');
    mockGroup.className = 'nav-group-title';
    mockGroup.innerText = 'Mock Tests';
    nav.appendChild(mockGroup);

    // Use the helper function for nav items
    nav.appendChild(createNavItemElement('<span>Mock Test 1 </span>', [], () => showMockInstructions(1, null, true, 30)));
    nav.appendChild(createNavItemElement('<span>Mock Test 2 </span>', [], () => showMockInstructions(2, null, true, 30)));
    nav.appendChild(createNavItemElement('<span>Mock Test 3 </span>', [], () => showMockInstructions(3, null, true, 30)));

    if (isAdmin && window.location.search.includes('admin=true')) {
        localStorage.setItem('admin_bypass', 'true');
    }

}

function toggleSubMenu(catKey, safeId, element) {
    const subMenu = document.getElementById(`sub-${safeId}`);
    const isOpen = subMenu.classList.contains('show');
    subMenu.classList.toggle('show');
    element.classList.toggle('open');
    if (!isOpen) {
        renderTheory(catKey);
    }
}

function switchTab(cat, element, subtopic = null) {
    // Update active class
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    element.classList.add('active');
    
    // Render new data
    renderTheory(cat, subtopic);
    closeSidebarOnMobile();
    
    // Scroll to top for mobile users
    if(window.innerWidth < 900) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

async function showStatistics(push = true) {
    clearActiveNavItems();
    ensureDashboardShell();
    if (!ui.questionsList) return;
    closeSidebarOnMobile();
    if (ui.breadcrumbCat) ui.breadcrumbCat.innerText = "Performance";
    if (ui.displayTitle) ui.displayTitle.innerText = "Your Statistics";
    if (push) history.pushState({ view: 'stats' }, "", "#/statistics");
    ui.questionsList.innerHTML = "<div class='question-card'>Loading your performance data...</div>";

    if (!window.getUserResults) return;
    const results = await window.getUserResults();
    
    if (!results || results.length === 0) {
        ui.questionsList.innerHTML = "<div class='question-card'>No performance data found. Take a Mock Test to see your BI analysis!</div>";
        return;
    }

    // BI Logic: Aggregate data for visuals
    const reversedResults = [...results].reverse(); // Oldest to newest for trend
    const dates = reversedResults.map(r => r.timestamp ? r.timestamp.toDate().toLocaleDateString() : 'Just now');
    const scores = reversedResults.map(r => r.percentage);
    
    const focusFrequencies = {};
    let totalQuestions = 0;
    let totalCorrect = 0;

    results.forEach(r => {
        totalQuestions += (r.total || 10);
        totalCorrect += (r.score || 0);
        if (r.focusArea && r.focusArea !== "None") {
            focusFrequencies[r.focusArea] = (focusFrequencies[r.focusArea] || 0) + 1;
        }
    });

    const avgAccuracy = Math.round((totalCorrect / totalQuestions) * 100);
    const sortedWeaknesses = Object.entries(focusFrequencies).sort((a, b) => b[1] - a[1]);
    const topWeakness = sortedWeaknesses.length > 0 ? sortedWeaknesses[0][0] : "None Detected";

    // Render Layout
    let html = `
        <!-- Metric Row -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
            <div class="question-card" style="text-align: center; padding: 1.5rem; margin-bottom:0; border-bottom: 4px solid var(--primary);">
                <p style="color: var(--text-muted); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; margin-bottom: 0.5rem;">Overall Accuracy</p>
                <h2 style="font-size: 2.5rem; color: var(--text-dark);">${avgAccuracy}%</h2>
            </div>
            <div class="question-card" style="text-align: center; padding: 1.5rem; margin-bottom:0; border-bottom: 4px solid #f59e0b;">
                <p style="color: var(--text-muted); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; margin-bottom: 0.5rem;">Total Attempts</p>
                <h2 style="font-size: 2.5rem; color: var(--text-dark);">${results.length}</h2>
            </div>
            <div class="question-card" style="text-align: center; padding: 1.5rem; margin-bottom:0; border-bottom: 4px solid #ef4444;">
                <p style="color: var(--text-muted); font-size: 0.75rem; font-weight: 800; text-transform: uppercase; margin-bottom: 0.5rem;">Critical Weakness</p>
                <h2 style="font-size: 1.25rem; color: #ef4444; height: 3rem; display: flex; align-items: center; justify-content: center;">${topWeakness}</h2>
            </div>
        </div>

        <!-- Visual Analytics Row -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(450px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
            <div class="question-card" style="margin-bottom:0;">
                <h3 style="margin-bottom: 1rem; font-size: 1rem;">Performance Trend</h3>
                <canvas id="trendChart" height="250"></canvas>
            </div>
            <div class="question-card" style="margin-bottom:0;">
                <h3 style="margin-bottom: 1rem; font-size: 1rem;">Repeated Mistakes by Topic</h3>
                <canvas id="weaknessChart" height="250"></canvas>
            </div>
        </div>

        <!-- Mock History Row -->
        <div class="question-card" style="margin-top: 2rem;">
            <h3 style="margin-bottom: 1.5rem; font-size: 1.25rem; border-bottom: 2px solid var(--primary-light); padding-bottom: 0.5rem;">Recent Mock Test History</h3>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 0.9rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border); color: var(--text-muted);">
                            <th style="padding: 1rem 0.5rem;">Date</th>
                            <th style="padding: 1rem 0.5rem;">Test</th>
                            <th style="padding: 1rem 0.5rem;">Score</th>
                            <th style="padding: 1rem 0.5rem;">Accuracy</th>
                            <th style="padding: 1rem 0.5rem;">Focus Area</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${results.map(r => `
                            <tr style="border-bottom: 1px solid var(--border);">
                                <td style="padding: 1rem 0.5rem;">${r.timestamp && typeof r.timestamp.toDate === 'function' ? r.timestamp.toDate().toLocaleDateString() : 'Recent'}</td>
                                <td style="padding: 1rem 0.5rem; font-weight: 600;">Mock Test ${r.testId || '-'}</td>
                                <td style="padding: 1rem 0.5rem;">${r.score}/${r.total}</td>
                                <td style="padding: 1rem 0.5rem; font-weight: 700; color: ${r.percentage >= 70 ? 'var(--success)' : '#ef4444'};">${r.percentage}%</td>
                                <td style="padding: 1rem 0.5rem;"><span class="q-tag" style="margin:0; font-size: 0.7rem; padding: 0.15rem 0.5rem;">${r.focusArea || 'General'}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    ui.questionsList.innerHTML = html;

    // Initialize BI Visuals
    if (window.Chart) {
        setTimeout(() => {
            // Performance Fix: Destroy existing chart instances before re-rendering
            if (activeCharts.trend) activeCharts.trend.destroy();
            if (activeCharts.weakness) activeCharts.weakness.destroy();

            // 1. Trend Chart
            const trendCtx = document.getElementById('trendChart').getContext('2d');
            activeCharts.trend = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: dates,
                    datasets: [{
                        label: 'Score %',
                        data: scores,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true, max: 100 } }
                }
            });

            // 2. Weakness Chart
            const weaknessCtx = document.getElementById('weaknessChart').getContext('2d');
            activeCharts.weakness = new Chart(weaknessCtx, {
                type: 'bar',
                data: {
                    labels: Object.keys(focusFrequencies),
                    datasets: [{
                        label: 'Mistake Frequency',
                        data: Object.values(focusFrequencies),
                        backgroundColor: '#ef4444',
                        borderRadius: 6
                    }]
                },
                options: {
                    indexAxis: 'y',
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: {
                        x: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
        }, 100);
    }
}
// Add this function to handle sidebar click for Mock Tests
function showMockInstructions(mockNum, element, push = true, numQuestions = null) {
    ensureDashboardShell();
    if (!ui.questionsList) return;
    closeSidebarOnMobile();
    clearActiveNavItems();

    const testTitle = mockNum === 4 ? "Practise Test" : "Mock Test " + mockNum;
    const topicName = history.state?.topicName || "all topics";

    if (element) element.classList.add('active');
    else {
        const sidebarItems = document.querySelectorAll('.sidebar .nav-item');
        sidebarItems.forEach(el => {
            if (el.innerText.includes(testTitle)) el.classList.add('active');
        });
    }

    if (ui.breadcrumbCat) ui.breadcrumbCat.innerText = testTitle;
    if (ui.displayTitle) ui.displayTitle.innerText = "Exam Instructions";
    if (ui.mockResult) ui.mockResult.innerHTML = "";

    ui.questionsList.innerHTML = `
        <div class="question-card" style="text-align:left; max-width: 700px; margin: 2rem auto; border-top: 5px solid var(--primary); padding: 2.5rem;">
            <div style="display: flex; align-items: center; gap: 1rem; margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border);">
                <div style="background: var(--primary-light); padding: 12px; border-radius: 12px; color: var(--primary);">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
                </div>
                <div>
                    <h2 style="margin:0; font-size: 1.5rem; color: var(--text-dark);">${testTitle} Readiness</h2>
                    <p style="margin:0; font-size: 0.9rem; color: var(--text-muted);">Please read the instructions carefully before starting.</p>
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-bottom: 2rem;">
                <div style="background: var(--bg); padding: 1rem; border-radius: 10px;">
                    <span style="display: block; font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">Total Questions</span>
                    <span style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">${mockNum === 4 ? 'Variable' : (numQuestions || 30)} Items</span>
                </div>
                <div style="background: var(--bg); padding: 1rem; border-radius: 10px;">
                    <span style="display: block; font-size: 0.7rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.5rem;">Time Allowed</span>
                    <span style="font-size: 1.2rem; font-weight: 700; color: var(--primary);">${mockNum === 4 ? 'No Limit' : '20 Minutes'}</span>
                </div>
            </div>

            <div class="theory-content" style="font-size: 0.95rem; color: var(--text-dark); line-height: 1.8;">
                <p style="margin-bottom: 1rem; font-weight: 600;">Standard Operating Procedures:</p>
                <ul style="padding-left: 1.25rem; margin-bottom: 2rem;">
                    <li>The test consists of multiple-choice questions from <b>${mockNum === 4 ? topicName : 'various aptitude topics'}</b>.</li>
                    <li>You can mark questions for review and return to them later using the Question Palette.</li>
                    <li>The test will <b>auto-submit</b> once the timer reaches zero.</li>
                    <li>Do not close the browser tab or refresh the page, as your progress will be lost.</li>
                    <li>A detailed analysis of your performance will be generated upon completion.</li>
                </ul>
            </div>

            <div style="display: flex; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                <button class="btn" style="flex: 1; justify-content: center;" onclick="chooseMockTest()">Go Back</button>
                <button class="btn btn-primary btn-lg" style="flex: 2; justify-content: center;" onclick="startMockTest(${mockNum}, true, null, '${topicName}', ${numQuestions || 30})">
                    Accept & Start Test ➔
                </button>
            </div>
        </div>
    `;
    if (push) history.pushState({ view: 'mockInstr', mockNum }, "", `#/mock-test/${mockNum}/instructions`);
}

function toggleExamPalette() {
    const panel = document.querySelector('.exam-side-panel');
    if (panel) {
        panel.classList.toggle('show-mobile-palette');
    }
}

// Show mock test selection (if you want 3 mock tests)
function chooseMockTest(push = true, defaultNumQuestions = 30) {
    ensureDashboardShell();
    if (!ui.questionsList) return;
    if (ui.mockResult) ui.mockResult.innerHTML = "";
    if (ui.breadcrumbCat) ui.breadcrumbCat.innerText = "Mock Tests";
    if (ui.displayTitle) ui.displayTitle.innerText = "Examination Center";
    
    ui.questionsList.innerHTML = `
        <div class="welcome-container">
            <p class="theory-overview" style="margin-bottom: 2.5rem; text-align: center;">Welcome to the Examination Center. Select a full-length mock test to evaluate your preparation.</p>
            
            <div class="dashboard-grid">
                ${[1, 2, 3].map(num => `
                    <div class="question-card" style="display: flex; flex-direction: column; gap: 1rem; border-top: 4px solid var(--primary); transition: all 0.3s ease; height: 100%;">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                            <div>
                                <h3 style="margin: 0; border: none; color: var(--text-dark); font-size: 1.25rem;">Mock Test ${num}</h3>
                                <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">General Ability & Quant</span>
                            </div>
                            <span class="q-tag" style="margin: 0;">${defaultNumQuestions} Qs</span>
                        </div>
                        
                        <div style="flex-grow: 1; padding: 0.5rem 0;">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 0.75rem; font-size: 0.9rem; color: var(--text-muted);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                <span>20 Minutes Timer</span>
                            </div>
                            <div style="display: flex; align-items: center; gap: 10px; font-size: 0.9rem; color: var(--text-muted);">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--primary);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                <span>Real Exam Pattern</span>
                            </div>
                        </div>
                        
                        <button class="btn btn-primary" style="width: 100%; justify-content: center; padding: 0.75rem;" onclick="showMockInstructions(${num}, null, true, ${defaultNumQuestions})">
                            Open Mock Center ➔
                        </button>
                    </div>
                `).join('')}
            </div>
            
            
        </div>
    `;
    if (push) history.pushState({ view: 'mockSelect' }, "", "#/mock-test");
}

async function showTopicSelectionForPractice(push = true) {
    ensureDashboardShell();
    if (!ui.questionsList) return;
    closeSidebarOnMobile();

    if (ui.breadcrumbCat) ui.breadcrumbCat.innerText = "Practise Test";
    if (ui.displayTitle) ui.displayTitle.innerText = "Select Topic for Practise";
    if (ui.mockResult) ui.mockResult.innerHTML = "";

    // Aggregate all unique tags from theoryData
    const allTopics = new Set();
    for (const catKey in theoryData) {
        for (const topicKey in theoryData[catKey].topics) {
            allTopics.add(topicKey);
        }
    }

    const sortedTopics = Array.from(allTopics).sort();

    ui.questionsList.innerHTML = `
        <div class="question-card" style="text-align:left;">
            <h3 style="border:none; margin-bottom:1.5rem;">Choose a topic to start your practice session:</h3>
            <div class="glance-grid">
                ${sortedTopics.map(topic => `
                    <div class="glance-card" onclick="startTopicPractice('${topic}')">
                        <span class="glance-topic-name">${topic}</span>
                        <span class="glance-arrow">➔</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    if (push) history.pushState({ view: 'topicPracticeSelect' }, "", "#/mock-test/practise/select-topic");
}

function startTopicPractice(topicName) {
    // Mock 4 is now the dedicated topic practice test
    // We pass the topicName so instructions and test can use it
    startMockTest(4, true, null, topicName); 
}

function showProfileDetails(push = true) {
    clearActiveNavItems();
    ensureDashboardShell();
    if (!ui.questionsList) return;
    closeSidebarOnMobile();
    if (ui.breadcrumbCat) ui.breadcrumbCat.innerText = "Profile";
    if (ui.displayTitle) ui.displayTitle.innerText = "Account Settings";
    if (push) history.pushState({ view: 'profile' }, "", "#/profile");

    const currentName = document.getElementById('full-name')?.innerText || "Student";
    const currentEmail = window.currentUserEmail || "No email available";

    ui.questionsList.innerHTML = `
        <div class="question-card" style="max-width: 600px; margin: 1rem auto; animation: fadeIn 0.4s ease-out;">
            <div style="text-align: left; padding: 1rem;">
                <h3 style="margin-top: 0; margin-bottom: 2rem; border: none; color: var(--primary);">Profile Information</h3>
                
                <div style="margin-bottom: 2rem;">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.75rem;">Registered Email</label>
                    <div style="padding: 1rem; background: var(--bg); border-radius: 10px; border: 1px solid var(--border); color: var(--text-muted); display: flex; align-items: center; gap: 10px;">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                        <span>${currentEmail}</span>
                    </div>
                </div>

                <div style="margin-bottom: 2.5rem;">
                    <label style="display: block; font-size: 0.75rem; font-weight: 800; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.75rem;">Full Name</label>
                    <div style="position: relative;">
                        <input type="text" id="profile-name-input" value="${currentName}" 
                               style="width: 100%; padding: 1rem 1rem 1rem 3rem; border-radius: 10px; border: 1px solid var(--border); font-size: 1rem; font-weight: 500; outline: none;">
                        <svg style="position: absolute; left: 1rem; top: 50%; transform: translateY(-50%); color: var(--text-muted);" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                    </div>
                </div>

                <button class="btn btn-primary btn-lg" onclick="saveProfileChanges()" style="width: 100%; justify-content: center;">
                    Update Name
                </button>
            </div>
        </div>
    `;
}

function saveProfileChanges() {
    const nameInput = document.getElementById('profile-name-input');
    const newName = nameInput.value.trim();
    if (!newName) return alert("Name cannot be empty");

    if (window.updateUserProfileName) {
        window.updateUserProfileName(newName)
            .then(() => {
                alert("Name updated successfully!");
                renderHome();
            })
            .catch(err => alert("Error: " + err.message));
    }
}

// MOCK TEST FEATURE
// Performance Optimization: Cache for the entire mock pool to avoid re-fetching

async function startMockTest(mockNum, push = true, seed = null, topicName = null, numQuestions = null) { // Consolidated definition
    if (examState.timerId) clearInterval(examState.timerId);
    
    try {
        let pool = [];
        // Define Quantitative Aptitude tags for filtering
        const qaTags = [
            "Percentage",
            "Time, Speed and Distance",
            "Simple Interest", // Assuming "Simple and Compound Interest" in QA.json is covered by this
            "Compound Interest",
            "Ratio and Proportion",
            "Profit & Loss",
            "Averages",
            "Work and Time",
            "Number System",
            "HCF & LCM",
            "Problems Based on Ages", // Often considered QA in some contexts, or LR. Including for now.
            "Pipes and Cisterns",
            "Discount",
            "Mixtures or Allegations",
            "Boats & Streams",
            "Problems Based on Trains",
            "Partnership",
            "Simplification",
            "Number Series"
        ];

        const files = mockNum === 4
            ? ['data/Quantitative_Aptitude.json', 'data/Logical_Reasoning___Mental_Ability.json', 'data/English_Language___Comprehension.json']
            : ['data/mock_pool.json']; // Only load from mock_pool.json for standard mock tests

        for (const file of files) {
            if (questionsCache[file]) {
                pool = pool.concat(questionsCache[file]);
                pool = pool.concat(questionsCache[file]); 
            } else {
                const res = await fetch(file);
                if (!res.ok) continue;
                const data = await res.json();
                questionsCache[file] = data;
                pool = pool.concat(data);
            }
        }

        // Filter for specific topic if it's the Topic practice mode (Mock 4)
        let questionsToUse = pool; // Default to all questions in the pool
        if (mockNum === 4 && topicName && topicName !== "all topics") {
            questionsToUse = pool.filter(q => q.tag?.trim().toLowerCase() === topicName.trim().toLowerCase());
        } else if (mockNum !== 4) {
            questionsToUse = pool.filter(q => qaTags.includes(q.tag));
        }

        const finalSeed = seed || (Math.floor(Math.random() * 1000000) + mockNum);
        const shuffled = shuffleArray(questionsToUse, finalSeed);
        
        // Improved Selection: Balanced Difficulty for Full Mock Tests
        if (mockNum !== 4) {
            const target = numQuestions || 30;
            const perLevel = Math.floor(target / 3);
            
            const easy = shuffled.filter(q => q.level === 'Easy').slice(0, perLevel);
            const med = shuffled.filter(q => q.level === 'Medium').slice(0, perLevel);
            const hard = shuffled.filter(q => q.level === 'Hard').slice(0, target - (easy.length + med.length));
            
            examState.questions = shuffleArray([...easy, ...med, ...hard], finalSeed);
        } else {
            examState.questions = shuffled;
        }

        if (examState.questions.length === 0) {
            alert("No questions found for this selection.");
            return;
        }

        examState.responses = {};
        examState.marked = new Set();
        examState.visited = new Set([0]);
        examState.currentIndex = 0;
        examState.timeLeft = mockNum === 4 ? Infinity : 20 * 60; // No time limit for practice
        
        if (push) {
            const urlPath = (mockNum === 4 && topicName) 
                ? `#/mock-test/${mockNum}/active/${topicName.replace(/\s+/g, '-').toLowerCase()}`
                : `#/mock-test/${mockNum}/active`;
            history.pushState({ view: 'mockActive', mockNum, seed: finalSeed, topicName }, "", urlPath);
        }
        if (mockNum === 4) {
            renderPracticeSequentialLayout(topicName);
        } else {
            renderExamLayout(mockNum);
            startExamTimer();
            document.body.classList.add('exam-mode-active');
        }
    } catch (err) {
        console.error(err);
        alert("Error initializing exam.");
    }
}

function renderPracticeSequentialLayout(topicName) {
    ensureDashboardShell();
    if (ui.breadcrumbCat) ui.breadcrumbCat.innerText = "Practise";
    if (ui.displayTitle) ui.displayTitle.innerText = topicName || "Practice Session";

    ui.questionsList.innerHTML = `<div id="sequential-list" style="max-width: 850px; margin: 0 auto; animation: fadeIn 0.4s ease-out;"></div>`;

    const list = document.getElementById('sequential-list');
    examState.questions.forEach((q, idx) => {
        const qId = q.id || q.question_number || `q-${idx}`;
        const qDiv = document.createElement('div');
        qDiv.className = 'question-card';
        qDiv.style = "text-align: left; margin-bottom: 3rem; border-left: 4px solid var(--primary-light);";
        
        const questionText = q.q || q.series || "Question content missing";
        const options = q.options || (q.option ? [q.option] : []);

        qDiv.innerHTML = `
            <div class="q-tag">${q.tag || "General Ability"}</div>
            <p class="q-text">Question ${idx + 1}:<br>${questionText}</p>
            <div class="options-grid" id="options-${qId}">
                ${options.map((opt, i) => {
                    const val = String.fromCharCode(65 + i);
                    return `
                        <div class="mock-option" id="opt-${qId}-${val}" 
                             onclick="selectSequentialOption('${qId}', '${val}')">
                            ${val}) ${opt}
                        </div>`;
                }).join('')}
            </div>
            <button class="btn btn-primary" style="margin-top: 1rem;" onclick="togglePracticeSolution('${qId}')">Check Solution & Explanation 💡</button>
            <div id="sol-${qId}" class="answer-container">
                <div class="answer-content">
                    <span class="correct-badge">Correct Answer: ${q.ans}</span>
                    <div class="explanation"><strong>Explanation:</strong> ${q.explain}</div>
                </div>
            </div>
        `;
        list.appendChild(qDiv);
    });
}

function renderExamLayout(mockNum) { // Consolidated definition
    const topicName = history.state?.topicName; // Keep this, it's used for the title
    const testTitle = mockNum === 4 ? `Practise: ${topicName || 'Selected Topic'}` : `Mock Test ${mockNum}`;

    ui.mainContent.innerHTML = `
        <div class="exam-header-strip" style="position: sticky; top: 0; z-index: 1000; width: 100%;">
            <div style="display: flex; align-items: center; gap: 1rem;">
                <svg style="width:24px; color:var(--primary);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 10v6M2 10l10-5 10 5-10 5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>
                <h2 style="margin:0;">${testTitle}</h2>
            </div>
            <button class="mobile-only-flex btn" onclick="toggleExamPalette()" style="margin-left: 10px; padding: 5px 10px; display: none;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                Grid
            </button>
            <div style="flex-grow: 1;"></div> 
            <div class="exam-timer" id="exam-timer-display" style="margin-left: auto;">${mockNum === 4 ? 'No Time Limit' : '20:00'}</div>
        </div>
        <div class="exam-container">
            <div class="exam-main-panel" id="exam-question-area"></div>
            <div class="exam-side-panel">
                <div class="nav-group-title">Question Palette</div>
                <div class="question-palette" id="palette-grid"></div>
                <div class="palette-legend">
                    <div class="legend-item"><div class="legend-box answered"></div> Answered</div>
                    <div class="legend-item"><div class="legend-box not-answered"></div> Not Answered</div>
                    <div class="legend-item"><div class="legend-box marked"></div> Marked</div>
                    <div class="legend-item"><div class="legend-box not-visited"></div> Not Visited</div>
                </div>
                <div style="margin-top: 2rem;">
                    <button class="btn btn-primary btn-lg" style="width: 100%; justify-content: center; background-color: var(--success); border: none;" onclick="showFinishModal()">Finish Test ➔</button>
                </div>
            </div>
        </div>
        <!-- Custom Modal for Finish Confirmation -->
        <div id="finish-modal" class="modal-overlay">
            <div class="modal-content">
                <h3 style="margin-bottom: 1rem; border: none;">Finish Mock Test?</h3>
                <p style="color: var(--text-muted); margin-bottom: 2rem;">Are you sure you want to submit your answers? You won't be able to change them after this.</p>
                <div style="display: flex; gap: 1rem; justify-content: center;">
                    <button class="btn" onclick="hideFinishModal()">Cancel</button>
                    <button class="btn btn-primary" onclick="finishMockTest(false)">Submit Test</button>
                </div>
            </div>
        </div>
    `;

    // Show grid toggle button only on mobile
    if (window.innerWidth <= 900) {
        const gridBtn = document.querySelector('.mobile-only-flex');
        if (gridBtn) gridBtn.style.display = 'flex';
    }

    updateQuestionDisplay();
}

function updateQuestionDisplay() {
    const q = examState.questions[examState.currentIndex];
    const area = document.getElementById('exam-question-area');
    const qId = q.id || q.question_number || `q-${examState.currentIndex}`;
    const selected = examState.responses[qId];
    const isLastQuestion = examState.currentIndex === examState.questions.length - 1;

    const questionText = q.q || q.series || "Question content missing";
    const options = q.options || (q.option ? [q.option] : []);
    const tag = q.tag || "General Ability";

    area.innerHTML = `
        <div class="q-tag">${tag}</div>
        <p class="q-text">Question ${examState.currentIndex + 1}:<br>${questionText}</p>
        <div class="options-grid">
            ${options.map((opt, i) => {
                const val = String.fromCharCode(65 + i);
                return `
                    <div class="mock-option ${selected === val ? 'selected' : ''}" 
                         onclick="selectOption('${qId}', '${val}')">
                        ${val}) ${opt}
                    </div>`;
            }).join('')}
        </div>
        <div class="exam-footer">
            <button class="btn" onclick="prevQuestion()" ${examState.currentIndex === 0 ? 'disabled' : ''}>Previous</button>
            <button class="btn" style="border-color: #8b5cf6; color: #8b5cf6;" onclick="toggleMark()">Mark for Review</button>
            ${isLastQuestion ? 
                `<button class="btn btn-primary" style="background-color: var(--success);" onclick="showFinishModal()">Finish Test ➔</button>` : 
                `<button class="btn btn-primary" onclick="nextQuestion()">Save & Next</button>`
            }
        </div>
    `;
    updatePalette();
}

function showFinishModal() {
    const modal = document.getElementById('finish-modal');
    if (modal) modal.style.display = 'flex';
}

function hideFinishModal() {
    const modal = document.getElementById('finish-modal');
    if (modal) modal.style.display = 'none';
}

function selectSequentialOption(qId, val) {
    examState.responses[String(qId)] = val;
    const optionsGrid = document.getElementById(`options-${qId}`);
    if (optionsGrid) {
        optionsGrid.querySelectorAll('.mock-option').forEach(el => el.classList.remove('selected'));
        const selectedEl = document.getElementById(`opt-${qId}-${val}`);
        if (selectedEl) selectedEl.classList.add('selected');
    }
}

function togglePracticeSolution(qId) {
    const solDiv = document.getElementById(`sol-${qId}`);
    if (solDiv) solDiv.classList.toggle('show');
}

function selectOption(qId, val) {
    // Ensure qId is treated as a string for consistent mapping
    examState.responses[String(qId)] = val;
    updateQuestionDisplay();
}

function toggleMark() {
    const qId = examState.questions[examState.currentIndex].id;
    if (examState.marked.has(qId)) examState.marked.delete(qId);
    else examState.marked.add(qId);
    updatePalette();
}

function nextQuestion() {
    if (examState.currentIndex < examState.questions.length - 1) {
        // Mark current as visited before moving
        examState.visited.add(examState.currentIndex);
        examState.currentIndex++;
        examState.visited.add(examState.currentIndex);
        updateQuestionDisplay();
        document.querySelector('.exam-side-panel')?.classList.remove('show-mobile-palette');
    }
}

function prevQuestion() {
    if (examState.currentIndex > 0) {
        examState.currentIndex--;
        updateQuestionDisplay();
        document.querySelector('.exam-side-panel')?.classList.remove('show-mobile-palette');
    }
}

function updatePalette() {
    const grid = document.getElementById('palette-grid');
    if (!grid) return;
    
    const existingButtons = grid.querySelectorAll('.palette-btn');
    
    // Efficient Update: If buttons already exist, just update their classes
    if (existingButtons.length === examState.questions.length) {
        examState.questions.forEach((q, i) => {
            const qId = q.id || q.question_number || `q-${i}`;
            let status = 'not-visited';
            if (examState.marked.has(qId)) status = 'marked';
            else if (examState.responses[String(qId)]) status = 'answered';
            else if (examState.visited.has(i)) status = 'not-answered';
            
            const btn = existingButtons[i];
            btn.className = `palette-btn ${status} ${examState.currentIndex === i ? 'active' : ''}`;
        });
    } else {
        // Full Render (only happens once per test start)
        grid.innerHTML = examState.questions.map((q, i) => {
            const qId = q.id || q.question_number || `q-${i}`;
            let status = 'not-visited';
            if (examState.marked.has(qId)) status = 'marked';
            else if (examState.responses[String(qId)]) status = 'answered';
            else if (examState.visited.has(i)) status = 'not-answered';
            
            return `<div class="palette-btn ${status} ${examState.currentIndex === i ? 'active' : ''}" 
                         onclick="jumpToQuestion(${i})">${i + 1}</div>`;
        }).join('');
    }
}

function jumpToQuestion(i) {
    if (examState.currentIndex === i) return; // Prevent unnecessary re-renders
    examState.currentIndex = i;
    examState.visited.add(i);
    updateQuestionDisplay();
    
    const area = document.getElementById('exam-question-area');
    if (area) area.scrollTop = 0; 
    document.querySelector('.exam-side-panel')?.classList.remove('show-mobile-palette');
}

function startExamTimer() {
    examState.timerId = setInterval(() => {
        examState.timeLeft--;
        const mins = Math.floor(examState.timeLeft / 60);
        const secs = examState.timeLeft % 60;
        const display = document.getElementById('exam-timer-display');
        if (display) display.innerText = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

        if (examState.timeLeft === Infinity) { // For practice mode
            if (display) display.innerText = "No Time Limit";
            return;
        }
        if (examState.timeLeft <= 0) {
            clearInterval(examState.timerId);
            finishMockTest(true);
        }
    }, 1000);
}

async function finishMockTest(autoSubmit) {
    hideFinishModal();
    clearInterval(examState.timerId);
    const mockNum = history.state?.mockNum || 1;
    const topicName = history.state?.topicName || 'All Topics';
    const testTitle = mockNum === 4 ? `Practise: ${topicName || 'Selected Topic'}` : `Mock Test ${mockNum}`;
    
    let correct = 0;
    let total = examState.questions.length;
    let answered = 0;
    let currentTestMistakes = {}; // Track mistakes for THIS test only
    let cumulativeMistakes = {};
    try {
        cumulativeMistakes = JSON.parse(localStorage.getItem('cumulativeMistakes') || '{}');
    } catch (e) { cumulativeMistakes = {}; }
    
    examState.questions.forEach((q, idx) => {
        const qId = q.id || q.question_number || `q-${idx}`;
        const selected = examState.responses[String(qId)];
        const tag = q.tag || 'General Ability';

        if(selected) {
            answered++;
            if(selected === q.ans) {
                correct++;
            } else {
                cumulativeMistakes[tag] = (cumulativeMistakes[tag] || 0) + 1;
                currentTestMistakes[tag] = (currentTestMistakes[tag] || 0) + 1;
            }
        } else {
            cumulativeMistakes[tag] = (cumulativeMistakes[tag] || 0) + 1;
            currentTestMistakes[tag] = (currentTestMistakes[tag] || 0) + 1;
        }
    });

    localStorage.setItem('cumulativeMistakes', JSON.stringify(cumulativeMistakes));
    let percent = Math.round((correct/total)*100);
    let notAnswered = total - answered;

    // Find focus area (tag with most mistakes in THIS attempt)
    let focusArea = "None";
    let maxWrong = 0;
    for (let tag in currentTestMistakes) {
        if (currentTestMistakes[tag] > maxWrong) {
            maxWrong = currentTestMistakes[tag];
            focusArea = `${tag} (${maxWrong} mistakes)`;
        }
    }

    // Display result in the same window (Exam UI)
    const area = document.getElementById('exam-question-area');
    const timerDisplay = document.getElementById('exam-timer-display');
    if (timerDisplay) timerDisplay.innerText = "Exam Completed";

    if (area) {
        area.innerHTML = `
            <div class="question-card" style="background:#f0fdf4; border:none; box-shadow:none;">
                <h2 style="color:#16a34a; margin-bottom: 1.5rem;">${testTitle} Result Analysis</h2>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-bottom: 2rem;">
                    <div class="question-card" style="margin:0; text-align:center; padding: 1.5rem; background: white;">
                        <p style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Final Score</p>
                        <h1 style="font-size:3rem; color:var(--primary); border:none; margin:0;">${correct}/${total}</h1>
                    </div>
                    <div class="question-card" style="margin:0; text-align:center; padding: 1.5rem; background: white;">
                        <p style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-weight:700;">Accuracy</p>
                        <h1 style="font-size:3rem; color:var(--success); border:none; margin:0;">${percent}%</h1>
                    </div>
                </div>
                <p style="margin-bottom: 1.5rem; font-size: 1.1rem;"><b>Focus Area:</b> <span class="q-tag">${focusArea}</span></p>
                ${autoSubmit ? `<p style="color:#e11d48; margin-bottom: 1.5rem;"><strong>Note:</strong> Test was auto-submitted due to time limit.</p>` : ""}
                
                <div class="exam-footer" style="border:none; padding:0; margin-top:2rem; display: flex; gap: 1rem; flex-wrap: wrap;">
                    <button class="btn btn-primary btn-lg" style="flex: 1; min-width: 200px; justify-content: center; background-color: var(--success);" onclick="reviewMockTest()">Review Paper 📄</button>
                    <button class="btn btn-primary btn-lg" style="flex: 1; min-width: 200px; justify-content: center;" onclick="chooseMockTest()">Back to Mock Section ➔</button>
                </div>
            </div>
        `;

        // Update sidebar palette area to show a summary
        const paletteGrid = document.getElementById('palette-grid');
        if (paletteGrid) {
            const sidePanel = paletteGrid.closest('.exam-side-panel');
            sidePanel.innerHTML = `
                <div class="nav-group-title">Status Summary</div>
                <div style="padding: 1rem; display: flex; flex-direction: column; gap: 1rem;">
                    <div class="legend-item" style="font-weight:600;"><div class="legend-box answered" style="width:20px; height:20px;"></div> Answered: <span style="margin-left:auto; color:var(--success);">${answered}</span></div>
                    <div class="legend-item" style="font-weight:600;"><div class="legend-box not-answered" style="width:20px; height:20px;"></div> Not Answered: <span style="margin-left:auto; color:#ef4444;">${total - answered}</span></div>
                    <div class="legend-item" style="font-weight:600;"><div class="legend-box marked" style="width:20px; height:20px;"></div> For Review: <span style="margin-left:auto; color:#8b5cf6;">${examState.marked.size}</span></div>
                </div>
            `;
        }
    }

    // Professional Tracking: Save the result to Firestore
    if (window.savePerformanceResult) {
        await window.savePerformanceResult({
            testType: mockNum === 4 ? `Topic Practice (${topicName || 'Unknown'})` : "Mock Test",
            testId: mockNum,
            score: correct,
            total: total,
            percentage: percent,
            focusArea: focusArea
        });
    }
}

function reviewMockTest() {
    const area = document.getElementById('exam-question-area');
    if (!area) return;
    
    // Scroll back to the top of the question area
    area.scrollTo({ top: 0, behavior: 'smooth' });

    area.innerHTML = `
        <div class="question-card" style="background:white; border:none; box-shadow:none; text-align:left; animation: fadeIn 0.4s ease-out;">
            <h2 style="color:var(--primary); margin-bottom: 2rem; border-bottom: 2px solid var(--primary-light); padding-bottom: 1rem;">Detailed Paper Review</h2>
            <div id="review-list"></div>
            <div class="exam-footer" style="border:none; padding:0; margin-top:2rem;">
                <button class="btn btn-primary btn-lg" style="width: 100%; justify-content: center;" onclick="chooseMockTest()">Back to Mock Section ➔</button>
            </div>
        </div>
    `;

    const list = document.getElementById('review-list');
    examState.questions.forEach((q, idx) => {
        const userAns = examState.responses[q.id];
        const isCorrect = userAns === q.ans;
        const categoryKey = findCategoryByTopic(q.tag);
        
        const qDiv = document.createElement('div');
        qDiv.style = "margin-bottom: 4rem; padding-bottom: 2rem; border-bottom: 1px solid var(--border);";
        
        const reviseBtnHtml = categoryKey ? `<button class="btn" style="font-size: 0.7rem; padding: 4px 8px; margin-left: 10px; border-color: var(--primary); color: var(--primary);" onclick="ensureDashboardShell(); renderTheory('${categoryKey}', '${q.tag}')">Revise Topic 📚</button>` : '';
        
        let optionsHtml = q.options.map((opt, i) => {
            const letter = String.fromCharCode(65 + i);
            let statusClass = '';
            if (letter === q.ans) statusClass = 'correct';
            else if (letter === userAns && !isCorrect) statusClass = 'wrong';
            
            return `
                <div class="option-label ${statusClass}" style="cursor:default; margin-bottom: 0.6rem; pointer-events:none;">
                    <span style="font-weight:700;">${letter})</span> <span style="margin-left:10px;">${opt}</span>
                    ${letter === q.ans ? '<span style="margin-left:auto; font-size:0.7rem; font-weight:800; color:var(--success); border: 1.5px solid var(--success); padding: 2px 6px; border-radius:4px;">CORRECT ANSWER</span>' : ''}
                    ${(letter === userAns && !isCorrect) ? '<span style="margin-left:auto; font-size:0.7rem; font-weight:800; color:#ef4444; border: 1.5px solid #ef4444; padding: 2px 6px; border-radius:4px;">YOUR SELECTION</span>' : ''}
                </div>`;
        }).join('');

        qDiv.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:1.25rem;">
                <span class="q-tag" style="margin:0;">${q.tag}</span>
                ${reviseBtnHtml}
                <span style="font-size:0.85rem; font-weight:800; color: ${isCorrect ? 'var(--success)' : userAns ? '#ef4444' : 'var(--text-muted)'}; margin-left:auto;">
                    ${isCorrect ? '✓ CORRECT' : userAns ? '✗ INCORRECT' : '○ UNANSWERED'}
                </span>
            </div>
            <p class="q-text" style="font-size:1.2rem; line-height:1.45; margin-bottom:1.5rem; padding-right:0; color:var(--text-dark);">Q${idx + 1}. ${q.q}</p>
            <div class="options-grid">
                ${optionsHtml}
            </div>
            <div class="explanation" style="background:var(--bg); padding:1.5rem; border-radius:12px; color:var(--text-dark); border-left: 5px solid var(--primary); margin-top:1.5rem;">
                <strong style="color:var(--primary); display:block; margin-bottom:0.5rem; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.05em;">Solution Explanation:</strong>
                ${q.explain}
            </div>
        `;
        list.appendChild(qDiv);
    });
}

// Utility: Shuffle array (Fisher-Yates)
function shuffleArray(array, seed) {
    let arr = array.slice();
    let random = mulberry32(seed);
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
// Deterministic PRNG for repeatable shuffles
function mulberry32(a) {
    return function() {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

// --- BROWSER NAVIGATION LOGIC ---
window.addEventListener('popstate', (event) => {
    const state = event.state;
    
    if (examState.timerId) {
        clearInterval(examState.timerId);
        examState.timerId = null;
    }

    if (!state || state.view === 'home') {
        renderHome(false);
    } else if (state.view === 'theory') {
        renderTheory(state.category, state.subcat, false);
    } else if (state.view === 'practice') {
        currentTheory.category = state.category;
        startPractice(state.tag, false);
    } else if (state.view === 'stats') {
        showStatistics(false);
    } else if (state.view === 'profile') {
        showProfileDetails(false);
    } else if (state.view === 'mockInstr') {
        showMockInstructions(state.mockNum, null, false);
    } else if (state.view === 'mockSelect') {
        chooseMockTest(false);
    } else if (state.view === 'mockActive') {
        startMockTest(state.mockNum, false, state.seed, state.topicName);
    }
})