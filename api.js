class VSBrowserAPI {
    constructor() {
        this.sitesBaseUrl = './sites/';
        this.verifiedFile = './verified.txt';
    }
    
    async loadWebsite(url) {
        try {
            console.log('Loading URL:', url);
            
            // Текущий домен извлекается, но не хранится в состоянии класса, как просили
            let sitePath = this.resolveUrlPath(url);
            const fullPath = this.sitesBaseUrl + sitePath;
            
            console.log('Resolved path:', fullPath);
            
            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`Сайт не найден: ${url} (попытка загрузить: ${fullPath})`);
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
        
        // Обработка путей
        if (url.includes('/')) {
            const [domain, ...pathParts] = url.split('/');
            const siteName = domain.replace('.vs', '');
            const path = pathParts.join('/');
            
            // Проверяем, является ли первый элемент пути .updomain папкой
            const firstPath = pathParts[0];
            if (firstPath && this.isUpdomainPath(siteName, firstPath)) {
                return `${siteName}/${firstPath}.updomain/start.html`;
            }
            
            // Логика для обычных путей (site.vs/example.html или site.vs/folder/)
            if (path.includes('.') && !path.endsWith('/')) {
                // Прямой путь к файлу (например: site.vs/page.html)
                return `${siteName}/${path}`;
            } else {
                // Путь к папке (например: site.vs/folder или site.vs/folder/)
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
        const updomainPaths = ['imagining', 'blog', 'shop']; 
        return updomainPaths.includes(path);
    }
    
    processHtmlContent(content, baseUrl) {
        const basePath = this.getBasePath(baseUrl);
        const baseTag = `<base href="${basePath}">`;
        
        // Вставляем тег <base> для корректной обработки относительных ресурсов
        if (content.includes('</head>')) {
            content = content.replace('</head>', `${baseTag}</head>`);
        } else if (content.includes('<head>')) {
            content = content.replace('<head>', `<head>${baseTag}`);
        } else {
            // Если нет <head>, добавляем его
            content = `<head>${baseTag}</head>` + content;
        }
        
        // Перехват ссылок (href)
        content = content.replace(/href="([^"]*)"/gi, (match, href) => {
            return this.processHref(href, baseUrl, match);
        });
        
        // Перехват действий форм (action)
        content = content.replace(/action="([^"]*)"/gi, (match, action) => {
            return this.processAction(action, baseUrl, match);
        });
        
        // Инъекция скриптов для работы навигации внутри iframe
        content = this.injectNavigationScripts(content, baseUrl);
        
        return content;
    }
    
    processHref(href, baseUrl, originalMatch) {
        // Пропускаем внешние ссылки, якоря, JS-ссылки и почтовые
        if (href.startsWith('http') || href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) {
            return originalMatch;
        }
        
        let newUrl;

        if (href.startsWith('/')) {
            // Абсолютный путь (от корня домена, например /page.html)
            const domain = baseUrl.split('/')[0];
            newUrl = domain + href;
        } else {
            // Относительный путь (например example.html)
            newUrl = this.resolveRelativeUrl(baseUrl, href);
        }

        // Заменяем href на вызов функции навигации в родительском окне
        return `href="javascript:void(0)" onclick="VSNavigate('${newUrl}')"`;
    }
    
    processAction(action, baseUrl, originalMatch) {
        // Пропускаем внешние ссылки или пустые действия
        if (action.startsWith('http') || !action) {
            return originalMatch;
        }
        
        let newUrl;

        if (action.startsWith('/')) {
            const domain = baseUrl.split('/')[0];
            newUrl = domain + action;
        } else {
            newUrl = this.resolveRelativeUrl(baseUrl, action);
        }

        // Заменяем action на вызов функции обработки формы
        return `action="javascript:void(0)" onsubmit="return VSHandleForm(this, '${newUrl}')"`;
    }
    
    resolveRelativeUrl(baseUrl, relativeUrl) {
        const baseParts = baseUrl.split('/').filter(part => part);
        const relativeParts = relativeUrl.split('/').filter(part => part);
        
        // Если baseUrl - это путь к файлу (т.е. нет слеша в конце, и есть расширение), удаляем имя файла
        if (baseParts.length > 1 && baseParts[baseParts.length - 1].includes('.')) {
             baseParts.pop();
        } else if (baseParts.length > 1 && !baseUrl.endsWith('/')) {
            // Если это просто папка без слеша в конце (site.vs/folder), то удаляем "folder" 
            // так как в функции resolveUrlPath он будет преобразован в start.html
            baseParts.pop();
        }

        for (const part of relativeParts) {
            if (part === '..') {
                // Переход на один уровень вверх, если это не домен
                if (baseParts.length > 1) baseParts.pop();
            } else if (part !== '.') {
                // Пропускаем текущую директорию
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
                // Глобальная функция для навигации, вызывается из iframe
                function VSNavigate(url) {
                    // Внешние ссылки открываем в новом окне
                    if (url.startsWith('http')) {
                        window.open(url, '_blank');
                    } else {
                        // Внутренние ссылки передаем родительскому браузеру
                        window.parent.navigateTo(url);
                    }
                }
                
                // Глобальная функция для обработки форм
                function VSHandleForm(form, actionUrl) {
                    console.log('Form submitted to:', actionUrl, form);
                    // Сейчас просто перенаправляем на actionUrl, игнорируя данные формы
                    VSNavigate(actionUrl);
                    return false; // Предотвращаем стандартную отправку формы
                }
                
                // Переопределение window.location, чтобы ссылки внутри iframe работали через родительский браузер
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
            content += scripts; // Если нет </body>, добавляем в конец
        }
        
        return content;
    }
    
    // Функция для получения списка верифицированных сайтов (оставлена как заглушка)
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
// Глобальная функция для вызова из browser.html
async function loadWebsite(url) {
    return await vsBrowser.loadWebsite(url);
}
