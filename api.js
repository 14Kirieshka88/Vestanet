class VSBrowserAPI {
    constructor() {
        this.sitesBaseUrl = './sites/';
        this.verifiedFile = './verified.txt';
        this.currentDomain = '';
    }
    
    // НОВАЯ ВСПОМОГАТЕЛЬНАЯ ФУНКЦИЯ
    getHostBaseUrl() {
        // window.location.origin: https://14kirieshka88.github.io
        // window.location.pathname: /Vestanet/browser.html
        
        // Получаем путь до директории, где лежит browser.html
        let path = window.location.pathname;
        let baseDir = path.substring(0, path.lastIndexOf('/') + 1);
        
        // Возвращаем полный базовый URL (например, https://14kirieshka88.github.io/Vestanet/)
        return window.location.origin + baseDir;
    }

    isHtmlResource(path) {
        return path.endsWith('.html') || path.endsWith('/start.html');
    }

    isResourceLink(url) {
        const resourceExtensions = [
            '.css', '.js', '.png', '.jpg', '.jpeg', '.gif', 
            '.svg', '.webp', '.mp3', '.mp4', '.txt', '.json',
            '.pdf', '.ico'
        ];
        const lowerUrl = url.toLowerCase();
        
        for (const ext of resourceExtensions) {
            if (lowerUrl.includes(ext)) {
                return true;
            }
        }
        
        if (lowerUrl.includes('.') && !lowerUrl.endsWith('.html') && !lowerUrl.startsWith('/') && !lowerUrl.includes('?')) {
             return true;
        }

        return false;
    }

    // ИСПРАВЛЕНО: Теперь возвращает полный публичный URL
    getAbsoluteHostPath(baseUrl, link) {
        // 1. Решаем относительный URL (как будто мы находимся в start.html)
        const resolvedUrl = this.resolveRelativeUrl(baseUrl, link);
        
        const urlParts = resolvedUrl.split('/');
        const domain = urlParts[0]; 
        const path = urlParts.slice(1).join('/'); 

        let sitePath;
        
        // 2. Преобразуем в локальный путь относительно папки ./sites/
        if (this.isSubdomain(domain)) {
            const domainParts = domain.split('.');
            const subdomain = domainParts[0];
            const mainDomain = domainParts[1];
            sitePath = `${mainDomain}/${subdomain}.downdomain/${path}`;
        } else {
            const siteName = domain.replace('.vs', '');
            
            const firstPath = urlParts[1];
            if (this.isUpdomainPath(siteName, firstPath)) {
                const partsAfterDomain = path.split('/');
                const updomainFolder = partsAfterDomain[0]; 
                const resourcePath = partsAfterDomain.slice(1).join('/'); 
                sitePath = `${siteName}/${updomainFolder}.updomain/${resourcePath}`;
            } else {
                sitePath = `${siteName}/${path}`;
            }
        }
        
        // 3. Собираем полный публичный URL!
        // Получаем базовый URL хоста (например, https://14kirieshka88.github.io/Vestanet/)
        const hostBaseUrl = this.getHostBaseUrl();
        
        // Собираем: hostBaseUrl + sites/ + sitePath
        // Мы используем sitesBaseUrl (который равен './sites/') и убираем './'
        const cleanSitesBase = this.sitesBaseUrl.replace('./', '');
        
        return hostBaseUrl + cleanSitesBase + sitePath;
    }
    
    async loadWebsite(url) {
        try {
            console.log('Loading URL:', url);
            
            const lowercasedUrl = url.toLowerCase();
            
            this.currentDomain = this.extractDomain(lowercasedUrl);
            let sitePath = this.resolveUrlPath(lowercasedUrl);
            const fullPath = this.sitesBaseUrl + sitePath;
            
            console.log('Resolved path:', fullPath);
            
            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`Сайт не найден: ${url}`);
            }
            
            let content = await response.text();

            if (this.isHtmlResource(sitePath)) {
                content = this.processHtmlContent(content, lowercasedUrl);
            }
            
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
        const urlParts = url.split('/');
        const domain = urlParts[0]; 
        const path = urlParts.slice(1).join('/'); 

        if (this.isSubdomain(domain)) {
            const domainParts = domain.split('.');
            const subdomain = domainParts[0];
            const mainDomain = domainParts[1];
            
            if (path) {
                return `${mainDomain}/${subdomain}.downdomain/${path}`;
            } else {
                return `${mainDomain}/${subdomain}.downdomain/start.html`;
            }
        }
        
        const siteName = domain.replace('.vs', '');

        if (path) {
            const firstPath = urlParts[1];
            if (this.isUpdomainPath(siteName, firstPath)) {
                return `${siteName}/${firstPath}.updomain/start.html`;
            }
            
            if (path.includes('.') && !path.endsWith('/')) {
                return `${siteName}/${path}`;
            } else {
                const cleanPath = path.endsWith('/') ? path.slice(0, -1) : path;
                return `${siteName}/${cleanPath}/start.html`;
            }
        }
        
        return `${siteName}/start.html`;
    }
    
    isSubdomain(url) {
        const parts = url.split('.');
        return parts.length > 2 && parts[parts.length - 1] === 'vs';
    }
    
    isUpdomainPath(siteName, path) {
        const updomainPaths = ['imagining', 'blog', 'shop', 'none']; 
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
        
        // Обработка SRC-атрибутов (Img, Script, etc.)
        content = content.replace(/src="([^"]*)"/gi, (match, src) => {
            return this.processSrc(src, baseUrl, match);
        });
        
        // Обработка HREF-атрибутов
        content = content.replace(/href="([^"]*)"/gi, (match, href) => {
            return this.processHref(href, baseUrl, match);
        });
        
        content = content.replace(/action="([^"]*)"/gi, (match, action) => {
            return this.processAction(action, baseUrl, match);
        });
        
        content = this.injectNavigationScripts(content, baseUrl);
        
        return content;
    }
    
    processSrc(src, baseUrl, originalMatch) {
        if (src.startsWith('http') || src.startsWith('data:') || src.startsWith('#')) {
            return originalMatch;
        }
        
        // Заменяем относительный путь на ПОЛНЫЙ АБСОЛЮТНЫЙ URL
        const absoluteHostPath = this.getAbsoluteHostPath(baseUrl, src);
        return `src="${absoluteHostPath}"`;
    }

    processHref(href, baseUrl, originalMatch) {
        if (href.startsWith('http') || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
            return originalMatch;
        }
        
        // Если это ссылка на ресурс (CSS/Favicon), заменяем на ПОЛНЫЙ АБСОЛЮТНЫЙ URL
        if (this.isResourceLink(href)) {
            const absoluteHostPath = this.getAbsoluteHostPath(baseUrl, href);
            return originalMatch.replace(href, absoluteHostPath);
        }
        
        // Если это навигация (a href="page.html"), перехватываем
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
            
            if (lastPart.includes('.') && lastPart !== baseParts[0]) {
                baseParts.pop(); 
            }
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
