const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const QRCode = require('qrcode');
const cors = require('cors');

// ============================================
// CẤU HÌNH
// ============================================

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Token và Admin ID
const token = "8893583013:AAHFMGQpY1FmLXlEunJhLqATL9Qed8aXSA4";
const adminId = "7338417401";  // THAY ID ADMIN VÀO ĐÂY

const bot = new TelegramBot(token, { polling: true });

// ============================================
// QUẢN LÝ GÓI VIP
// ============================================

class PackageManager {
    constructor() {
        this.packages = {
            '1day': { name: '🌟 1 Ngày', price: 20000, duration: 1, emoji: '⭐' },
            '3day': { name: '🔥 3 Ngày', price: 45000, duration: 3, emoji: '🔥' },
            '7day': { name: '💎 7 Ngày', price: 70000, duration: 7, emoji: '💎' },
            '1month': { name: '👑 1 Tháng', price: 130000, duration: 30, emoji: '👑' }
        };
        this.users = {};
        this.pendingPayments = {};
        this.historyCau = [];
    }

    getPackageInfo(packageId) {
        return this.packages[packageId];
    }

    createPayment(userId, packageId) {
        const packageInfo = this.getPackageInfo(packageId);
        if (!packageInfo) return null;

        const transactionId = `VIP${Date.now()}_${String(userId).slice(-4)}_${String(Math.random()).slice(-4)}`;

        const payment = {
            userId,
            packageId,
            packageName: packageInfo.name,
            amount: packageInfo.price,
            transactionId,
            createdAt: new Date(),
            status: 'pending',
            billSubmitted: false
        };

        if (!this.users[userId]) {
            this.users[userId] = {
                payments: [],
                activePackage: null,
                expiryDate: null
            };
        }

        this.users[userId].payments.push(payment);
        this.pendingPayments[transactionId] = payment;

        return payment;
    }

    submitBill(userId, transactionId, billInfo) {
        if (!this.pendingPayments[transactionId]) return false;
        const payment = this.pendingPayments[transactionId];
        
        // Kiểm tra trạng thái
        if (payment.status !== 'pending') return false;
        if (payment.userId !== userId) return false;
        
        payment.billInfo = billInfo;
        payment.billSubmitted = true;
        payment.status = 'waiting_approval';
        return true;
    }

    approvePayment(transactionId) {
        if (!this.pendingPayments[transactionId]) return false;
        const payment = this.pendingPayments[transactionId];
        
        // Kiểm tra trạng thái
        if (payment.status !== 'waiting_approval') return false;

        payment.status = 'approved';

        const userId = payment.userId;
        const packageInfo = this.getPackageInfo(payment.packageId);

        if (!this.users[userId]) {
            this.users[userId] = { payments: [], activePackage: null, expiryDate: null };
        }

        this.users[userId].activePackage = payment.packageId;
        this.users[userId].expiryDate = new Date(Date.now() + packageInfo.duration * 24 * 60 * 60 * 1000);

        // ✅ XÓA KHỎI PENDING SAU KHI DUYỆT
        delete this.pendingPayments[transactionId];

        return true;
    }

    rejectPayment(transactionId) {
        if (!this.pendingPayments[transactionId]) return false;
        const payment = this.pendingPayments[transactionId];
        
        // Kiểm tra trạng thái
        if (payment.status !== 'waiting_approval') return false;
        
        payment.status = 'rejected';
        
        // ✅ XÓA KHỎI PENDING SAU KHI TỪ CHỐI
        delete this.pendingPayments[transactionId];
        
        return true;
    }

    checkUserAccess(userId) {
        if (!this.users[userId]) return false;
        const user = this.users[userId];
        if (!user.activePackage) return false;
        if (user.expiryDate && new Date(user.expiryDate) < new Date()) {
            user.activePackage = null;
            user.expiryDate = null;
            return false;
        }
        return true;
    }

    getUserInfo(userId) {
        if (!this.users[userId]) return null;
        const user = this.users[userId];
        return {
            hasActive: !!user.activePackage,
            package: user.activePackage,
            expiry: user.expiryDate ? new Date(user.expiryDate).toLocaleString('vi-VN') : null,
            payments: user.payments.length
        };
    }

    getPendingPayment(transactionId) {
        return this.pendingPayments[transactionId] || null;
    }

    getAllPending() {
        const pending = [];
        for (const [id, payment] of Object.entries(this.pendingPayments)) {
            if (payment.status === 'waiting_approval') {
                pending.push(payment);
            }
        }
        return pending;
    }
}

const packageManager = new PackageManager();

// ✅ KHỞI TẠO GLOBAL AWAITING BILL
global.awaitingBill = {};

// ============================================
// TẠO QR CODE
// ============================================

async function generateQR(data) {
    try {
        const qrBuffer = await QRCode.toBuffer(data, {
            type: 'png',
            margin: 2,
            width: 300,
            color: {
                dark: '#7c3aed',
                light: '#ffffff'
            }
        });
        return qrBuffer;
    } catch (err) {
        console.error('QR Error:', err);
        return null;
    }
}

// ============================================
// THUẬT TOÁN PHÂN TÍCH MD5 (COPY 100% TỪ HTML)
// ============================================

// HÀM HEX_ENTROPY_PY - COPY TỪ HTML
function hex_entropy_py(h) {
    const c = {};
    for (const x of h) c[x] = (c[x] || 0) + 1;
    let e = 0, n = h.length;
    for (const k in c) {
        const p = c[k] / n;
        e -= p * Math.log2(p);
    }
    return e;
}

// HÀM FAST_SHA256_ENTROPY_SIMULATE - COPY TỪ HTML
function fast_sha256_entropy_simulate(str) {
    let h = 0x811c9dc5, h2 = 0x9e3779b1;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    for (let i = 0; i < str.length; i++) {
        h2 ^= str.charCodeAt(i) << ((i & 3) * 8);
        h2 = Math.imul(h2, 0x5bd1e995);
    }
    return hex_entropy_py(((h >>> 0).toString(16) + (h2 >>> 0).toString(16)).padEnd(64, '0').slice(0, 64));
}

// HÀM PY_DEEP_SCORE - COPY TỪ HTML
function py_deep_score(h) {
    const e1 = hex_entropy_py(h);
    const e2 = fast_sha256_entropy_simulate(h);
    const df = Math.abs(e1 - e2);
    const c = {};
    let rp = 0;
    for (const x of h) c[x] = (c[x] || 0) + 1;
    const k = Object.keys(c);
    k.forEach(x => { if (c[x] > 2) rp++; });
    rp = k.length ? rp / k.length : 0;
    let sm = 0;
    for (let i = 0; i < 16; i++) {
        if (h[i] === h[31 - i]) sm += 2.618 - Math.abs(i - 7.5) * 0.105;
    }
    return Math.max(0, Math.min(100, e2 * 12.2 + (50 - df * 22.5) + sm * 2.25 - rp * 18.5 + (sm / 16) * 32));
}

// HÀM PY_DETECT_CAU - COPY TỪ HTML
function py_detect_cau(his) {
    if (his.length < 3) return { next: null, type: null, power: 0 };
    const s = his.slice(-10).join('');
    const L = his[his.length - 1];
    const R = (n, t, p) => ({ next: n, type: t, power: p });
    if (his.length >= 6 && new Set(his.slice(-6)).size === 1) return R(L === 'T' ? 'X' : 'T', 'ĐỔI BỆT DÀI', 14.8);
    if (his.length >= 4 && new Set(his.slice(-4)).size === 1) return R(L, 'BỆT', 12.6);
    let alt = true;
    for (let i = 0; i < s.length - 1; i++) if (s[i] === s[i + 1]) alt = false;
    if (s.length >= 5 && alt) return R(L === 'T' ? 'X' : 'T', '1‑1', 11.9);
    if (s.length >= 6 && s.slice(0, 3) === s.slice(3, 6)) return R(s[2], '3 NHỊP', 10.6);
    if (s.length >= 8 && s.slice(0, 4) === s.slice(4, 8)) return R(s[3], '4 NHỊP', 11.3);
    if (his.length >= 5) {
        const h = his.slice(-5);
        if (new Set(h.slice(0, 4)).size === 1 && h[4] !== h[3]) return R(h[4], 'BẺ MẠNH', 13.3);
        if (new Set(h.slice(0, 3)).size === 1 && h[3] !== h[2] && h[4] === h[3]) return R(h[4], 'BẺ', 9.9);
    }
    if (s.length >= 8) {
        let d = 0;
        for (let i = 1; i < s.length; i++) if (s[i] !== s[i - 1]) d++;
        if (d >= 4 && d <= 6) return R(L === 'T' ? 'X' : 'T', 'ĐẢO', 8.9);
    }
    const t6 = his.slice(-6).filter(x => x === 'T').length;
    if (t6 >= 5) return R('T', 'NGHIỆN TÀI', 9.6);
    if (6 - t6 >= 5) return R('X', 'NGHIỆN XỈU', 9.6);
    if (t6 >= 4) return R('T', 'NHỊP NGHIỆN', 7.3);
    if (6 - t6 >= 4) return R('X', 'NHỊP NGHIỆN', 7.3);
    const t3 = his.slice(-3).filter(x => x === 'T').length;
    return R(t3 >= 2 ? 'T' : 'X', 'TỔNG HỢP', 5.6);
}

// ============================================
// LỚP MD5Analyzer - COPY 100% TỪ HTML
// ============================================

class MD5Analyzer {
    constructor() {
        this.stats = {
            energy: 0, moduloScore: 0, entropy: 0, mirrorScore: 0,
            stdDev: 0, freqScore: 0, crossScore: 0, fiboScore: 0, bitScore: 0,
            deepScore: 0, confLevel: 0, shannon: 0, blockBalance: 0
        };
        this.POS_W = [
            2.6180, 1.9130, 2.3820, 1.6180, 2.1416, 1.8541, 2.0000, 1.7321,
            2.4142, 1.5708, 2.2361, 1.8478, 1.9870, 2.1180, 1.7725, 2.5465,
            2.5465, 1.7725, 2.1180, 1.9870, 1.8478, 2.2361, 1.5708, 2.4142,
            1.7321, 2.0000, 1.8541, 2.1416, 1.6180, 2.3820, 1.9130, 2.6180
        ];
        this.VAL_W = [0.618, 0.827, 1.051, 1.236, 1.414, 1.618, 1.732, 1.847,
            1.847, 1.732, 1.618, 1.414, 1.236, 1.051, 0.827, 0.618];
        this.MID_E = 240;
        this.MID_EW = 462.48;
        this.PHI = 1.618033988749895;
        this.historyCau = [];
    }

    validate(md5) { return /^[a-f0-9]{32}$/i.test(md5); }

    analyze(md5) {
        md5 = md5.toLowerCase();
        const H = new Uint8Array(32);
        const W = new Float64Array(32);
        for (let i = 0; i < 32; i++) { H[i] = parseInt(md5[i], 16); W[i] = H[i] * this.POS_W[i]; }

        let tai = 0, xiu = 0;

        const E = H.reduce((a, b) => a + b, 0);
        const EW = W.reduce((a, b) => a + b, 0);
        this.stats.energy = E;
        const dE = E - this.MID_E, dEW = EW - this.MID_EW;
        const eGain = Math.min(15, Math.abs(dEW) / 17.8 + Math.abs(dE) / 6.88);
        dEW >= 0 ? tai += eGain : xiu += eGain;

        let big = 0, sm = 0, ev = 0, od = 0, bw = 0, sw = 0, ew2 = 0, ow = 0;
        for (let i = 0; i < 32; i++) {
            const v = H[i], w = this.POS_W[i];
            if (v >= 8) { big++; bw += w; } else { sm++; sw += w; }
            if ((v & 1) === 0) { ev++; ew2 += w; } else { od++; ow += w; }
        }
        tai += (bw - sw) * 0.60 + (big - 16) * 0.36 + (ow - ew2) * 0.46 + (od - 16) * 0.30;
        xiu += (sw - bw) * 0.60 + (sm - 16) * 0.36 + (ew2 - ow) * 0.46 + (ev - 16) * 0.30;

        for (let i = 0; i < 32; i++) {
            if (H[i] === 0) xiu += this.POS_W[i] * 0.35;
            else if (H[i] === 15) tai += this.POS_W[i] * 0.35;
        }

        const MOD = [3, 5, 7, 11, 13, 17, 19], WMOD = [1.854, 2.357, 3.1416, 4.256, 5.512, 6.1804, 6.8541];
        let mScore = 0;
        MOD.forEach((m, i) => {
            const r = E % m, mid = (m - 1) / 2;
            mScore += r + (EW % m);
            const k = WMOD[i] * (0.62 + Math.abs(r - mid) / m);
            r >= mid ? tai += k : xiu += k;
        });
        this.stats.moduloScore = Math.round(mScore);

        const B = BigInt('0x' + md5).toString(2).padStart(128, '0');
        const C1 = (B.match(/1/g) || []).length, C0 = 128 - C1;
        this.stats.entropy = Math.round(Math.abs(C1 - 64) / 64 * 100);
        const Hb = C1 && C0 ? -(C1 / 128 * Math.log2(C1 / 128) + C0 / 128 * Math.log2(C0 / 128)) : 0;
        this.stats.bitScore = +Hb.toFixed(4);
        const be = 6.854 * (1 + Math.abs(C1 - 64) / 64) + (Hb - 0.92) * 12.5;
        C1 >= 64 ? tai += be : xiu += be;
        for (let k = 0; k < 128; k += 8) {
            const c = (B.slice(k, k + 8).match(/1/g) || []).length;
            if (c >= 5) tai += 0.62;
            else if (c <= 3) xiu += 0.62;
        }

        let streak = 1, maxS = 1, sumS = 0, cntS = 0;
        for (let i = 1; i < 32; i++) {
            if (md5[i] === md5[i - 1]) { streak++; if (streak > maxS) maxS = streak; }
            else { if (streak >= 2) { sumS += streak; cntS++; } streak = 1; }
        }
        if (streak >= 2) { sumS += streak; cntS++; }
        if (maxS >= 5) tai += maxS * 3.090 + cntS * 1.25;
        else if (maxS === 4) tai += maxS * 2.618 + cntS * 1.10;
        else if (maxS === 3) tai += maxS * 2.142 + cntS * 0.90;
        else if (maxS === 2) xiu += 3.330 + Math.max(0, (6 - cntS)) * 0.72;
        else xiu += 5.650;

        let mir = 0, mm = 0;
        for (let i = 0; i < 16; i++) {
            const d = Math.abs(H[i] - H[31 - i]);
            mir += d * (this.POS_W[i] + this.POS_W[31 - i]) / 2;
            if (d === 0) mm++;
            else if (d <= 2) tai += 0.39;
            else xiu += 0.39;
        }
        this.stats.mirrorScore = Math.round(mir);
        if (mir > 93.5) tai += 8.05 + mm * 0.95;
        else if (mir < 71.5) xiu += 8.05 + (8 - mm) * 0.95;
        else mm >= 3 ? tai += 4.30 : xiu += 4.30;

        let A = 0, Bl = 0, C = 0, D = 0, mtx = 0;
        for (let i = 0; i < 8; i++) {
            A += H[i]; Bl += H[i + 8]; C += H[i + 16]; D += H[i + 24];
            mtx ^= Math.round(H[i] * H[i + 8] * this.POS_W[i] - H[i + 16] * H[i + 24] * this.POS_W[i + 16]);
        }
        const bBal = Math.abs((A + D) - (Bl + C));
        this.stats.blockBalance = +bBal.toFixed(2);
        mtx >= 0 ? tai += 8.35 + bBal * 0.085 : xiu += 8.35 + bBal * 0.085;
        const blk = [A, Bl, C, D], bMax = Math.max(...blk), bMin = Math.min(...blk);
        (bMax - bMin) >= 10 ? xiu += 2.618 : tai += 2.618;

        const cnt = {};
        for (let i = 0; i < 32; i++) cnt[md5[i]] = (cnt[md5[i]] || 0) + 1;
        let S = 0, dev = 0;
        for (const k in cnt) { const p = cnt[k] / 32; S -= p * Math.log2(p); dev = Math.max(dev, Math.abs(cnt[k] - 2)); }
        const U = Object.keys(cnt).length;
        this.stats.shannon = +S.toFixed(4);
        this.stats.freqScore = +S.toFixed(3);
        if (S > 3.58) tai += S * 2.18 + (U - 12) * 0.58;
        else if (S < 3.22) xiu += (4.0 - S) * 2.65 + (16 - U) * 0.58;
        else U >= 14 ? tai += 4.95 : xiu += 4.95;
        dev >= 4 ? xiu += 1.8 : tai += 1.8;

        let hs = 0, sq = 0;
        H.forEach(v => { hs += 1 / Math.max(1, v); sq += v * v; });
        const HM = 32 / hs, RMS = Math.sqrt(sq / 32), AVG = E / 32;
        const SD = Math.sqrt(sq / 32 - AVG * AVG);
        this.stats.stdDev = +SD.toFixed(4);
        HM > 5.65 ? tai += HM * 1.33 : xiu += (10.0 - HM) * 1.33;
        RMS > 8.02 ? tai += 3.65 : xiu += 3.65;
        SD > 4.58 ? xiu += 3.28 : tai += 3.28;

        const FIB = [0, 1, 1, 2, 3, 5, 8, 13]; let fs = 0;
        for (let i = 0; i < 8; i++) fs += Math.abs(H[i] - FIB[i]) + Math.abs(H[24 + i] - FIB[7 - i]);
        this.stats.fiboScore = Math.round(fs);
        const phiScore = (H[0] * H[15] + H[7] * H[8]) / Math.max(1, H[31] + H[16]);
        ((phiScore > this.PHI * 10) || (phiScore > this.PHI && phiScore < this.PHI * 2)) ? tai += 5.92 : xiu += 5.92;
        fs < 44 ? tai += 4.28 : xiu += 4.28;

        let cr = 0, co = 0;
        for (let i = 0; i < 31; i++) cr += H[i] * H[i + 1];
        for (let i = 0; i < 16; i++) co += H[i] * H[i + 16];
        this.stats.crossScore = Math.round(cr / 100);
        const CR_MID = 15 * 16 * 31 / 2;
        cr > CR_MID ? tai += 5.68 : xiu += 5.68;
        co > 1920 ? tai += 4.88 : xiu += 4.88;

        const d1 = 1 - Math.min(1, Math.abs(E - 240) / 120);
        const d2 = Hb;
        const d3 = Math.min(1, S / 4);
        const d4 = 1 - Math.min(1, Math.abs(mir - 82) / 60);
        const d5 = 1 - Math.min(1, (bMax - bMin) / 30);
        const d6 = 1 - Math.min(1, Math.abs(C1 - 64) / 64);
        const d7 = mm / 8;
        const d8 = 1 - Math.min(1, (16 - U) / 12);
        const d9 = 1 - Math.min(1, Math.abs(SD - 4.47) / 4);
        const DS = (d1 * 12 + d2 * 14 + d3 * 13 + d4 * 10 + d5 * 9 + d6 * 12 + d7 * 11 + d8 * 10 + d9 * 9) * 100 / 100;
        this.stats.deepScore = +Math.max(0, Math.min(100, DS)).toFixed(2);

        const delta = tai - xiu;
        const K = 4.82;
        const bal = 1 / (1 + Math.exp(-delta / K));
        tai = tai * bal;
        xiu = xiu * (1 - bal);

        const T = tai + xiu;
        let tPct = Math.round((tai / T) * 1000) / 10;
        let xPct = Math.round((1000 - tPct * 10)) / 10;
        if (tPct === 50.0) { tPct = 51.0; xPct = 49.0; }

        this.stats.confLevel = +Math.min(99.5, Math.abs(delta) * 1.82 + 48 + this.stats.deepScore * 0.12).toFixed(1);

        return { tai: tPct, xiu: xPct, suggestion: tPct > xPct ? "TÀI" : "XỈU" };
    }

    getStats() { return this.stats; }
}

// ============================================
// CLASS VIP PREDICTOR - COPY TỪ HTML
// ============================================

class VipPredictor {
    static enhance(tai, xiu, stats = {}) {
        const c = stats.confLevel || 70;
        const d = stats.deepScore || 50;
        const boost = ((c - 50) / 55) * 3.88 * (0.65 + d / 100 * 0.7);
        if (tai > xiu) { tai += boost; xiu -= boost * 0.925; }
        else { xiu += boost; tai -= boost * 0.925; }
        const T = tai + xiu;
        return {
            tai: Math.max(1.0, (tai / T * 100).toFixed(1)),
            xiu: Math.max(1.0, (xiu / T * 100).toFixed(1))
        };
    }
}

// ============================================
// GHI ĐÈ PHÂN TÍCH - COPY TỪ HTML
// ============================================

const __BAK = MD5Analyzer.prototype.analyze;
MD5Analyzer.prototype.analyze = function (md5) {
    let res = __BAK.call(this, md5);
    const st = this.stats;
    const cl = md5.toLowerCase();
    const bn = BigInt('0x' + cl);
    let px = Number(bn % 100n), pt = 100 - px;
    const ent = hex_entropy_py(cl);
    const dp = py_deep_score(cl);
    const df = Math.abs(pt - px);
    const bal = 100 - Math.abs(50 - px) * 2;
    const rb = Math.max(0, (ent - 3.5) * 18.5);
    const ai = Math.min(99.5, df * 1.46 + bal * 0.56 + rb + dp * 0.36);
    const py = pt > px ? 'TÀI' : 'XỈU';
    const cau = py_detect_cau(packageManager.historyCau);

    let tw = res.tai, xw = res.xiu, cf = ai / 100;
    if (py === 'TÀI') { tw += ai / 4.15 * cf; xw -= ai / 4.55 * cf; }
    else { xw += ai / 4.15 * cf; tw -= ai / 4.55 * cf; }
    if (cau.next) {
        const pw = cau.power * (0.76 + (st.deepScore || 50) / 100 * 0.52);
        cau.next === 'T' ? (tw += pw * cf, xw -= pw * 0.925 * cf)
            : (xw += pw * cf, tw -= pw * 0.925 * cf);
        res.cauType = cau.type;
    } else res.cauType = 'KHÔNG RÕ';

    res.deepScore = +dp.toFixed(2);
    res.aiConf = +ai.toFixed(2);
    const tot = tw + xw;
    res.tai = Math.max(1, Math.min(99, +(tw / tot * 100).toFixed(1)));
    res.xiu = +(100 - res.tai).toFixed(1);
    res.suggestion = res.tai > res.xiu ? 'TÀI' : 'XỈU';

    packageManager.historyCau.push(res.suggestion === 'TÀI' ? 'T' : 'X');
    if (packageManager.historyCau.length > 25) packageManager.historyCau.shift();
    return res;
};

// ============================================
// FORMAT KẾT QUẢ
// ============================================

function formatResult(result) {
    const icon = result.suggestion === 'XỈU' ? '🔵' : '🔴';
    const level = result.aiConf >= 70 ? '🟢 Cao' :
        result.aiConf >= 50 ? '🟡 Trung bình' : '🟠 Thấp';

    const now = new Date().toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    return `
📊 *KẾT QUẢ PHÂN TÍCH*
━━━━━━━━━━━━━━━━━━━━━
🔐 *Loại:* MD5 32
━━━━━━━━━━━━━━━━━━━━━
${icon} *DỰ ĐOÁN:* **${result.suggestion}**
📊 *Độ tin cậy:* ${result.aiConf}% (${level})
━━━━━━━━━━━━━━━━━━━━━
📈 *CHI TIẾT:*
• Tài: ${result.tai}%
• Xỉu: ${result.xiu}%
• Deep Score: ${result.deepScore}
• Pattern: ${result.cauType || '—'}
━━━━━━━━━━━━━━━━━━━━━
🕐 ${now}
    `.trim();
}

// ============================================
// FORMAT VIP
// ============================================

function formatVipMessage(userId, hasAccess) {
    const now = new Date().toLocaleString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });

    if (hasAccess) {
        const info = packageManager.getUserInfo(userId);
        const packageInfo = packageManager.getPackageInfo(info.package);
        const emoji = packageInfo ? packageInfo.emoji : '⭐';

        return `
🔐 *MD5/SHA256 VIP AI PRO*
━━━━━━━━━━━━━━━━━━━━━━━
✅ *VIP ĐANG HOẠT ĐỘNG*

${emoji} *Gói:* ${info.package}
⏰ *Hết hạn:* ${info.expiry}
📝 *Số lần mua:* ${info.payments}

━━━━━━━━━━━━━━━━━━━━━━━
📌 *CÁCH SỬ DỤNG:*
• Gửi MD5 (32 ký tự) → tự động phân tích
• Thuật toán 6 lớp AI phân tích
━━━━━━━━━━━━━━━━━━━━━━━
🕐 ${now}
        `.trim();
    } else {
        return `
🔐 *MD5/SHA256 VIP AI PRO*
━━━━━━━━━━━━━━━━━━━━━━━
⚠️ *BẠN CHƯA CÓ VIP!*

🧠 *Thuật toán:* 6 lớp phân tích
📊 *Entropy • Bit • Mirror*
⚡ *Modulo • Deep Score • Pattern*
🎯 *Nhận diện cầu AI*

━━━━━━━━━━━━━━━━━━━━━━━
💎 *NÂNG CẤP VIP NGAY:*

🌟 1 Ngày → 20,000đ
🔥 3 Ngày → 45,000đ
💎 7 Ngày → 70,000đ
👑 1 Tháng → 130,000đ

━━━━━━━━━━━━━━━━━━━━━━━
👇 *CHỌN GÓI BÊN DƯỚI*
🕐 ${now}
        `.trim();
    }
}

// ============================================
// BOT TELEGRAM
// ============================================

const analyzer = new MD5Analyzer();

// Lệnh /start
bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const hasAccess = packageManager.checkUserAccess(userId);
    const vipMessage = formatVipMessage(userId, hasAccess);

    const keyboard = {
        inline_keyboard: hasAccess ? [
            [{ text: '💰 GIA HẠN VIP', callback_data: 'buy_package' }]
        ] : [
            [
                { text: '🌟 1 Ngày - 20,000đ', callback_data: 'buy_1day' },
                { text: '🔥 3 Ngày - 45,000đ', callback_data: 'buy_3day' }
            ],
            [
                { text: '💎 7 Ngày - 70,000đ', callback_data: 'buy_7day' },
                { text: '👑 1 Tháng - 130,000đ', callback_data: 'buy_1month' }
            ]
        ]
    };

    await bot.sendMessage(chatId, vipMessage, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
    });
});

// Lệnh /admin
bot.onText(/\/admin/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);

    if (userId !== adminId) {
        await bot.sendMessage(chatId, '❌ *Bạn không có quyền admin!*', { parse_mode: 'Markdown' });
        return;
    }

    const pending = packageManager.getAllPending();

    if (pending.length === 0) {
        await bot.sendMessage(chatId, '📋 *Không có giao dịch nào đang chờ duyệt.*', { parse_mode: 'Markdown' });
        return;
    }

    for (const payment of pending) {
        const text = `
📋 *GIAO DỊCH CHỜ DUYỆT*
━━━━━━━━━━━━━━━━━━━━━
🆔 Mã GD: \`${payment.transactionId}\`
👤 User: \`${payment.userId}\`
📦 Gói: ${payment.packageName}
💰 Số tiền: ${payment.amount.toLocaleString()}đ
📝 Bill: ${payment.billInfo || 'Chưa có bill'}
━━━━━━━━━━━━━━━━━━━━━
        `.trim();

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '✅ DUYỆT', callback_data: `approve_${payment.transactionId}` },
                    { text: '❌ TỪ CHỐI', callback_data: `reject_${payment.transactionId}` }
                ]
            ]
        };

        await bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }
});

// Xử lý tin nhắn thường
bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const text = msg.text;

    if (!text) return;
    if (text.startsWith('/')) return;

    // ✅ KIỂM TRA ĐANG CHỜ GỬI BILL
    if (global.awaitingBill && global.awaitingBill[userId]) {
        const txId = global.awaitingBill[userId];
        const payment = packageManager.getPendingPayment(txId);
        
        if (!payment || payment.status !== 'pending') {
            await bot.sendMessage(chatId, `
❌ *GIAO DỊCH KHÔNG HỢP LỆ HOẶC ĐÃ XỬ LÝ!*

Vui lòng tạo giao dịch mới.
Nhấn /start để bắt đầu.
            `.trim(), { parse_mode: 'Markdown' });
            delete global.awaitingBill[userId];
            return;
        }

        // Lưu bill
        if (packageManager.submitBill(userId, txId, text)) {
            await bot.sendMessage(chatId, `
✅ *ĐÃ GỬI BILL THÀNH CÔNG!*

⏳ Vui lòng chờ admin duyệt.
Admin sẽ xác nhận trong thời gian sớm nhất.
            `.trim(), { parse_mode: 'Markdown' });

            // Gửi cho admin
            const adminText = `
📋 *BILL MỚI CẦN DUYỆT*
━━━━━━━━━━━━━━━━━━━━━
🆔 Mã GD: \`${txId}\`
👤 User: \`${userId}\`
📦 Gói: ${payment.packageName}
💰 Số tiền: ${payment.amount.toLocaleString()}đ
📝 Nội dung: ${text}
━━━━━━━━━━━━━━━━━━━━━
            `.trim();

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ DUYỆT', callback_data: `approve_${txId}` },
                        { text: '❌ TỪ CHỐI', callback_data: `reject_${txId}` }
                    ]
                ]
            };

            await bot.sendMessage(adminId, adminText, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

            delete global.awaitingBill[userId];
            return;
        }
    }

    // Kiểm tra quyền
    if (!packageManager.checkUserAccess(userId)) {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🌟 1 Ngày - 20,000đ', callback_data: 'buy_1day' },
                    { text: '🔥 3 Ngày - 45,000đ', callback_data: 'buy_3day' }
                ],
                [
                    { text: '💎 7 Ngày - 70,000đ', callback_data: 'buy_7day' },
                    { text: '👑 1 Tháng - 130,000đ', callback_data: 'buy_1month' }
                ]
            ]
        };

        await bot.sendMessage(chatId, `
⚠️ *BẠN CHƯA CÓ QUYỀN SỬ DỤNG!*

💎 Vui lòng mua VIP để sử dụng bot.
👇 Chọn gói bên dưới:
        `.trim(), {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        return;
    }

    // Phân tích MD5
    if (text.length === 32 && /^[0-9a-fA-F]+$/.test(text)) {
        const result = analyzer.analyze(text);
        const formatted = formatResult(result);
        await bot.sendMessage(chatId, formatted, { parse_mode: 'Markdown' });
    } else {
        await bot.sendMessage(chatId, `
❌ *KHÔNG NHẬN DIỆN ĐƯỢC HASH!*

Vui lòng gửi MD5 (32 ký tự hex)

Ví dụ:
\`5d41402abc4b2a76b9719d911017c592\`
        `.trim(), { parse_mode: 'Markdown' });
    }
});

// Xử lý callback
bot.on('callback_query', async (callbackQuery) => {
    const chatId = callbackQuery.message.chat.id;
    const userId = callbackQuery.from.id;
    const data = callbackQuery.data;

    await bot.answerCallbackQuery(callbackQuery.id);

    // Admin duyệt/từ chối
    if (data.startsWith('approve_') || data.startsWith('reject_')) {
        const userIdStr = String(userId);
        if (userIdStr !== adminId) {
            await bot.sendMessage(chatId, '❌ *Bạn không có quyền admin!*', { parse_mode: 'Markdown' });
            return;
        }

        const [action, txId] = data.split('_');
        
        // Kiểm tra giao dịch tồn tại
        const payment = packageManager.getPendingPayment(txId);
        if (!payment) {
            await bot.editMessageText(`
❌ *GIAO DỊCH KHÔNG TỒN TẠI HOẶC ĐÃ XỬ LÝ!*
━━━━━━━━━━━━━━━━━━━━━
Mã GD: \`${txId}\`
            `.trim(), {
                chat_id: chatId,
                message_id: callbackQuery.message.message_id,
                parse_mode: 'Markdown'
            });
            return;
        }

        if (action === 'approve') {
            if (packageManager.approvePayment(txId)) {
                await bot.editMessageText(`
✅ *ĐÃ DUYỆT GIAO DỊCH!*
━━━━━━━━━━━━━━━━━━━━━
🆔 Mã GD: \`${txId}\`
👤 User: \`${payment.userId}\`
📦 Gói: ${payment.packageName}
💰 Số tiền: ${payment.amount.toLocaleString()}đ
━━━━━━━━━━━━━━━━━━━━━
🎉 Gói VIP đã được kích hoạt!
                `.trim(), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown'
                });

                const packageInfo = packageManager.getPackageInfo(payment.packageId);
                const expiryDate = new Date(Date.now() + packageInfo.duration * 24 * 60 * 60 * 1000);

                await bot.sendMessage(payment.userId, `
🎉 *CHÚC MỪNG!*
━━━━━━━━━━━━━━━━━━━━━
Gói VIP của bạn đã được kích hoạt!

${packageInfo.emoji} *${packageInfo.name}*
⏰ Hết hạn: ${expiryDate.toLocaleString('vi-VN')}

Nhấn /start để bắt đầu phân tích.
                `.trim(), { parse_mode: 'Markdown' });
            }
        } else if (action === 'reject') {
            if (packageManager.rejectPayment(txId)) {
                await bot.editMessageText(`
❌ *ĐÃ TỪ CHỐI GIAO DỊCH!*
━━━━━━━━━━━━━━━━━━━━━
🆔 Mã GD: \`${txId}\`
👤 User: \`${payment.userId}\`
📦 Gói: ${payment.packageName}
💰 Số tiền: ${payment.amount.toLocaleString()}đ
━━━━━━━━━━━━━━━━━━━━━
⚠️ Giao dịch đã bị từ chối.
                `.trim(), {
                    chat_id: chatId,
                    message_id: callbackQuery.message.message_id,
                    parse_mode: 'Markdown'
                });

                await bot.sendMessage(payment.userId, `
❌ *GIAO DỊCH BỊ TỪ CHỐI!*

Vui lòng kiểm tra lại thông tin và thử lại.
Nhấn /start để mua lại VIP.
                `.trim(), { parse_mode: 'Markdown' });
            }
        }
        return;
    }

    // Mua gói
    if (data.startsWith('buy_')) {
        const packageId = data.replace('buy_', '');
        const packageInfo = packageManager.getPackageInfo(packageId);

        if (!packageInfo) {
            await bot.sendMessage(chatId, '❌ Gói không tồn tại!');
            return;
        }

        const payment = packageManager.createPayment(userId, packageId);
        if (!payment) {
            await bot.sendMessage(chatId, '❌ Lỗi tạo giao dịch!');
            return;
        }

        const qrData = `BVBank - TRINH ANH PHONG - 99ZP25271M36143372 - ${payment.transactionId}`;
        const qrBuffer = await generateQR(qrData);

        const text = `
💳 *THANH TOÁN VIP*
━━━━━━━━━━━━━━━━━━━━━
${packageInfo.emoji} *Gói:* ${packageInfo.name}
💰 *Số tiền:* ${packageInfo.price.toLocaleString()}đ
⏰ *Thời hạn:* ${packageInfo.duration} ngày
🆔 *Mã GD:* \`${payment.transactionId}\`

━━━━━━━━━━━━━━━━━━━━━
*THÔNG TIN CHUYỂN KHOẢN*
🏦 Ngân hàng: BVBank
👤 Chủ TK: TRINH ANH PHONG
🔢 Số TK: \`99ZP25271M36143372\`
💳 ZaloPay: *TRINH ANH PHONG*

📝 *Nội dung CK:* \`${payment.transactionId}\`
━━━━━━━━━━━━━━━━━━━━━
⬇️ *QR CODE BÊN DƯỚI*
        `.trim();

        const keyboard = {
            inline_keyboard: [
                [{ text: '✅ ĐÃ CHUYỂN KHOẢN', callback_data: `paid_${payment.transactionId}` }],
                [{ text: '🔙 QUAY LẠI', callback_data: 'back_to_start' }]
            ]
        };

        if (qrBuffer) {
            await bot.sendPhoto(chatId, qrBuffer, {
                caption: text,
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } else {
            await bot.sendMessage(chatId, text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
        return;
    }

    // Đã chuyển khoản
    if (data.startsWith('paid_')) {
        const txId = data.replace('paid_', '');
        
        // Kiểm tra giao dịch tồn tại
        const payment = packageManager.getPendingPayment(txId);
        if (!payment || payment.status !== 'pending') {
            await bot.sendMessage(chatId, `
❌ *GIAO DỊCH KHÔNG HỢP LỆ!*

Vui lòng tạo giao dịch mới.
Nhấn /start để bắt đầu.
            `.trim(), { parse_mode: 'Markdown' });
            return;
        }

        if (!global.awaitingBill) global.awaitingBill = {};
        global.awaitingBill[userId] = txId;

        await bot.sendMessage(chatId, `
📤 *GỬI BILL THANH TOÁN*

Vui lòng gửi ảnh bill hoặc nội dung chuyển khoản:
• Ảnh chụp màn hình chuyển khoản
• Hoặc mã giao dịch + số tiền

⚠️ *Lưu ý:* Gửi đúng bill để admin duyệt nhanh nhất!
        `.trim(), { parse_mode: 'Markdown' });
        return;
    }

    // Quay lại
    if (data === 'back_to_start') {
        const hasAccess = packageManager.checkUserAccess(userId);
        const vipMessage = formatVipMessage(userId, hasAccess);

        const keyboard = {
            inline_keyboard: hasAccess ? [
                [{ text: '💰 GIA HẠN VIP', callback_data: 'buy_package' }]
            ] : [
                [
                    { text: '🌟 1 Ngày - 20,000đ', callback_data: 'buy_1day' },
                    { text: '🔥 3 Ngày - 45,000đ', callback_data: 'buy_3day' }
                ],
                [
                    { text: '💎 7 Ngày - 70,000đ', callback_data: 'buy_7day' },
                    { text: '👑 1 Tháng - 130,000đ', callback_data: 'buy_1month' }
                ]
            ]
        };

        await bot.editMessageText(vipMessage, {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        return;
    }

    // Mua package từ menu
    if (data === 'buy_package') {
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🌟 1 Ngày - 20,000đ', callback_data: 'buy_1day' },
                    { text: '🔥 3 Ngày - 45,000đ', callback_data: 'buy_3day' }
                ],
                [
                    { text: '💎 7 Ngày - 70,000đ', callback_data: 'buy_7day' },
                    { text: '👑 1 Tháng - 130,000đ', callback_data: 'buy_1month' }
                ],
                [{ text: '🔙 QUAY LẠI', callback_data: 'back_to_start' }]
            ]
        };

        await bot.editMessageText(`
💰 *CHỌN GÓI VIP*

Chọn gói phù hợp với nhu cầu của bạn:
━━━━━━━━━━━━━━━━━━━━━
🌟 1 Ngày → 20,000đ
🔥 3 Ngày → 45,000đ
💎 7 Ngày → 70,000đ
👑 1 Tháng → 130,000đ
━━━━━━━━━━━━━━━━━━━━━
        `.trim(), {
            chat_id: chatId,
            message_id: callbackQuery.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        return;
    }
});

// ============================================
// EXPRESS SERVER
// ============================================

app.get('/', (req, res) => {
    res.json({
        status: 'running',
        bot: 'MD5 Telegram Bot',
        version: '1.0.0',
        time: new Date().toISOString()
    });
});

app.get('/api/stats', (req, res) => {
    const users = Object.keys(packageManager.users).length;
    const pending = packageManager.getAllPending().length;
    res.json({
        users,
        pending,
        totalPayments: Object.values(packageManager.users).reduce((sum, u) => sum + u.payments.length, 0)
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🤖 Bot is active!`);
});

// ============================================
// XỬ LÝ LỖI
// ============================================

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
});

console.log('✅ MD5 Telegram Bot started!');
