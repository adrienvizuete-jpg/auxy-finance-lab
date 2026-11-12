/**
 * Auxy Partners - Export Helpers (PDF & Excel)
 */

import { PARAM_LABELS, RESULT_LABELS, t, excelValue, unitOf } from './i18n.js';
import { Charts } from './charts.js';
import { Dossier } from './dossier.js';

export const Export = {

    /**
     * Export full simulation report to Excel with multiple sheets
     */
    fullReportExcel(simulation) {
        if (typeof XLSX === 'undefined') {
            window.showToast?.('Outils d\u2019export Excel indisponibles (connexion ?) — réessayez', 'error');
            return;
        }

        const wb = XLSX.utils.book_new();

        // Summary sheet
        const summaryData = [
            ['AUXY PARTNERS - Rapport de Simulation'],
            [''],
            ['Type', simulation.typeLabel || simulation.type],
            ['Date', new Date().toLocaleDateString('fr-FR')],
            [''],
        ];

        if (simulation.name) {
            summaryData.push(['Nom', simulation.name]);
        }
        if (simulation.notes) {
            summaryData.push(['Notes', simulation.notes]);
        }

        summaryData.push([''], ['PARAMÈTRES']);

        if (simulation.params) {
            const p = simulation.params;
            Object.entries(p).forEach(([key, value]) => {
                // Skip redundant insurance params
                if (key === 'insuranceMonthly' && p.insuranceRate > 0) return;
                if ((key === 'insuranceRate' || key === 'insuranceMode') && (!p.insuranceRate || p.insuranceRate === 0)) return;
                const label = t(key, PARAM_LABELS);
                // Nombres conservés comme nombres (recalculables dans Excel), unité à part
                summaryData.push([label, excelValue(key, value), unitOf(key, value)]);
            });
        }

        summaryData.push([''], ['RÉSULTATS']);
        if (simulation.results) {
            Object.entries(simulation.results).forEach(([key, value]) => {
                if (typeof value !== 'object' || value === null) {
                    const label = t(key, RESULT_LABELS);
                    summaryData.push([label, excelValue(key, value), unitOf(key, value)]);
                }
            });
        }

        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        summaryWs['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 8 }];
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Résumé');

        // Schedule sheet
        if (simulation.results?.schedule) {
            const schedule = simulation.results.schedule;
            const headerKeys = Object.keys(schedule[0] || {});
            const headerLabels = headerKeys.map(k => {
                const labels = {
                    period: 'Période', payment: 'Mensualité', principal: 'Capital',
                    interest: 'Intérêts', insurance: 'Assurance', balance: 'CRD',
                    cashPayment: 'Paiement Cash', pikInterest: 'Int. PIK',
                    commitmentFee: 'Com. Engagement'
                };
                return labels[k] || k;
            });
            const scheduleData = [headerLabels, ...schedule.map(row => headerKeys.map(h => {
                const v = row[h];
                return typeof v === 'number' ? Math.round(v * 100) / 100 : v;
            }))];
            const scheduleWs = XLSX.utils.aoa_to_sheet(scheduleData);
            scheduleWs['!cols'] = headerLabels.map(() => ({ wch: 16 }));
            XLSX.utils.book_append_sheet(wb, scheduleWs, 'Amortissement');
        }

        XLSX.writeFile(wb, `rapport_${simulation.type}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    /**
     * Texte compatible avec la police standard du PDF (WinAnsi) : les espaces
     * fines de Intl et les symboles hors jeu de caractères (≥, −, →, Δ…)
     * sortaient en caractères parasites ou en lettres espacées.
     */
    _sanitizePdf(str) {
        if (typeof str !== 'string') return str;
        return str
            .replace(/[\u202F\u00A0\u2009\u2007]/g, ' ')
            .replace(/−/g, '-')
            .replace(/≥/g, '>=')
            .replace(/≤/g, '<=')
            .replace(/→/g, '›')
            .replace(/←/g, '‹')
            .replace(/Δ|δ/g, 'Var.')
            .replace(/≈/g, '~')
            .replace(/≠/g, '<>')
            .replace(/[✓✔]/g, 'OK')
            .replace(/[✕✖]/g, 'X')
            // tout autre caractère hors WinAnsi : retiré plutôt que rendu en parasite
            .replace(/[^\t\n\r\u0020-\u00FF\u0152\u0153\u0160\u0161\u0178\u017D\u017E\u2013\u2014\u2018\u2019\u201A\u201C\u201D\u201E\u2020\u2021\u2022\u2026\u2030\u2039\u203A\u20AC\u2122]/g, '');
    },

    // Charte Auxy (celle des Data Packs et des mémos Emplois-Ressources)
    _pdfTheme: {
        navy: [27, 73, 97], teal: [19, 121, 163], copper: [211, 149, 87],
        cream: [247, 236, 221], light: [234, 241, 246], ink: [33, 37, 41],
        grey: [107, 114, 128], rule: [214, 221, 227], white: [255, 255, 255],
        margin: 15, top: 22, bottom: 276
    },

    /** Logo du bandeau PDF (37 Ko), chargé au premier export seulement. @type {string | null} */
    _logo: null,

    /**
     * Génère le PDF. Asynchrone : le logo est chargé à la demande au premier
     * export (il pesait dans le premier affichage de l'outil).
     *
     * opts.cover : { kind?, client?, subtitle?, items?: [{label, value}] } — page de
     *   garde façon Data Pack (toujours présente, sauf opts.cover === false).
     * Sections : title { text, subtitle? } · keyvalue { items } · table { headers,
     *   rows, totalRows?, sectionRows?, highlightRows?, totalFill?, fontSize?, note? } ·
     *   columns { left, right } (deux tableaux côte à côte, chacun { title?, headers,
     *   rows, … }) · kpicards { items } · note { title?, text } · chart { canvasId,
     *   title?, maxHeight? } · separator · pagebreak.
     */
    async toPdf(title, sections, filename = 'simulation', opts = {}) {
        if (!this._logo) {
            try { this._logo = (await import('./logo-data.js')).LOGO_JPEG_BANNER; } catch { /* repli texte « AUXY PARTNERS » */ }
        }
        return this._buildPdf(title, sections, filename, opts);
    },

    /** Page de garde : type de document, client, objet, fiche d'identité, chiffres clés. */
    _drawCover(doc, title, cover) {
        const T = this._pdfTheme;
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const s = v => this._sanitizePdf(String(v));
        const M = 20;

        doc.setFillColor(...T.navy);
        doc.rect(0, 0, W, 58, 'F');
        doc.setFillColor(...T.copper);
        doc.rect(0, 58, W, 1.6, 'F');
        try {
            doc.addImage(this._logo, 'JPEG', M, 17, 66, 23.3);
        } catch {
            doc.setTextColor(...T.white);
            doc.setFontSize(24);
            doc.setFont('helvetica', 'bold');
            doc.text('AUXY PARTNERS', M, 34);
        }

        // « Plan de financement — EMEK GROUP » : le type de document en surtitre, le client en titre
        const [kindFromTitle, clientFromTitle] = String(title).split(/\s+[—–]\s+/);
        const kind = cover.kind || kindFromTitle || title;
        const client = cover.client || clientFromTitle || '';

        let y = 92;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...T.copper);
        doc.text(s(kind).toUpperCase(), M, y, { charSpace: 0.6 });
        y += 14;
        doc.setFontSize(client ? 28 : 24);
        doc.setTextColor(...T.navy);
        const headline = doc.splitTextToSize(s(client || title), W - 2 * M);
        doc.text(headline, M, y);
        y += headline.length * 11;
        if (cover.subtitle && cover.subtitle !== client) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(12);
            doc.setTextColor(...T.grey);
            doc.text(doc.splitTextToSize(s(cover.subtitle), W - 2 * M), M, y);
            y += 9;
        }
        doc.setFillColor(...T.copper);
        doc.rect(M, y, 24, 1.2, 'F');
        y += 16;

        // Fiche d'identité du document
        const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
        const fiche = [
            ...(client ? [['Client', client]] : []),
            ['Objet', kind],
            ['Date d’émission', today],
            ['Cabinet émetteur', 'Auxy Partners'],
            ['Confidentialité', 'Document strictement confidentiel']
        ];
        const row = (label, value, bold = true) => {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            doc.setTextColor(...T.grey);
            doc.text(s(label), M, y);
            doc.setFont('helvetica', bold ? 'bold' : 'normal');
            doc.setTextColor(...T.navy);
            doc.text(s(value), M + 52, y);
            doc.setDrawColor(...T.rule);
            doc.setLineWidth(0.15);
            doc.line(M, y + 3, W - M, y + 3);
            y += 9;
        };
        fiche.forEach(([l, v]) => row(l, v));

        // Chiffres clés
        const items = (cover.items || []).slice(0, 6);
        if (items.length) {
            y += 10;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(...T.copper);
            doc.text('CHIFFRES CLÉS', M, y, { charSpace: 0.4 });
            y += 6;
            const perRow = Math.min(3, items.length);
            const gap = 5;
            const cw = (W - 2 * M - gap * (perRow - 1)) / perRow;
            items.forEach((item, i) => {
                const cx = M + (i % perRow) * (cw + gap);
                const cy = y + Math.floor(i / perRow) * 25;
                doc.setFillColor(...T.light);
                doc.rect(cx, cy, cw, 21, 'F');
                doc.setFillColor(...T.navy);
                doc.rect(cx, cy, cw, 1, 'F');
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(...T.grey);
                doc.text(s(item.label), cx + 4, cy + 8);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(13);
                doc.setTextColor(...T.navy);
                doc.text(s(item.value), cx + 4, cy + 16);
            });
        }

        doc.setFillColor(...T.navy);
        doc.rect(0, H - 16, W, 16, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...T.white);
        doc.text('Auxy Partners — Conseil en financement', M, H - 6.5);
        doc.text('Document de travail — ne constitue pas un engagement de financement', W - M, H - 6.5, { align: 'right' });
    },

    /** Titre de section : libellé, source ou unité en italique, filet cuivre. Retourne le nouveau y. */
    _sectionTitle(doc, section, y, x = this._pdfTheme.margin) {
        const T = this._pdfTheme;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(section.small ? 10 : 12);
        doc.setTextColor(...T.navy);
        doc.text(this._sanitizePdf(String(section.text ?? section.title)), x, y);
        y += 4.5;
        if (section.subtitle) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8);
            doc.setTextColor(...T.grey);
            doc.text(this._sanitizePdf(String(section.subtitle)), x, y);
            y += 4;
        }
        doc.setFillColor(...T.copper);
        doc.rect(x, y - 2.2, 14, 0.7, 'F');
        return y + 3.5;
    },

    /**
     * Tableau à la charte : en-tête marine, filets horizontaux, totaux en
     * bandeau (détectés sur « Total… » / « Sous-total… » ou donnés par
     * totalRows), libellés à gauche et chiffres à droite. Retourne le y final.
     */
    _table(doc, section, y, { left, right } = { left: this._pdfTheme.margin, right: this._pdfTheme.margin }) {
        const T = this._pdfTheme;
        const s = v => this._sanitizePdf(String(v ?? ''));
        const head = section.headers.map(s);
        const body = section.rows.map(r => r.map(s));
        const wide = head.length > 7;
        const fontSize = section.fontSize || (wide ? 7.5 : 8.5);
        const isTotal = i => (section.totalRows ? section.totalRows.includes(i) : /^(total|sous[- ]total|ss total)/i.test(body[i]?.[0] || ''));
        const isGrand = i => /^total/i.test(body[i]?.[0] || '');
        const columnStyles = { 0: { halign: 'left', minCellWidth: wide ? 26 : 34 } };
        // colonnes de chiffres à la largeur de leur contenu (pas de retour à la ligne), le libellé prend le reste
        for (let c = 1; c < head.length; c++) columnStyles[c] = { halign: section.align?.[c] || 'right', ...(head.length <= 6 ? { cellWidth: 'wrap' } : {}) };
        doc.autoTable({
            startY: y,
            head: [head],
            body,
            theme: 'plain',
            // un petit tableau ne se coupe pas entre deux pages
            pageBreak: body.length <= 28 ? 'avoid' : 'auto',
            rowPageBreak: 'avoid',
            margin: { left, right, top: T.top, bottom: 297 - T.bottom },
            styles: { font: 'helvetica', fontSize, textColor: T.ink, cellPadding: { top: 2, bottom: 2, left: 2.4, right: 2.4 }, lineColor: T.rule, lineWidth: { top: 0, right: 0, bottom: 0.12, left: 0 }, overflow: 'linebreak', valign: 'middle' },
            headStyles: { fillColor: T.navy, textColor: T.white, fontStyle: 'bold', halign: 'right', lineWidth: 0 },
            columnStyles,
            didParseCell: data => {
                if (data.section === 'head') { if (data.column.index === 0) data.cell.styles.halign = 'left'; return; }
                const i = data.row.index;
                if (section.sectionRows?.includes(i)) {
                    data.cell.styles.fillColor = T.light;
                    data.cell.styles.textColor = T.navy;
                    data.cell.styles.fontStyle = 'bold';
                } else if (isTotal(i)) {
                    data.cell.styles.fillColor = (section.totalFill === 'navy' && isGrand(i)) ? T.navy : T.teal;
                    data.cell.styles.textColor = T.white;
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.lineWidth = 0;
                } else if (section.highlightRows?.includes(i)) {
                    data.cell.styles.fillColor = T.cream;
                    data.cell.styles.fontStyle = 'bold';
                } else if (section.boldRows?.includes(i)) {
                    data.cell.styles.fontStyle = 'bold';
                }
            }
        });
        let endY = doc.lastAutoTable.finalY;
        if (section.note) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(7.5);
            doc.setTextColor(...T.grey);
            const lines = doc.splitTextToSize(s(section.note), 210 - left - right);
            doc.text(lines, left, endY + 4);
            endY += 2 + lines.length * 3.4;
        }
        return endY;
    },

    _buildPdf(title, sections, filename = 'simulation', opts = {}) {
        if (typeof jspdf === 'undefined') {
            window.showToast?.('Outils d’export PDF indisponibles (connexion ?) — réessayez', 'error');
            return;
        }

        const T = this._pdfTheme;
        const s = v => this._sanitizePdf(String(v ?? ''));
        const { jsPDF } = jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const W = doc.internal.pageSize.getWidth();
        const M = T.margin;
        const hasCover = opts.cover !== false;
        // client : celui du titre (« Objet — Client »), sinon le dossier actif
        const activeClient = (opts.cover && opts.cover.client) || String(title).split(/\s+[\u2014\u2013]\s+/)[1] || Dossier.get()?.name || '';
        if (hasCover) {
            this._drawCover(doc, title, { ...(opts.cover || {}), client: activeClient });
            doc.addPage();
        }

        let y = T.top;
        /** Saut de page si le bloc de hauteur h ne tient pas */
        const need = h => { if (y + h > T.bottom) { doc.addPage(); y = T.top; } };

        for (const [index, section] of sections.entries()) {
            if (section.type === 'pagebreak') {
                if (y > T.top) { doc.addPage(); y = T.top; }
                continue;
            }

            if (section.type === 'title') {
                // un titre ne reste jamais seul en bas de page
                const next = sections[index + 1];
                const rowsNext = next?.type === 'table' ? next.rows.length : next?.type === 'columns' ? Math.max(next.left.rows.length, next.right.rows.length) : 0;
                need(next?.type === 'chart' ? 80 : rowsNext && rowsNext <= 28 ? rowsNext * 6.4 + 26 : 36);
                y = this._sectionTitle(doc, section, y + 2);
            }

            if (section.type === 'keyvalue') {
                // Fiche sur deux colonnes de paires libellé / valeur
                const items = (section.items || []).filter(it => it && it.value !== '' && it.value != null);
                const pairs = items.length > 4 ? 2 : 1;
                const rows = [];
                for (let i = 0; i < items.length; i += pairs) {
                    const r = [];
                    for (let k = 0; k < pairs; k++) { const it = items[i + k]; r.push(it ? s(it.label) : '', it ? s(it.value) : ''); }
                    rows.push(r);
                }
                need(Math.min(rows.length, 4) * 6.5 + 4);
                const colW = (W - 2 * M) / (pairs * 2);
                const columnStyles = {};
                for (let c = 0; c < pairs * 2; c++) {
                    columnStyles[c] = c % 2 === 0
                        ? { textColor: T.grey, cellWidth: colW * 1.1 }
                        : { textColor: T.navy, fontStyle: 'bold', halign: 'right', cellWidth: colW * 0.9 };
                }
                doc.autoTable({
                    startY: y, body: rows, theme: 'plain',
                    margin: { left: M, right: M, top: T.top, bottom: 297 - T.bottom },
                    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: { top: 1.9, bottom: 1.9, left: 2, right: 4 }, lineColor: T.rule, lineWidth: { top: 0, right: 0, bottom: 0.12, left: 0 } },
                    columnStyles
                });
                y = doc.lastAutoTable.finalY + 8;
            }

            if (section.type === 'table') {
                need(Math.min(section.rows.length, 3) * 6.5 + 10);
                y = this._table(doc, section, y) + 9;
            }

            if (section.type === 'columns') {
                // Deux tableaux côte à côte (Emplois | Ressources)
                const gap = 6;
                const half = (W - 2 * M - gap) / 2;
                const rowsMax = Math.max(section.left.rows.length, section.right.rows.length);
                need(Math.min(rowsMax * 6.2 + 22, 120));
                const page = doc.internal.getCurrentPageInfo().pageNumber;
                const startY = y;
                let yl = startY, yr = startY;
                if (section.left.title) yl = this._sectionTitle(doc, { text: section.left.title, subtitle: section.left.subtitle, small: true }, startY + 2, M);
                if (section.right.title) yr = this._sectionTitle(doc, { text: section.right.title, subtitle: section.right.subtitle, small: true }, startY + 2, M + half + gap);
                const top = Math.max(yl, yr);
                const endL = this._table(doc, { fontSize: 8, ...section.left }, top, { left: M, right: W - M - half });
                doc.setPage(page);
                const endR = this._table(doc, { fontSize: 8, ...section.right }, top, { left: M + half + gap, right: M });
                doc.setPage(doc.internal.getNumberOfPages());
                y = Math.max(endL, endR) + 9;
            }

            if (section.type === 'kpicards') {
                const items = section.items || [];
                const perRow = items.length === 4 || items.length >= 7 ? 4 : Math.min(3, Math.max(1, items.length));
                const gap = 4;
                const cardW = (W - 2 * M - gap * (perRow - 1)) / perRow;
                const cardH = items.some(it => it.sub) ? 23 : 19;
                const rows = Math.ceil(items.length / perRow);
                need(rows * (cardH + gap));
                items.forEach((item, idx) => {
                    const cx = M + (idx % perRow) * (cardW + gap);
                    const cy = y + Math.floor(idx / perRow) * (cardH + gap);
                    doc.setFillColor(...T.light);
                    doc.rect(cx, cy, cardW, cardH, 'F');
                    doc.setFillColor(...T.navy);
                    doc.rect(cx, cy, cardW, 0.9, 'F');
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(7.5);
                    doc.setTextColor(...T.grey);
                    doc.text(doc.splitTextToSize(s(item.label), cardW - 6)[0], cx + 3.5, cy + 6.5);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(perRow === 4 ? 11.5 : 13);
                    doc.setTextColor(...T.navy);
                    doc.text(s(item.value), cx + 3.5, cy + 14);
                    if (item.sub) {
                        doc.setFont('helvetica', 'normal');
                        doc.setFontSize(7);
                        doc.setTextColor(...T.grey);
                        doc.text(doc.splitTextToSize(s(item.sub), cardW - 6)[0], cx + 3.5, cy + 19.5);
                    }
                });
                y += rows * (cardH + gap) + 5;
            }

            if (section.type === 'note') {
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                const lines = doc.splitTextToSize(s(section.text), W - 2 * M - 9);
                const h = lines.length * 3.7 + (section.title ? 12 : 7);
                need(h);
                doc.setFillColor(...T.cream);
                doc.rect(M, y, W - 2 * M, h, 'F');
                doc.setFillColor(...T.copper);
                doc.rect(M, y, 1.2, h, 'F');
                let ny = y + 6;
                if (section.title) {
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(8);
                    doc.setTextColor(...T.navy);
                    doc.text(s(section.title).toUpperCase(), M + 5, ny, { charSpace: 0.3 });
                    ny += 5;
                }
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(...T.ink);
                doc.text(lines, M + 5, ny);
                y += h + 8;
            }

            if (section.type === 'separator') {
                y += 2;
            }

            if (section.type === 'chart') {
                const dataUrl = Charts.toImage(section.canvasId);
                if (dataUrl) {
                    const canvas = document.getElementById(section.canvasId);
                    const ratio = canvas && canvas.width > 0 ? canvas.height / canvas.width : 0.5;
                    const imgW = W - 2 * M;
                    const imgH = Math.min(imgW * ratio, section.maxHeight || 95);
                    need(imgH + (section.title ? 12 : 0));
                    if (section.title) y = this._sectionTitle(doc, { text: section.title, subtitle: section.subtitle }, y + 2);
                    try {
                        doc.addImage(dataUrl, 'JPEG', M, y, imgW, imgH);
                        y += imgH + 9;
                    } catch {
                        // canvas inexploitable : on continue sans le graphique
                    }
                }
            }
        }

        // En-tête et pied de page de chaque page de contenu
        const total = doc.internal.getNumberOfPages();
        const first = hasCover ? 2 : 1;
        const numbered = total - first + 1;
        const [docKind, docClient] = String(title).split(/\s+[—–]\s+/);
        const client = activeClient || docClient || '';
        for (let i = first; i <= total; i++) {
            doc.setPage(i);
            doc.setFillColor(...T.navy);
            doc.rect(0, 0, W, 12, 'F');
            doc.setFillColor(...T.copper);
            doc.rect(0, 12, W, 0.7, 'F');
            try {
                doc.addImage(this._logo, 'JPEG', M, 2.2, 21.5, 7.6);
            } catch {
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8);
                doc.setTextColor(...T.white);
                doc.text('AUXY PARTNERS', M, 7.5);
            }
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8.5);
            doc.setTextColor(...T.white);
            doc.text(s(client ? `${client}  —  ${docKind}` : title), W - M, 7.6, { align: 'right' });

            doc.setDrawColor(...T.rule);
            doc.setLineWidth(0.15);
            doc.line(M, 283, W - M, 283);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...T.grey);
            doc.text(`Auxy Partners — Confidentiel. Document de travail : simulation indicative, ne constitue pas un engagement de financement. Édité le ${new Date().toLocaleDateString('fr-FR')}.`, M, 287.5);
            doc.setFont('helvetica', 'bold');
            doc.text(`${i - first + 1} / ${numbered}`, W - M, 287.5, { align: 'right' });
        }

        doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
    },

    /**
     * Export benchmark comparison to PDF
     */
    benchmarkPdf(loans) {
        const cur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
        const pct = (v, d = 2) => `${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)} %`;
        const typeLabels = { constant: 'Échéances constantes', degressif: 'Capital constant', infine: 'In fine' };
        const natureLabels = { ci: 'capital emprunté', crd: 'capital restant dû' };
        const hasInsurance = loans.some(l => l.totalInsurance > 0);
        const hasGuarantee = loans.some(l => l.guaranteeAmount > 0);
        const best = key => loans.reduce((a, b) => ((a[key] ?? Infinity) <= (b[key] ?? Infinity) ? a : b));
        const bestCost = best('totalCost');
        const insurance = p => (p && p.quotite > 0
            ? (p.mode === 'rate' ? `${pct(p.value)} sur ${natureLabels[p.nature] || p.nature}, quotité ${p.quotite} %` : `${cur(p.value)} / mois, quotité ${p.quotite} %`)
            : '—');

        // Un prêt par colonne : la lecture d'un comparatif bancaire
        const line = (label, fn) => [label, ...loans.map(fn)];
        const rows = [
            line('Montant emprunté', l => cur(l.principal)),
            line('Taux nominal', l => pct(l.rate)),
            line('Durée', l => `${l.duration} mois`),
            line('Amortissement', l => typeLabels[l.type] || l.type),
            line('Mensualité', l => cur(l.monthlyPayment)),
            ...(hasInsurance ? [line('Assurance emprunteur 1', l => insurance(l.insP1)), line('Assurance emprunteur 2', l => insurance(l.insP2)), line('Coût de l’assurance', l => cur(l.totalInsurance || 0))] : []),
            ...(hasGuarantee ? [line('Garantie', l => cur(l.guaranteeAmount || 0))] : []),
            line('Frais de dossier', l => cur(l.fees || 0)),
            line('Total des intérêts', l => cur(l.totalInterest)),
            line('Coût total du crédit', l => cur(l.totalCost)),
            line('TAEG', l => (l.taeg ? pct(l.taeg) : '—')),
            ...(loans.length > 1 ? [line('Surcoût par rapport au moins cher', l => (l === bestCost ? '—' : `+ ${cur(l.totalCost - bestCost.totalCost)}`))] : [])
        ];
        const costRow = rows.findIndex(r => r[0] === 'Coût total du crédit');

        const sections = [
            { type: 'title', text: 'Synthèse', subtitle: `${loans.length} prêt${loans.length > 1 ? 's' : ''} comparé${loans.length > 1 ? 's' : ''}` },
            { type: 'kpicards', items: [
                { label: 'Coût total le plus bas', value: bestCost.name, sub: cur(bestCost.totalCost) },
                { label: 'Mensualité la plus basse', value: best('monthlyPayment').name, sub: cur(best('monthlyPayment').monthlyPayment) },
                { label: 'TAEG le plus bas', value: best('taeg').name, sub: best('taeg').taeg ? pct(best('taeg').taeg) : '' },
                ...(loans.length > 1 ? [{ label: 'Écart de coût total', value: cur(Math.max(...loans.map(l => l.totalCost)) - bestCost.totalCost), sub: 'entre le plus cher et le moins cher' }] : [])
            ] },
            { type: 'title', text: 'Comparatif', subtitle: 'Classement sur le coût total du crédit (intérêts, assurance, garantie et frais)' },
            { type: 'table', headers: ['', ...loans.map(l => l.name)], rows, totalRows: [], highlightRows: costRow >= 0 ? [costRow] : [] }
        ];

        this.toPdf('Comparatif de prêts', sections, 'benchmark', {
            cover: { kind: 'Comparatif de prêts', subtitle: `${loans.length} offres de financement comparées`, items: [
                { label: 'Moins cher', value: bestCost.name },
                { label: 'Coût total', value: cur(bestCost.totalCost) },
                ...(bestCost.taeg ? [{ label: 'TAEG', value: pct(bestCost.taeg) }] : [])
            ] }
        });
    }
};
