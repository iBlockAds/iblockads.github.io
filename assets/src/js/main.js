function closeNotif() {
    const n = document.querySelector("._notif");
    if (n) n.remove();
}

// ====================== UTILITY CLASSES ======================
class Navbar {
    constructor() {
        this.nav = document.querySelector("nav");
        if (!this.nav) return;
        this.initListeners();
    }
    open() { document.body.style.overflow = "hidden"; this.nav.classList.add("active"); }
    close() { document.body.style.overflow = "auto"; this.nav.classList.remove("active"); }
    initListeners() {
        const btn = this.nav.querySelector("button");
        if (btn) btn.addEventListener("click", () => this.nav.classList.contains("active") ? this.close() : this.open());
        document.querySelectorAll("nav ul > a").forEach(a => a.addEventListener("click", () => this.close()));
    }
}

class ThemeManager {
    constructor() {
        this.toggles = document.getElementsByClassName("theme-toggle");
        if (this.toggles.length === 0) return;
        const stored = localStorage.getItem('theme') || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        document.documentElement.setAttribute('data-theme', stored);
        for (let i = 0; i < this.toggles.length; i++) {
            this.toggles[i].addEventListener("click", () => {
                const current = document.documentElement.getAttribute("data-theme");
                this.setTheme(current === "light" ? "dark" : "light");
            });
        }
    }
    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }
}

class AOS {
    constructor() {
        this.items = document.querySelectorAll("[class*=_aos]");
        if (!('IntersectionObserver' in window) || this.items.length === 0) return;
        this.observer = new IntersectionObserver(this.handle.bind(this), { threshold: 0 });
        this.items.forEach(item => this.observer.observe(item));
    }
    handle(entries) {
        entries.forEach(entry => entry.target.classList.toggle('_aos-done', entry.isIntersecting));
    }
}

class GoTop {
    constructor() {
        this.btn = document.getElementById('gt-link');
        if (!this.btn) return;
        window.addEventListener("scroll", () => this.btn.classList.toggle("hidden", window.scrollY === 0));
        this.btn.addEventListener("click", e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    }
}

class Modal {
    constructor(id = '.modal') {
        this.modal = document.querySelector(id);
        if (!this.modal) return;
        this.body = document.body.classList;
        this.triggers = document.querySelectorAll(`[data-toggle="${this.modal.id}"]`);
        this.closeBtns = this.modal.querySelectorAll('.close-modal');
        this.initListeners();
    }
    show() { this.body.add('_overflowhidden'); this.modal.classList.add('_show-modal'); }
    hide() { this.modal.classList.remove('_show-modal'); this.body.remove('_overflowhidden'); }
    initListeners() {
        this.triggers.forEach(el => el.addEventListener('click', () => this.show()));
        this.closeBtns.forEach(btn => btn.addEventListener('click', () => this.hide()));
    }
}

// ====================== MAIN TESTER ======================
class AdBlockTester {
    constructor() {
        this.nTest = 0;
        this.points = 0;
        this.bar = new RadialProgress(document.getElementById('bar'), {
            colorBg: "#ff3b3f",
            colorFg: "#3cc47c",
            colorText: "#202020",
            thick: 12
        });
        this.notification = new Notif({
            topPos: 10,
            classNames: 'success',
            autoClose: true,
            autoCloseTimeout: 2000
        });
        this.testWrapper = document.getElementById("test");
        this.pendingChecks = [];
    }

    // Modern clipboard (works instantly)
    copyToClip(str) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(str).then(() => {
                this.notification.showN('Đã sao chép URL vào bộ nhớ tạm!', 'success');
            }).catch(() => this.oldCopy(str));
        } else {
            this.oldCopy(str);
        }
    }

    oldCopy(str) {
        const el = document.createElement('textarea');
        el.value = str;
        el.style.position = 'absolute';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        el.remove();
        this.notification.showN('Đã sao chép URL vào bộ nhớ tạm!', 'success');
    }

    async check_url(url, contentDiv, testDiv, isNonPoint = false) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const hostDiv = document.createElement("div");
        hostDiv.textContent = url;
        hostDiv.style.cursor = "pointer";
        hostDiv.title = "Nhấp để sao chép";
        hostDiv.onclick = () => this.copyToClip(url);
        contentDiv.appendChild(hostDiv);

        if (!isNonPoint) this.nTest++;

        try {
            await fetch(url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
            testDiv.style.background = "var(--red)";
            hostDiv.style.background = "var(--red)";
        } catch {
            hostDiv.style.background = "var(--green)";
            if (!isNonPoint) {
                this.points = Math.min(this.points + (100 / this.nTest), 100);
                this.bar.setValue(this.points / 100);
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }

    show_info(t) {
        const testDiv = t.parentElement;
        document.querySelectorAll(".test").forEach(el => { if (el !== testDiv) el.classList.remove("show"); });
        testDiv.classList.toggle("show");
    }

    async withConcurrencyLimit(tasks, limit = 8) {
        const results = [];
        const executing = [];
        for (const task of tasks) {
            const p = Promise.resolve().then(() => task()).then(r => {
                executing.splice(executing.indexOf(p), 1);
                return r;
            });
            results.push(p);
            executing.push(p);
            if (executing.length >= limit) await Promise.race(executing);
        }
        return Promise.all(results);
    }

    async fetchTests() {
        const fragment = document.createDocumentFragment();
        // ... (same as before - normal categories + OEM) ...
        for (const element in data) {
            const catEl = document.createElement("div");
            catEl.id = element;
            catEl.innerHTML = `<h3>${icons[element]}&nbsp;&nbsp;${element}</h3>`;
            fragment.appendChild(catEl);

            const category = data[element];
            for (const key in category) {
                const div = document.createElement('div');
                const dw = document.createElement('div');
                div.classList.add("test");
                div.id = key;
                div.style.background = "var(--green)";
                div.innerHTML = `<span onclick="adBlockTester.show_info(this)">${icons[key]}&nbsp;&nbsp;${key}</span>`;
                div.appendChild(dw);
                catEl.appendChild(div);

                const value = category[key];
                const items = Array.isArray(value) ? value : [value];
                for (const u of items) this.pendingChecks.push(() => this.check_url(u, dw, div));
            }
        }

        const oemTest = document.createElement("div");
        oemTest.id = "OEM";
        oemTest.innerHTML = `<h3>${icons["OEM"]}&nbsp;&nbsp;OEM</h3>`;
        fragment.appendChild(oemTest);

        for (const key in dataOEM) {
            const div = document.createElement('div');
            const dw = document.createElement('div');
            div.classList.add("test");
            div.id = key;
            div.style.background = "var(--green)";
            div.innerHTML = `<span onclick="adBlockTester.show_info(this)">${icons[key]}&nbsp;&nbsp;${key}</span>`;
            div.appendChild(dw);
            oemTest.appendChild(div);

            const value = dataOEM[key];
            const items = Array.isArray(value) ? value : [value];
            for (const u of items) this.pendingChecks.push(() => this.check_url(u, dw, div, true));
        }

        this.testWrapper.appendChild(fragment);
        await this.withConcurrencyLimit(this.pendingChecks, 8);
    }
}

// ====================== GLOBAL INSTANCE & HELPERS (IMMEDIATE) ======================
let adBlockTester = new AdBlockTester();   // ← created instantly

// Make modal button and other onclicks work immediately
window.copyToClip = (str) => adBlockTester.copyToClip(str);
window.show_info   = (t)  => adBlockTester.show_info(t);
window.adBlockTester = adBlockTester;   // just in case

// ====================== INITIALIZE EVERYTHING ======================
window.onload = function () {
    new Navbar();
    new ThemeManager();
    new GoTop();
    new AOS();
    new Modal();

    adBlockTester.pendingChecks = [];   // reset for safety

    adBlockTester.fetchTests().then(() => {
        const loading = document.querySelector(".loadingWrap");
        if (loading) {
            loading.style.transition = "opacity 400ms";
            loading.style.opacity = "0";
            setTimeout(() => {
                loading.style.display = "none";
                document.body.classList.remove("_overflowhidden");
                console.log("Đã hoàn thành tất cả các bài kiểm tra!");
            }, 400);
        }
    });
};
