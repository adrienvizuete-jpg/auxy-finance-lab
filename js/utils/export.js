/**
 * Auxy Partners - Export Helpers (PDF & Excel)
 */

import { PARAM_LABELS, RESULT_LABELS, t, formatValue } from './i18n.js';
import { LOGO_JPEG_BANNER } from './logo-data.js';
import { Charts } from './charts.js';

export const Export = {

    /**
     * Sanitize strings for PDF rendering (replaces narrow no-break spaces with regular spaces)
     */
    _sanitizePdf(str) {
        if (typeof str !== 'string') return str;
        return str.replace(/[\u202F\u00A0]/g, ' ');
    },

    /**
     * Export schedule to Excel
     */
    toExcel(schedule, filename = 'simulation', sheetName = 'Amortissement') {
        if (typeof XLSX === 'undefined') {
            alert('Bibliothèque Excel non chargée');
            return;
        }

        const wb = XLSX.utils.book_new();

        // Header row
        const headers = Object.keys(schedule[0] || {}).map(k => {
            const labels = {
                period: 'Période',
                payment: 'Mensualité',
                principal: 'Capital',
                interest: 'Intérêts',
                insurance: 'Assurance',
                balance: 'CRD',
                totalInterest: 'Int. Cumulés',
                totalInsurance: 'Ass. Cumulées',
                utilized: 'Utilisé',
                unused: 'Non utilisé',
                commitmentFee: 'Com. Engagement',
                totalCost: 'Coût Total',
                cashPayment: 'Paiement Cash',
                pikInterest: 'Intérêts PIK',
                capitalizedInterest: 'Int. Capitalisés'
            };
            return labels[k] || k;
        });

        const data = [headers, ...schedule.map(row => Object.values(row).map(v =>
            typeof v === 'number' ? Math.round(v * 100) / 100 : v
        ))];

        const ws = XLSX.utils.aoa_to_sheet(data);

        // Column widths
        ws['!cols'] = headers.map(() => ({ wch: 16 }));

        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    },

    /**
     * Export full simulation report to Excel with multiple sheets
     */
    fullReportExcel(simulation) {
        if (typeof XLSX === 'undefined') {
            alert('Bibliothèque Excel non chargée');
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
                const formatted = formatValue(key, value);
                summaryData.push([label, formatted]);
            });
        }

        summaryData.push([''], ['RÉSULTATS']);
        if (simulation.results) {
            Object.entries(simulation.results).forEach(([key, value]) => {
                if (typeof value !== 'object') {
                    const label = t(key, RESULT_LABELS);
                    const formatted = formatValue(key, value);
                    summaryData.push([label, formatted]);
                }
            });
        }

        const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
        summaryWs['!cols'] = [{ wch: 30 }, { wch: 25 }];
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
     * Page de garde Auxy : bandeau logo, titre, sous-titre, hypothèses clés.
     * opts.cover = { subtitle?, items?: [{label, value}] }
     */
    _drawCover(doc, title, cover) {
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        // Bandeau supérieur
        doc.setFillColor(27, 73, 97);
        doc.rect(0, 0, pageWidth, 84, 'F');
        doc.setFillColor(211, 149, 87); // liseré accent
        doc.rect(0, 84, pageWidth, 1.8, 'F');

        try {
            doc.addImage(LOGO_JPEG_BANNER, 'JPEG', (pageWidth - 70) / 2, 26, 70, 24.7);
        } catch (e) {
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(24);
            doc.setFont('helvetica', 'bold');
            doc.text('AUXY PARTNERS', pageWidth / 2, 42, { align: 'center' });
        }

        // Titre
        doc.setTextColor(27, 73, 97);
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text(this._sanitizePdf(title), pageWidth / 2, 112, { align: 'center' });

        if (cover.subtitle) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(107, 114, 128);
            doc.text(this._sanitizePdf(cover.subtitle), pageWidth / 2, 122, { align: 'center' });
        }

        doc.setFontSize(10);
        doc.setTextColor(107, 114, 128);
        doc.text(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), pageWidth / 2, 132, { align: 'center' });

        // Encadré hypothèses clés
        if (cover.items?.length) {
            const boxW = 130;
            const boxX = (pageWidth - boxW) / 2;
            const rowH = 9;
            const boxH = cover.items.length * rowH + 18;
            const boxY = 150;
            doc.setDrawColor(27, 73, 97);
            doc.setLineWidth(0.4);
            doc.roundedRect(boxX, boxY, boxW, boxH, 2, 2);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(211, 149, 87);
            doc.text('HYPOTHÈSES CLÉS', boxX + 8, boxY + 9);
            let iy = boxY + 19;
            doc.setFontSize(10);
            cover.items.forEach(item => {
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(107, 114, 128);
                doc.text(this._sanitizePdf(String(item.label)), boxX + 8, iy);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(27, 73, 97);
                doc.text(this._sanitizePdf(String(item.value)), boxX + boxW - 8, iy, { align: 'right' });
                iy += rowH;
            });
        }

        doc.setFontSize(8.5);
        doc.setTextColor(150, 150, 150);
        doc.text('Document de travail — ne constitue pas un engagement de financement', pageWidth / 2, pageHeight - 22, { align: 'center' });
    },

    /**
     * Export to PDF using jsPDF
     * @param {object} opts - { cover?: { subtitle?, items? } }
     * Sections supportées : title, keyvalue, table, separator,
     * chart ({ canvasId, title?, maxHeight? } — capture le graphique affiché).
     */
    toPdf(title, sections, filename = 'simulation', opts = {}) {
        if (typeof jspdf === 'undefined') {
            alert('Bibliothèque PDF non chargée');
            return;
        }

        const { jsPDF } = jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        let y = 20;

        // Page de garde optionnelle
        if (opts.cover) {
            this._drawCover(doc, title, opts.cover);
            doc.addPage();
        }

        // Header with logo
        doc.setFillColor(27, 73, 97); // primary-800
        doc.rect(0, 0, pageWidth, 38, 'F');

        // Add logo (white on dark blue background)
        try {
            doc.addImage(LOGO_JPEG_BANNER, 'JPEG', 15, 4, 52, 18.4);
        } catch (e) {
            // Fallback text if logo fails
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(18);
            doc.setFont('helvetica', 'bold');
            doc.text('AUXY PARTNERS', 15, 15);
        }

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(this._sanitizePdf(title), 15, 28);
        doc.setFontSize(9);
        doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, pageWidth - 15, 28, { align: 'right' });

        y = 48;
        doc.setTextColor(27, 73, 97);

        for (const section of sections) {
            if (y > 250) {
                doc.addPage();
                y = 20;
            }

            if (section.type === 'title') {
                doc.setFontSize(13);
                doc.setFont('helvetica', 'bold');
                doc.text(this._sanitizePdf(section.text), 15, y);
                y += 10;
            }

            if (section.type === 'keyvalue') {
                doc.setFontSize(10);
                section.items.forEach(item => {
                    if (y > 260) { doc.addPage(); y = 20; }
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(107, 114, 128);
                    doc.text(this._sanitizePdf(String(item.label)), 15, y);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(27, 73, 97);
                    doc.text(this._sanitizePdf(String(item.value)), 95, y);
                    y += 7;
                });
                y += 8;
            }

            if (section.type === 'table') {
                const sanitizedHeaders = section.headers.map(h => this._sanitizePdf(String(h)));
                const sanitizedRows = section.rows.map(row => row.map(cell => this._sanitizePdf(String(cell))));
                // 1ère colonne (libellés) à gauche, le reste (numérique) à droite
                const columnStyles = { 0: { halign: 'left' } };
                for (let c = 1; c < sanitizedHeaders.length; c++) columnStyles[c] = { halign: 'right' };
                doc.autoTable({
                    startY: y,
                    head: [sanitizedHeaders],
                    body: sanitizedRows,
                    theme: 'grid',
                    headStyles: {
                        fillColor: [27, 73, 97],
                        textColor: [255, 255, 255],
                        fontSize: 9,
                        fontStyle: 'bold',
                        halign: 'right'
                    },
                    bodyStyles: {
                        fontSize: 9,
                        textColor: [55, 65, 81]
                    },
                    columnStyles,
                    alternateRowStyles: { fillColor: [240, 244, 247] },
                    margin: { left: 15, right: 15, top: 18 },
                    styles: { cellPadding: 3.2, lineColor: [222, 228, 233], lineWidth: 0.15 },
                    didParseCell: data => {
                        if (data.section === 'head' && data.column.index === 0) data.cell.styles.halign = 'left';
                        // lignes de mise en relief optionnelles (ex. exercice courant)
                        if (section.highlightRows?.includes(data.row.index) && data.section === 'body') {
                            data.cell.styles.fillColor = [248, 238, 224];
                            data.cell.styles.fontStyle = 'bold';
                        }
                    }
                });
                y = doc.lastAutoTable.finalY + 14;
            }

            if (section.type === 'kpicards') {
                const items = section.items || [];
                const perRow = Math.min(3, Math.max(1, items.length));
                const gap = 6;
                const cardW = (pageWidth - 30 - gap * (perRow - 1)) / perRow;
                const cardH = 24;
                const rows = Math.ceil(items.length / perRow);
                const blockH = rows * (cardH + gap);
                if (y + blockH > 265) { doc.addPage(); y = 20; }

                items.forEach((item, idx) => {
                    const col = idx % perRow;
                    const row = Math.floor(idx / perRow);
                    const cx = 15 + col * (cardW + gap);
                    const cy = y + row * (cardH + gap);
                    doc.setFillColor(244, 247, 249);
                    doc.setDrawColor(27, 73, 97);
                    doc.setLineWidth(0.2);
                    doc.roundedRect(cx, cy, cardW, cardH, 1.5, 1.5, 'FD');
                    doc.setFillColor(211, 149, 87);
                    doc.rect(cx, cy, 1.4, cardH, 'F');

                    doc.setFontSize(6.5);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(107, 114, 128);
                    doc.text(this._sanitizePdf(String(item.label).toUpperCase()), cx + 5, cy + 6.5);
                    doc.setFontSize(13);
                    doc.setTextColor(27, 73, 97);
                    doc.text(this._sanitizePdf(String(item.value)), cx + 5, cy + 14.5);
                    if (item.sub) {
                        doc.setFontSize(7);
                        doc.setFont('helvetica', 'normal');
                        doc.setTextColor(107, 114, 128);
                        doc.text(this._sanitizePdf(String(item.sub)), cx + 5, cy + 20);
                    }
                });
                y += blockH + 6;
            }

            if (section.type === 'note') {
                const textLines = doc.splitTextToSize(this._sanitizePdf(String(section.text)), pageWidth - 42);
                const noteH = textLines.length * 4 + (section.title ? 14 : 8);
                if (y + noteH > 270) { doc.addPage(); y = 20; }
                doc.setFillColor(244, 247, 249);
                doc.rect(15, y, pageWidth - 30, noteH, 'F');
                doc.setFillColor(211, 149, 87);
                doc.rect(15, y, 1.4, noteH, 'F');
                let ny = y + 7;
                if (section.title) {
                    doc.setFontSize(8);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(27, 73, 97);
                    doc.text(this._sanitizePdf(section.title.toUpperCase()), 20, ny);
                    ny += 6;
                }
                doc.setFontSize(8);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(90, 99, 110);
                doc.text(textLines, 20, ny);
                y += noteH + 10;
            }

            if (section.type === 'separator') {
                doc.setDrawColor(200, 200, 200);
                doc.line(15, y, pageWidth - 15, y);
                y += 8;
            }

            if (section.type === 'chart') {
                const dataUrl = Charts.toImage(section.canvasId);
                if (dataUrl) {
                    const canvas = document.getElementById(section.canvasId);
                    const ratio = canvas && canvas.width > 0 ? canvas.height / canvas.width : 0.5;
                    const imgW = pageWidth - 30;
                    const imgH = Math.min(imgW * ratio, section.maxHeight || 110);
                    if (y + imgH + (section.title ? 10 : 0) > 270) {
                        doc.addPage();
                        y = 20;
                    }
                    if (section.title) {
                        doc.setFontSize(13);
                        doc.setFont('helvetica', 'bold');
                        doc.setTextColor(27, 73, 97);
                        doc.text(this._sanitizePdf(section.title), 15, y);
                        y += 8;
                    }
                    try {
                        doc.addImage(dataUrl, 'JPEG', 15, y, imgW, imgH);
                        y += imgH + 12;
                    } catch (e) {
                        // canvas inexploitable : on continue sans le graphique
                    }
                }
            }
        }

        // Footer (chaque page) + bande d'en-tête rappelée sur les pages
        // intermédiaires (la couverture et la 1ère page de contenu ont déjà
        // leur propre en-tête)
        const totalPages = doc.internal.getNumberOfPages();
        const firstContentPage = opts.cover ? 2 : 1;
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            if (i > firstContentPage) {
                doc.setFillColor(27, 73, 97);
                doc.rect(0, 0, pageWidth, 9, 'F');
                doc.setFillColor(211, 149, 87);
                doc.rect(0, 9, pageWidth, 0.8, 'F');
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(255, 255, 255);
                doc.text('AUXY PARTNERS', 15, 6);
                doc.setFont('helvetica', 'normal');
                doc.text(this._sanitizePdf(title), pageWidth - 15, 6, { align: 'right' });
            }
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Confidentiel — Auxy Partners | Page ${i}/${totalPages}`, pageWidth / 2, 290, { align: 'center' });
        }

        doc.save(`${filename}_${new Date().toISOString().slice(0, 10)}.pdf`);
    },

    /**
     * Export benchmark comparison to PDF
     */
    benchmarkPdf(loans, comparisonData) {
        const fmtCur = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
        const fmtCur2 = v => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

        const typeLabels = { constant: 'Amortissable', degressif: 'Dégressif', infine: 'In Fine' };
        const modeLabels = { amount: 'Montant fixe', rate: 'Taux' };
        const natureLabels = { ci: 'Capital Emprunte', crd: 'Capital Restant Du' };

        const sections = [
            { type: 'title', text: 'Comparaison de Prets - Benchmark' },
            { type: 'separator' }
        ];

        // Summary info
        sections.push({
            type: 'keyvalue',
            items: [
                { label: 'Nombre de prets compares', value: String(loans.length) },
                { label: 'Date d\'analyse', value: new Date().toLocaleDateString('fr-FR') }
            ]
        });
        sections.push({ type: 'separator' });

        // Main comparison table
        const hasInsurance = loans.some(l => l.totalInsurance > 0);
        const hasGuarantee = loans.some(l => l.guaranteeAmount > 0);

        const headers = ['Pret', 'Montant', 'Taux', 'Duree', 'Type', 'Mensualite'];
        if (hasInsurance) headers.push('Ass./mois', 'Cout Ass.');
        if (hasGuarantee) headers.push('Garantie');
        headers.push('Total Int.', 'Cout Total', 'TAEG');

        const rows = loans.map(l => {
            const row = [
                l.name,
                fmtCur(l.principal),
                l.rate + '%',
                l.duration + ' mois',
                typeLabels[l.type] || l.type,
                fmtCur2(l.monthlyPayment)
            ];
            if (hasInsurance) {
                row.push(fmtCur2(l.avgMonthlyInsurance || 0));
                row.push(fmtCur(l.totalInsurance || 0));
            }
            if (hasGuarantee) {
                row.push(fmtCur(l.guaranteeAmount || 0));
            }
            row.push(fmtCur(l.totalInterest));
            row.push(fmtCur(l.totalCost));
            row.push(l.taeg ? l.taeg.toFixed(2) + ' %' : '--');
            return row;
        });

        sections.push({ type: 'table', headers, rows });

        // Best values highlight
        if (loans.length > 1) {
            const bestCost = loans.reduce((a, b) => a.totalCost < b.totalCost ? a : b);
            const bestPayment = loans.reduce((a, b) => a.monthlyPayment < b.monthlyPayment ? a : b);
            const bestInterest = loans.reduce((a, b) => a.totalInterest < b.totalInterest ? a : b);

            sections.push({ type: 'separator' });
            sections.push({ type: 'title', text: 'Analyse' });
            const analysisItems = [
                { label: 'Cout total le plus bas', value: `${bestCost.name} (${fmtCur(bestCost.totalCost)})` },
                { label: 'Mensualite la plus basse', value: `${bestPayment.name} (${fmtCur2(bestPayment.monthlyPayment)})` },
                { label: 'Interets les plus bas', value: `${bestInterest.name} (${fmtCur(bestInterest.totalInterest)})` }
            ];
            if (hasInsurance) {
                const bestIns = loans.reduce((a, b) => (a.totalInsurance || 0) < (b.totalInsurance || 0) ? a : b);
                analysisItems.push({ label: 'Assurance la moins chere', value: `${bestIns.name} (${fmtCur(bestIns.totalInsurance || 0)})` });
            }
            sections.push({ type: 'keyvalue', items: analysisItems });
        }

        // Individual loan details
        sections.push({ type: 'separator' });
        sections.push({ type: 'title', text: 'Detail par pret' });

        loans.forEach(l => {
            const items = [
                { label: `-- ${l.name} --`, value: '' },
                { label: 'Montant emprunte', value: fmtCur(l.principal) },
                { label: 'Taux annuel', value: l.rate + ' %' },
                { label: 'Duree', value: `${l.duration} mois (${(l.duration / 12).toFixed(1)} ans)` },
                { label: 'Type', value: typeLabels[l.type] || l.type }
            ];

            // Insurance detail
            if (l.insP1 && l.insP1.quotite > 0) {
                const p1 = l.insP1;
                const desc = p1.mode === 'rate'
                    ? `${p1.value}% ${natureLabels[p1.nature] || p1.nature}, quotite ${p1.quotite}%`
                    : `${fmtCur2(p1.value)}/mois, quotite ${p1.quotite}%`;
                items.push({ label: 'Assurance Empr. 1', value: desc });
            }
            if (l.insP2 && l.insP2.quotite > 0) {
                const p2 = l.insP2;
                const desc = p2.mode === 'rate'
                    ? `${p2.value}% ${natureLabels[p2.nature] || p2.nature}, quotite ${p2.quotite}%`
                    : `${fmtCur2(p2.value)}/mois, quotite ${p2.quotite}%`;
                items.push({ label: 'Assurance Empr. 2', value: desc });
            }

            // Guarantee detail
            if (l.guaranteeAmount > 0) {
                const g = l.guarantee;
                const desc = g.mode === 'percent'
                    ? `${g.value}% du capital = ${fmtCur(l.guaranteeAmount)}`
                    : fmtCur(l.guaranteeAmount);
                items.push({ label: 'Garantie', value: desc });
            }

            items.push(
                { label: 'Mensualite', value: fmtCur2(l.monthlyPayment) },
                { label: 'Total interets', value: fmtCur(l.totalInterest) }
            );
            if (l.totalInsurance > 0) {
                items.push({ label: 'Cout assurance total', value: fmtCur(l.totalInsurance) });
            }
            items.push({ label: 'Cout total', value: fmtCur(l.totalCost) });
            if (l.taeg) {
                items.push({ label: 'TAEG', value: l.taeg.toFixed(2) + ' %' });
            }

            sections.push({ type: 'keyvalue', items });
        });

        this.toPdf('Benchmark - Comparaison de Prets', sections, 'benchmark');
    }
};
