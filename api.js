// api.js — упрощённый API для "интернета в интернете"
// Основная идея: вводим "<sitename>.vs" -> пытаемся загрузить /sites/<sitename>/start.html
// Защита: разрешаем загружать только из /sites/<name>/
// Интерфейс: vsBrowser.load(siteHost) -> Promise({ok, msg})

export class VSBrowserAPI {
  constructor(options = {}) {
    // base path на GitHub Pages — просто корень сайта
    this.sitesBase = options.sitesBase || '/sites';
    // имя файла старта
    this.startFile = options.startFile || 'start.html';
    // iframe id куда вставляем контент
    this.iframeId = options.iframeId || 'vs-content-frame';
    // элемент статуса (опционально)
    this.statusEl = options.statusEl || null;
    // history
    this.history = [];
    this.historyIndex = -1;
  }

  _setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
    else console.log('[VSBrowser status]', text);
  }

  // нормализует ввод: "gov.vs" -> "gov", также принимает "gov" или full path "/sites/gov/start.html"
  extractSiteName(input) {
    if (!input) return null;
    input = input.trim();
    // если ввели с доменом .vs
    const vsMatch = input.match(/^([a-zA-Z0-9-_]+)\.vs$/);
    if (vsMatch) return vsMatch[1];
    // если ввели просто имя
    if (/^[a-zA-Z0-9-_]+$/.test(input)) return input;
    // если ввели путевой адрес типа /sites/gov/start.html -> извлечь gov
    const pathMatch = input.match(/\/sites\/([a-zA-Z0-9-_]+)(\/|$)/);
    if (pathMatch) return pathMatch[1];
    return null;
  }

  // Возвращает URL для загрузки стартовой страницы сайта
  getStartUrlForSite(siteName) {
    return `${this.sitesBase}/${encodeURIComponent(siteName)}/${this.startFile}`;
  }

  // Проверяет, доступен ли start.html (HEAD или GET)
  async checkSiteExists(siteName) {
    const url = this.getStartUrlForSite(siteName);
    try {
      const resp = await fetch(url, { method: 'GET' });
      if (!resp.ok) return { ok: false, code: resp.status, msg: `HTTP ${resp.status}` };
      return { ok: true, url };
    } catch (e) {
      return { ok: false, msg: e.message };
    }
  }

  // Загружает сайт в iframe. Возвращает Promise с объектом результата.
  async load(siteInput, pushHistory = true) {
    const siteName = this.extractSiteName(siteInput);
    if (!siteName) {
      this._setStatus('Неверный адрес — введите, например, gov.vs');
      return { ok: false, msg: 'invalid site name' };
    }

    this._setStatus(`Проверяю сайт: ${siteName}...`);
    const check = await this.checkSiteExists(siteName);
    if (!check.ok) {
      this._setStatus(`Сайт не найден: ${siteName} (${check.msg || check.code})`);
      return { ok: false, msg: 'not found', detail: check };
    }

    const iframe = document.getElementById(this.iframeId);
    if (!iframe) {
      this._setStatus('Ошибка: iframe не найден.');
      return { ok: false, msg: 'no iframe' };
    }

    // Устанавливаем src iframe на стартовую страницу
    iframe.src = check.url;
    this._setStatus('Загрузка...');

    // Обновляем историю
    if (pushHistory) {
      // если мы не в конце — усекаем "вперёд"
      if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1);
      }
      this.history.push({ site: siteName, url: check.url });
      this.historyIndex = this.history.length - 1;
    }

    // Подключим onload обработчик извне (в browser.html установим обработчик)
    return { ok: true, url: check.url, site: siteName };
  }

  // Навигация по истории
  async back() {
    if (this.historyIndex <= 0) return { ok: false, msg: 'no back' };
    this.historyIndex--;
    const entry = this.history[this.historyIndex];
    return this._navigateToHistoryEntry(entry);
  }

  async forward() {
    if (this.historyIndex >= this.history.length - 1) return { ok: false, msg: 'no forward' };
    this.historyIndex++;
    const entry = this.history[this.historyIndex];
    return this._navigateToHistoryEntry(entry);
  }

  async reload() {
    if (this.historyIndex < 0) return { ok: false, msg: 'no current' };
    const entry = this.history[this.historyIndex];
    return this._navigateToHistoryEntry(entry, false);
  }

  _navigateToHistoryEntry(entry, pushHistory = false) {
    const iframe = document.getElementById(this.iframeId);
    if (!iframe) return { ok: false, msg: 'no iframe' };
    iframe.src = entry.url;
    this._setStatus(`Загрузка ${entry.site}...`);
    return { ok: true, url: entry.url, site: entry.site };
  }

  // Ограничение: только ресурсы внутри /sites/<site> разрешаем открывать.
  // Эта функция проверяет ссылку и возвращает true если безопасно.
  isAllowedUrl(url, siteName) {
    try {
      const u = new URL(url, location.href);
      // разрешаем только тот же origin и путь начинающийся на /sites/<siteName>/
      if (u.origin !== location.origin) return false;
      return u.pathname.startsWith(`${this.sitesBase}/${siteName}/`);
    } catch (e) {
      return false;
    }
  }

  // Инжектим внутрь iframe обработчик ссылок и форм (только если same-origin)
  // Вызывать в onload iframe. Если не доступно (cross-origin), ничего не меняем.
  attachSandboxHandlers() {
    const iframe = document.getElementById(this.iframeId);
    if (!iframe) return;
    try {
      const win = iframe.contentWindow;
      const doc = iframe.contentDocument;
      if (!doc) return;
      const currentEntry = this.history[this.historyIndex];
      const siteName = currentEntry ? currentEntry.site : null;

      // Перехватываем ссылки
      doc.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', (ev) => {
          const href = a.getAttribute('href') || '';
          // относительные ссылки нормально резолвятся
          const resolved = new URL(href, win.location.href).href;
          if (this.isAllowedUrl(resolved, siteName)) {
            // загрузим новую страницу в iframe (pushHistory=true)
            ev.preventDefault();
            // вытянем siteName из нового пути (если ссылка ведёт внутри той же папки — остаёмся)
            const match = resolved.match(new RegExp(`${this.sitesBase}/([a-zA-Z0-9-_]+)/`));
            const newSite = match ? match[1] : siteName;
            this.load(`${newSite}.vs`);
          } else {
            ev.preventDefault();
            alert('Открытие внешних ресурсов запрещено в этом "интернетe".');
          }
        }, { passive: true });
      });

      // Перехватываем формы — блокируем отправку за пределы allowed
      doc.querySelectorAll('form').forEach(form => {
        form.addEventListener('submit', (ev) => {
          ev.preventDefault();
          alert('Отправка форм заблокирована (симуляция).');
        });
      });

      this._setStatus('Готово');
    } catch (e) {
      // cross-origin или ошибка доступа — ничего не делаем
      console.warn('Не удалось инжектить обработчики в iframe (возможно cross-origin):', e);
      this._setStatus('Загружено (без модификаций).');
    }
  }
}

// Удобная фабрика для создания API в browser.html:
// window.vsBrowser = new VSBrowserAPI({ iframeId: 'vs-content-frame', statusEl: document.getElementById('vs-status') });
