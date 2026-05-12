import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// using d3, load year_experiments.csv and create a bar chart with the following specifications:
// - the x-axis should represent the year
// - the y-axis should represent the number of experiments conducted in that year
// - each bar should be colored based on the decade (e.g., 1950s, 1960s, etc.)
// - add appropriate labels and titles to the chart

// set up the dimensions and margins of the chart
// const margin = { top: 50, right: 30, bottom: 50, left: 60 },
//     width = 800 - margin.left - margin.right,
//     height = 400 - margin.top - margin.bottom;


// const lineSvg = d3.select('#line-chart')
//     .append('svg')
//     .attr('width', width + margin.left + margin.right)
//     .attr('height', height + margin.top + margin.bottom)
//     .append('g')
//     .attr('transform', `translate(${margin.left},${margin.top})`);

const margin = { top: 10, right: 10, bottom: 30, left: 20 };


async function loadData() {

    // plot circles AFTER data loads
    const data = await d3.csv("year_region_experiment.csv", (row) => ({

        region: row.region,
        experiment: row.experiment,
        year: Number(row.year),
        anomaly: Number(row.anomaly),
    }));

    // console.log(data);
    return (data);
}

let data = await loadData();
console.log(data);


let xScale;
let yScale;
function renderScatterPlot(data) {
    const width = 1000;
    const height = 600;

    const svg = d3
        .select('#line-chart')
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('viewBox', `0 0 ${width} ${height}`)
        .style('overflow', 'visible');

    xScale = d3
        .scaleTime()
        .domain(d3.extent(data, (d) => d.datetime))
        .range([0, width])
        .nice()

    yScale = d3
        .scaleLinear()
        .domain(d3.extent(data, (d) => d.datetime))
        .range([height, 0])

    const dots = svg.append('g').attr('class', 'dots');

    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    // Update scales with new ranges
    xScale.range([usableArea.left, usableArea.right]);
    yScale.range([usableArea.bottom, usableArea.top]);

    const xAxis = d3.axisBottom(xScale);
    const yAxis = d3
        .axisLeft(yScale)
        .tickFormat((d) => String(d % 24).padStart(2, '0') + ':00');

    // Add X axis
    svg
        .append('g')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .call(xAxis);

    // Add Y axis
    svg
        .append('g')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .call(yAxis);
};

renderScatterPlot(data);
