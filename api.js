class VSBrowserAPI {
    constructor() {
        this.sitesBaseUrl = './sites/';
        this.verifiedFile = './verified.txt';
        this.currentDomain = '';
    }
    
    async loadWebsite(url) {
        try {
            console.log('Loading URL:', url);
            
            // Отделяем якорь от основного URL
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
        
        // Обрабатываем якорные ссылки
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
                    // Прокрутка внутри iframe
                    const element = document.getElementById(anchor);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth' });
                    }
                }
                
                // Автопрокрутка к якорю при загрузке
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
    
    // Остальные методы остаются без изменений
    extractDomain(url) {
        if (url.includes('/')) {
            return url.split('/')[0];
        }
        return url;
    }
    
    resolveUrlPath(url) {
        // Обработка поддоменов типа my.site.vs
        if (this.isSubdomain(url)) {
            const parts = url.split('.');
            const subdomain = parts[0];
            const mainDomain = parts[1];
            return `${mainDomain}/${subdomain}.downdomain/start.html`;
        }
        
        // Обработка путей типа site.vs/path/to/page
        if (url.includes('/')) {
            const [domain, ...pathParts] = url.split('/');
            const siteName = domain.replace('.vs', '');
            const path = pathParts.join('/');
            
            // Проверяем, является ли путь .updomain в контексте .downdomain
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
        
        // Простой домен типа site.vs
        const siteName = url.replace('.vs', '');
        return `${siteName}/start.html`;
    }
    
    isSubdomain(url) {
        const parts = url.split('.');
        return parts.length > 2 && parts[parts.length - 1] === 'vs';
    }
    
    isUpdomainInDowndomain(siteName, path) {
        // Проверяем, существует ли такой .downdomain с .updomain внутри
        const possibleDowndomains = ['imagining', 'blog', 'admin']; // примеры
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
