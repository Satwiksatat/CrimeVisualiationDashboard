const tooltip = d3.select("#tooltip");
const chartLookup = {}; 
function slugify(label) {
    if (typeof label !== 'string') return '';
    return label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        const context = this;
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(context, args), wait);
    };
}

function drawLineChart(data, mapping, targetSvgSelector, legendContainerSelector) {
    console.log(`Drawing Line Chart in ${targetSvgSelector}...`);
    const targetSvg = d3.select(targetSvgSelector);
    const legendContainer = document.querySelector(legendContainerSelector);

    if (targetSvg.empty() || !legendContainer) {
        console.error(`Missing elements for drawLineChart: SVG=${targetSvgSelector}, Legend=${legendContainerSelector}`);
        const chartArea = document.querySelector(targetSvgSelector)?.parentElement;
        if (chartArea) chartArea.innerHTML = `<p style="color:red;">Chart rendering error: Target elements not found.</p>`;
        return;
    }

    targetSvg.html(""); 
    legendContainer.innerHTML = ""; 
    const chartGroup = targetSvg.append("g").attr("class", "chart-group");

    function drawChartContent() {
        const parentNode = targetSvg.node()?.parentElement;
        if (!parentNode) { console.error("Cannot draw chart: Parent node not found."); return; }
        const containerWidth = parentNode.getBoundingClientRect().width;
        const containerHeight = parentNode.getBoundingClientRect().height;
        if (!containerWidth || !containerHeight || containerWidth < 50 || containerHeight < 50) {
             console.warn("Cannot draw chart: Parent has zero or very small dimensions.");
             targetSvg.html(`<text x="50%" y="50%" text-anchor="middle" fill="currentColor" font-size="14px">Container too small</text>`);
             return;
        }

        targetSvg.attr("width", containerWidth).attr("height", containerHeight);
        const margin = { top: 60, right: 30, bottom: 60, left: 70 };
        const innerW = Math.max(10, containerWidth - margin.left - margin.right);
        const innerH = Math.max(10, containerHeight - margin.top - margin.bottom);

        chartGroup.attr("transform", `translate(${margin.left},${margin.top})`);
        chartGroup.selectAll("*").remove(); 
        targetSvg.selectAll(".chart-title").remove(); 

        const grouped = d3.group(data, d => d.label);
        const allLabels = Array.from(grouped.keys());

        if (data.length === 0) {
            targetSvg.html(`<text x="50%" y="50%" text-anchor="middle" fill="currentColor" font-size="14px">No data available for this chart.</text>`);
            return;
        }

        const xDomain = [...new Set(data.map(d => d.x))].sort();
        const x = d3.scalePoint().domain(xDomain).range([0, innerW]).padding(0.5);
        const y = d3.scaleLinear().domain([0, d3.max(data, d => +d.y) || 10]).nice().range([innerH, 0]);

        chartGroup.append("g").attr("class", "axis x-axis").attr("transform", `translate(0, ${innerH})`)
            .call(d3.axisBottom(x).tickSizeOuter(0));
        chartGroup.append("g").attr("class", "axis y-axis").call(d3.axisLeft(y).ticks(8));

        const color = d3.scaleOrdinal(d3.schemeTableau10).domain(allLabels);
        const lineGenerator = d3.line().x(d => x(d.x)).y(d => y(+d.y));
        const linePathsGroup = chartGroup.append("g").attr("class", "lines");
        grouped.forEach((series, label) => {
            const className = `line-${slugify(label)}`;
            const sortedSeries = series.sort((a, b) => xDomain.indexOf(a.x) - xDomain.indexOf(b.x));

            const path = linePathsGroup.append("path")
                .datum(sortedSeries)
                .attr("class", `line-path ${className}`)
                .attr("fill", "none")
                .attr("stroke", color(label))
                .attr("stroke-width", 2)
                .attr("d", lineGenerator);

            const totalLength = path.node().getTotalLength(); 

            path.attr("stroke-dasharray", totalLength + " " + totalLength)
                .attr("stroke-dashoffset", totalLength)            
                .transition()                                     
                .duration(1500)                                        
                .ease(d3.easeLinear)                                 
                .attr("stroke-dashoffset", 0);                        

            path.on("mouseover", function (event, seriesData) {
                d3.selectAll(`#${targetSvg.attr('id')} .line-path`).filter(':not(.hovered)').style("opacity", 0.2); 
                d3.select(this).classed('hovered', true).style("opacity", 1).attr("stroke-width", 3.5); 

                const [pointerX] = d3.pointer(event, chartGroup.node());
                let closestX = null; let minDist = Infinity;
                xDomain.forEach(domainVal => {
                    const scaledX = x(domainVal);
                    if (typeof scaledX === 'number' && isFinite(scaledX)) {
                        const dist = Math.abs(scaledX - pointerX);
                        if (dist < minDist) { minDist = dist; closestX = domainVal; }
                    }
                });
                const closestPoint = seriesData.find(p => p.x === closestX);
                let tooltipHtml = `<strong>${label}</strong>`;
                if (closestPoint) {
                    tooltipHtml += `<br>${mapping.x}: ${closestPoint.x}<br>${mapping.y}: ${d3.format(",")(closestPoint.y)}`;
                }
                tooltip.style("opacity", 0.9).html(tooltipHtml)
                    .style("left", `${event.pageX + 10}px`).style("top", `${event.pageY - 28}px`);
            }).on("mousemove", function (event) {
                tooltip.style("left", `${event.pageX + 10}px`).style("top", `${event.pageY - 28}px`);
            }).on("mouseout", function () {
                d3.selectAll(`#${targetSvg.attr('id')} .line-path`).style("opacity", 1).attr("stroke-width", 2).classed('hovered', false);
                tooltip.style("opacity", 0);
            });
        });


        legendContainer.innerHTML = "";
        const visibilityMap = new Map(allLabels.map(label => [label, true]));
        allLabels.forEach(label => {
            const item = document.createElement("div"); item.className = "legend-item"; item.style.cursor = "pointer"; item.style.opacity = 1;
            const swatch = document.createElement("div"); swatch.className = "legend-color"; swatch.style.backgroundColor = color(label);
            const text = document.createElement("span"); text.textContent = label;
            item.appendChild(swatch); item.appendChild(text); legendContainer.appendChild(item);
            const className = `line-${slugify(label)}`;

            item.addEventListener("click", () => {
                const isVisible = visibilityMap.get(label);
                visibilityMap.set(label, !isVisible);
                const targetPath = targetSvg.select(`.${className}`);
                targetPath.transition().duration(300)
                    .style("opacity", isVisible ? 0 : 1)
                    .style("pointer-events", isVisible ? "none" : "all");

                item.style.opacity = isVisible ? 0.4 : 1;
            });
        });
    } 
    const debouncedResizeHandler = debounce(drawChartContent, 250);
    drawChartContent(); 
    const resizeObserver = new ResizeObserver(debouncedResizeHandler);
    const targetElement = targetSvg.node()?.parentElement;
    if (targetElement) {
        resizeObserver.observe(targetElement);

        targetSvg.node().__resizeObserver__ = resizeObserver;
    } else { console.error("Could not attach ResizeObserver."); }
} 

function drawRadialBar(data, targetDivSelector, title = "Radial Bar Chart") {
    console.log(`Drawing Radial Bar Chart in ${targetDivSelector}...`);
    const targetDiv = d3.select(targetDivSelector);

    if (targetDiv.empty()) {
        console.error(`Target div ${targetDivSelector} not found for radial bar chart.`);
        const containerElement = document.querySelector(targetDivSelector);
        if(containerElement) containerElement.innerHTML = "<p style='color:red;'>Error: Chart container not found.</p>";
        return;
    }
    targetDiv.html(""); 

    setTimeout(() => {
        const parentNode = targetDiv.node()?.parentElement;
        if (!parentNode) { console.error("Cannot draw radial chart: Parent node not found."); return; }

        const containerWidth = targetDiv.node().getBoundingClientRect().width;
        const containerHeight = targetDiv.node().getBoundingClientRect().height;
        console.log(`Radial Chart Container Dimensions: W=${containerWidth}, H=${containerHeight}`);

         if (!containerWidth || !containerHeight || containerWidth < 100 || containerHeight < 100) {
             console.warn("Cannot draw radial chart: Chart area has zero or very small dimensions.");
             targetDiv.html(`<p style='color:orange; text-align: center; padding-top: 50px;'>Chart area too small</p>`);
             return;
         }

        const margin = { top: 55, right: 30, bottom: 30, left: 30 }; 
        const usableWidth = Math.max(10, containerWidth - margin.left - margin.right);
        const usableHeight = Math.max(10, containerHeight - margin.top - margin.bottom);
        const baseSize = Math.min(usableWidth, usableHeight); 

        const width = baseSize; 
        const height = baseSize;

        const outerRadius = baseSize * 0.50; 
        const innerRadius = baseSize * 0.2; 

        const categoryLabelRadius = outerRadius + (baseSize * 0.05); 
        const categoryDotRadius = outerRadius + (baseSize * 0.025);  

        console.log(`Radial Chart Calculated Sizes: baseSize=${baseSize}, innerR=${innerRadius.toFixed(1)}, outerR=${outerRadius.toFixed(1)}`);

        const svg = targetDiv.append("svg")
            .attr("viewBox", `0 0 ${containerWidth} ${containerHeight}`) 
            .attr("preserveAspectRatio", "xMidYMid meet")
            .attr("width", "100%")
            .attr("height", "100%")
            .append("g")
            .attr("transform", `translate(${containerWidth / 2}, ${containerHeight / 2})`);

        const colorMap = {
            "VIOLENCE AGAINST THE PERSON": "#1f77b4", "SEXUAL OFFENCES": "#ff7f0e", "ROBBERY": "#2ca02c",
            "THEFT": "#d62728", "BURGLARY": "#9467bd", "DRUG OFFENCES": "#8c564b", "CRIMINAL DAMAGE": "#e377c2",
            "PUBLIC ORDER OFFENCES": "#7f7f7f", "POSSESSION OF WEAPONS": "#bcbd22",
            "MISCELLANEOUS CRIMES AGAINST SOCIETY": "#17becf", "FRAUD AND FORGERY": "#aec7e8", "VEHICLE OFFENCES": "#ffbb78"
        };
        const defaultColor = "#cccccc";
        const categories = Array.from(new Set(data.map(d => d.label))).sort();
        const phaseOrder = ["Pre-Lockdown", "Lockdown 1", "Post-Lockdown 1", "Lockdown 2", "Post-Lockdown 2", "Lockdown 3", "Post-Lockdown 3"];
        const phases = Array.from(new Set(data.map(d => d.x))).sort((a, b) => {
             let indexA = phaseOrder.indexOf(a); let indexB = phaseOrder.indexOf(b);
             if (indexA === -1) indexA = Infinity; if (indexB === -1) indexB = Infinity; return indexA - indexB;
        });
        const xLabels = data.map(d => `${d.label}__${d.x}`);

        const x = d3.scaleBand().domain(xLabels.sort((a, b) => { 
                const [catA, phaseA] = a.split('__'); const [catB, phaseB] = b.split('__');
                const catIndexA = categories.indexOf(catA); const catIndexB = categories.indexOf(catB);
                if (catIndexA !== catIndexB) return catIndexA - catIndexB;
                const phaseIndexA = phaseOrder.indexOf(phaseA); const phaseIndexB = phaseOrder.indexOf(phaseB);
                if (phaseIndexA === -1 && phaseIndexB === -1) return 0; if (phaseIndexA === -1) return 1; if (phaseIndexB === -1) return -1;
                return phaseIndexA - phaseIndexB;
            })).range([0, 2 * Math.PI])
            .paddingInner(0.1) 
            .paddingOuter(0.2)
            .align(0.5);

        const maxVal = d3.max(data, d => +d.y);
        const y = d3.scaleRadial().domain([0, maxVal * 1.05]).range([innerRadius, outerRadius]);

        const yAxis = svg.append("g").attr("class", "y-axis").attr("text-anchor", "middle");
        const yTickCount = Math.max(3, Math.min(5, Math.floor(outerRadius / 40))); 
        const yTicks = y.ticks(yTickCount);
        yAxis.selectAll(".grid-circle").data(yTicks).join("circle").attr("class", "grid-circle")
            .attr("r", d => y(d))
            .attr("fill", "none")
            .attr("stroke", "currentColor") 
            .attr("stroke-opacity", 0.15) 
            .attr("stroke-dasharray", "3,3");
        yAxis.selectAll(".tick-label").data(yTicks.slice(1)).join("text").attr("class", "tick-label")
            .attr("x", 4)
            .attr("y", d => -y(d))
            .attr("dy", "-0.4em")
            .style("font-size", "9px") 
            .attr("text-anchor", "start").text(d => d3.format("~s")(d));

        const bars = svg.append("g").attr("class", "bars").selectAll("path").data(data).join("path")
            .attr("fill", d => colorMap[d.label] || defaultColor)
            .attr("class", d => `radial-bar bar-${slugify(d.label)} bar-${slugify(d.x)}`)
            .attr("d", d3.arc().innerRadius(innerRadius).outerRadius(innerRadius) 
                .startAngle(d => x(`${d.label}__${d.x}`)).endAngle(d => x(`${d.label}__${d.x}`) + x.bandwidth())
                .padAngle(0.01).padRadius(innerRadius).cornerRadius(3)
            );

        bars.transition().duration(1200).delay((d, i) => i * 3)
            .attrTween("d", d => {
                 const targetOuterRadius = y(Math.max(0, +d.y || 0));
                 const finalOuterRadius = (isNaN(targetOuterRadius) || targetOuterRadius < innerRadius) ? innerRadius : targetOuterRadius;

                 const interpolate = d3.interpolate(innerRadius, finalOuterRadius);
                 const arcGenerator = d3.arc().innerRadius(innerRadius)
                     .startAngle(x(`${d.label}__${d.x}`)).endAngle(x(`${d.label}__${d.x}`) + x.bandwidth())
                     .padAngle(0.01).padRadius(innerRadius).cornerRadius(3);
                 return t => arcGenerator.outerRadius(interpolate(t))(d); 
            });

        svg.append("g")
          .attr("class", "bar-labels")
          .selectAll("g")
          .data(data)
          .join("g") 
            .attr("text-anchor", function(d) {
                const midAngleRad = x(`${d.label}__${d.x}`) + x.bandwidth() / 2;
                const midAngleDeg = (midAngleRad * 180 / Math.PI) - 90;
                return (midAngleDeg % 360 > 90 && midAngleDeg % 360 < 270) ? "end" : "start";
            })
            .attr("transform", function(d) {
                const midAngleRad = x(`${d.label}__${d.x}`) + x.bandwidth() / 2;
                const midAngleDeg = (midAngleRad * 180 / Math.PI) - 90; 
                const barOuterRadius = y(Math.max(0, +d.y || 0));
                const labelRadius = Math.max(innerRadius + 5, barOuterRadius + 5);
                const effectiveAngleRad = midAngleRad - Math.PI / 2; 

                const labelX = labelRadius * Math.cos(effectiveAngleRad);
                const labelY = labelRadius * Math.sin(effectiveAngleRad);

                let rotation = midAngleDeg;
                if (midAngleDeg % 360 > 90 && midAngleDeg % 360 < 270) {
                    rotation += 180;
                }
                return `translate(${labelX}, ${labelY}) rotate(${rotation})`;
             })
           .append("text")
             .filter(d => +d.y >= 0)
             .text(d => d3.format(",")(d.y))
             .style("font-size", "8px") 
             .style("fill", "currentColor") 
             .attr("alignment-baseline", "middle"); 

            const labelGroups = svg.select(".bar-labels").selectAll("g");

            labelGroups.style("cursor", "default") 
                .on("mouseover", function (event, d) {
                    const labelSlug = slugify(d.label);
                    const phaseSlug = slugify(d.x);
                    svg.select(`.radial-bar bar-${labelSlug} bar-${phaseSlug}`)
                    .attr("stroke", "#333").attr("stroke-width", 0.5).attr("opacity", 0.85);

                    tooltip.style("opacity", 0.9)
                    .html(`<strong>${d.label}</strong><br>Phase: ${d.x}<br>Count: ${d3.format(",")(d.y)}`)
                    .style("left", `${event.pageX + 5}px`).style("top", `${event.pageY - 28}px`);
                })
                .on("mousemove", function (event) {
                    tooltip.style("left", `${event.pageX + 5}px`).style("top", `${event.pageY - 28}px`);
                })
                .on("mouseout", function (event, d) {
                    const labelSlug = slugify(d.label);
                    const phaseSlug = slugify(d.x);
                    svg.select(`.radial-bar bar-${labelSlug} bar-${phaseSlug}`)
                    .attr("stroke", "none").attr("stroke-width", 0).attr("opacity", 1);

                    tooltip.style("opacity", 0);
                });

        const categoryGroup = svg.append("g").attr("class", "category-markers");
        categories.forEach(category => {
             const categoryDomain = x.domain().filter(label => label.startsWith(`${category}__`));
             if (categoryDomain.length === 0) return;
             const firstAngle = x(categoryDomain[0]);
             const lastAngle = x(categoryDomain[categoryDomain.length - 1]) + x.bandwidth();
             const midAngle = (firstAngle + lastAngle) / 2;
             const angle = midAngle - Math.PI / 2; 

             categoryGroup.append("circle")
                 .attr("cx", Math.cos(angle) * categoryDotRadius)
                 .attr("cy", Math.sin(angle) * categoryDotRadius)
                 .attr("r", 4) 
                 .attr("fill", colorMap[category] || defaultColor);


             const textEl = categoryGroup.append("text")
                 .attr("x", Math.cos(angle) * categoryLabelRadius)
                 .attr("y", Math.sin(angle) * categoryLabelRadius)
                 .attr("dy", "0.35em")
                 .style("font-size", "10px")  


             const angleDegrees = (midAngle * 180 / Math.PI) % 360; 
             if (angleDegrees > 10 && angleDegrees < 170) { textEl.attr("text-anchor", "start"); }
             else if (angleDegrees > 190 && angleDegrees < 350) { textEl.attr("text-anchor", "end"); }
             else { textEl.attr("text-anchor", "middle"); }

             textEl.text(category); 
        });

        bars.on("mouseover", function (event, d) {
                d3.select(this).attr("stroke", "#333").attr("stroke-width", 0.5).attr("opacity", 0.85);
                tooltip.style("opacity", 0.9)
                  .html(`<strong>${d.label}</strong><br>Phase: ${d.x}<br>Count: ${d3.format(",")(d.y)}`)
                  .style("left", `${event.pageX + 5}px`).style("top", `${event.pageY - 28}px`);
            })
            .on("mousemove", function (event) {
                tooltip.style("left", `${event.pageX + 5}px`).style("top", `${event.pageY - 28}px`);
            })
            .on("mouseout", function () {
                d3.select(this).attr("stroke", "none").attr("stroke-width", 0).attr("opacity", 1);
                tooltip.style("opacity", 0);
            });

        svg.append("text")
            .attr("text-anchor", "middle").attr("dy", "0.30em")
            .style("font-size", baseSize < 300 ? "9px" : "11px") 
            .style("font-weight", "bold")
            .style("fill", "var(--muted-text-color)")
            .text("Lockdown Phases");

    }, 50); 

} 

    let map = null;
    let geojsonLayer = null;
    let crimeData = {};
    let mapLegend = L.control({position: 'bottomright'});

    function initMap() {
        if (map) return;
        console.log("Initializing Leaflet map...");
        try {
            map = L.map('map-container').setView([51.5074, -0.1278], 10);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap &copy; CARTO', maxZoom: 19
            }).addTo(map);

            mapLegend.onAdd = function (map) {
                this._div = L.DomUtil.create('div', 'info legend');
                this.update();
                return this._div;
            };
            mapLegend.update = function (grades, colorScale) {
                 if (!this._div) return;
                 let content = '<h4>Crime Count</h4>';
                 if (!grades || !colorScale || grades.length === 0) { content += 'No data available'; }
                 else {
                    let scaleHtml = '<div class="legend-scale"><ul>';
                    let labelHtml = '<div class="legend-labels"><ul>';
                    let numBlocks = grades.length;
                    for (let i = 0; i < numBlocks; i++) {
                        const from = grades[i];
                        const color = colorScale(from + (i === 0 ? 0.1 : 1));
                        scaleHtml += `<li style="background-color: ${color}"></li>`;
                        labelHtml += `<li>${d3.format("~s")(from)}</li>`;
                    }
                    const lastGrade = grades[numBlocks - 1];
                    const nextStepEstimate = (grades.length > 1) ? (lastGrade + (grades[1] - grades[0])) : lastGrade * 1.1;
                    labelHtml += `<li>${d3.format("~s")(nextStepEstimate)}+</li>`;
                    scaleHtml += '</ul></div>'; labelHtml += '</ul></div>';
                    content += scaleHtml + labelHtml;
                    const labelsUl = this._div.querySelector('.legend-labels ul');
                    if (labelsUl) { const blockWidth = 25; labelsUl.style.width = `calc(${blockWidth}px * ${numBlocks + 1})`; }
                 }
                  this._div.innerHTML = content;
            };
            mapLegend.addTo(map);

            loadCrimeTypes();
            loadMapData();
        } catch (error) {
            console.error("Leaflet map initialization failed:", error);
            const mapContainer = document.getElementById('map-container');
            if (mapContainer) mapContainer.innerHTML = `<p style="color:red; padding: 20px; text-align: center;">Error initializing map. ${error.message}</p>`;
        }
    }

    function loadCrimeTypes() {
         fetch('/data/crime-types')
            .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
            .then(types => {
                const select = document.getElementById('crime-type-select');
                if (!select) return;
                select.innerHTML = '';
                types.forEach(type => {
                    const option = document.createElement('option'); option.value = type; option.textContent = type; select.appendChild(option);
                });
                select.value = 'All';
            })
            .catch(error => { console.error('Error loading crime types:', error); });
    }

    function loadMapData() {
        const selectedCrimeType = document.getElementById('crime-type-select')?.value || 'All';
        const dataUrl = `/data/crime-choropleth?crime_type=${encodeURIComponent(selectedCrimeType)}`;
        console.log(`Loading map data from: ${dataUrl}`);
        if (mapLegend?.update) mapLegend.update();

        Promise.all([
            fetch('/geojson/london-boroughs').then(res => { if (!res.ok) throw new Error(`GeoJSON ${res.status}`); return res.json(); }),
            fetch(dataUrl).then(res => { if (!res.ok) throw new Error(`Crime data ${res.status}`); return res.json(); })
        ])
        .then(([geojsonFeatureCollection, crimeCounts]) => {
            console.log("Map data received. Crime Counts:", crimeCounts);
            crimeData = crimeCounts;

            const counts = Object.values(crimeData).filter(v => v !== null && v > 0);
            if (counts.length === 0) console.warn("No positive crime counts found for scale.");

            const maxCount = d3.max(counts) || 1;
            const quantiles = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
            const quantileBreaks = quantiles.map(q => d3.quantile(counts.sort((a,b)=>a-b), q)).filter(b => typeof b === 'number' && !isNaN(b));
            let domainBreaks = quantileBreaks.length > 1 ? [...new Set(quantileBreaks)] : [0, maxCount];
            if (domainBreaks.length < 2) domainBreaks = [0, maxCount];
            console.log("Scale domain breaks:", domainBreaks);

            const numThresholds = domainBreaks.length - 1;
            const colorRange = d3.schemeBlues[Math.max(3, Math.min(9, numThresholds + 1))];
            const colorScale = d3.scaleThreshold().domain(domainBreaks.slice(1)).range(colorRange);
            const grades = domainBreaks;

            if (geojsonLayer && map?.hasLayer(geojsonLayer)) map.removeLayer(geojsonLayer);
            if (!map) { console.error("Map not initialized."); return; }

            let featuresStyledCount = 0, featuresWithData = 0;
            geojsonLayer = L.geoJSON(geojsonFeatureCollection, {
                style: function(feature) {
                    const boroughName = feature?.properties?.name;
                    if (!boroughName || typeof boroughName !== 'string') { return { fillColor: '#CCC', weight: 1, color: '#BBB', fillOpacity: 0.5 }; }
                    const trimmedName = boroughName.trim();
                    const count = crimeData[trimmedName];
                    const hasData = crimeData.hasOwnProperty(trimmedName);
                    if(hasData) featuresWithData++;
                    featuresStyledCount++;
                    return { fillColor: hasData && count > 0 ? colorScale(count) : '#FFFFFF', weight: 1, opacity: 1, color: '#BBB', fillOpacity: 0.7 };
                },
                onEachFeature: function(feature, layer) {
                    const boroughName = feature?.properties?.name;
                    if (!boroughName || typeof boroughName !== 'string') return;
                    const trimmedName = boroughName.trim();
                    const count = crimeData[trimmedName];
                    const displayCount = (typeof count === 'number') ? d3.format(",")(count) : "N/A";
                    layer.bindTooltip(`<strong>${trimmedName}</strong><br>Count: ${displayCount}`, { sticky: true });
                    layer.on({ mouseover: highlightFeature, mouseout: resetHighlight, click: showBoroughPopup });
                }
            }).addTo(map);

            console.log(`Applied styles to ${featuresStyledCount} features. Found data for ${featuresWithData} boroughs.`);
            if (featuresWithData === 0 && geojsonFeatureCollection?.features?.length > 0) { console.error("CRITICAL: No boroughs from GeoJSON matched keys in crime data!"); /* ... */ }
            if (mapLegend?.update) mapLegend.update(grades, colorScale);

        })
        .catch(error => { console.error("Error loading map data:", error); /* ... */ });
    }

    function highlightFeature(e) {
         const layer = e.target;
         layer.setStyle({ weight: 3, color: '#666', fillOpacity: 0.9 });
         if (!L.Browser.ie && !L.Browser.opera && !L.Browser.edge) { layer.bringToFront(); }
    }
    function resetHighlight(e) { if (geojsonLayer) { geojsonLayer.resetStyle(e.target); } }

    function showBoroughPopup(e) {
        const layer = e.target;
        const props = layer?.feature?.properties;
        const boroughName = props?.name;
        if (!boroughName || typeof boroughName !== 'string') { console.error("Cannot show popup: Borough name missing."); return; }
    
        const selectedCrimeType = document.getElementById('crime-type-select')?.value || 'All';
        const detailUrl = `/data/borough-details/${encodeURIComponent(boroughName)}?crime_type=${encodeURIComponent(selectedCrimeType)}`;
        console.log(`Workspaceing details for ${boroughName} (${selectedCrimeType}) from ${detailUrl}`); // Log crime type
    
        const popupContainer = document.getElementById('popup-chart-container');
        const popupTitle = document.getElementById('popup-title');
        const popupChartDiv = d3.select("#popup-chart");
        if (!popupContainer || !popupTitle || !popupChartDiv) { console.error("Borough popup elements not found."); return; }
    
        popupTitle.textContent = `Monthly Count Data for Crime - ${selectedCrimeType} (2014–2024) - ${boroughName} `; // Update title
        popupChartDiv.html("<p>Loading...</p>");
        popupContainer.classList.add('visible');
    
        fetch(detailUrl)
            .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
            .then(boroughData => {
                console.log("Borough detail data received:", boroughData);
                if (!boroughData || boroughData.length === 0) {

                    popupChartDiv.html("<p>No detailed crime data available for the selected period or type.</p>");
                } else {
                    drawPopupChart(boroughData, boroughName, selectedCrimeType);
                }
            })
            .catch(error => {
                console.error('Error fetching borough details:', error);
                popupTitle.textContent = `${boroughName} - Error`; 
                popupChartDiv.html(`<p style='color: red;'>Could not load crime details. ${error.message || 'Check server connection.'}</p>`);
             });
    }
    

    function drawPopupChart(data, boroughName, crimeType) { 
        const chartDiv = d3.select("#popup-chart");
        chartDiv.html(""); 
        console.log(`Debugging Borough Chart: drawPopupChart called for ${boroughName} (${crimeType})`); 
    
        const containerWidth = chartDiv.node()?.getBoundingClientRect()?.width;
        if (!containerWidth || containerWidth < 100) {
            console.error("Could not get popup chart container width or too small.");
            chartDiv.html("<p>Chart area too small.</p>");
            return;
         }
    
        const containerHeight = 450; 
        const margin = { top: 30, right: 40, bottom: 70, left: 70 }; 
        const width = Math.max(10, containerWidth - margin.left - margin.right);
        const height = Math.max(10, containerHeight - margin.top - margin.bottom);
        console.log(`Debugging Borough Chart: Dimensions - W: ${width}, H: ${height}`);
    
        const svg = chartDiv.append("svg")
            .attr("width", containerWidth)
            .attr("height", containerHeight)
            .append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);
    
        const parseDate = d3.timeParse("%Y-%m");
        data.forEach(d => { d.parsedDate = parseDate(d.date); d.count = +d.count; });
        const validData = data.filter(d => d.parsedDate instanceof Date && !isNaN(d.parsedDate) && typeof d.count === 'number' && !isNaN(d.count))
                             .sort((a, b) => a.parsedDate - b.parsedDate); 
        console.log(`Debugging Borough Chart: Original data length: ${data.length}, Valid sorted data length: ${validData.length}`);
    
        if (validData.length === 0) {
            chartDiv.html("<p>No valid data entries found to draw chart.</p>");
            console.error("Debugging Borough Chart: No valid data after parsing.");
            return;
        }
    
        const xDomain = d3.extent(validData, d => d.parsedDate);
        const yDomain = [0, d3.max(validData, d => d.count) * 1.1 || 10];
        console.log(`Debugging Borough Chart: X Domain: ${xDomain}, Y Domain: ${yDomain}`);
    
        const x = d3.scaleTime().domain(xDomain).range([0, width]);
        const y = d3.scaleLinear().domain(yDomain).nice().range([height, 0]);
    
        try {
            svg.append("g").attr("class", "axis x-axis")
               .attr("transform", `translate(0,${height})`)
               .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0));
    
            svg.append("g").attr("class", "axis y-axis")
               .call(d3.axisLeft(y).ticks(8));
            console.log("Debugging Borough Chart: Axes drawn.");
        } catch(axisError) { console.error("Debugging Borough Chart: Error drawing axes:", axisError); chartDiv.html("<p style='color:red'>Error drawing chart axes.</p>"); return; }
    
        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("x", width / 2)
            .attr("y", height + margin.bottom / 1.5)
            .style("fill", "currentColor")
            .style("font-size", "12px")
            .text("Date (Month/Year)");
    
        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("transform", `rotate(-90)`) 
            .attr("x", -height / 2) 
            .attr("y", -margin.left / 1.5) 
            .style("fill", "currentColor")
            .style("font-size", "12px")
            .text("Number of Crimes");
    
        const line = d3.line()
            .x(d => x(d.parsedDate))
            .y(d => y(d.count))
            .curve(d3.curveMonotoneX); 
        try {
            const pathData = line(validData);
            if (!pathData) throw new Error("Line generator returned null/empty data.");
            console.log("Debugging Borough Chart: Line path data (first 100 chars):", pathData?.substring(0, 100));
    
            svg.append("path")
                .datum(validData)
                .attr("class", "line") 
                .attr("fill", "none") 
                .attr("stroke", "steelblue") 
                .attr("stroke-width", 1.5)
                .attr("d", pathData);
            console.log("Debugging Borough Chart: Line drawn.");
        } catch(lineError) { console.error("Debugging Borough Chart: Error drawing line:", lineError); chartDiv.html("<p style='color:red'>Error drawing chart line.</p>"); return; }
    
        const tooltip = d3.select("#tooltip");
        const bisectDate = d3.bisector(d => d.parsedDate).left;
    
        const focus = svg.append("g")
            .attr("class", "focus")
            .style("display", "none"); 
    
        focus.append("circle")
            .attr("r", 4.5)
            .style("fill", "none")
            .style("stroke", "black");
    
        focus.append("line") 
            .attr("class", "focus-line")
            .attr("y1", 0)
            .attr("y2", height)
            .style("stroke", "gray")
            .style("stroke-width", 1)
            .style("stroke-dasharray", "3,3")
            .style("opacity", 0.5);
    
        // Transparent overlay for capturing mouse events
        svg.append("rect")
            .attr("class", "overlay")
            .attr("width", width)
            .attr("height", height)
            .style("fill", "none")
            .style("pointer-events", "all") 
            .on("mouseover", () => {
                focus.style("display", null); 
                tooltip.style("opacity", 0.9); 
             })
            .on("mouseout", () => {
                focus.style("display", "none"); // Hide focus elements
                tooltip.style("opacity", 0); // Hide tooltip div
             })
            .on("mousemove", mousemove);
    
        function mousemove(event) {
            const [pointerX] = d3.pointer(event); 
            const xDate = x.invert(pointerX); 
            const i = bisectDate(validData, xDate, 1); 
            const d0 = validData[i - 1];
            const d1 = validData[i];
    
            let d;
            if (d0 && d1) {
                d = (xDate - d0.parsedDate > d1.parsedDate - xDate) ? d1 : d0;
            } else if (d0) {
                d = d0;
            } else if (d1) {
                d = d1;
            } else {
                return; 
            }
    
            const focusX = x(d.parsedDate);
            const focusY = y(d.count);
    
            focus.select("circle").attr("transform", `translate(${focusX},${focusY})`);
            focus.select(".focus-line").attr("x1", focusX).attr("x2", focusX);

            const tooltipDate = d3.timeFormat("%B %Y")(d.parsedDate); // Format date nicely
            tooltip.html(`<strong>${tooltipDate}</strong><br>Count: ${d3.format(",")(d.count)}`)
                   .style("left", (event.pageX + 15) + "px") // Position tooltip near mouse
                   .style("top", (event.pageY - 28) + "px");
        }
    
    } 
    
    const overallTrendButton = document.getElementById('show-overall-trend-button');
    const overallTrendPopup = document.getElementById('overall-trend-popup-container');
    const overallTrendChartDiv = d3.select("#overall-trend-popup-chart");
    const overallTrendLegendDiv = document.getElementById("overall-trend-popup-legend");
    const overallTrendTitle = document.getElementById("overall-trend-popup-title");
    let overallTrendData = null;
    let overallTrendMapping = null;

    function showOverallTrendPopup() {
        if (!overallTrendPopup || !overallTrendChartDiv || !overallTrendTitle || !overallTrendLegendDiv) {
            console.error("Overall trend popup elements not found!"); return;
        }
        overallTrendTitle.textContent = "Loading Overall Trend...";
        overallTrendChartDiv.html("<p>Loading...</p>");
        overallTrendLegendDiv.innerHTML = "";
        overallTrendPopup.classList.add('visible');

        if (overallTrendData && overallTrendMapping) {
            console.log("Using cached overall trend data.");
            overallTrendTitle.textContent = overallTrendMapping.title || "Overall Crime Trend (2014-2024)";
            overallTrendChartDiv.html('<svg id="overall-trend-svg"></svg>');
            drawLineChart(overallTrendData, overallTrendMapping, "#overall-trend-svg", "#overall-trend-popup-legend");
            return;
        }

        const trendDataUrl = '/data/Major_Crimes_Trend';
        console.log(`Fetching overall trend data from ${trendDataUrl}`);
        fetch(trendDataUrl)
            .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
            .then(response => {
                if (!response.data || !response.columns) throw new Error("Invalid data format.");
                overallTrendData = response.data; overallTrendMapping = response.columns;
                console.log("Overall trend data loaded.");
                overallTrendTitle.textContent = overallTrendMapping.title || "Overall Crime Trend (2014-2024)";
                overallTrendChartDiv.html('<svg id="overall-trend-svg"></svg>');
                drawLineChart(overallTrendData, overallTrendMapping, "#overall-trend-svg", "#overall-trend-popup-legend");
            })
            .catch(error => {
                console.error("Error fetching overall trend data:", error);
                overallTrendTitle.textContent = "Error Loading Trend";
                overallTrendChartDiv.html(`<p style='color:red;'>Could not load overall trend data. ${error.message}</p>`);
             });
    }

    const lockdownChartButton = document.getElementById('show-lockdown-chart-button');
    const lockdownChartPopup = document.getElementById('lockdown-chart-popup-container');
    const lockdownChartChartDiv = d3.select("#lockdown-chart-popup-chart");
    const lockdownChartTitle = document.getElementById("lockdown-chart-popup-title");
    let lockdownChartData = null;
    let lockdownChartMapping = null;

    function showLockdownChartPopup() {
        if (!lockdownChartPopup || !lockdownChartChartDiv || !lockdownChartTitle) {
            console.error("Lockdown chart popup elements not found!"); return;
        }
        lockdownChartTitle.textContent = "Loading Lockdown Phase Data...";
        lockdownChartChartDiv.html("<p>Loading...</p>");
        lockdownChartPopup.classList.add('visible');

        if (lockdownChartData && lockdownChartMapping) {
             console.log("Using cached lockdown chart data.");
             lockdownChartTitle.textContent = lockdownChartMapping.title || "Crime During Lockdown Phases";
             drawRadialBar(lockdownChartData, "#lockdown-chart-popup-chart", lockdownChartMapping.title);
             return;
        }

        const lockdownDataUrl = '/data/Crime_Lockdown_Patterns';
        console.log(`Fetching lockdown chart data from ${lockdownDataUrl}`);
        fetch(lockdownDataUrl)
            .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
            .then(response => {
                if (!response.data || !response.columns) throw new Error("Invalid data format for lockdown chart.");
                lockdownChartData = response.data;
                lockdownChartMapping = response.columns;
                console.log("Lockdown chart data loaded.");
                lockdownChartTitle.textContent = lockdownChartMapping.title || "Crime During Lockdown Phases";
                drawRadialBar(lockdownChartData, "#lockdown-chart-popup-chart", lockdownChartMapping.title);
            })
            .catch(error => {
                console.error("Error fetching lockdown chart data:", error);
                lockdownChartTitle.textContent = "Error Loading Data";
                lockdownChartChartDiv.html(`<p style='color:red;'>Could not load lockdown phase data. ${error.message}</p>`);
             });
    }

    document.addEventListener('DOMContentLoaded', () => {
        initMap(); 

        if (overallTrendButton) { overallTrendButton.addEventListener('click', showOverallTrendPopup); }
        else { console.error("Show Overall Trend button not found."); }

        if (lockdownChartButton) { lockdownChartButton.addEventListener('click', showLockdownChartPopup); }
        else { console.error("Show Lockdown Chart button not found."); }

     function setupPopupClose(popupElement) {
        if (!popupElement) {
            console.error("setupPopupClose: popupElement provided was null or undefined.");
            return;
        }
        console.log(`Setting up close listeners for:`, popupElement.id || popupElement.className); 

        const closeButton = popupElement.querySelector('.popup-close');
        const popupContent = popupElement.querySelector('.popup-content');

        if (closeButton) {
            closeButton.addEventListener('click', () => {
                console.log(`Close button clicked for: ${popupElement.id}`); 

                try {
                    const chartSvg = popupElement.querySelector('svg');
                    if (chartSvg && chartSvg.__resizeObserver__ && typeof chartSvg.__resizeObserver__.disconnect === 'function') {
                        console.log(`Disconnecting ResizeObserver for ${chartSvg.id || 'popup chart'}.`);
                        chartSvg.__resizeObserver__.disconnect();
                        delete chartSvg.__resizeObserver__; 
                    } else {
                    }
                } catch (e) {
                   console.error("Error during ResizeObserver disconnection:", e);
                }

                // Hide popup
                popupElement.classList.remove('visible');
                console.log(`Removed 'visible' class from ${popupElement.id}`); // Confirm class removal
            });
        } else {
           console.warn(`Could not find .popup-close button within`, popupElement.id);
        }

        popupElement.addEventListener('click', (event) => {
            if (event.target === popupElement) {
                console.log(`Overlay clicked for: ${popupElement.id}`); 

                try {
                    const chartSvg = popupElement.querySelector('svg');
                    if (chartSvg && chartSvg.__resizeObserver__ && typeof chartSvg.__resizeObserver__.disconnect === 'function') {
                        console.log(`Disconnecting ResizeObserver for ${chartSvg.id || 'popup chart'} via overlay click.`);
                        chartSvg.__resizeObserver__.disconnect();
                        delete chartSvg.__resizeObserver__;
                    } else {
                    }
                } catch (e) {
                   console.error("Error during ResizeObserver disconnection via overlay:", e);
                }

                // Hide popup
                popupElement.classList.remove('visible');
                console.log(`Removed 'visible' class from ${popupElement.id} via overlay click.`); // Confirm class removal
            } else {
            }
        });
        const dataInfoModal = document.getElementById('data-info-modal');
        const showDataInfoButton = document.getElementById('show-data-info-button');
        const closeDataInfoButton = document.getElementById('close-data-info-button');
    
        if (showDataInfoButton && dataInfoModal) {
            showDataInfoButton.addEventListener('click', () => {
                dataInfoModal.classList.add('visible');
            });
        }
    
        if (closeDataInfoButton && dataInfoModal) {
            closeDataInfoButton.addEventListener('click', () => {
                dataInfoModal.classList.remove('visible');
            });
        }
    
        if (dataInfoModal) {
            dataInfoModal.addEventListener('click', (event) => {
                if (event.target === dataInfoModal) {
                    dataInfoModal.classList.remove('visible');
                }
            });
        }
   } 
        setupPopupClose(document.getElementById('popup-chart-container'));
        setupPopupClose(document.getElementById('overall-trend-popup-container'));
        setupPopupClose(document.getElementById('lockdown-chart-popup-container'));


        const crimeTypeSelect = document.getElementById('crime-type-select');
        if (crimeTypeSelect) { crimeTypeSelect.addEventListener('change', loadMapData); }
        else { console.error("Map crime type select not found."); }

        const darkToggleButton = document.getElementById('dark-toggle');
        if (darkToggleButton) { darkToggleButton.addEventListener('click', () => { document.body.classList.toggle('dark-mode'); }); }
        else { console.error("Dark toggle button not found."); }

        fetch('/charts')
            .then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); })
            .then(charts => {
                 const chartSelect = document.getElementById("chart-select");
                 if (!chartSelect) return;
                 chartSelect.innerHTML = '';
                 Object.entries(charts).forEach(([key, title]) => {
                     chartLookup[title] = key;
                     const option = document.createElement("option");
                     option.value = title; option.textContent = title;
                     chartSelect.appendChild(option);
                 });
            })
            .catch(error => {
                console.error("Error loading D3 chart list:", error);
                const d3SelectionDiv = document.getElementById('d3-chart-selection');
                if(d3SelectionDiv) d3SelectionDiv.innerHTML = "<p><small>Could not load other D3 chart options.</small></p>";
             });

    });

