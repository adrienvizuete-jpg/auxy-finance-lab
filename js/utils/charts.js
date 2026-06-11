/**
 * Auxy Partners - Chart.js Helpers
 */

// Auxy color palette for charts
const COLORS = {
    primary: '#1d5f7f',
    primaryLight: '#2e86ab',
    accent: '#e8973f',
    accentLight: '#f0a854',
    dark: '#1a3548',
    teal: '#4a9ec2',
    lightBlue: '#6fb3d2',
    success: '#059669',
    danger: '#dc2626',
    warning: '#d97706',
    gray: '#6b7280',
    series: ['#1d5f7f', '#e8973f', '#059669', '#dc2626', '#8b5cf6', '#2e86ab', '#d97706', '#6fb3d2']
};

// Track active chart instances to destroy before re-creating
const chartInstances = {};

function getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return {
        text: isDark ? '#94a3b8' : '#4b5563',
        grid: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
        bg: isDark ? '#1a2736' : '#ffffff'
    };
}

/**
 * Plugin inline : ligne verticale « date d'analyse » (pointillés + libellé).
 * Options (options.plugins.auxyMarker) :
 *  - value : position sur une échelle x linéaire (ex. 2026.42)
 *  - betweenIndex : sur une échelle catégorielle, trace la ligne entre
 *    l'index donné et le suivant (frontière historique / projection)
 *  - label : texte affiché en haut de la ligne
 */
const AUXY_MARKER_PLUGIN = {
    id: 'auxyMarker',
    afterDatasetsDraw(chart) {
        const opts = chart.options.plugins?.auxyMarker;
        if (!opts) return;
        const xScale = chart.scales.x;
        if (!xScale) return;

        let x = null;
        if (typeof opts.value === 'number') {
            x = xScale.getPixelForValue(opts.value);
        } else if (typeof opts.betweenIndex === 'number') {
            const a = xScale.getPixelForValue(opts.betweenIndex);
            const b = xScale.getPixelForValue(opts.betweenIndex + 1);
            x = isFinite(b) ? (a + b) / 2 : a;
        }
        if (x == null || !isFinite(x) || x < chart.chartArea.left || x > chart.chartArea.right) return;

        const { top, bottom } = chart.chartArea;
        const ctx = chart.ctx;
        ctx.save();
        ctx.strokeStyle = COLORS.danger;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.moveTo(x, top);
        ctx.lineTo(x, bottom);
        ctx.stroke();
        if (opts.label) {
            ctx.setLineDash([]);
            ctx.font = '600 10px Inter, sans-serif';
            ctx.fillStyle = COLORS.danger;
            ctx.textAlign = 'center';
            ctx.fillText(opts.label, x, top - 4);
        }
        ctx.restore();
    }
};

export const Charts = {
    COLORS,

    /**
     * Destroy existing chart on a canvas
     */
    destroy(canvasId) {
        if (chartInstances[canvasId]) {
            chartInstances[canvasId].destroy();
            delete chartInstances[canvasId];
        }
    },

    /**
     * Amortization chart - stacked area showing principal vs interest
     */
    amortization(canvasId, schedule) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();

        const labels = schedule.map(r => r.period);
        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Capital',
                        data: schedule.map(r => r.principal),
                        backgroundColor: COLORS.primary + 'cc',
                        borderRadius: 2,
                        order: 2
                    },
                    {
                        label: 'Int\u00e9r\u00eats',
                        data: schedule.map(r => r.interest),
                        backgroundColor: COLORS.accent + 'cc',
                        borderRadius: 2,
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'top', labels: { color: theme.text, usePointStyle: true, padding: 16 } },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: { color: theme.text, maxTicksLimit: 24 },
                        title: { display: true, text: 'Mois', color: theme.text }
                    },
                    y: {
                        stacked: true,
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            callback: v => new Intl.NumberFormat('fr-FR', { notation: 'compact', compactDisplay: 'short' }).format(v) + ' \u20ac'
                        }
                    }
                }
            }
        });
        return chartInstances[canvasId];
    },

    /**
     * Balance evolution line chart
     */
    balanceEvolution(canvasId, schedule) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: schedule.map(r => r.period),
                datasets: [{
                    label: 'Capital Restant D\u00fb',
                    data: schedule.map(r => r.balance),
                    borderColor: COLORS.primary,
                    backgroundColor: COLORS.primary + '15',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 5,
                    borderWidth: 2.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: ctx => `CRD: ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: theme.text, maxTicksLimit: 24 },
                        title: { display: true, text: 'Mois', color: theme.text }
                    },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            callback: v => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) + ' \u20ac'
                        }
                    }
                }
            }
        });
        return chartInstances[canvasId];
    },

    /**
     * Cost breakdown doughnut
     */
    costBreakdown(canvasId, data) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: data.map(d => d.label),
                datasets: [{
                    data: data.map(d => d.value),
                    backgroundColor: data.map((_, i) => COLORS.series[i % COLORS.series.length] + 'dd'),
                    borderWidth: 2,
                    borderColor: theme.bg,
                    hoverOffset: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: theme.text, usePointStyle: true, padding: 16, font: { size: 12 } }
                    },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: ctx => {
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = ((ctx.raw / total) * 100).toFixed(1);
                                return `${ctx.label}: ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(ctx.raw)} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
        return chartInstances[canvasId];
    },

    /**
     * Benchmark comparison bar chart
     */
    benchmarkComparison(canvasId, loans, metric) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: loans.map(l => l.name),
                datasets: [{
                    label: metric.label,
                    data: loans.map(l => l[metric.key]),
                    backgroundColor: loans.map((_, i) => COLORS.series[i % COLORS.series.length] + 'cc'),
                    borderRadius: 6,
                    borderSkipped: false,
                    maxBarThickness: 60
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: loans.length > 4 ? 'y' : 'x',
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: ctx => metric.format ? metric.format(ctx.raw) : ctx.raw.toLocaleString('fr-FR')
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: theme.text }
                    },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            callback: v => metric.format ? metric.format(v) : v.toLocaleString('fr-FR')
                        }
                    }
                }
            }
        });
        return chartInstances[canvasId];
    },

    /**
     * Multi-line comparison chart
     */
    multiLineComparison(canvasId, datasets, xLabels) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: xLabels,
                datasets: datasets.map((ds, i) => ({
                    label: ds.label,
                    data: ds.data,
                    borderColor: COLORS.series[i % COLORS.series.length],
                    backgroundColor: 'transparent',
                    tension: 0.3,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    borderWidth: 2.5
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'top', labels: { color: theme.text, usePointStyle: true, padding: 16 } },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: ctx => `${ctx.dataset.label}: ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(ctx.raw)}`
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { display: false },
                        ticks: { color: theme.text, maxTicksLimit: 24 }
                    },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            callback: v => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) + ' \u20ac'
                        }
                    }
                }
            }
        });
        return chartInstances[canvasId];
    },

    /**
     * Waterfall chart for structured finance
     */
    waterfallChart(canvasId, tranches, metric) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();
        const trancheColors = { senior: COLORS.primary, mezzanine: COLORS.accent, equity: COLORS.dark, junior: COLORS.teal };

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: tranches.map(t => t.name),
                datasets: [{
                    data: tranches.map(t => t[metric]),
                    backgroundColor: tranches.map(t => (trancheColors[t.type] || COLORS.gray) + 'cc'),
                    borderRadius: 6,
                    maxBarThickness: 80
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: theme.text } },
                    y: {
                        grid: { color: theme.grid },
                        ticks: {
                            color: theme.text,
                            callback: v => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) + ' \u20ac'
                        }
                    }
                }
            }
        });
        return chartInstances[canvasId];
    },

    /**
     * Capture un graphique en image PNG (dataURL) pour insertion dans un PDF.
     * Le canvas Chart.js est transparent : on le compose sur le fond du thème
     * courant pour rester lisible (blanc en mode clair).
     */
    toImage(canvasId) {
        const chart = chartInstances[canvasId];
        // Force un rendu synchrone : en mode responsive, le premier paint
        // passe par requestAnimationFrame — une capture immédiate (export
        // déclenché dans la foulée d'un recalcul) lirait un canvas blanc.
        if (chart) chart.update('none');
        const src = chart?.canvas || document.getElementById(canvasId);
        if (!src || !src.width || !src.height) return null;
        const theme = getThemeColors();
        // Plafonne la résolution exportée : 1800 px ≈ 250 dpi sur 180 mm,
        // suffisant pour l'impression et ~4× plus léger qu'un canvas Retina brut
        const scale = Math.min(1, 1800 / src.width);
        const out = document.createElement('canvas');
        out.width = Math.round(src.width * scale);
        out.height = Math.round(src.height * scale);
        const ctx = out.getContext('2d');
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(src, 0, 0, out.width, out.height);
        // JPEG sur fond plein : bien plus léger que le PNG dans le PDF
        return out.toDataURL('image/jpeg', 0.82);
    },

    /**
     * Covenants : barres service de dette + ligne EBITDA (axe €) ;
     * ligne DSCR + seuil covenant en pointillés (axe x, à droite).
     */
    covenantChart(canvasId, { labels, ebitda, debtService, dscr, covenantDscr }) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();
        // animation désactivée plus bas : paint synchrone pour la capture PDF

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        type: 'bar',
                        label: 'Service de dette',
                        data: debtService,
                        backgroundColor: COLORS.primary + 'cc',
                        borderRadius: 4,
                        maxBarThickness: 56,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'EBITDA',
                        data: ebitda,
                        borderColor: COLORS.accent,
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        tension: 0.2,
                        pointRadius: 3,
                        pointBackgroundColor: COLORS.accent,
                        yAxisID: 'y'
                    },
                    {
                        type: 'line',
                        label: 'DSCR',
                        data: dscr,
                        borderColor: COLORS.success,
                        backgroundColor: 'transparent',
                        borderWidth: 2.5,
                        tension: 0.2,
                        pointRadius: 3,
                        pointBackgroundColor: COLORS.success,
                        yAxisID: 'y2'
                    },
                    {
                        type: 'line',
                        label: `Covenant DSCR (${covenantDscr.toFixed(2)}x)`,
                        data: labels.map(() => covenantDscr),
                        borderColor: COLORS.danger,
                        borderDash: [6, 6],
                        borderWidth: 1.5,
                        pointRadius: 0,
                        yAxisID: 'y2'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'top', labels: { color: theme.text, usePointStyle: true, padding: 16 } },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: c => c.dataset.yAxisID === 'y2'
                                ? `${c.dataset.label}: ${c.raw.toFixed(2)}x`
                                : `${c.dataset.label}: ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(c.raw)} k€`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false }, ticks: { color: theme.text } },
                    y: {
                        grid: { color: theme.grid },
                        ticks: { color: theme.text, callback: v => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) + ' k€' }
                    },
                    y2: {
                        position: 'right',
                        grid: { display: false },
                        ticks: { color: theme.text, callback: v => v.toFixed(1) + 'x' },
                        beginAtZero: true
                    }
                }
            }
        });
        return chartInstances[canvasId];
    },

    /**
     * Mur de la dette : barres empilées (capital remboursé par an), une série par ligne de dette.
     * series = [{ label, data }]
     */
    debtWall(canvasId, labels, series, { unit = '€' } = {}) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();
        const fmt = v => new Intl.NumberFormat('fr-FR', { notation: 'compact', compactDisplay: 'short' }).format(v) + ' ' + unit;

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels,
                datasets: series.map((s, i) => ({
                    label: s.label,
                    data: s.data,
                    backgroundColor: COLORS.series[i % COLORS.series.length] + 'cc',
                    borderRadius: 3,
                    maxBarThickness: 64
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'top', labels: { color: theme.text, usePointStyle: true, padding: 16 } },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: c => `${c.dataset.label}: ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c.raw)}`,
                            footer: items => `Total : ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(items.reduce((s, it) => s + it.raw, 0))}`
                        }
                    }
                },
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { color: theme.text } },
                    y: { stacked: true, grid: { color: theme.grid }, ticks: { color: theme.text, callback: fmt } }
                }
            }
        });
        return chartInstances[canvasId];
    },

    /**
     * Frise des financements (chronogramme) : une barre horizontale par crédit,
     * de la mise en place à la maturité. items = [{ label, start, end, isNew,
     * tooltip }] avec start/end en années décimales (ex. 2021.5).
     * markerValue : position de la ligne « date d'analyse ».
     */
    debtGantt(canvasId, items, { markerValue = null, markerLabel = 'Analyse' } = {}) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx || !items.length) return;
        const theme = getThemeColors();

        const minX = Math.floor(Math.min(...items.map(i => i.start)));
        const maxX = Math.ceil(Math.max(...items.map(i => i.end)));

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: items.map(i => i.label),
                datasets: [{
                    data: items.map(i => [i.start, i.end]),
                    backgroundColor: items.map(i => (i.isNew ? COLORS.accent : COLORS.primary) + 'cc'),
                    borderColor: items.map(i => i.isNew ? COLORS.accent : COLORS.primary),
                    borderWidth: 1,
                    borderRadius: 4,
                    borderSkipped: false,
                    barThickness: 18
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // paint synchrone : fiabilise la capture PDF
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1,
                        padding: 12,
                        callbacks: {
                            label: c => items[c.dataIndex].tooltip || ''
                        }
                    },
                    auxyMarker: { value: markerValue, label: markerLabel }
                },
                scales: {
                    x: {
                        min: minX,
                        max: maxX,
                        grid: { color: theme.grid },
                        ticks: { color: theme.text, stepSize: 1, callback: v => Number.isInteger(v) ? v : '' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: { color: theme.text, font: { size: 11 } }
                    }
                }
            },
            plugins: [AUXY_MARKER_PLUGIN]
        });
        return chartInstances[canvasId];
    },

    /**
     * Mur de la dette historique + projectif : barres empilées par crédit
     * (exercices passés atténués) + courbe d'encours de clôture (axe droit).
     * series = [{ label, isNew, data }] ; crd = encours fin d'exercice ;
     * pastCount = nombre d'exercices entièrement passés.
     */
    debtTimeline(canvasId, { labels, series, crd, pastCount = 0, markerLabel = 'Analyse' }) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();

        const EXISTING_PALETTE = [COLORS.primary, COLORS.teal, COLORS.lightBlue, COLORS.primaryLight, COLORS.success, COLORS.gray];
        const NEW_PALETTE = [COLORS.accent, COLORS.accentLight, COLORS.warning];
        let iExist = 0, iNew = 0;

        const barDatasets = series.map(s => {
            const base = s.isNew
                ? NEW_PALETTE[iNew++ % NEW_PALETTE.length]
                : EXISTING_PALETTE[iExist++ % EXISTING_PALETTE.length];
            return {
                type: 'bar',
                label: s.label,
                data: s.data,
                // exercices passés atténués, projection pleine
                backgroundColor: s.data.map((_, j) => base + (j < pastCount ? '4d' : 'cc')),
                borderRadius: 3,
                stack: 'wall',
                maxBarThickness: 56,
                yAxisID: 'y',
                order: 2
            };
        });

        chartInstances[canvasId] = new Chart(ctx, {
            data: {
                labels,
                datasets: [
                    ...barDatasets,
                    {
                        type: 'line',
                        label: 'Encours fin d\'exercice',
                        data: crd,
                        borderColor: theme.text,
                        backgroundColor: 'transparent',
                        borderWidth: 2,
                        borderDash: [4, 3],
                        tension: 0.25,
                        pointRadius: 2.5,
                        pointBackgroundColor: theme.text,
                        yAxisID: 'y2',
                        order: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: false, // paint synchrone : fiabilise la capture PDF
                interaction: { intersect: false, mode: 'index' },
                plugins: {
                    legend: { position: 'top', labels: { color: theme.text, usePointStyle: true, padding: 14, font: { size: 11 } } },
                    tooltip: {
                        backgroundColor: theme.bg,
                        titleColor: theme.text,
                        bodyColor: theme.text,
                        borderColor: theme.grid,
                        borderWidth: 1,
                        padding: 12,
                        filter: item => item.raw !== 0,
                        callbacks: {
                            label: c => `${c.dataset.label}: ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(c.raw)}`
                        }
                    },
                    auxyMarker: { betweenIndex: pastCount > 0 ? pastCount - 1 : null, label: markerLabel }
                },
                scales: {
                    x: { stacked: true, grid: { display: false }, ticks: { color: theme.text } },
                    y: {
                        stacked: true,
                        position: 'left',
                        grid: { color: theme.grid },
                        title: { display: true, text: 'Capital remboursé / an', color: theme.text, font: { size: 10 } },
                        ticks: { color: theme.text, callback: v => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) + ' €' }
                    },
                    y2: {
                        position: 'right',
                        grid: { display: false },
                        beginAtZero: true,
                        title: { display: true, text: 'Encours', color: theme.text, font: { size: 10 } },
                        ticks: { color: theme.text, callback: v => new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) + ' €' }
                    }
                }
            },
            plugins: [AUXY_MARKER_PLUGIN]
        });
        return chartInstances[canvasId];
    },

    /**
     * Radar chart for loan scoring
     */
    radarChart(canvasId, loans) {
        this.destroy(canvasId);
        const ctx = document.getElementById(canvasId);
        if (!ctx) return;
        const theme = getThemeColors();

        const metrics = ['Co\u00fbt Total', 'Mensualit\u00e9', 'Taux', 'Flexibilit\u00e9', 'Dur\u00e9e'];

        chartInstances[canvasId] = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: metrics,
                datasets: loans.map((loan, i) => ({
                    label: loan.name,
                    data: loan.scores,
                    borderColor: COLORS.series[i % COLORS.series.length],
                    backgroundColor: COLORS.series[i % COLORS.series.length] + '20',
                    borderWidth: 2,
                    pointRadius: 3,
                    pointBackgroundColor: COLORS.series[i % COLORS.series.length]
                }))
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', labels: { color: theme.text, usePointStyle: true, padding: 16 } }
                },
                scales: {
                    r: {
                        beginAtZero: true,
                        max: 10,
                        ticks: { display: false },
                        grid: { color: theme.grid },
                        pointLabels: { color: theme.text, font: { size: 12 } }
                    }
                }
            }
        });
        return chartInstances[canvasId];
    }
};
