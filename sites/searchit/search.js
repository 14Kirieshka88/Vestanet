class SearchItEngine {
    constructor() {
        this.availableSites = [
            { name: 'mail.vs', description: 'Почтовый сервис Весталии', category: 'почта', verified: true },
            { name: 'youtube.vs', description: 'Видеохостинг платформа', category: 'видео', verified: true },
            { name: 'google.vs', description: 'Поисковая система и сервисы', category: 'поиск', verified: true },
            { name: 'welcome.vs', description: 'Добро пожаловать в интернет .vs', category: 'информация', verified: true },
            { name: 'admin.goverment.vs', description: 'Административный портал правительства', category: 'правительство', verified: true },
            { name: 'imagining.mail.vs', description: 'Блог почтового сервиса', category: 'блог', verified: true },
            { name: 'drive.google.vs', description: 'Облачное хранилище файлов', category: 'хранилище', verified: true },
            { name: 'games.vs', description: 'Игровая платформа', category: 'игры', verified: false },
            { name: 'social.vs', description: 'Социальная сеть', category: 'соцсети', verified: false },
            { name: 'news.vs', description: 'Новостной портал', category: 'новости', verified: false },
            { name: 'music.vs', description: 'Музыкальный сервис', category: 'музыка', verified: false },
            { name: 'weather.vs', description: 'Погодный сервис', category: 'погода', verified: false }
        ];
        
        this.searchCount = localStorage.getItem('searchit_search_count') || 0;
        this.init();
    }
    
    init() {
        this.updateStats();
        this.setupEventListeners();
    }
    
    updateStats() {
        const totalSites = this.availableSites.length;
        const verifiedSites = this.availableSites.filter(site => site.verified).length;
        
        document.getElementById('totalSites')?.textContent = totalSites;
        document.getElementById('verifiedSites')?.textContent = verifiedSites;
        document.getElementById('searchCount')?.textContent = this.searchCount;
    }
    
    setupEventListeners() {
        const searchForm = document.getElementById('searchForm');
        if (searchForm) {
            searchForm.addEventListener('submit', (e) => this.handleSearch(e));
        }
    }
    
    handleSearch(event) {
        event.preventDefault();
        const searchInput = document.getElementById('searchInput');
        const query = searchInput.value.trim();
        
        if (query) {
            this.searchCount++;
            localStorage.setItem('searchit_search_count', this.searchCount);
            this.updateStats();
            
            // Перенаправляем на страницу результатов
            if (typeof VSNavigate !== 'undefined') {
                VSNavigate(`searchit.vs/search/${encodeURIComponent(query)}`);
            } else if (window.parent && window.parent.navigateTo) {
                window.parent.navigateTo(`searchit.vs/search/${encodeURIComponent(query)}`);
            }
        }
    }
    
    transliterate(text) {
        const rus = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
        const eng = "abvgdeejziyklmnoprstufhzcss_y_euya";
        
        return text.toLowerCase().split('').map(char => {
            const index = rus.indexOf(char);
            return index >= 0 ? eng[index] : char;
        }).join('');
    }
    
    search(query, filters = {}) {
        const onlyVerified = filters.onlyVerified || false;
        const autoTransliterate = filters.autoTransliterate !== false;
        
        let searchQuery = query.toLowerCase();
        
        // Автоматическая транслитерация
        if (autoTransliterate) {
            searchQuery = this.transliterate(searchQuery);
        }
        
        // Специальные категории
        const categoryMap = {
            'почта': ['mail', 'email', 'письма'],
            'видео': ['youtube', 'video', 'видео', 'films'],
            'поиск': ['google', 'search', 'поиск'],
            'игры': ['games', 'game', 'игры', 'gaming'],
            'новости': ['news', 'новости'],
            'соцсети': ['social', 'соцсети', 'friends'],
            'музыка': ['music', 'музыка', 'audio'],
            'погода': ['weather', 'погода']
        };
        
        // Расширяем поиск по категориям
        let extendedQueries = [searchQuery];
        for (const [category, keywords] of Object.entries(categoryMap)) {
            if (keywords.some(keyword => searchQuery.includes(keyword))) {
                extendedQueries.push(...keywords);
            }
        }
        
        // Поиск по сайтам
        let results = this.availableSites.filter(site => {
            if (onlyVerified && !site.verified) return false;
            
            const siteName = site.name.replace('.vs', '');
            const siteSearchText = siteName + ' ' + site.description + ' ' + site.category;
            const searchText = siteSearchText.toLowerCase();
            
            return extendedQueries.some(extendedQuery => 
                searchText.includes(extendedQuery) || 
                siteName.includes(searchQuery) ||
                site.category.includes(query.toLowerCase())
            );
        });
        
        // Сортировка: сначала verified, потом по релевантности
        results.sort((a, b) => {
            if (a.verified && !b.verified) return -1;
            if (!a.verified && b.verified) return 1;
            
            const aScore = this.calculateRelevance(a, searchQuery);
            const bScore = this.calculateRelevance(b, searchQuery);
            
            return bScore - aScore;
        });
        
        return results;
    }
    
    calculateRelevance(site, query) {
        let score = 0;
        const siteName = site.name.replace('.vs', '');
        
        if (siteName.toLowerCase().includes(query)) score += 10;
        if (site.description.toLowerCase().includes(query)) score += 5;
        if (site.category.includes(query)) score += 8;
        if (site.verified) score += 3;
        
        return score;
    }
    
    displayResults(results, query) {
        const resultsContainer = document.getElementById('searchResults');
        const noResults = document.getElementById('noResults');
        const resultsTitle = document.getElementById('resultsTitle');
        
        if (!resultsContainer) return;
        
        resultsTitle.textContent = `Результаты поиска: "${query}" (${results.length})`;
        
        if (results.length === 0) {
            resultsContainer.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }
        
        noResults.style.display = 'none';
        
        resultsContainer.innerHTML = results.map(site => `
            <div class="result-item ${site.verified ? 'verified' : ''}">
                <div class="result-title">
                    <a href="javascript:void(0)" onclick="VSNavigate('${site.name}')">${site.name}</a>
                    ${site.verified ? '<span class="verified-badge">✓ Проверен</span>' : ''}
                </div>
                <div class="result-url">${site.name}</div>
                <div class="result-description">${site.description}</div>
                <div class="result-category">Категория: ${site.category}</div>
            </div>
        `).join('');
    }
}

// Глобальные функции
function quickSearch(query) {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = query;
        searchEngine.handleSearch(new Event('submit'));
    }
}

function suggestSearch(query) {
    if (typeof VSNavigate !== 'undefined') {
        VSNavigate(`searchit.vs/search/${encodeURIComponent(query)}`);
    }
}

function setFilter(filter) {
    // Обновляем активную кнопку фильтра
    document.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');
    
    // Здесь можно добавить дополнительную фильтрацию
    processSearchResults();
}

// Обработка результатов на странице поиска
function processSearchResults() {
    const pathParts = window.location.href.split('/');
    const query = decodeURIComponent(pathParts[pathParts.length - 1]);
    
    if (query && query !== 'start.html') {
        const results = searchEngine.search(query, {
            onlyVerified: document.getElementById('onlyVerified')?.checked || false,
            autoTransliterate: document.getElementById('autoTransliterate')?.checked !== false
        });
        
        searchEngine.displayResults(results, query);
    }
}

// Навигация
function VSNavigate(url) {
    if (window.parent && window.parent.navigateTo) {
        window.parent.navigateTo(url);
    }
}

// Инициализация
const searchEngine = new SearchItEngine();

// Для страницы результатов
if (document.getElementById('searchResults')) {
    processSearchResults();
}
