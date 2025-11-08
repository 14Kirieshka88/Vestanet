// api.js — исправленный. Поддержка:
// - site.vs, site.vs/path
// - downdomain.site.vs and downdomain.site.vs/updomain/...
// - не блокирует формы (обрабатывает отправки внутри симуляции)
// - перехватывает клики даже с target="_top"/"_blank" и загружает внутри iframe

class VSBrowserAPI {
  constructor(options = {}) {
    this.basePath = options.basePath || "/sites"; // /sites
    this.startFile = options.startFile || "start.html";
    this.iframe = null;
    this.currentSite = null;     // main site name (e.g. "site")
    this.currentSub = null;      // downdomain if used (e.g. "downdomain")
    this.onStatus = options.onStatus || ((s) => console.log("[VS]", s));
  }

  init(iframeId) {
    const frame = document.getElementById(iframeId);
    if (!frame) throw new Error(`VSBrowserAPI.init: iframe ${iframeId} not found`);
    this.iframe = frame;

    // При загрузке инжектим обработчики (если same-origin)
    this.iframe.addEventListener("load", () => {
      this.onStatus("iframe loaded");
      this._attachHandlersSafely();
    });

    this.onStatus("VSBrowserAPI initialized (API не автозагружает сайты).");
  }

  // ------------------------------
  // Разбор адреса .vs
  // Поддерживает:
  //  - site.vs
  //  - site.vs/path/to.html
  //  - downdomain.site.vs
  //  - downdomain.site.vs/updomain/...
  // Возвращает {ok:true, site, sub, path}
  // ------------------------------
  _parseVsAddress(input) {
    if (!input) return { ok: false };
    let s = String(input).trim();

    // если ввели с протоколом или слешами вначале — убираем
    s = s.replace(/^https?:\/\//i, "");
    s = s.replace(/^\/+/, "");

    // если передали полный путь /sites/... -> свести к относительному
    const sitesMatch = s.match(/^sites\/([a-z0-9-_]+)(?:\/(.*))?$/i);
    if (sitesMatch) {
      return { ok: true, site: sitesMatch[1].toLowerCase(), sub: null, path: sitesMatch[2] || "" };
    }

    // проверим формат: downdomain.site.vs[/path] или site.vs[/path]
    const parts = s.split("/");
    const host = parts.shift(); // host может быть 'a.b.vs' или 'site.vs' или 'site.vs:80'
    const path = parts.join("/");

    // убираем порт если есть
    const hostNoPort = host.split(":")[0];

    // host должен заканчиваться на .vs
    if (!hostNoPort.toLowerCase().endsWith(".vs")) return { ok: false };

    const hostCore = hostNoPort.slice(0, -3); // убираем .vs

    // если есть точка — downdomain.site
    const hostSegments = hostCore.split(".");
    if (hostSegments.length === 1) {
      return { ok: true, site: hostSegments[0].toLowerCase(), sub: null, path };
    } else {
      const sub = hostSegments.slice(0, -1).join(".").toLowerCase(); // всё что перед последним сегментом
      const site = hostSegments[hostSegments.length - 1].toLowerCase();
      return { ok: true, site, sub, path };
    }
  }

  // ------------------------------
  // Формирует URL на файловом хранилище /sites
  // mapping rules:
  //  - site, no sub, no path -> /sites/site/start.html
  //  - site, path -> /sites/site/<path>
  //  - sub.site, no path -> /sites/site/sub/start.html
  //  - sub.site, path -> /sites/site/sub/<path>
  // ------------------------------
  _buildUrl(parsed) {
    if (!parsed || !parsed.ok) return null;
    const site = encodeURIComponent(parsed.site);
    const sub = parsed.sub ? encodeURIComponent(parsed.sub) : null;
    const path = (parsed.path || "").replace(/^\/+/, ""); // убираем ведущие слэши

    if (sub) {
      if (!path) return `${this.basePath}/${site}/${sub}/${this.startFile}`;
      return `${this.basePath}/${site}/${sub}/${path}`;
    } else {
      if (!path) return `${this.basePath}/${site}/${this.startFile}`;
      return `${this.basePath}/${site}/${path}`;
    }
  }

  // ------------------------------
  // Проверка наличия ресурса (GET)
  // ------------------------------
  async _exists(url) {
    try {
      const r = await fetch(url, { method: "GET" });
      return { ok: r.ok, status: r.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ------------------------------
  // Основной метод загрузки: принимает любые формы, например:
  //  - "site.vs", "site.vs/path", "downdomain.site.vs", "downdomain.site.vs/up"
  // Возвращает {ok, url, parsed}
  // ------------------------------
  async load(address) {
    if (!this.iframe) throw new Error("VSBrowserAPI: iframe not initialized");

    const parsed = this._parseVsAddress(address);
    if (!parsed.ok) {
      this.onStatus("Неверный адрес (ожидается .vs)");
      return { ok: false, msg: "invalid address" };
    }

    const url = this._buildUrl(parsed);
    if (!url) return { ok: false, msg: "cannot build url" };

    const check = await this._exists(url);
    if (!check.ok) {
      this.onStatus(`Сайт/ресурс не найден: ${url} (${check.status || check.error})`);
      return { ok: false, msg: "not found", detail: check };
    }

    // всё ок — загрузим в iframe
    this.currentSite = parsed.site;
    this.currentSub = parsed.sub || null;
    this.iframe.src = url;
    this.onStatus(`Загружаю: ${url}`);
    return { ok: true, url, parsed };
  }

  // ------------------------------
  // Разрешённые ресурсы: только те, что находятся внутри /sites/<site>/...
  // ------------------------------
  _isAllowedResource(url) {
    try {
      const u = new URL(url, location.href);
      if (u.origin !== location.origin) return false;
      const expected = `${this.basePath}/${this.currentSite}/`.replace(/\/+/g, "/");
      return u.pathname.startsWith(expected);
    } catch (e) {
      return false;
    }
  }

  // ------------------------------
  // Инъекция обработчиков внутрь iframe (если same-origin)
  // Перехватываем:
  //  - клики по <a href="..."> — включая href вида titup.vs и downdomain.site.vs/up
  //  - формы: разрешаем отправку внутри симуляции; если action ведёт в .vs или относительный — обрабатываем и показываем результат в iframe
  //  - предотвращаем уход за пределы (https:// и другие origin)
  // ------------------------------
  _attachHandlersSafely() {
    if (!this.iframe) return;
    let doc;
    try {
      doc = this.iframe.contentDocument || this.iframe.contentWindow.document;
    } catch (e) {
      this.onStatus("Нет доступа к документу iframe (cross-origin) — обработчики не подключены.");
      return;
    }
    if (!doc) return;

    // Перехват кликов: используем capture + passive=false, чтобы перехватить даже target=_top/_blank
    const onClick = (ev) => {
      // найти ближайший элемент a
      let el = ev.target;
      while (el && el !== doc && el.nodeName !== "A") el = el.parentElement;
      if (!el || el.nodeName !== "A") return;
      const href = el.getAttribute("href") || "";
      if (!href) return;

      // если anchor указывает якорь — позволим (можно прокрутить)
      if (href.startsWith("#")) return;

      // если .vs адрес (например titup.vs или a.b.site.vs/...), парсим и загружаем через API
      const parsed = this._parseVsAddress(href);
      if (parsed.ok) {
        ev.preventDefault();
        // загрузка через API (это обновит iframe.src)
        this.load(href);
        return;
      }

      // если абсолютный http(s) — блокируем (вне симуляции)
      if (/^https?:\/\//i.test(href)) {
        ev.preventDefault();
        alert("Внешние сайты запрещены в этом симуляторе интернета.");
        return;
      }

      // относительная ссылка (в пределах текущего сайта)
      // собираем полный url и проверяем разрешение
      try {
        const full = new URL(href, this.iframe.contentWindow.location.href).href;
        if (this._isAllowedResource(full)) {
          ev.preventDefault();
          // просто установим iframe.src на этот ресурс
          this.iframe.src = full;
          this.onStatus(`Загрузка ресурса внутри сайта: ${full}`);
          return;
        } else {
          ev.preventDefault();
          alert("Доступ к этому ресурсу запрещён (вне текущего сайта).");
          return;
        }
      } catch (e) {
        // оставим переход по умолчанию если что-то неожиданное
      }
    };

    // Добавляем обработчик на корневой документ (capture чтобы перехватить target specifics)
    doc.addEventListener("click", onClick, true);

    // Формы: разрешаем отправку, но если action ведёт наружу — блокируем; если action относителен или .vs — будем обрабатывать.
    const onSubmit = (ev) => {
      const form = ev.target;
      if (!form || form.nodeName !== "FORM") return;
      const actionRaw = form.getAttribute("action") || "";
      const method = (form.getAttribute("method") || "GET").toUpperCase();

      // Разрешаем чисто внутри-страничные формы без action (они могут быть handled by JS)
      if (!actionRaw || actionRaw === "") {
        // позволяем (внутренний JS обработает)
        return;
      }

      // Если действие ведёт на .vs -> перехватим и загрузим результат как URL (полезно для поисков)
      const parsed = this._parseVsAddress(actionRaw);
      if (parsed.ok) {
        ev.preventDefault();
        // для GET собираем query строки из полей
        if (method === "GET") {
          const params = new URLSearchParams(new FormData(form)).toString();
          const base = this._buildUrl(parsed);
          const targetUrl = params ? `${base}${base.includes("?") ? "&" : "?"}${params}` : base;
          this.iframe.src = targetUrl;
          this.onStatus(`Форма => загрузка ${targetUrl}`);
        } else {
          // POST: соберём и отправим через fetch, затем вставим ответ в iframe через blob
          const formData = new FormData(form);
          const body = new URLSearchParams();
          for (const [k, v] of formData.entries()) body.append(k, v);
          const url = this._buildUrl(parsed);
          fetch(url, { method: "POST", body })
            .then(r => r.text())
            .then(html => {
              const blob = new Blob([html], { type: "text/html" });
              this.iframe.src = URL.createObjectURL(blob);
              this.onStatus("Форма POST -> ответ загружен в iframe (симуляция).");
            })
            .catch(err => {
              alert("Ошибка при отправке формы (симуляция): " + err);
            });
        }
        return;
      }

      // Если action абсолютный наружу -> блокируем
      if (/^https?:\/\//i.test(actionRaw)) {
        ev.preventDefault();
        alert("Отправка форм на внешние сайты запрещена.");
        return;
      }

      // Иначе позволим форме отправиться (если это относительный путь внутри сайта, браузер сам загрузит его в iframe)
      // НО нужно предотвратить target=_top/_blank у форм — если есть target, очистим его чтобы не выйти из iframe
      if (form.target && form.target !== "" && form.target !== "_self") {
        form.target = "_self";
      }
      // (не предотвращаем)
    };

    // Вешаем обработчики на весь документ
    doc.addEventListener("submit", onSubmit, true);

    this.onStatus("Обработчики ссылок/форм подключены (внутри iframe).");
  }
}

// экспорт глобального экземпляра
window.vsBrowser = new VSBrowserAPI();
