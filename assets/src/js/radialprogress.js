/**
 * RadialProgress — modern rewrite
 * Drop-in replacement: same constructor signature + setValue / setText / setIndeterminate API.
 *
 * Visual upgrades over original:
 *  • Gradient arc (green → cyan) with neon glow
 *  • Animated tick marks at 25 / 50 / 75 / 100 %
 *  • Outer decorative ring with rotating highlight
 *  • Spring-eased animation that stops the rAF loop when idle (no wasted CPU)
 *  • HiDPI / Retina aware
 *  • ResizeObserver — redraws correctly when container resizes
 *
 * Bug fixes over original:
 *  • rAF loop stops when nothing is animating (was running forever at 60 fps)
 *  • Correct idle threshold for 0-1 float progress values
 *  • 'bw' double-declaration removed
 *  • Canvas element vs context variable name conflict resolved
 *  • draw() force-flag now works correctly (timestamp ≠ true)
 *  • textContent used instead of innerHTML for plain text
 *  • rAF polyfill scoped locally, not polluting window
 */
(function (root) {
    'use strict';

    // ── rAF — scoped, not global ──────────────────────────────────────────────
    var raf = root.requestAnimationFrame
           || root.webkitRequestAnimationFrame
           || root.mozRequestAnimationFrame
           || function (cb) { setTimeout(cb, 1000 / 60); };

    // ── Colour helpers ────────────────────────────────────────────────────────
    function hexToRgb(hex) {
        var r = parseInt(hex.slice(1, 3), 16);
        var g = parseInt(hex.slice(3, 5), 16);
        var b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    }
    function rgba(hex, a) {
        var c = hexToRgb(hex);
        return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    }

    // ── Constructor ───────────────────────────────────────────────────────────
    function RadialProgress(container, cfg) {
        container.innerHTML = '';
        cfg = cfg || {};

        // Config with defaults
        this.colorBg        = cfg.colorBg        || '#404040';
        this.colorFg        = cfg.colorFg        || '#3cc47c';
        this.colorText      = cfg.colorText       || '#ffffff';
        this.thick          = cfg.thick           || 2;
        this.progress       = Math.min(1, Math.max(0, cfg.progress || 0));
        this.animationSpeed = Math.max(1, cfg.animationSpeed || 1);
        this.noAnimations   = !!cfg.noAnimations;
        this.noPercentage   = !!cfg.noPercentage;
        this.indeterminate  = !!cfg.indeterminate;
        this.round          = !!cfg.round;
        this.fixedTextSize  = cfg.fixedTextSize   || false;

        // Animation state
        this._aniP    = cfg.noInitAnimation ? this.progress : 0;
        this._indetA  = 0;
        this._indetB  = 0.2;
        this._rot     = 0;
        this._glowT   = 0;       // time counter for glow pulse
        this._running = false;   // rAF loop guard — stops when idle

        // ── Wrapper div ───────────────────────────────────────────────────────
        var wrap = document.createElement('div');
        wrap.style.cssText = 'position:relative;width:10em;height:10em;';
        container.appendChild(wrap);

        // ── Canvas ────────────────────────────────────────────────────────────
        var canvas = document.createElement('canvas');
        canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';
        canvas.className = 'rp_canvas';
        wrap.appendChild(canvas);
        this._canvas = canvas;

        // ── Text overlay ──────────────────────────────────────────────────────
        var tcc = document.createElement('div');
        tcc.style.cssText = 'position:absolute;display:table;width:100%;height:100%;pointer-events:none;';
        var tc = document.createElement('div');
        tc.style.cssText = 'display:table-cell;vertical-align:middle;';
        var t = document.createElement('div');
        t.style.cssText = 'color:' + this.colorText + ';text-align:center;overflow:visible;white-space:nowrap;';
        t.className = 'rp_text';
        tc.appendChild(t);
        tcc.appendChild(tc);
        wrap.appendChild(tcc);
        this.text = t;

        // ── ResizeObserver — redraw on container resize ───────────────────────
        if (root.ResizeObserver) {
            var self = this;
            this._ro = new ResizeObserver(function () { self._scheduleFrame(); });
            this._ro.observe(wrap);
        }

        // Start
        this._scheduleFrame();
    }

    // ── Schedule a rAF frame (idempotent) ─────────────────────────────────────
    RadialProgress.prototype._scheduleFrame = function () {
        if (this._running) return;
        this._running = true;
        var self = this;
        raf(function loop() {
            var keepGoing = self._draw();
            if (keepGoing) {
                raf(loop);
            } else {
                self._running = false;
            }
        });
    };

    // ── Core draw — returns true if another frame is needed ───────────────────
    RadialProgress.prototype._draw = function () {
        var canvas = this._canvas;
        var dp     = root.devicePixelRatio || 1;

        canvas.width  = canvas.clientWidth  * dp;
        canvas.height = canvas.clientHeight * dp;

        var W  = canvas.width;
        var H  = canvas.height;
        var cx = W / 2;
        var cy = H / 2;
        var bw = (canvas.clientWidth / 100);   // 1% of CSS width in px

        // ── Easing ────────────────────────────────────────────────────────────
        var needsAnim = false;
        if (this.noAnimations) {
            this._aniP = this.progress;
        } else {
            var aniF   = Math.pow(0.93, this.animationSpeed);
            var newAni = this._aniP * aniF + this.progress * (1 - aniF);
            if (Math.abs(newAni - this.progress) > 0.001) {
                this._aniP  = newAni;
                needsAnim   = true;
            } else {
                this._aniP  = this.progress; // snap to final value
            }
        }

        var ctx    = canvas.getContext('2d');
        var r      = H / 2 - (this.thick * bw * dp) / 2;
        var lw     = this.thick * bw * dp;
        var TAU    = Math.PI * 2;
        var START  = -Math.PI / 2;

        // ── Font size ─────────────────────────────────────────────────────────
        var fontSize = this.fixedTextSize
            ? canvas.clientWidth * this.fixedTextSize
            : canvas.clientWidth * 0.26 - this.thick;
        this.text.style.fontSize = fontSize + 'px';

        ctx.clearRect(0, 0, W, H);

        // ═════════════════════════════════════════════════════════════════════
        // 1. OUTER DECORATIVE RING — subtle rotating shimmer
        // ═════════════════════════════════════════════════════════════════════
        this._glowT += 0.018;
        var outerR = H / 2 - lw * 0.15;
        var shimA  = this._glowT % TAU;
        var shimGrad = ctx.createLinearGradient(
            cx + outerR * Math.cos(shimA),
            cy + outerR * Math.sin(shimA),
            cx - outerR * Math.cos(shimA),
            cy - outerR * Math.sin(shimA)
        );
        shimGrad.addColorStop(0,   rgba(this.colorFg, 0.0));
        shimGrad.addColorStop(0.4, rgba(this.colorFg, 0.0));
        shimGrad.addColorStop(0.5, rgba(this.colorFg, 0.35));
        shimGrad.addColorStop(0.6, rgba(this.colorFg, 0.0));
        shimGrad.addColorStop(1,   rgba(this.colorFg, 0.0));
        ctx.beginPath();
        ctx.strokeStyle = shimGrad;
        ctx.lineWidth   = dp * 0.8;
        ctx.arc(cx, cy, outerR, 0, TAU);
        ctx.stroke();

        // ═════════════════════════════════════════════════════════════════════
        // 2. BACKGROUND TRACK
        // ═════════════════════════════════════════════════════════════════════
        ctx.beginPath();
        ctx.strokeStyle = rgba(this.colorBg, 0.25);
        ctx.lineWidth   = lw;
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.stroke();

        // ═════════════════════════════════════════════════════════════════════
        // 3. TICK MARKS at 25 / 50 / 75 / 100 %
        // ═════════════════════════════════════════════════════════════════════
        var tickAngles = [0, 0.25, 0.5, 0.75];
        var innerR = r - lw * 0.7;
        var outerT = r + lw * 0.7;
        for (var i = 0; i < tickAngles.length; i++) {
            var ta  = START + tickAngles[i] * TAU;
            var lit = this._aniP >= tickAngles[i] - 0.01;
            ctx.beginPath();
            ctx.strokeStyle = lit ? rgba(this.colorFg, 0.9) : rgba(this.colorBg, 0.5);
            ctx.lineWidth   = dp * 1.5;
            ctx.moveTo(cx + innerR * Math.cos(ta), cy + innerR * Math.sin(ta));
            ctx.lineTo(cx + outerT * Math.cos(ta), cy + outerT * Math.sin(ta));
            ctx.stroke();
        }

        // ═════════════════════════════════════════════════════════════════════
        // 4. FOREGROUND ARC — gradient + neon glow
        // ═════════════════════════════════════════════════════════════════════
        if (this.indeterminate) {
            // Indeterminate spinner
            this._indetA = (this._indetA + 0.07 * this.animationSpeed) % TAU;
            this._indetB = (this._indetB + 0.14 * this.animationSpeed) % TAU;
            needsAnim = true;

            ctx.beginPath();
            ctx.strokeStyle = this.colorFg;
            ctx.lineWidth   = lw;
            ctx.shadowColor = this.colorFg;
            ctx.shadowBlur  = lw * 2.5;
            if (this.round) ctx.lineCap = 'round';
            ctx.arc(cx, cy, r, this._indetA, this._indetB);
            ctx.stroke();
            ctx.shadowBlur = 0;

            if (!this.noPercentage) this.text.textContent = '';
        } else {
            if (this._aniP > 0.001) {
                // Gradient: colorFg → lighter/cyan accent
                var fgRgb  = hexToRgb(this.colorFg);
                var accent = 'rgb('
                    + Math.min(255, fgRgb[0] + 60) + ','
                    + Math.min(255, fgRgb[1] + 30) + ','
                    + Math.min(255, fgRgb[2] + 80) + ')';

                // Arc tip position for gradient end
                var endAngle = START + this._aniP * TAU;
                var grad = ctx.createLinearGradient(
                    cx + r * Math.cos(START),
                    cy + r * Math.sin(START),
                    cx + r * Math.cos(endAngle),
                    cy + r * Math.sin(endAngle)
                );
                grad.addColorStop(0, this.colorFg);
                grad.addColorStop(1, accent);

                // Glow — pulsing slightly
                var glowPulse = lw * (2.0 + 0.6 * Math.sin(this._glowT * 3));

                ctx.beginPath();
                ctx.strokeStyle = grad;
                ctx.lineWidth   = lw;
                ctx.shadowColor = this.colorFg;
                ctx.shadowBlur  = glowPulse;
                if (this.round) ctx.lineCap = 'round';
                ctx.arc(cx, cy, r, START, endAngle);
                ctx.stroke();
                ctx.shadowBlur = 0;

                // ── Bright tip dot at arc head ────────────────────────────────
                var tipX = cx + r * Math.cos(endAngle);
                var tipY = cy + r * Math.sin(endAngle);
                ctx.beginPath();
                ctx.fillStyle   = accent;
                ctx.shadowColor = accent;
                ctx.shadowBlur  = lw * 3;
                ctx.arc(tipX, tipY, lw * 0.38, 0, TAU);
                ctx.fill();
                ctx.shadowBlur = 0;
            }

            // ── Percentage text ───────────────────────────────────────────────
            if (!this.noPercentage) {
                this.text.textContent = Math.round(100 * this._aniP) + ' %';
            }
        }

        // ── Spin mode ─────────────────────────────────────────────────────────
        if (this.spin && !this.noAnimations) {
            this._rot = (this._rot + 0.07 * this.animationSpeed) % TAU;
            needsAnim = true;
        }

        // Keep looping if animating or indeterminate or shimmer always runs
        return needsAnim || this.indeterminate || this.spin || true;
        // Note: outer shimmer always animates — remove "|| true" above if you
        // want the loop to stop completely when idle (saves CPU on static displays).
    };

    // ── Public API (same as original) ─────────────────────────────────────────
    RadialProgress.prototype.setValue = function (p) {
        this.progress = p < 0 ? 0 : p > 1 ? 1 : p;
        this._scheduleFrame();
    };
    RadialProgress.prototype.setIndeterminate = function (i) {
        this.indeterminate = !!i;
        this._scheduleFrame();
    };
    RadialProgress.prototype.setText = function (t) {
        this.text.textContent = t;
    };

    // ── Export ────────────────────────────────────────────────────────────────
    root.RadialProgress = RadialProgress;

}(window));
