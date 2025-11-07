class VSBrowserAPI {
    constructor() {
        this.sitesBaseUrl = './sites/';
        this.verifiedFile = './verified.txt';
    }
    
    async loadWebsite(url) {
        try {
            // Обработка разных форматов URL
            let sitePath = '';
            
            if (url.includes('/')) {
                // Обработка путей типа mail.vs/imagining
                const [domain, ...pathParts] = url.split('/');
                const siteName = domain.replace('.vs', '');
                sitePath = `${siteName}/${pathParts.join('/')}`;
            } else if (url.includes('.vs')) {
                // Обработка доменов типа mail.vs
                const siteName = url.replace('.vs', '');
                sitePath = `${siteName}/start.html`;
            } else {
                // Простое имя сайта
                sitePath = `${url}/start.html`;
            }
            
            // Проверяем поддомены типа imagining.mail.vs
            if (url.includes('.') && url.split('.').length > 2) {
                const parts = url.split('.');
                if (parts[parts.length - 1] === 'vs') {
                    const subdomain = parts[0];
                    const mainDomain = parts[1];
                    sitePath = `${mainDomain}/${subdomain}.downdomain/start.html`;
                }
            }
            
            const fullPath = this.sitesBaseUrl + sitePath;
            console.log('Loading:', fullPath);
            
            const response = await fetch(fullPath);
            if (!response.ok) {
                throw new Error(`Сайт не найден: ${url}`);
            }
            
            let content = await response.text();
            
            // Обрабатываем относительные пути в ссылках и ресурсах
            content = this.fixRelativePaths(content, url);
            
            return content;
        } catch (error) {
            console.error('Error loading website:', error);
            throw error;
        }
    }
    
    fixRelativePaths(content, baseUrl) {
        // Базовый путь для ресурсов
        const basePath = this.getBasePath(baseUrl);
        
        // Исправляем ссылки
        content = content.replace(/href="([^"]*)"/g, (match, link) => {
            if (link.startsWith('http') || link.startsWith('#') || link.startsWith('javascript:')) {
                return match;
            }
            return `href="javascript:void(0)" onclick="navigateFromLink('${baseUrl}', '${link}')"`;
        });
        
        // Исправляем src атрибуты
        content = content.replace(/src="([^"]*)"/g, (match, src) => {
            if (src.startsWith('http') || src.startsWith('data:')) {
                return match;
            }
            return `src="${basePath}${src}"`;
        });
        
        return content;
    }
    
    getBasePath(url) {
        if (url.includes('/')) {
            const parts = url.split('/');
            const domain = parts[0];
            const siteName = domain.replace('.vs', '');
            return `./sites/${siteName}/`;
        } else {
            const siteName = url.replace('.vs', '');
            return `./sites/${siteName}/`;
        }
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
    
    async addNewSite(siteName, siteContent) {
        // В реальной реализации здесь была бы логика добавления нового сайта
        console.log('Adding new site:', siteName, siteContent);
        // Для демо просто возвращаем успех
        return { success: true, message: 'Сайт добавлен' };
    }
}

// Глобальные функции для использования в iframe
window.navigateFromLink = function(baseUrl, link) {
    let newUrl = '';
    
    if (link.startsWith('/')) {
        // Абсолютный путь
        newUrl = baseUrl.split('/')[0] + link;
    } else if (link.startsWith('http')) {
        // Внешняя ссылка (в реальном браузере откроется в новой вкладке)
        newUrl = link;
    } else {
        // Относительный путь
        const baseParts = baseUrl.split('/');
        baseParts.pop();
        newUrl = baseParts.join('/') + '/' + link;
    }
    
    window.parent.navigateTo(newUrl);
};

// Инициализация API
const vsBrowser = new VSBrowserAPI();

// Функция для загрузки сайта (используется в браузере)
async function loadWebsite(url) {
    return await vsBrowser.loadWebsite(url);
}