// api.js — "Интернет в интернете" (исправленная версия)
// 1) НЕ автозагружает никакие сайты (всё только по вызову load/init из внешнего кода).
// 2) Поддерживает updomain / downdomain (настраиваемые наборы правил).
// 3) Обрабатывает .vs-ссылки, относительные ссылки и блокирует внешние URL.
// 4) API предоставляет методы для управления списками up/down domains.

class VSBrowserAPI {
  constructor(options = {}) {
    // Путь к папке с сайтами (можно задать при создании)
    this.basePath = options.basePath || "/sites";
    this.startFile = options.startFile || "start.html"; // файл по умолчанию внутри каждой папки
    this.iframe = null;
    this.currentSite = null;

    // updomain/downdomain: массивы строк (напр. ['imagining','blog'])
    this.updomainPaths = new Set(options.updomainPaths || []);   // те, что считаются "updomain"
    this.downdomainPaths = new Set(options.downdomainPaths || []); // те, что "downdomain"

    // Флаги (по умолчанию API молчит — не автозагружает)
    this.autoLoadOnInit = !!options.autoLoadOnInit; // по умолчанию false

    // Отладка
    this.onStatus = typeof options.onStatus === "function" ? options.onStatus : (s) => console.log("[VSBrowser]", s);
  }

  // ---------------------------
  // Инициализация: привязать iframe (не будет автозагружать)
  // ---------------------------
  init(iframeId) {
    const el = document.getElementById(iframeId);
    if (!el) {
      throw new Error(`VSBrowserAPI.init: iframe with id "${iframeId}" not found`);
    }
    this.iframe = el;

    // слушаем load для инъекции обработчиков
    this.iframe.addEventListener("load", () => {
      this.onStatus("iframe loaded");
      this._attachHandlersSafely();
    });

    this.onStatus("VSBrowserAPI initialized (no auto-load).");
    // ВАЖНО: API НЕ делает автоматическую загрузку стартовой страницы.
    // Если нужно автозагрузить - это должен делать внешний код (browser.html).
  }

  // ---------------------------
  // Управление updomain / downdomain
  // ---------------------------
  addUpdomain(name) { this.updomainPaths.add(String(name)); }
  removeUpdomain(name) { this.updomainPaths.delete(String(name)); }
  listUpdomain() { return Array.from(this.updomainPaths); }
  isUpdomain(name) { return this.updomainPaths.has(String(name)); }

  addDowndomain(name) { this.downdomainPaths.add(String(name)); }
  removeDowndomain(name) { this.downdomainPaths.delete(String(name)); }
  listDowndomain() { return Array.from(this.downdomainPaths); }
  isDowndomain(name) { return this.downdomainPaths.has(String(name)); }

  // ---------------------------
  // Нормализация введённого адреса
  // Примеры входа: "gov.vs", "gov", "/sites/gov/start.html"
  // ---------------------------
  _cleanSiteInput(input) {
    if (!input) return null;
    let s = String(input).trim();
    // если указали полный путь /sites/name/... -> попытаться извлечь имя
    const m = s.match(/\/sites\/([a-zA-Z0-9-_]+)(\/|$)/);
    if (m) return m[1];
    // если указали с доменом .vs
    if (s.toLowerCase().endsWith(".vs")) s = s.slice(0, -3);
    // если просто имя — оставляем, но фильтруем лишние символы
    s = s.toLowerCase().replace(/[^a-z0-9-_]/g, "");
    return s || null;
  }

  // ---------------------------
  // Получить URL стартовой страницы для сайта
  // ---------------------------
  getStartUrl(siteName) {
    return `${this.basePath}/${encodeURIComponent(siteName)}/${this.startFile}`;
  }

  // ---------------------------
  // Проверить существование start.html (GET)
  // ---------------------------
  async siteExists(siteName) {
    const url = this.getStartUrl(siteName);
    try {
      const res = await fetch(url, { method: "GET" });
      return { ok: res.ok, status: res.status, url };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ---------------------------
  // Загрузить сайт (НИЧЕГО не делает автоматически при init)
  // siteInput может быть "gov", "gov.vs", или уже "gov/start.html"
  // pushHistory — внешняя логика может вести историю (API не хранит историю автоматически)
  // ---------------------------
  async load(siteInput) {
    if (!this.iframe) throw new Error("VSBrowserAPI: iframe not initialized. Call init(iframeId) first.");
    const siteName = this._cleanSiteInput(siteInput);
    if (!siteName) {
      this.onStatus("VSBrowserAPI: неверное имя сайта.");
      return { ok: false, msg: "invalid site name" };
    }

    const startUrl = this.getStartUrl(siteName);
    // пробуем загрузить (проверка существования)
    const check = await this.siteExists(siteName);
    if (!check.ok) {
      this.onStatus(`VSBrowserAPI: сайт "${siteName}" не найден (${check.status || check.error})`);
      return { ok: false, msg: "not found", detail: check };
    }

    this.currentSite = siteName;
    this.iframe.src = startUrl;
    this.onStatus(`VSBrowserAPI: загружаю ${siteName} -> ${startUrl}`);
    return { ok: true, site: siteName, url: startUrl };
  }

  // ---------------------------
  // Разрешённые URL: только те, что внутри this.basePath/<site>/
  // и same-origin. Блокируем внешние https:// ссылки.
  // ---------------------------
  _isAllowedResourceUrl(url, siteName) {
    try {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin) return false;
      const expectedPrefix = `${this.basePath}/${siteName}/`.replace(/\/+/g, "/");
      return u.pathname.startsWith(expectedPrefix);
    } catch (e) {
      return false;
    }
  }

  // ---------------------------
  // Инъекция обработчиков внутрь iframe (при доступе same-origin)
  //  - обрабатываем <a href="something.vs">  -> load соответствующего сайта
  //  - блокируем внешние ссылки (https://)
  //  - относительные ссылки (page2.html) резолвим относительно currentSite
  //  - блокируем формы (по приколу)
  // ---------------------------
  _attachHandlersSafely() {
    if (!this.iframe) return;
    let doc;
    try {
      doc = this.iframe.contentDocument || this.iframe.contentWindow.document;
    } catch (e) {
      // cross-origin — ничего не делаем, но это ожидаемо если iframe загружен с другого origin
      this.onStatus("VSBrowserAPI: нет доступа к документу iframe (возможен cross-origin) — обработчики не подключены.");
      return;
    }
    if (!doc) return;

    // Удобная внутренняя функция обработчика добавления
    const addAnchorHandler = (a) => {
      const href = a.getAttribute("href") || "";
      // Если ссылка ведёт на .vs (пример: titup.vs)
      if (/^[a-zA-Z0-9-_]+\.vs$/.test(href)) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const target = this._cleanSiteInput(href);
          // Перекладываем управление на внешний код: вызываем load и возвращаем результат
          this.load(target);
        });
        return;
      }

      // Если внешняя абсолютная ссылка -> блокируем
      if (/^https?:\/\//i.test(href)) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          alert("Открытие внешних сайтов запрещено в этом симулированном интернете.");
        });
        return;
      }

      // Если относительная ссылка (не якорь) -> открываем внутри текущего сайта
      if (href && !href.startsWith("#") && !/^[a-zA-Z0-9-_]+:\/\//.test(href)) {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          if (!this.currentSite) return;
          const newUrl = `${this.basePath}/${this.currentSite}/${href}`.replace(/\/+/g, "/");
          // проверяем, что ресурс внутри текущего сайта
          if (this._isAllowedResourceUrl(newUrl, this.currentSite)) {
            this.iframe.src = newUrl;
            this.onStatus(`VSBrowserAPI: загружаю ресурс внутри сайта: ${newUrl}`);
          } else {
            alert("Ресурс за пределами сайта заблокирован.");
          }
        });
      }
    };

    // подключаем для всех ссылок, в т.ч. динамически созданных
    const anchors = Array.from(doc.querySelectorAll("a[href]"));
    anchors.forEach(addAnchorHandler);

    // блокируем формы (симуляция)
    const forms = Array.from(doc.querySelectorAll("form"));
    forms.forEach(f => {
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        alert("Отправка форм отключена в этом симуляторе интернета.");
      });
    });

    this.onStatus("VSBrowserAPI: обработчики ссылок/форм подключены.");
  }
}

// Экспортируем глобальный экземпляр — внешняя страница использует window.vsBrowser
window.vsBrowser = new VSBrowserAPI();
