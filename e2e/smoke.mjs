/**
 * Auxy Finance Lab — test E2E smoke (puppeteer-core)
 *
 * Vérifie les parcours critiques dans un vrai Chrome headless :
 *   1. Accueil : l'app démarre, parcours et en-tête client affichés, zéro erreur console
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

        // --- 1. Accueil ---
        console.log('Parcours 1 : Accueil');
        await page.goto(`${baseUrl}#dashboard`, { waitUntil: 'networkidle0', timeout: 30000 });
        await page.waitForSelector('.home-mission', { timeout: 10000 });
        const missionCount = await page.$$eval('.home-mission', els => els.length);
        check('Parcours de mission proposés', missionCount >= 4, `${missionCount} trouvés`);
        const quickCount = await page.$$eval('.home-quick-item', els => els.length);
        check('Accès à tous les modules', quickCount >= 8, `${quickCount} trouvés`);
        check('En-tête client affiché', await page.$eval('#context-bar', el => /dossier/i.test(el.textContent || '')));

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

        // --- 4 bis. Bouton Retour du navigateur + titre par page ---
        console.log('Parcours 4 bis : Retour / Suivant du navigateur');
        // historique à ce stade : … → covenants → debtprofile
        await page.goBack();
        await page.waitForFunction(() => location.hash === '#covenants' && !!document.querySelector('#cov-results-table'), { timeout: 5000 }).catch(() => {});
        const back1 = await page.evaluate(() => ({ hash: location.hash, title: document.title }));
        check('Retour : page précédente affichée', back1.hash === '#covenants', back1.hash);
        check('Titre d\'onglet propre au module', /Covenants/.test(back1.title), back1.title);
        await page.goForward();
        await page.waitForFunction(() => location.hash === '#debtprofile', { timeout: 5000 }).catch(() => {});
        check('Suivant : retour sur la page quittée', await page.evaluate(() => location.hash) === '#debtprofile');

        // --- 5. Service worker : installation + flux de mise à jour ---
        // --- 4 ter. Socle commun : champ montant, saisies conservées, parcours ---
        console.log('Parcours 4 ter : champ montant, saisies conservées, parcours de mission');
        await navByClick(page, 'calculator');
        await page.waitForSelector('#calc-wacc-debt[data-amount]', { timeout: 5000 });
        const amount = await page.$eval('#calc-wacc-debt', el => {
            const shown = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.get?.call(el);
            return { shown, value: /** @type {HTMLInputElement} */ (el).value };
        });
        check('Montant affiché formaté, lu en nombre brut', /^3[\s\u00a0\u202f]000[\s\u00a0\u202f]000$/.test(amount.shown || '') && amount.value === '3000000', JSON.stringify(amount));
        await page.$eval('#calc-wacc-debt', el => { /** @type {HTMLInputElement} */ (el).value = '1250000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
        await page.click('#calc-wacc-btn');
        await navByClick(page, 'dashboard');
        await navByClick(page, 'calculator');
        await page.waitForSelector('#calc-wacc-debt[data-amount]', { timeout: 5000 });
        check('Saisie de la Calculatrice conservée au retour', await page.$eval('#calc-wacc-debt', el => /** @type {HTMLInputElement} */ (el).value === '1250000'));
        await navByClick(page, 'dashboard');
        await page.click('.home-mission[data-mission="refi"]');
        await page.waitForFunction(() => location.hash === '#debtprofile', { timeout: 5000 });
        await page.click('#mission-next');
        await page.waitForFunction(() => location.hash === '#credit', { timeout: 5000 });
        check('Parcours : étape Crédit ouverte sur le bon type', await page.$eval('#credit-tabs .tab.active', el => el.getAttribute('data-type') === 'variable'));
        await page.click('#mission-stop');

        // --- 4 quater. Prêt Bpifrance : différé puis échéances constantes ---
        console.log('Parcours 4 quater : prêt Bpifrance');
        await navByClick(page, 'credit');
        await page.click('.credit-family[data-family="mt"]').catch(() => {});
        await page.waitForSelector('#credit-tabs .tab[data-type="bpi"]', { timeout: 5000 });
        await page.click('#credit-tabs .tab[data-type="bpi"]');
        await page.waitForSelector('#cr-bpi-years', { timeout: 5000 });
        await page.click('#credit-form button[type="submit"]');
        await page.waitForSelector('#credit-results .results-panel', { timeout: 10000 });
        const bpi = await page.evaluate(() => ({
            rows: document.querySelectorAll('#amort-table tbody tr').length,
            text: document.querySelector('#credit-results .results-panel')?.textContent || ''
        }));
        check('Bpifrance : phase de différé affichée', /pendant le différé/i.test(bpi.text) && /5 ans/.test(bpi.text), bpi.text.replace(/\s+/g, ' ').slice(0, 120));

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
