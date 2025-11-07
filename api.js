class VSBrowserAPI {
    constructor() {
        this.sitesBaseUrl = './sites/';
        this.verifiedFile = './verified.txt';
        this.currentDomain = '';
    }
    
    async loadWebsite(url) {
        try {
            console.log('Loading URL:', url);
            
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

    // Сканируем папку sites на наличие сайтов
    async getAllSites() {
        const sites = [];
        const verifiedSites = await this.getVerifiedSites();
        
        // Пробуем найти все папки в sites
        const possibleFolders = await this.scanSitesFolder();
        
        for (const folder of possibleFolders) {
            const siteName = `${folder}.vs`;
            sites.push({
                name: siteName,
                verified: verifiedSites.includes(siteName)
            });
        }
        
        return sites;
    }

    // Сканируем папку sites
    async scanSitesFolder() {
        const folders = [];
        
        // Пробуем проверить существование основных папок
        const testFolders = ['mail', 'goverment', 'welcome', 'searchit', 'admin'];
        
        for (const folder of testFolders) {
            try {
                const response = await fetch(`${this.sitesBaseUrl}${folder}/start.html`);
                if (response.ok) {
                    folders.push(folder);
                }
            } catch (error) {
                // Папка не существует
            }
        }
        
        return folders;
    }

    async handleSearchRequest(url) {
        const searchQuery = decodeURIComponent(url.replace('searchit.vs/search/', ''));
        const allSites = await this.getAllSites();
        
        // Ищем совпадения
        const results = allSites.filter(site => {
            const siteName = site.name.replace('.vs', '').toLowerCase();
            const query = searchQuery.toLowerCase();
            return siteName.includes(query);
        });
        
        return this.generateSearchResults(searchQuery, results);
    }
    
    generateSearchResults(query, results) {
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Результаты - SearchIt.vs</title>
    <style>
        body { margin: 20px; font-family: Arial; }
        .header { margin-bottom: 20px; }
        input { width: 500px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; }
        button { padding: 8px 16px; border: 1px solid #f8f9fa; background: #f8f9fa; cursor: pointer; }
        .result { margin: 15px 0; }
        .result a { color: #1a0dab; text-decoration: none; font-size: 18px; }
        .result a:hover { text-decoration: underline; }
        .url { color: #006621; font-size: 14px; }
        .verified { color: #27ae60; font-size: 12px; margin-left: 5px; }
    </style>
</head>
<body>
    <div class="header">
        <a href="../start.html" style="color: #1a0dab; text-decoration: none;">🔍 SearchIt.vs</a>
        <form onsubmit="handleSearch(event)" style="margin-top: 10px;">
            <input type="text" id="search" value="${query}" placeholder="Введите запрос">
            <button type="submit">Поиск</button>
        </form>
    </div>

    <div id="results">
        ${results.length > 0 ? 
            results.map(site => `
                <div class="result">
                    <a href="javascript:void(0)" onclick="goTo('${site.name}')">${site.name}</a>
                    ${site.verified ? '<span class="verified">✓</span>' : ''}
                    <div class="url">${site.name}</div>
                </div>
            `).join('') : 
            `<p>По запросу "${query}" ничего не найдено</p>`
        }
    </div>

    <script>
        function handleSearch(event) {
            event.preventDefault();
            const query = document.getElementById('search').value.trim();
            if (query) {
                if (window.parent && window.parent.navigateTo) {
                    window.parent.navigateTo('searchit.vs/search/' + encodeURIComponent(query));
                }
            }
        }

        function goTo(site) {
            if (window.parent && window.parent.navigateTo) {
                window.parent.navigateTo(site);
            }
        }
    </script>
</body>
</html>`;
    }

    // Остальные методы без изменений
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
