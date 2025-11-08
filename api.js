class VSBrowserAPI {
    constructor() {
        this.sitesBaseUrl = './sites/';
        this.verifiedFile = './verified.txt';
        this.currentDomain = '';
    }
    
    async loadWebsite(url) {
        try {
            console.log('Loading URL:', url);
            
            this.currentDomain = this.extractDomain(url);
            let sitePath = this.resolveUrlPath(url);
            const fullPath = this.sitesBaseUrl + sitePath;
            
            console.log('Resolved path:', fullPath);
            
            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`Сайт не найден: ${url}`);
            }
            
            let content = await response.text();
            content = this.processHtmlContent(content, url);
            
            return content;
        } catch (error) {
            console.error('Error loading website:', error);
            throw error;
        }
    }
    
    extractDomain(url) {
        if (url.includes('/')) {
            return url.split('/')[0];
        }
        return url;
    }
    
    resolveUrlPath(url) {
        // Обработка поддоменов типа my.site.vs (через .downdomain)
        if (this.isSubdomain(url)) {
            const parts = url.split('.');
            const subdomain = parts[0];
            const mainDomain = parts[1];
            return `${mainDomain}/${subdomain}.downdomain/start.html`;
        }
        
        // Обработка путей типа site.vs/updomain (через .updomain)
        if (url.includes('/')) {
            const [domain, ...pathParts] = url.split('/');
            const siteName = domain.replace('.vs', '');
            const path = pathParts.join('/');
            
            // Проверяем, является ли первый элемент пути .updomain папкой
            const firstPath = pathParts[0];
            if (firstPath && this.isUpdomainPath(siteName, firstPath)) {
                return `${siteName}/${firstPath}.updomain/start.html`;
            }
            
            // Обычные пути (site.vs/example.html или site.vs/folder/)
            if (path.includes('.') && !path.endsWith('/')) {
                // Путь к файлу
                return `${siteName}/${path}`;
            } else {
                // Путь к папке
                const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
                return `${siteName}/${cleanPath}/start.html`;
            }
        }
        
        // Простой домен типа site.vs
        const siteName = url.replace('.vs', '');
        return `${siteName}/start.html`;
    }
    
    isSubdomain(url) {
        const parts = url.split('.');
        return parts.length > 2 && parts[parts.length - 1] === 'vs';
    }
    
    isUpdomainPath(siteName, path) {
        // Для демо просто проверяем по известным путям
        const updomainPaths = ['imagining', 'blog', 'shop', 'none']; // примеры
        return updomainPaths.includes(path);
    }
    
    processHtmlContent(content, baseUrl) {
        const basePath = this.getBasePath(baseUrl);
        const baseTag = `<base href="${basePath}">`;
        
        if (content.includes('</head>')) {
            content = content.replace('</head>', `${baseTag}</head>`);
        } else if (content.includes('<head>')) {
            content = content.replace('<head>', `<head>${baseTag}`);
        } else {
            content = `<head>${baseTag}</head>` + content;
        }
        
        content = content.replace(/href="([^"]*)"/gi, (match, href) => {
            return this.processHref(href, baseUrl, match);
        });
        
        content = content.replace(/action="([^"]*)"/gi, (match, action) => {
            return this.processAction(action, baseUrl, match);
        });
        
        content = this.injectNavigationScripts(content, baseUrl);
        
        return content;
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
        
        if (baseParts.length > 1) {
            const lastPart = baseParts[baseParts.length - 1];
            
            // Если последний сегмент содержит точку, и это не домен, значит, это имя файла.
            // Нужно удалить его, чтобы получить путь к папке.
            // Например: site.vs/folder/file.html -> pop file.html
            // Например: site.vs/folder -> не pop, потому что 'folder' - это папка.
            if (lastPart.includes('.') && lastPart !== baseParts[0]) {
                baseParts.pop(); 
            }
        }
        
        for (const part of relativeParts) {
            if (part === '..') {
                // Запрещаем переход выше домена
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
        
        // Для .updomain путей нужно определить базовый путь
        if (url.includes('/')) {
            const pathParts = url.split('/');
            const firstPath = pathParts[1];
            if (this.isUpdomainPath(siteName, firstPath)) {
                return `./sites/${siteName}/${firstPath}.updomain/`;
            }
        }
        
        return `./sites/${siteName}/`;
    }
    
    injectNavigationScripts(content, baseUrl) {
        const scripts = `
            <script>
                function VSNavigate(url) {
                    if (url.startsWith('http')) {
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
