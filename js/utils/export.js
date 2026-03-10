/**
 * Auxy Partners - Export Helpers (PDF & Excel)
 */

import { PARAM_LABELS, RESULT_LABELS, t, formatValue } from './i18n.js';

export const Export = {

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
     * Export to PDF using jsPDF
     */
    toPdf(title, sections, filename = 'simulation') {
        if (typeof jspdf === 'undefined') {
            alert('Bibliothèque PDF non chargée');
            return;
        }

        const { jsPDF } = jspdf;
        const doc = new jsPDF('p', 'mm', 'a4');
        const pageWidth = doc.internal.pageSize.getWidth();
        let y = 20;

        // Header
        doc.setFillColor(26, 53, 72); // primary-800
        doc.rect(0, 0, pageWidth, 35, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);
        doc.setFont('helvetica', 'bold');
        doc.text('AUXY PARTNERS', 15, 15);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(title, 15, 25);
        doc.setFontSize(9);
        doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')} à ${new Date().toLocaleTimeString('fr-FR')}`, pageWidth - 15, 25, { align: 'right' });

        y = 45;
        doc.setTextColor(26, 53, 72);

        for (const section of sections) {
            if (y > 260) {
                doc.addPage();
                y = 20;
            }

            if (section.type === 'title') {
                doc.setFontSize(13);
                doc.setFont('helvetica', 'bold');
                doc.text(section.text, 15, y);
                y += 8;
            }

            if (section.type === 'keyvalue') {
                doc.setFontSize(9);
                section.items.forEach(item => {
                    if (y > 275) { doc.addPage(); y = 20; }
                    doc.setFont('helvetica', 'normal');
                    doc.setTextColor(107, 114, 128);
                    doc.text(String(item.label), 15, y);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(26, 53, 72);
                    doc.text(String(item.value), 90, y);
                    y += 6;
                });
                y += 4;
            }

            if (section.type === 'table') {
                doc.autoTable({
                    startY: y,
                    head: [section.headers],
                    body: section.rows,
                    theme: 'grid',
                    headStyles: {
                        fillColor: [26, 53, 72],
                        textColor: [255, 255, 255],
                        fontSize: 8,
                        fontStyle: 'bold'
                    },
                    bodyStyles: {
                        fontSize: 7.5,
                        textColor: [55, 65, 81]
                    },
                    alternateRowStyles: { fillColor: [240, 244, 247] },
                    margin: { left: 15, right: 15 },
                    styles: { cellPadding: 3 }
                });
                y = doc.lastAutoTable.finalY + 10;
            }

            if (section.type === 'separator') {
                doc.setDrawColor(200, 200, 200);
                doc.line(15, y, pageWidth - 15, y);
                y += 8;
            }
        }

        // Footer on each page
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150, 150, 150);
            doc.text(`Auxy Partners - Finance Lab | Page ${i}/${totalPages}`, pageWidth / 2, 290, { align: 'center' });
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

        const sections = [
            { type: 'title', text: 'Comparaison de Prêts - Benchmark' },
            { type: 'separator' }
        ];

        // Summary info
        sections.push({
            type: 'keyvalue',
            items: [
                { label: 'Nombre de prêts comparés', value: String(loans.length) },
                { label: 'Date d\'analyse', value: new Date().toLocaleDateString('fr-FR') }
            ]
        });
        sections.push({ type: 'separator' });

        // Main comparison table
        const headers = ['Prêt', 'Montant', 'Taux', 'Durée', 'Type', 'Mensualité', 'Total Int.', 'Coût Total'];
        const rows = loans.map(l => [
            l.name,
            fmtCur(l.principal),
            l.rate + '%',
            l.duration + ' mois',
            typeLabels[l.type] || l.type,
            fmtCur2(l.monthlyPayment),
            fmtCur(l.totalInterest),
            fmtCur(l.totalCost)
        ]);

        sections.push({ type: 'table', headers, rows });

        // Best values highlight
        if (loans.length > 1) {
            const bestCost = loans.reduce((a, b) => a.totalCost < b.totalCost ? a : b);
            const bestPayment = loans.reduce((a, b) => a.monthlyPayment < b.monthlyPayment ? a : b);
            const bestInterest = loans.reduce((a, b) => a.totalInterest < b.totalInterest ? a : b);

            sections.push({ type: 'separator' });
            sections.push({ type: 'title', text: 'Analyse' });
            sections.push({
                type: 'keyvalue',
                items: [
                    { label: 'Coût total le plus bas', value: `${bestCost.name} (${fmtCur(bestCost.totalCost)})` },
                    { label: 'Mensualité la plus basse', value: `${bestPayment.name} (${fmtCur2(bestPayment.monthlyPayment)})` },
                    { label: 'Intérêts les plus bas', value: `${bestInterest.name} (${fmtCur(bestInterest.totalInterest)})` }
                ]
            });
        }

        // Individual loan details
        sections.push({ type: 'separator' });
        sections.push({ type: 'title', text: 'Détail par prêt' });

        loans.forEach(l => {
            sections.push({
                type: 'keyvalue',
                items: [
                    { label: `── ${l.name} ──`, value: '' },
                    { label: 'Montant emprunté', value: fmtCur(l.principal) },
                    { label: 'Taux annuel', value: l.rate + ' %' },
                    { label: 'Durée', value: `${l.duration} mois (${(l.duration / 12).toFixed(1)} ans)` },
                    { label: 'Type', value: typeLabels[l.type] || l.type },
                    { label: 'Mensualité', value: fmtCur2(l.monthlyPayment) },
                    { label: 'Total intérêts', value: fmtCur(l.totalInterest) },
                    { label: 'Coût total', value: fmtCur(l.totalCost) },
                    ...(l.taeg ? [{ label: 'TAEG', value: (l.taeg).toFixed(2) + ' %' }] : [])
                ]
            });
        });

        this.toPdf('Benchmark - Comparaison de Prêts', sections, 'benchmark');
    }
};
