
(async function () {

    // ═══ Configuration ═══════════════════════════════════════
    const REGIONS = ['tropical', 'subtropical', 'temperate', 'polar'];
    const REGION_COLORS = {
        tropical: 'var(--c-tropical)',
        subtropical: 'var(--c-subtropical)',
        temperate: 'var(--c-temperate)',
        polar: 'var(--c-polar)',
    };
    const REGION_COLORS_RAW = {
        tropical: '#3b82f6',
        subtropical: '#10b981',
        temperate: '#f59e0b',
        polar: '#ef4444',
    };

    const SCENARIOS_META = {
        ssp126: { label: 'SSP1-2.6', desc: 'Policy success · low emissions', color: '#38bdf8' },
        ssp245: { label: 'SSP2-4.5', desc: 'Middle of the road · moderate', color: '#f59e0b' },
        ssp370: { label: 'SSP3-7.0', desc: 'Regional rivalry · high', color: '#fb923c' },
        ssp585: { label: 'SSP5-8.5', desc: 'Fossil-fueled · extreme', color: '#ef4444' },
    };

    // ═══ Load data ═══════════════════════════════════════════
    // Tries year_region_experiment.csv first (teammate's filename),
    // falls back to regional_anomalies_full.csv. Adapts to either column
    // naming convention (experiment / scenario) and computes gmean +
    // amplification from regional anomalies if not present in the CSV.

    let rawData;
    let dataSource = '';
    try {
        rawData = await d3.csv('year_region_experiment.csv', d3.autoType);
        dataSource = 'year_region_experiment.csv';
    } catch (e1) {
        try {
            rawData = await d3.csv('regional_anomalies_full.csv', d3.autoType);
            dataSource = 'regional_anomalies_full.csv';
        } catch (e2) {
            document.getElementById('banner').style.display = 'block';
            document.getElementById('banner').innerHTML =
                '<strong>Data not found:</strong> place either <code>year_region_experiment.csv</code> or <code>regional_anomalies_full.csv</code> in the same folder as this HTML file.';
            return;
        }
    }
    console.log(`Loaded ${dataSource} (${rawData.length} rows)`);

    // Normalize column names — accept either 'experiment' or 'scenario'
    rawData.forEach(row => {
        if (row.experiment !== undefined && row.scenario === undefined) {
            row.scenario = row.experiment;
        }
    });

    // Cap at year 2100 for fair scenario comparison
    // (SSP1-2.6 extends to 2299 but other scenarios stop at 2100)
    rawData = rawData.filter(d => d.year <= 2100);

    // Area weights for the four climate-zone regions (from spherical geometry).
    // sin(boundary_lat) gives cumulative fraction of half-Earth surface area.
    const REGION_AREA_WEIGHTS = {
        tropical: Math.sin(23.5 * Math.PI / 180),                                // 0.399
        subtropical: Math.sin(40 * Math.PI / 180) - Math.sin(23.5 * Math.PI / 180), // 0.244
        temperate: Math.sin(60 * Math.PI / 180) - Math.sin(40 * Math.PI / 180), // 0.223
        polar: 1 - Math.sin(60 * Math.PI / 180),                              // 0.134
    };

    // Compute global mean and amplification per (year, scenario) if not in CSV
    const hasGmean = rawData[0].gmean !== undefined && rawData[0].gmean !== null;
    if (!hasGmean) {
        const byYearScen = d3.group(rawData,
            d => `${d.year}|${d.scenario}`);
        byYearScen.forEach(rows => {
            let gm = 0, wSum = 0;
            rows.forEach(r => {
                const w = REGION_AREA_WEIGHTS[r.region];
                if (w !== undefined && r.anomaly !== null && !isNaN(r.anomaly)) {
                    gm += r.anomaly * w;
                    wSum += w;
                }
            });
            gm = wSum > 0 ? gm / wSum : 0;
            rows.forEach(r => {
                r.gmean = gm;
                r.amplification = r.anomaly - gm;
            });
        });
        console.log('Computed gmean and amplification from regional anomalies.');
    }

    const data = rawData;

    // Detect which scenarios are actually present in the data
    const availableScenarios = [...new Set(data.map(d => d.scenario))]
        .filter(s => s !== 'historical')
        .sort();

    if (availableScenarios.length === 0) {
        document.getElementById('banner').style.display = 'block';
        document.getElementById('banner').innerHTML =
            '<strong>⚠ No scenarios found</strong> in the CSV. Did you run the regional_anomaly() function for ssp126/ssp245/ssp585?';
        return;
    }

    if (availableScenarios.length < 3) {
        document.getElementById('banner').style.display = 'block';
        document.getElementById('banner').innerHTML =
            `<strong>ℹ Limited scenarios:</strong> only ${availableScenarios.join(', ')} found. Add SSP1-2.6 to your notebook for the full three-scenario story.`;
    }

    // Pre-build lookups
    const historicalData = data.filter(d => d.scenario === 'historical');
    const histByRegion = d3.group(historicalData, d => d.region);

    // For each scenario, get records by region
    const scenarioByRegion = {};
    availableScenarios.forEach(scen => {
        const subset = data.filter(d => d.scenario === scen);
        scenarioByRegion[scen] = d3.group(subset, d => d.region);
    });

    // ═══ State ═══════════════════════════════════════════════
    let currentScenario = availableScenarios.includes('ssp245') ? 'ssp245' : availableScenarios[0];
    let selectedRegion = null;

    // ═══ Build scenario slider/stops ═══════════════════════
    const stopsDiv = document.getElementById('scenario-stops');
    const labelsDiv = document.getElementById('scenario-labels');
    stopsDiv.innerHTML = '';
    labelsDiv.innerHTML = '';
    availableScenarios.forEach((scen, i) => {
        const meta = SCENARIOS_META[scen] || { label: scen, desc: '' };
        const marker = document.createElement('div');
        marker.className = 'stop-marker' + (scen === currentScenario ? ' active' : '');
        marker.dataset.scenario = scen;
        stopsDiv.appendChild(marker);

        const label = document.createElement('div');
        label.className = 'scenario-slider-label' + (scen === currentScenario ? ' active' : '');
        label.dataset.scenario = scen;
        label.innerHTML = `
      <span class="label-name">${meta.label}</span>
      <span class="label-desc">${meta.desc}</span>
    `;
        label.addEventListener('click', () => setScenario(scen));
        labelsDiv.appendChild(label);
    });

    function setScenario(scen) {
        currentScenario = scen;
        document.querySelectorAll('.stop-marker').forEach(m =>
            m.classList.toggle('active', m.dataset.scenario === scen));
        document.querySelectorAll('.scenario-slider-label').forEach(l =>
            l.classList.toggle('active', l.dataset.scenario === scen));
        renderMainChart();
        if (selectedRegion) renderDetail();
    }

    // ═══ Build main chart ═══════════════════════════════════
    const MC = { w: 1100, h: 460, m: { t: 20, r: 30, b: 50, l: 60 } };
    const mainSvg = d3.select('#main-chart');

    // Determine y-scale from all data (anomaly column)
    const allAnomalies = data.map(d => d.anomaly);
    const yMin = d3.min(allAnomalies);
    const yMax = d3.max(allAnomalies);

    const mcX = d3.scaleLinear()
        .domain(d3.extent(data, d => d.year))
        .range([MC.m.l, MC.w - MC.m.r]);
    const mcY = d3.scaleLinear()
        .domain([Math.min(yMin, -1), Math.max(yMax, 1) + 0.5])
        .range([MC.h - MC.m.b, MC.m.t])
        .nice();

    // Axes
    mainSvg.append('g').attr('class', 'axis')
        .attr('transform', `translate(0,${MC.h - MC.m.b})`)
        .call(d3.axisBottom(mcX).tickFormat(d3.format('d')).ticks(8));
    mainSvg.append('g').attr('class', 'axis')
        .attr('transform', `translate(${MC.m.l},0)`)
        .call(d3.axisLeft(mcY).tickFormat(d => (d > 0 ? '+' : '') + d + '°'));

    // Y-axis label
    mainSvg.append('text')
        .attr('transform', 'rotate(-90)')
        .attr('x', -MC.h / 2).attr('y', 16)
        .attr('text-anchor', 'middle')
        .style('font-family', "'JetBrains Mono', monospace")
        .style('font-size', '10px')
        .attr('fill', 'var(--ink-faint)')
        .text('Anomaly (°C vs. 1951–1980)');

    // Gridlines (horizontal)
    const yTicks = mcY.ticks(8);
    mainSvg.append('g').selectAll('line')
        .data(yTicks)
        .join('line')
        .attr('class', 'grid-line')
        .attr('x1', MC.m.l).attr('x2', MC.w - MC.m.r)
        .attr('y1', d => mcY(d)).attr('y2', d => mcY(d));

    // Zero line (emphasized)
    mainSvg.append('line')
        .attr('x1', MC.m.l).attr('x2', MC.w - MC.m.r)
        .attr('y1', mcY(0)).attr('y2', mcY(0))
        .attr('stroke', 'var(--ink-faint)')
        .attr('stroke-width', 0.8);

    // Baseline period shading (1951-1980)
    mainSvg.append('rect')
        .attr('x', mcX(1951)).attr('y', MC.m.t)
        .attr('width', mcX(1980) - mcX(1951))
        .attr('height', MC.h - MC.m.t - MC.m.b)
        .attr('fill', 'wheat').attr('opacity', 0.05);

    mainSvg.append('text')
        .attr('x', (mcX(1951) + mcX(1980)) / 2).attr('y', MC.m.t + 12)
        .attr('text-anchor', 'middle')
        .style('font-family', "'JetBrains Mono', monospace")
        .style('font-size', '9px')
        .attr('fill', 'rgba(245, 222, 179, 0.6)')
        .text('BASELINE');

    // 2015 transition line
    mainSvg.append('line')
        .attr('x1', mcX(2015)).attr('x2', mcX(2015))
        .attr('y1', MC.m.t).attr('y2', MC.h - MC.m.b)
        .attr('stroke', 'var(--ink-faint)')
        .attr('stroke-width', 0.6)
        .attr('stroke-dasharray', '3,4');

    mainSvg.append('text')
        .attr('x', mcX(2015) + 6).attr('y', MC.m.t + 12)
        .style('font-family', "'JetBrains Mono', monospace")
        .style('font-size', '9px')
        .attr('fill', 'var(--ink-faint)')
        .text('SCENARIO →');

    // Line generator
    const lineGen = d3.line()
        .x(d => mcX(d.year))
        .y(d => mcY(d.anomaly))
        .curve(d3.curveMonotoneX);

    // Containers for region lines
    const linesG = mainSvg.append('g').attr('class', 'region-lines');
    const globalLineG = mainSvg.append('g').attr('class', 'global-line');

    // Hover infrastructure
    const hoverLine = mainSvg.append('line')
        .attr('class', 'hover-line')
        .attr('y1', MC.m.t).attr('y2', MC.h - MC.m.b)
        .attr('stroke', 'var(--accent)')
        .attr('stroke-width', 0.8)
        .attr('opacity', 0);

    const hoverDots = mainSvg.append('g').attr('class', 'hover-dots');

    // Interaction overlay (transparent rect)
    mainSvg.append('rect')
        .attr('x', MC.m.l).attr('y', MC.m.t)
        .attr('width', MC.w - MC.m.l - MC.m.r)
        .attr('height', MC.h - MC.m.t - MC.m.b)
        .attr('fill', 'transparent')
        .on('mousemove', handleHover)
        .on('mouseleave', handleHoverEnd);

    function renderMainChart() {
        // Get a series for each region: historical + selected scenario
        function regionSeries(region) {
            const hist = histByRegion.get(region) || [];
            const scen = (scenarioByRegion[currentScenario].get(region) || [])
                .filter(d => d.year > 2014);
            return [...hist, ...scen].sort((a, b) => a.year - b.year);
        }

        // Global mean: compute from data
        const globalSeries = [];
        const yearSet = new Set();
        historicalData.forEach(d => yearSet.add(d.year));
        (data.filter(d => d.scenario === currentScenario)).forEach(d => yearSet.add(d.year));

        const yearsList = [...yearSet].sort((a, b) => a - b);
        yearsList.forEach(year => {
            // Use the gmean column if present, otherwise compute from regions
            let gm;
            if (year <= 2014) {
                const sample = historicalData.find(d => d.year === year);
                gm = sample ? sample.gmean : null;
            } else {
                const sample = data.find(d =>
                    d.year === year && d.scenario === currentScenario);
                gm = sample ? sample.gmean : null;
            }
            if (gm !== null && gm !== undefined) {
                globalSeries.push({ year, anomaly: gm });
            }
        });

        // Render region lines
        const lines = linesG.selectAll('path.rline')
            .data(REGIONS, d => d);

        lines.join(
            enter => enter.append('path')
                .attr('class', 'rline')
                .attr('fill', 'none')
                .attr('stroke', d => REGION_COLORS_RAW[d])
                .attr('stroke-width', 2)
                .attr('opacity', 0.9)
                .attr('d', d => lineGen(regionSeries(d))),
            update => update
                .transition().duration(500)
                .attr('d', d => lineGen(regionSeries(d)))
        );

        // Render global mean (dashed)
        globalLineG.selectAll('path.global').remove();
        globalLineG.append('path')
            .attr('class', 'global')
            .attr('fill', 'none')
            .attr('stroke', '#9aa6b2')
            .attr('stroke-width', 1.5)
            .attr('stroke-dasharray', '4,4')
            .attr('opacity', 0.85)
            .attr('d', lineGen(globalSeries));

        // Build legend
        const legend = document.getElementById('main-legend');
        legend.innerHTML = '';
        REGIONS.forEach(region => {
            const item = document.createElement('div');
            item.className = 'legend-item';
            item.innerHTML = `
        <span class="legend-swatch" style="background:${REGION_COLORS_RAW[region]};"></span>
        <span style="text-transform: capitalize;">${region}</span>
      `;
            legend.appendChild(item);
        });
        const g = document.createElement('div');
        g.className = 'legend-item';
        g.innerHTML = `
      <span class="legend-swatch dashed"></span>
      <span>Global mean</span>
    `;
        legend.appendChild(g);
    }

    function handleHover(event) {
        const [mx] = d3.pointer(event, mainSvg.node());
        const year = Math.round(mcX.invert(mx));
        if (year < 1850 || year > 2100) return;

        hoverLine
            .attr('x1', mcX(year)).attr('x2', mcX(year))
            .attr('opacity', 1);

        // Get values for each region at this year
        const tipParts = [`<div class="tt-year">${year}</div>`];

        REGIONS.forEach(region => {
            let record;
            if (year <= 2014) {
                record = historicalData.find(d => d.year === year && d.region === region);
            } else {
                const scenList = scenarioByRegion[currentScenario].get(region);
                record = (scenList || []).find(d => d.year === year);
            }
            if (record) {
                const v = record.anomaly;
                const fmt = (v >= 0 ? '+' : '') + v.toFixed(2);
                tipParts.push(`
          <div class="tt-row">
            <span class="tt-region">
              <span class="tt-swatch" style="background:${REGION_COLORS_RAW[region]}"></span>
              <span style="text-transform: capitalize;">${region}</span>
            </span>
            <span class="tt-value">${fmt}°C</span>
          </div>
        `);
            }
        });

        // Global mean
        let gmRecord;
        if (year <= 2014) {
            gmRecord = historicalData.find(d => d.year === year);
        } else {
            gmRecord = data.find(d => d.year === year && d.scenario === currentScenario);
        }
        if (gmRecord && gmRecord.gmean !== undefined) {
            const v = gmRecord.gmean;
            const fmt = (v >= 0 ? '+' : '') + v.toFixed(2);
            tipParts.push(`
        <div class="tt-row" style="border-top: 1px solid var(--line); padding-top: 4px; margin-top: 2px;">
          <span class="tt-region">
            <span class="tt-swatch" style="background:#9aa6b2"></span>
            <span>Global mean</span>
          </span>
          <span class="tt-value">${fmt}°C</span>
        </div>
      `);
        }

        // Update hover dots
        const dotData = REGIONS.map(region => {
            let record;
            if (year <= 2014) {
                record = historicalData.find(d => d.year === year && d.region === region);
            } else {
                const scenList = scenarioByRegion[currentScenario].get(region);
                record = (scenList || []).find(d => d.year === year);
            }
            return record ? { region, year, anomaly: record.anomaly } : null;
        }).filter(Boolean);

        const dots = hoverDots.selectAll('circle')
            .data(dotData, d => d.region);
        dots.join(
            enter => enter.append('circle')
                .attr('r', 4)
                .attr('fill', d => REGION_COLORS_RAW[d.region])
                .attr('stroke', 'var(--bg-deeper)')
                .attr('stroke-width', 1.5),
            update => update
        )
            .attr('cx', d => mcX(d.year))
            .attr('cy', d => mcY(d.anomaly));

        const tip = document.getElementById('main-tooltip');
        tip.innerHTML = tipParts.join('');
        const wrapRect = document.querySelector('.chart-wrap').getBoundingClientRect();
        const left = event.clientX - wrapRect.left + 16;
        const top = event.clientY - wrapRect.top + 8;
        tip.style.left = Math.min(left, wrapRect.width - 240) + 'px';
        tip.style.top = top + 'px';
        tip.style.opacity = 1;
    }

    function handleHoverEnd() {
        hoverLine.attr('opacity', 0);
        hoverDots.selectAll('circle').remove();
        document.getElementById('main-tooltip').style.opacity = 0;
    }

    renderMainChart();

    // ═══ Small multiples ═══════════════════════════════════
    function buildSmallMultiples() {
        const container = document.getElementById('small-multiples');
        container.innerHTML = '';

        REGIONS.forEach(region => {
            const panel = document.createElement('div');
            panel.className = 'small-panel';
            panel.dataset.region = region;

            // Get peak amplification value across scenarios for this region (under SSP5-8.5 typically)
            const highScen = availableScenarios.includes('ssp585') ? 'ssp585' : availableScenarios[availableScenarios.length - 1];
            const series = (scenarioByRegion[highScen].get(region) || []);
            const peak = d3.max(series, d => d.amplification);
            const peakYr = series.find(d => Math.abs(d.amplification - peak) < 0.001)?.year || 2100;
            const peakFmt = (peak >= 0 ? '+' : '') + (peak ?? 0).toFixed(1);

            panel.innerHTML = `
        <div class="small-panel-title">${region}</div>
        <div class="small-panel-stat">${peakFmt}°C</div>
        <div class="small-panel-substat">PEAK BY ${peakYr} · SSP5-8.5</div>
        <svg class="small-panel-svg" viewBox="0 0 260 130" preserveAspectRatio="xMidYMid meet"></svg>
      `;
            container.appendChild(panel);

            // Draw the small chart
            const svg = d3.select(panel).select('svg');
            const sw = 260, sh = 130, sm = { t: 8, r: 10, b: 18, l: 10 };
            const allYears = [...new Set(data.map(d => d.year))].sort((a, b) => a - b);
            const allRegionAmps = [];
            availableScenarios.forEach(scen => {
                (scenarioByRegion[scen].get(region) || []).forEach(d => allRegionAmps.push(d.amplification));
            });
            (histByRegion.get(region) || []).forEach(d => allRegionAmps.push(d.amplification));
            const sx = d3.scaleLinear().domain(d3.extent(allYears)).range([sm.l, sw - sm.r]);
            const ext = d3.extent(allRegionAmps);
            const pad = (ext[1] - ext[0]) * 0.1 || 1;
            const sy = d3.scaleLinear()
                .domain([ext[0] - pad, ext[1] + pad])
                .range([sh - sm.b, sm.t]);

            // Zero line
            svg.append('line')
                .attr('x1', sx(allYears[0])).attr('x2', sx(allYears[allYears.length - 1]))
                .attr('y1', sy(0)).attr('y2', sy(0))
                .attr('stroke', 'var(--ink-faint)')
                .attr('stroke-width', 0.5)
                .attr('stroke-dasharray', '2,3');

            // Historical (shared, neutral gray)
            const hist = (histByRegion.get(region) || []).sort((a, b) => a.year - b.year);
            const lineG = d3.line()
                .x(d => sx(d.year)).y(d => sy(d.amplification))
                .curve(d3.curveMonotoneX);

            svg.append('path')
                .datum(hist)
                .attr('fill', 'none')
                .attr('stroke', 'var(--ink-faint)')
                .attr('stroke-width', 1.2)
                .attr('d', lineG);

            // One line per scenario
            availableScenarios.forEach(scen => {
                const meta = SCENARIOS_META[scen] || { color: '#9aa6b2' };
                const seriesScen = (scenarioByRegion[scen].get(region) || []).sort((a, b) => a.year - b.year);
                // Stitch to last historical point for visual continuity
                const lastHist = hist[hist.length - 1];
                const stitched = lastHist ? [lastHist, ...seriesScen] : seriesScen;
                svg.append('path')
                    .datum(stitched)
                    .attr('fill', 'none')
                    .attr('stroke', meta.color)
                    .attr('stroke-width', 1.5)
                    .attr('opacity', 0.95)
                    .attr('d', lineG);
            });

            // X-axis labels
            [allYears[0], allYears[allYears.length - 1]].forEach((yr, i) => {
                svg.append('text')
                    .attr('x', sx(yr)).attr('y', sh - 4)
                    .style('font-family', "'JetBrains Mono', monospace")
                    .style('font-size', '9px')
                    .attr('fill', 'var(--ink-faint)')
                    .attr('text-anchor', i === 0 ? 'start' : 'end')
                    .text(yr);
            });

            panel.addEventListener('click', () => {
                selectedRegion = region;
                document.querySelectorAll('.small-panel').forEach(p =>
                    p.classList.toggle('selected', p.dataset.region === region));
                renderDetail();
                document.getElementById('detail-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
            });
        });
    }

    buildSmallMultiples();

    // ═══ Detail panel ═══════════════════════════════════════
    function renderDetail() {
        if (!selectedRegion) return;

        document.getElementById('detail-section').classList.add('active');
        document.getElementById('detail-title').textContent =
            selectedRegion + ' region · ' + (SCENARIOS_META[currentScenario]?.label || currentScenario);

        // Peak amplification under this scenario
        const series = (scenarioByRegion[currentScenario].get(selectedRegion) || []);
        const peak = d3.max(series, d => d.amplification);
        const peakRec = series.find(d => Math.abs(d.amplification - peak) < 0.001);
        const peakFmt = (peak >= 0 ? '+' : '') + (peak ?? 0).toFixed(2);
        document.getElementById('peak-stat').innerHTML = `${peakFmt}<span class="unit">°C</span>`;
        document.getElementById('peak-sub').textContent = `at ${peakRec?.year || '—'} · vs. global mean`;

        // Anomaly at 2100
        const at2100 = series.find(d => d.year === 2100) || series[series.length - 1];
        const a2100Fmt = at2100 ? (at2100.anomaly >= 0 ? '+' : '') + at2100.anomaly.toFixed(2) : '—';
        document.getElementById('anom-stat').innerHTML = `${a2100Fmt}<span class="unit">°C</span>`;
        document.getElementById('anom-sub').textContent = `at ${at2100?.year || 2100} · vs. 1951–1980 baseline`;

        // Milestone text
        const milestoneText = generateMilestone(selectedRegion, currentScenario);
        document.getElementById('detail-milestone-text').textContent = milestoneText;

        // Detail chart - large amplification trajectory
        renderDetailChart();
    }

    function generateMilestone(region, scenario) {
        const series = (scenarioByRegion[scenario].get(region) || []);
        const peak = d3.max(series, d => d.amplification);
        const at2100 = series.find(d => d.year === 2100);

        const scenLabel = SCENARIOS_META[scenario]?.label || scenario;
        if (region === 'polar') {
            if (peak > 5) return `Under ${scenLabel}, polar regions reach roughly ${peak.toFixed(1)}°C above the global mean — a textbook case of Arctic amplification driven by sea-ice loss and reduced thermal buffering.`;
            return `Polar amplification under ${scenLabel} stays moderate at around ${peak.toFixed(1)}°C above the global mean — a markedly milder outcome than the high-emissions trajectories.`;
        }
        if (region === 'tropical') {
            if (peak < 0) return `Tropical regions actually warm slower than the global mean — peaking at ${peak.toFixed(1)}°C below it. Their vast ocean buffering damps the warming signal.`;
            return `Tropical amplification stays near zero (peak ${peak.toFixed(1)}°C) — the region tracks the global mean closely.`;
        }
        if (region === 'temperate') {
            return `Temperate-latitude amplification reaches ${peak.toFixed(1)}°C above the global mean, reflecting strong continental-interior warming (land warms faster than ocean).`;
        }
        return `Subtropical regions show modest amplification, peaking at ${peak.toFixed(1)}°C — between the muted tropical signal and the stronger temperate-latitude warming.`;
    }

    function renderDetailChart() {
        const region = selectedRegion;
        const svg = d3.select('#detail-chart');
        svg.selectAll('*').remove();

        const DC = { w: 760, h: 360, m: { t: 20, r: 30, b: 50, l: 60 } };
        const allYears = [...new Set(data.map(d => d.year))].sort((a, b) => a - b);

        // Get all amplification values for this region across scenarios
        const allAmps = [];
        availableScenarios.forEach(scen => {
            (scenarioByRegion[scen].get(region) || []).forEach(d => allAmps.push(d.amplification));
        });
        (histByRegion.get(region) || []).forEach(d => allAmps.push(d.amplification));

        const dx = d3.scaleLinear()
            .domain(d3.extent(allYears))
            .range([DC.m.l, DC.w - DC.m.r]);
        const dyExt = d3.extent(allAmps);
        const dpad = (dyExt[1] - dyExt[0]) * 0.1 || 1;
        const dy = d3.scaleLinear()
            .domain([dyExt[0] - dpad, dyExt[1] + dpad])
            .range([DC.h - DC.m.b, DC.m.t]).nice();

        // Axes
        svg.append('g').attr('class', 'axis')
            .attr('transform', `translate(0,${DC.h - DC.m.b})`)
            .call(d3.axisBottom(dx).tickFormat(d3.format('d')).ticks(8));
        svg.append('g').attr('class', 'axis')
            .attr('transform', `translate(${DC.m.l},0)`)
            .call(d3.axisLeft(dy).tickFormat(d => (d > 0 ? '+' : '') + d + '°'));

        svg.append('text')
            .attr('transform', 'rotate(-90)')
            .attr('x', -DC.h / 2).attr('y', 16)
            .attr('text-anchor', 'middle')
            .style('font-family', "'JetBrains Mono', monospace")
            .style('font-size', '10px')
            .attr('fill', 'var(--ink-faint)')
            .text('Amplification (°C above/below global mean)');

        // Gridlines
        dy.ticks(6).forEach(t => {
            svg.append('line')
                .attr('class', 'grid-line')
                .attr('x1', DC.m.l).attr('x2', DC.w - DC.m.r)
                .attr('y1', dy(t)).attr('y2', dy(t));
        });

        // Zero line emphasized
        svg.append('line')
            .attr('x1', DC.m.l).attr('x2', DC.w - DC.m.r)
            .attr('y1', dy(0)).attr('y2', dy(0))
            .attr('stroke', 'var(--ink-faint)')
            .attr('stroke-width', 1);

        // 2015 transition
        svg.append('line')
            .attr('x1', dx(2015)).attr('x2', dx(2015))
            .attr('y1', DC.m.t).attr('y2', DC.h - DC.m.b)
            .attr('stroke', 'var(--ink-faint)')
            .attr('stroke-width', 0.6)
            .attr('stroke-dasharray', '3,4');

        // Historical line (shared, neutral)
        const hist = (histByRegion.get(region) || []).sort((a, b) => a.year - b.year);
        const lineG = d3.line()
            .x(d => dx(d.year)).y(d => dy(d.amplification))
            .curve(d3.curveMonotoneX);

        svg.append('path')
            .datum(hist)
            .attr('fill', 'none')
            .attr('stroke', 'var(--ink-faint)')
            .attr('stroke-width', 1.5)
            .attr('d', lineG);

        // One line per scenario, with the currently selected scenario emphasized
        availableScenarios.forEach(scen => {
            const meta = SCENARIOS_META[scen] || { color: '#9aa6b2', label: scen };
            const seriesScen = (scenarioByRegion[scen].get(region) || []).sort((a, b) => a.year - b.year);
            const lastHist = hist[hist.length - 1];
            const stitched = lastHist ? [lastHist, ...seriesScen] : seriesScen;
            const isActive = scen === currentScenario;

            svg.append('path')
                .datum(stitched)
                .attr('fill', 'none')
                .attr('stroke', meta.color)
                .attr('stroke-width', isActive ? 2.5 : 1.3)
                .attr('opacity', isActive ? 1 : 0.45)
                .attr('d', lineG);

            // Endpoint label
            const last = stitched[stitched.length - 1];
            if (last) {
                svg.append('text')
                    .attr('x', dx(last.year) + 4)
                    .attr('y', dy(last.amplification) + 3)
                    .style('font-family', "'JetBrains Mono', monospace")
                    .style('font-size', '10px')
                    .attr('fill', meta.color)
                    .attr('opacity', isActive ? 1 : 0.5)
                    .text(meta.label);
            }
        });
    }

    document.getElementById('detail-close').addEventListener('click', () => {
        document.getElementById('detail-section').classList.remove('active');
        selectedRegion = null;
        document.querySelectorAll('.small-panel').forEach(p => p.classList.remove('selected'));
    });

    document.getElementById('narrative-dismiss').addEventListener('click', () => {
        document.getElementById('narrative').classList.add('collapsed');
    });

})();
