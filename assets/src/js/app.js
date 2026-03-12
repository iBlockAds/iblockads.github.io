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
    open()  { document.body.style.overflow = "hidden"; this.nav.classList.add("active"); }
    close() { document.body.style.overflow = "auto";   this.nav.classList.remove("active"); }
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
        window.addEventListener("scroll", () => this.btn.classList.toggle("hidden", window.scrollY === 0), { passive: true });
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

// ====================== SEMAPHORE ======================
class Semaphore {
    constructor(limit) {
        this._limit = limit;
        this._active = 0;
        this._queue = [];
        this._head  = 0;
    }
    acquire() {
        if (this._active < this._limit) { this._active++; return Promise.resolve(); }
        return new Promise(resolve => this._queue.push(resolve));
    }
    release() {
        if (this._head < this._queue.length) {
            const next = this._queue[this._head];
            this._queue[this._head] = null;
            this._head++;
            if (this._head > 64 && this._head > (this._queue.length >> 1)) {
                this._queue = this._queue.slice(this._head);
                this._head  = 0;
            }
            next();
        } else {
            this._active--;
        }
    }
}

// ====================== MAIN TESTER ======================
class AdBlockTester {
    constructor() {
        // Constructor touches NO DOM at all.
        // All getElementById calls live in init(), called explicitly after DOM ready.
        this.totalTests     = 0;
        this.blockedCount   = 0;
        this.unblockedCount = 0;
        this.completedCount = 0;
        this.CONCURRENCY    = 40;
        this.TIMEOUT_MS     = 3000;
        this.pendingChecks  = [];
        this._sem           = new Semaphore(this.CONCURRENCY);
        this._hostnameCache = new Map();
        this._paintQueue    = [];
        this._rafScheduled  = false;
        this._activeTest    = null;

        // DOM refs — populated by init()
        this.bar         = null;
        this.notification= null;
        this.testWrapper = null;
        this._elBlocked  = null;
        this._elTotal    = null;
        this._elChecked  = null;
        this._elProgress = null;
        this._elLabel    = null;
        this._elDot      = null;
    }

    // Called once, after the DOM is confirmed ready.
    init() {
        this.bar = new RadialProgress(document.getElementById('bar'), {
            colorBg: "#ff3b3f", colorFg: "#3cc47c", colorText: "#ffffff", thick: 12, round: true
        });
        this.notification = new Notif({
            topPos: 10, classNames: 'success', autoClose: true, autoCloseTimeout: 2000
        });
        this.testWrapper  = document.getElementById("test");
        this._elBlocked   = document.getElementById('stat-blocked');
        this._elUnblocked = document.getElementById('stat-unblocked');
        this._elChecked   = document.getElementById('stat-checked');
        this._elProgress  = document.getElementById('scan-progress');
        this._elLabel     = document.getElementById('scan-label');
        this._elDot       = document.getElementById('scan-dot');
    }

    // Batched rAF paint — one repaint per frame
    _schedulePaint(fn) {
        this._paintQueue.push(fn);
        if (!this._rafScheduled) {
            this._rafScheduled = true;
            requestAnimationFrame(() => {
                this._rafScheduled = false;
                const q = this._paintQueue.splice(0);
                for (let i = 0; i < q.length; i++) q[i]();

                // Update score ring and live counters once per frame
                if (this.totalTests > 0) {
                    this.bar.setValue(this.blockedCount / this.totalTests);
                    if (this._elBlocked)   this._elBlocked.textContent   = this.blockedCount;
                    if (this._elUnblocked) this._elUnblocked.textContent = this.unblockedCount;
                    if (this._elChecked)  this._elChecked.textContent  = this.completedCount;
                    if (this._elProgress) this._elProgress.textContent =
                        this.completedCount + ' / ' + this.totalTests;
                }
            });
        }
    }

    _getHostname(url) {
        try { return new URL(url).hostname; }
        catch { return url; }
    }

    _fetchURL(url) {
        const hostname = this._getHostname(url);
        if (this._hostnameCache.has(hostname)) return this._hostnameCache.get(hostname);

        const controller = new AbortController();
        const timeoutId  = setTimeout(() => controller.abort(), this.TIMEOUT_MS);

        const p = fetch(url, {
            method: 'HEAD', mode: 'no-cors', cache: 'no-store',
            signal: controller.signal
        })
            .then(() => false)
            .catch(() => true)
            .finally(() => clearTimeout(timeoutId));

        this._hostnameCache.set(hostname, p);
        return p;
    }

    async check_url(url, contentDiv, testDiv, isNonPoint = false) {
        if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url;

        const hostDiv = document.createElement("div");
        hostDiv.textContent = url;
        hostDiv.style.cursor = "pointer";
        hostDiv.title = "Nhấp để sao chép";
        hostDiv.onclick = () => this.copyToClip(url);
        contentDiv.appendChild(hostDiv);

        let blocked;
        const hostname = this._getHostname(url);
        if (this._hostnameCache.has(hostname)) {
            blocked = await this._hostnameCache.get(hostname);
        } else {
            await this._sem.acquire();
            try {
                blocked = await this._fetchURL(url);
            } finally {
                this._sem.release();
            }
        }

        this._schedulePaint(() => {
            if (!isNonPoint) this.completedCount++;
            if (blocked) {
                hostDiv.style.background = "var(--green)";
                if (!isNonPoint) this.blockedCount++;
            } else {
                testDiv.style.background = "var(--red)";
                hostDiv.style.background = "var(--red)";
                if (!isNonPoint) this.unblockedCount++;
            }
        });
    }

    show_info(t) {
        const testDiv = t.parentElement;
        if (this._activeTest && this._activeTest !== testDiv) {
            this._activeTest.classList.remove("show");
        }
        testDiv.classList.toggle("show");
        this._activeTest = testDiv.classList.contains("show") ? testDiv : null;
    }

    async runAll(tasks) {
        return Promise.allSettled(tasks.map(t => t()));
    }

    async fetchTests() {
        const testingInfoEl = document.getElementById("testingInfo");
        const fragment  = document.createDocumentFragment();
        const infoNodes = [];

        for (const element in data) {
            const catEl = document.createElement("div");
            catEl.id = element;
            catEl.innerHTML = `<h3>${icons[element]}&nbsp;&nbsp;${element}</h3>`;
            fragment.appendChild(catEl);

            const category = data[element];
            let countTests = 0;

            for (const key in category) {
                const div = document.createElement('div');
                const dw  = document.createElement('div');
                div.classList.add("test");
                div.id = key;
                div.style.background = "var(--green)";
                div.innerHTML = `<span onclick="adBlockTester.show_info(this)">${icons[key]}&nbsp;&nbsp;${key}</span>`;
                div.appendChild(dw);
                catEl.appendChild(div);

                const items = Array.isArray(category[key]) ? category[key] : [category[key]];
                for (const u of items) {
                    this.pendingChecks.push(() => this.check_url(u, dw, div));
                    if (!dataOEM.hasOwnProperty(key)) this.totalTests++;
                    countTests++;
                }
            }

            const testInfo = document.createElement("div");
            testInfo.textContent = `> ${element}: ${countTests} mục`;
            infoNodes.push(testInfo);
        }

        // OEM section
        const oemTest = document.createElement("div");
        oemTest.id = "OEM";
        oemTest.innerHTML = `<h3>${icons["OEM"]}&nbsp;&nbsp;OEM</h3>`;
        fragment.appendChild(oemTest);

        for (const key in dataOEM) {
            const div = document.createElement('div');
            const dw  = document.createElement('div');
            div.classList.add("test");
            div.id = key;
            div.style.background = "var(--green)";
            div.innerHTML = `<span onclick="adBlockTester.show_info(this)">${icons[key]}&nbsp;&nbsp;${key}</span>`;
            div.appendChild(dw);
            oemTest.appendChild(div);

            const items = Array.isArray(dataOEM[key]) ? dataOEM[key] : [dataOEM[key]];
            for (const u of items) {
                this.pendingChecks.push(() => this.check_url(u, dw, div, true));
            }
        }

        this.testWrapper.appendChild(fragment);

        // Update total counter now that we know totalTests
        if (this._elProgress) this._elProgress.textContent = '0 / ' + this.totalTests;

        // Append log entries
        const infoFrag = document.createDocumentFragment();
        infoNodes.forEach(n => infoFrag.appendChild(n));
        if (testingInfoEl) {
            testingInfoEl.appendChild(infoFrag);
            testingInfoEl.scrollTop = testingInfoEl.scrollHeight;
        }

        await this.runAll(this.pendingChecks);

        // All tests complete — transition to done state
        if (this._elLabel)  this._elLabel.textContent  = 'Hoàn thành!';
        if (this._elDot)    this._elDot.classList.add('done');
        if (this._elProgress) this._elProgress.textContent = this.totalTests + ' / ' + this.totalTests;

        console.log('Đã hoàn thành tất cả các bài kiểm tra!');
    }

    copyToClip(str) {
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(str)
                .then(() => this.notification.showN('Đã sao chép URL vào bộ nhớ tạm!', 'success'))
                .catch(() => this.oldCopy(str));
        } else {
            this.oldCopy(str);
        }
    }
    oldCopy(str) {
        const el = document.createElement('textarea');
        el.value = str;
        el.style.cssText = 'position:absolute;left:-9999px';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        el.remove();
        this.notification.showN('Đã sao chép URL vào bộ nhớ tạm!', 'success');
    }
}

// ====================== GLOBAL VARIABLE ======================
let adBlockTester;

new Navbar();
new ThemeManager();
new GoTop();
new AOS();
new Modal();

adBlockTester        = new AdBlockTester();
window.copyToClip    = (str) => adBlockTester.copyToClip(str);
window.show_info     = (t)   => adBlockTester.show_info(t);
window.adBlockTester = adBlockTester;

adBlockTester.init();

adBlockTester.fetchTests();
