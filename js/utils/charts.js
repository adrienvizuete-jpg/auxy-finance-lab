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
        const src = chart?.canvas || document.getElementById(canvasId);
        if (!src || !src.width || !src.height) return null;
        const theme = getThemeColors();
        const out = document.createElement('canvas');
        out.width = src.width;
        out.height = src.height;
        const ctx = out.getContext('2d');
        ctx.fillStyle = theme.bg;
        ctx.fillRect(0, 0, out.width, out.height);
        ctx.drawImage(src, 0, 0);
        return out.toDataURL('image/png');
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
