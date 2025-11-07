class VSBrowserAPI {
    constructor() {
        this.sitesBaseUrl = './sites/';
        this.verifiedFile = './verified.txt';
        this.currentDomain = '';
    }
    
    async loadWebsite(url) {
        try {
            console.log('Loading URL:', url);
            
            // Обработка поисковых запросов
            if (url.startsWith('searchit.vs/search/')) {
                return await this.handleSearchRequest(url);
            }
            
            let mainUrl = url;
            let hash = '';
            if (url.includes('#')) {
                [mainUrl, hash] = url.split('#');
            }
            
            this.currentDomain = this.extractDomain(mainUrl);
            let sitePath = this.resolveUrlPath(mainUrl);
            const fullPath = this.sitesBaseUrl + sitePath;
            
            console.log('Resolved path:', fullPath);
            
            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`Сайт не найден: ${url}`);
            }
            
            let content = await response.text();
            content = this.processHtmlContent(content, mainUrl, hash);
            
            return content;
        } catch (error) {
            console.error('Error loading website:', error);
            throw error;
        }
    }
    
    async handleSearchRequest(url) {
        const searchQuery = decodeURIComponent(url.replace('searchit.vs/search/', ''));
        const allSites = await this.getAllSites();
        const verifiedSites = await this.getVerifiedSites();
        
        // Ищем совпадения по английским названиям
        const results = allSites.filter(site => {
            const siteName = site.replace('.vs', '');
            return this.transliterate(siteName).includes(this.transliterate(searchQuery)) ||
                   siteName.toLowerCase().includes(searchQuery.toLowerCase());
        });
        
        return this.generateSearchResults(searchQuery, results, verifiedSites);
    }
    
    transliterate(text) {
        const rus = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя";
        const eng = "abvgdeejziyklmnoprstufhzcss_y_euya";
        
        return text.toLowerCase().split('').map(char => {
            const index = rus.indexOf(char);
            return index >= 0 ? eng[index] : char;
        }).join('');
    }
    
    async getAllSites() {
        // В реальной реализации здесь был бы сканирование папки sites
        // Пока используем статический список + verified
        const staticSites = ['mail.vs', 'youtube.vs', 'google.vs', 'welcome.vs', 'searchit.vs'];
        const verified = await this.getVerifiedSites();
        return [...new Set([...staticSites, ...verified])];
    }
    
    generateSearchResults(query, results, verifiedSites) {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Поиск: ${query} - SearchIt.vs</title>
    <style>
        body { font-family: Arial; margin: 20px; background: #f5f5f5; }
        .search-header { background: #4285f4; color: white; padding: 20px; border-radius: 10px; margin-bottom: 20px; }
        .search-box { display: flex; gap: 10px; margin: 20px 0; }
        input { flex: 1; padding: 10px; border: 1px solid #ddd; border-radius: 5px; }
        button { background: #4285f4; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; }
        .result { background: white; padding: 15px; margin: 10px 0; border-radius: 5px; border-left: 4px solid #4285f4; }
        .verified-badge { background: #27ae60; color: white; padding: 2px 8px; border-radius: 10px; font-size: 12px; margin-left: 10px; }
        .no-results { text-align: center; padding: 40px; color: #666; }
    </style>
</head>
<body>
    <div class="search-header">
        <h1>🔍 SearchIt.vs</h1>
        <form onsubmit="handleSearch(event)">
            <div class="search-box">
                <input type="text" id="searchInput" value="${query}" placeholder="Введите запрос...">
                <button type="submit">Поиск</button>
            </div>
        </form>
    </div>
    
    ${results.length > 0 ? `
        <h3>Найдено сайтов: ${results.length}</h3>
        ${results.map(site => {
            const isVerified = verifiedSites.includes(site);
            return `
            <div class="result">
                <h3><a href="javascript:void(0)" onclick="VSNavigate('${site}')">${site}</a>
                ${isVerified ? '<span class="verified-badge">✓ Проверен</span>' : ''}</h3>
                <p>Автоматически созданный сайт ${site}</p>
            </div>`;
        }).join('')}
    ` : `
        <div class="no-results">
            <h3>По запросу "${query}" ничего не найдено</h3>
            <p>Попробуйте изменить запрос или посмотрите <a href="javascript:void(0)" onclick="VSNavigate('welcome.vs')">список доступных сайтов</a></p>
        </div>
    `}
    
    <script>
        function handleSearch(event) {
            event.preventDefault();
            const query = document.getElementById('searchInput').value;
            if (query.trim()) {
                VSNavigate('searchit.vs/search/' + encodeURIComponent(query));
            }
        }
        
        function VSNavigate(url) {
            if (window.parent && window.parent.navigateTo) {
                window.parent.navigateTo(url);
            }
        }
    </script>
</body>
</html>`;
    }
    
    // Остальные методы остаются без изменений
    processHtmlContent(content, baseUrl, hash) {
        const basePath = this.getBasePath(baseUrl);
        const baseTag = `<base href="${basePath}">`;
        
        if (content.includes('</head>')) {
            content = content.replace('</head>', `${baseTag}</head>`);
        } else if (content.includes('<head>')) {
            content = content.replace('<head>', `<head>${baseTag}`);
        } else {
            content = `<head>${baseTag}</head>` + content;
        }
        
        content = content.replace(/href="#([^"]*)"/gi, (match, anchor) => {
            return `href="javascript:void(0)" onclick="VSHandleAnchor('${anchor}')"`;
        });
        
        content = content.replace(/href="([^"]*)"/gi, (match, href) => {
            return this.processHref(href, baseUrl, match);
        });
        
        content = content.replace(/action="([^"]*)"/gi, (match, action) => {
            return this.processAction(action, baseUrl, match);
        });
        
        content = this.injectNavigationScripts(content, baseUrl, hash);
        
        return content;
    }
    
    injectNavigationScripts(content, baseUrl, hash) {
        const scripts = `
            <script>
                function VSNavigate(url) {
                    if (url.startsWith('http') && !url.includes('.vs')) {
                        window.open(url, '_blank');
                    } else {
                        window.parent.navigateTo(url);
                    }
                }
                
                function VSHandleForm(form, actionUrl) {
                    console.log('Form submitted to:', actionUrl, form);
                    VSNavigate(actionUrl);
                    return false;
                }
                
                function VSHandleAnchor(anchor) {
                    const element = document.getElementById(anchor);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                    }
                }
                
                window.addEventListener('load', function() {
                    ${hash ? `
                    const anchorElement = document.getElementById('${hash}');
                    if (anchorElement) {
                        anchorElement.scrollIntoView({ behavior: 'smooth' });
                    }
                    ` : ''}
                });
                
                const originalLocation = window.location;
                Object.defineProperty(window, 'location', {
                    get: function() {
                        return {
                            href: '${baseUrl}',
                            assign: function(url) { VSNavigate(url); },
                            replace: function(url) { VSNavigate(url); },
                            reload: function() { window.parent.navigateTo('${baseUrl}'); }
                        };
                    },
                    set: function(url) { VSNavigate(url); }
                });
            </script>
        `;
        
        if (content.includes('</body>')) {
            content = content.replace('</body>', `${scripts}</body>`);
        } else {
            content += scripts;
        }
        
        return content;
    }
    
    extractDomain(url) {
        if (url.includes('/')) {
            return url.split('/')[0];
        }
        return url;
    }
    
    resolveUrlPath(url) {
        if (this.isSubdomain(url)) {
            const parts = url.split('.');
            const subdomain = parts[0];
            const mainDomain = parts[1];
            return `${mainDomain}/${subdomain}.downdomain/start.html`;
        }
        
        if (url.includes('/')) {
            const [domain, ...pathParts] = url.split('/');
            const siteName = domain.replace('.vs', '');
            const path = pathParts.join('/');
            
            if (this.isUpdomainInDowndomain(siteName, pathParts[0])) {
                return `${siteName}/${pathParts[0]}.downdomain/${pathParts.slice(1).join('/')}/start.html`;
            }
            
            if (path.includes('.') && !path.endsWith('/')) {
                return `${siteName}/${path}`;
            } else {
                const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
                return `${siteName}/${cleanPath}/start.html`;
            }
        }
        
        const siteName = url.replace('.vs', '');
        return `${siteName}/start.html`;
    }
    
    isSubdomain(url) {
        const parts = url.split('.');
        return parts.length > 2 && parts[parts.length - 1] === 'vs';
    }
    
    isUpdomainInDowndomain(siteName, path) {
        const possibleDowndomains = ['imagining', 'blog', 'admin'];
        return possibleDowndomains.includes(path);
    }
    
    processHref(href, baseUrl, originalMatch) {
        if (href.startsWith('http') || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
            return originalMatch;
        }
        
        if (href.startsWith('/')) {
            const domain = baseUrl.split('/')[0];
            const newUrl = domain + href;
            return `href="javascript:void(0)" onclick="VSNavigate('${newUrl}')"`;
        } else {
            const newUrl = this.resolveRelativeUrl(baseUrl, href);
            return `href="javascript:void(0)" onclick="VSNavigate('${newUrl}')"`;
        }
    }
    
    processAction(action, baseUrl, originalMatch) {
        if (action.startsWith('http') || !action) {
            return originalMatch;
        }
        
        if (action.startsWith('/')) {
            const domain = baseUrl.split('/')[0];
            const newUrl = domain + action;
            return `action="javascript:void(0)" onsubmit="return VSHandleForm(this, '${newUrl}')"`;
        } else {
            const newUrl = this.resolveRelativeUrl(baseUrl, action);
            return `action="javascript:void(0)" onsubmit="return VSHandleForm(this, '${newUrl}')"`;
        }
    }
    
    resolveRelativeUrl(baseUrl, relativeUrl) {
        const baseParts = baseUrl.split('/').filter(part => part);
        const relativeParts = relativeUrl.split('/').filter(part => part);
        
        if (baseParts.length > 1 && !baseUrl.endsWith('/')) {
            baseParts.pop();
        }
        
        for (const part of relativeParts) {
            if (part === '..') {
                if (baseParts.length > 1) baseParts.pop();
            } else if (part !== '.') {
                baseParts.push(part);
            }
        }
        
        return baseParts.join('/');
    }
    
    getBasePath(url) {
        const domain = url.split('/')[0];
        const siteName = domain.replace('.vs', '');
        return `./sites/${siteName}/`;
    }
    
    async getVerifiedSites() {
        try {
            const response = await fetch(this.verifiedFile);
            if (!response.ok) return [];
            
            const text = await response.text();
            return text.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#'));
        } catch (error) {
            console.error('Error loading verified sites:', error);
            return [];
        }
    }
}

const vsBrowser = new VSBrowserAPI();
async function loadWebsite(url) {
    return await vsBrowser.loadWebsite(url);
}
