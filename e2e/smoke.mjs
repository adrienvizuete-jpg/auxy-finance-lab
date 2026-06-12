/**
 * Auxy Finance Lab — test E2E smoke (puppeteer-core)
 *
 * Vérifie les parcours critiques dans un vrai Chrome headless :
 *   1. Dashboard : l'app démarre, les KPI s'affichent, zéro erreur console
 *   2. Crédit : une simulation par défaut produit un panneau de résultats
 *   3. Covenants : le tableau DSCR/levier est calculé au chargement
 *   4. Profil de dette : tableau de variation + graphiques rendus
 *
 * Aucune dépendance serveur : un serveur statique node intégré sert le repo.
 * Chrome est résolu via $CHROME_PATH, sinon les emplacements standards.
 *
 * Usage : node e2e/smoke.mjs
 */

import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

// ---------- Résolution de Chrome ----------

const CHROME_CANDIDATES = [
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium'
].filter(Boolean);

const chromePath = CHROME_CANDIDATES.find(p => existsSync(p));
if (!chromePath) {
    console.error('✗ Chrome introuvable. Définir CHROME_PATH.');
    process.exit(1);
}

// ---------- Serveur statique ----------

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2'
};

function startServer() {
    return new Promise(resolve => {
        const server = http.createServer((req, res) => {
            const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
            const filePath = normalize(join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
            if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
            if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
                res.writeHead(404); res.end('not found'); return;
            }
            res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
            createReadStream(filePath).pipe(res);
        });
        server.listen(0, '127.0.0.1', () => resolve(server));
    });
}

// ---------- Scénarios ----------

const failures = [];
const consoleErrors = [];

function check(label, ok, detail = '') {
    if (ok) {
        console.log(`  ✓ ${label}`);
    } else {
        console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
        failures.push(label);
    }
}

async function navByClick(page, target) {
    await page.click(`.nav-item[data-page="${target}"]`);
    await page.waitForFunction(
        t => location.hash === `#${t}`,
        { timeout: 5000 },
        target
    );
}

async function run() {
    const server = await startServer();
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}/index.html`;

    const browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-dev-shm-usage']
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1440, height: 900 });

        page.on('pageerror', err => consoleErrors.push(`pageerror: ${err.message}`));
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(`console: ${msg.text()}`);
        });

        // --- 1. Dashboard ---
        console.log('Parcours 1 : Dashboard');
        await page.goto(`${baseUrl}#dashboard`, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForSelector('.kpi-card', { timeout: 10000 });
        const kpiCount = await page.$$eval('.kpi-card', els => els.length);
        check('KPI cards affichées', kpiCount >= 4, `${kpiCount} trouvées`);

        // --- 2. Crédit : simulation par défaut ---
        console.log('Parcours 2 : Simulateur de crédit');
        await navByClick(page, 'credit');
        await page.waitForSelector('#credit-form button[type="submit"]', { timeout: 10000 });
        await page.click('#credit-form button[type="submit"]');
        await page.waitForSelector('#credit-results .results-panel', { timeout: 10000 });
        const hasAmount = await page.$eval('#credit-results', el => /€/.test(el.textContent || ''));
        check('Résultats de simulation rendus (montants €)', hasAmount);

        // --- 3. Covenants : calcul au chargement ---
        console.log('Parcours 3 : Covenants & DSCR');
        await navByClick(page, 'covenants');
        await page.waitForSelector('#cov-results-table tbody tr, #cov-results-table tr', { timeout: 10000 });
        const covRows = await page.$$eval('#cov-results-table tr', els => els.length);
        check('Tableau covenants calculé', covRows >= 2, `${covRows} lignes`);

        // --- 4. Profil de dette : variation + graphiques ---
        console.log('Parcours 4 : Profil de dette');
        await navByClick(page, 'debtprofile');
        await page.waitForSelector('#dp-variation-table', { timeout: 10000 });
        const dpOk = await page.evaluate(() => {
            const table = document.getElementById('dp-variation-table');
            const canvases = document.querySelectorAll('#page-container canvas');
            return { rows: table ? table.querySelectorAll('tr').length : 0, canvases: canvases.length };
        });
        check('Tableau de variation d\'endettement rempli', dpOk.rows >= 2, `${dpOk.rows} lignes`);
        check('Graphiques (canvas) présents', dpOk.canvases >= 2, `${dpOk.canvases} canvas`);

        // --- 5. Service worker : installation + flux de mise à jour ---
        console.log('Parcours 5 : Service worker (install + bandeau de mise à jour)');
        const swActive = await page.evaluate(async () => {
            if (!('serviceWorker' in navigator)) return 'unsupported';
            await navigator.serviceWorker.ready;
            return 'active';
        });
        check('Service worker installé et actif', swActive === 'active', swActive);

        // Simule une nouvelle version : une URL de SW différente sur le même
        // scope déclenche updatefound → installed → bandeau (même mécanique
        // qu'un sw.js dont le contenu a changé en production).
        await page.evaluate(() => navigator.serviceWorker.register('sw.js?e2e-bump'));
        await page.waitForSelector('#sw-update-banner', { timeout: 10000 });
        check('Bandeau « Nouvelle version disponible » affiché', true);

        const navigationAfterUpdate = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.click('#sw-update-btn');
        await navigationAfterUpdate; // SKIP_WAITING → controllerchange → reload auto
        // La page recharge sur le hash courant (#debtprofile) : on vérifie
        // que l'app re-démarre, quel que soit le module affiché.
        await page.waitForFunction(
            () => document.querySelectorAll('.nav-item').length > 0
                && (document.getElementById('page-container')?.children.length || 0) > 0,
            { timeout: 10000 }
        );
        check('Mise à jour appliquée : reload automatique et app fonctionnelle', true);

        // --- Erreurs console sur tout le parcours ---
        check('Zéro erreur console/page', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' | '));
    } finally {
        await browser.close();
        server.close();
    }
}

run()
    .then(() => {
        if (failures.length) {
            console.error(`\nE2E : ${failures.length} échec(s).`);
            process.exit(1);
        }
        console.log('\nE2E : tous les parcours passent.');
    })
    .catch(err => {
        console.error(`\nE2E : erreur fatale — ${err.message}`);
        process.exit(1);
    });
