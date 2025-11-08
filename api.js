// api.js — оригинальная концепция "Интернета в интернете"
// Работает на GitHub Pages. Загружает сайты из /sites/<site>/start.html
// Переход по .vs ссылкам (например <a href="titup.vs">) открывает соответствующий сайт.
// Реальные сайты не открываются.

class VSBrowserAPI {
  constructor() {
    this.basePath = "./sites/";
    this.currentSite = null;
    this.frame = null;
  }

  init(iframeId) {
    this.frame = document.getElementById(iframeId);
    if (!this.frame) {
      console.error("VSBrowserAPI: iframe not found:", iframeId);
      return;
    }

    // При загрузке сайта в iframe — обработаем ссылки
    this.frame.addEventListener("load", () => {
      this.handleLinks();
    });
  }

  // Загружает сайт по имени или по адресу типа gov.vs
  async load(siteName) {
    if (!this.frame) return console.error("iframe not initialized");

    siteName = this.cleanSiteName(siteName);
    if (!siteName) {
      this.showError("Введите адрес сайта, например gov.vs");
      return;
    }

    const url = `${this.basePath}${siteName}/start.html`;
    try {
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`Сайт не найден (${res.status})`);
      this.frame.src = url;
      this.currentSite = siteName;
    } catch (err) {
      this.showError(`Ошибка загрузки сайта "${siteName}.vs"`);
      console.error(err);
    }
  }

  // Очищает и нормализует имя сайта
  cleanSiteName(name) {
    if (!name) return null;
    name = name.trim().toLowerCase();
    if (name.endsWith(".vs")) name = name.slice(0, -3);
    name = name.replace(/[^a-z0-9-_]/g, ""); // защита от мусора
    return name || null;
  }

  // Показывает ошибку прямо в iframe
  showError(text) {
    if (!this.frame) return;
    const html = `
      <html>
        <head>
          <style>
            body { font-family: sans-serif; background:#fafafa; color:#333; display:flex; align-items:center; justify-content:center; height:100vh; }
            .box { text-align:center; border:1px solid #ddd; padding:20px; border-radius:8px; background:white; box-shadow:0 0 10px #0001; }
          </style>
        </head>
        <body>
          <div class="box">
            <h2>Ошибка</h2>
            <p>${text}</p>
            <p style="color:#888;font-size:0.9em;">Проверьте, существует ли папка сайта в /sites/</p>
          </div>
        </body>
      </html>`;
    const blob = new Blob([html], { type: "text/html" });
    this.frame.src = URL.createObjectURL(blob);
  }

  // Подключает обработчики ссылок внутри iframe
  handleLinks() {
    if (!this.frame || !this.frame.contentWindow) return;

    let doc;
    try {
      doc = this.frame.contentDocument || this.frame.contentWindow.document;
    } catch {
      console.warn("Невозможно получить доступ к контенту iframe (возможно кросс-домен).");
      return;
    }

    if (!doc) return;

    // ловим все <a> ссылки
    const anchors = doc.querySelectorAll("a[href]");
    anchors.forEach(a => {
      const href = a.getAttribute("href");
      if (!href) return;

      if (href.endsWith(".vs")) {
        // это переход на другой сайт .vs
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const targetSite = this.cleanSiteName(href);
          this.load(targetSite);
        });
      } else if (/^https?:\/\//i.test(href)) {
        // блокируем внешние сайты
        a.addEventListener("click", (e) => {
          e.preventDefault();
          alert("Внешние сайты запрещены в этом интернете 😎");
        });
      } else if (!href.startsWith("#")) {
        // относительная ссылка внутри текущего сайта
        a.addEventListener("click", (e) => {
          e.preventDefault();
          if (!this.currentSite) return;
          const newUrl = `${this.basePath}${this.currentSite}/${href}`;
          this.frame.src = newUrl;
        });
      }
    });

    // блокируем отправку форм (прикол)
    const forms = doc.querySelectorAll("form");
    forms.forEach(f => {
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        alert("Отправка форм недоступна в этом интернете 😅");
      });
    });
  }
}

// создаём глобальный экземпляр
window.vsBrowser = new VSBrowserAPI();
