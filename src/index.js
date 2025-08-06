/**
 * Example showcasing the Surface Scrolling Grid Series feature of LightningChart JS.
 */

const lcjs = require('@lightningchart/lcjs')
const { lightningChart, LUT, ColorHSV, PalettedFill, emptyLine, AxisScrollStrategies, AxisTickStrategies, regularColorSteps, Themes } = lcjs

const historyMs = 27 * 1000
// Sampling rate as samples per second.
const sampleRateHz = 35
// Minimum time step that can be displayed by the heatmap. In this example, set to half of average interval between samples. In normal applications you can set this to some comfortably small value.
// Smaller value means more precision but more RAM and GPU memory usage.
const heatmapMinTimeStepMs = (0.5 * 1000) / sampleRateHz

// Create empty dashboard and charts.
// NOTE: Using `Dashboard` is no longer recommended for new applications. Find latest recommendations here: https://lightningchart.com/js-charts/docs/basic-topics/grouping-charts/
const dashboard = lightningChart({
            resourcesBaseUrl: new URL(document.head.baseURI).origin + new URL(document.head.baseURI).pathname + 'resources/',
        })
    .Dashboard({
        numberOfColumns: 2,
        numberOfRows: 2,
        theme: Themes[new URLSearchParams(window.location.search).get('theme') || 'darkGold'] || undefined,
    })
    .setRowHeight(0, 1)
    .setRowHeight(1, 2)

let labelLoading = dashboard.addUIElement().setText('Loading example data ...')

// Load example data from file.
fetch(new URL(document.head.baseURI).origin + new URL(document.head.baseURI).pathname + 'examples/assets/0913/audio2ch.json')
    .then((r) => r.json())
    .then((data) => {
        labelLoading.dispose()
        labelLoading = undefined

        // Define value -> color lookup table.
        const theme = dashboard.getTheme()
        const lut = new LUT({
            steps: regularColorSteps(0, 255, theme.examples.spectrogramColorPalette),
            units: 'dB',
            interpolate: true,
        })

        const rowStep = 40
        const intensityValueToDb = (value) => -100 + (value / 255) * (-30 - -100)

        let channelList = [
            {
                name: 'Channel 1',
                data: data.ch1,
                columnIndex: 0,
            },
            {
                name: 'Channel 2',
                data: data.ch2,
                columnIndex: 1,
            },
        ]

        channelList = channelList.map((channel, iii) => {
            const rows = channel.data[0].length
            const chart2D = dashboard
                .createChartXY({
                    legend: { visible: false },
                    columnIndex: channel.columnIndex,
                    rowIndex: 0,
                })
                .setTitle(`${channel.name} | 2D audio spectrogram`)
            chart2D.axisX
                .setScrollStrategy(AxisScrollStrategies.scrolling)
                .setDefaultInterval((state) => ({ end: state.dataMax, start: (state.dataMax ?? 0) - historyMs, stopAxisAfter: false }))
            chart2D.axisY.setTitle('Frequency').setUnits('Hz')

            const chart3D = dashboard
                .createChart3D({
                    legend: { visible: false },
                    columnIndex: channel.columnIndex,
                    rowIndex: 1,
                })
                .setTitle(`${channel.name} | 3D audio spectrogram`)

            chart3D.axisX
                .setScrollStrategy(AxisScrollStrategies.scrolling)
                .setDefaultInterval((state) => ({ end: state.dataMax, start: (state.dataMax ?? 0) - historyMs, stopAxisAfter: false }))
            chart3D.axisY
                .setTitle('Intensity')
                .setUnits('dB')
                .setTickStrategy(AxisTickStrategies.Numeric, (ticks) =>
                    ticks.setFormattingFunction((y) => intensityValueToDb(y).toFixed(0)),
                )
            chart3D.getDefaultAxisZ().setTitle('Frequency').setUnits('Hz')

            const heatmapSeries2D = chart2D
                .addHeatmapScrollingGridSeries({
                    scrollDimension: 'columns',
                    resolution: rows,
                })
                .setStep({ x: heatmapMinTimeStepMs, y: rowStep })
                .setFillStyle(new PalettedFill({ lut }))
                .setWireframeStyle(emptyLine)
                .setDataCleaning({ maxDataPointCount: 10000 })

            const surfaceSeries3D = chart3D
                .addSurfaceScrollingGridSeries({
                    scrollDimension: 'columns',
                    columns: Math.ceil(historyMs / heatmapMinTimeStepMs),
                    rows,
                })
                .setStep({ x: heatmapMinTimeStepMs, z: rowStep })
                .setFillStyle(new PalettedFill({ lut, lookUpProperty: 'y' }))
                .setWireframeStyle(emptyLine)

            return { ...channel, chart2D, chart3D, heatmapSeries2D, surfaceSeries3D }
        })

        let tFirstSample
        const handleIncomingData = (channel, timestamp, sample) => {
            if (!tFirstSample) {
                tFirstSample = timestamp
                channelList.forEach((ch) => {
                    ch.chart2D.axisX.setTickStrategy(AxisTickStrategies.DateTime, (strategy) =>
                        strategy.setDateOrigin(new Date(tFirstSample)),
                    )
                    ch.chart3D.axisX.setTickStrategy(AxisTickStrategies.DateTime, (strategy) =>
                        strategy.setDateOrigin(new Date(tFirstSample)),
                    )
                })
            }
            // Calculate sample index from timestamp to place sample in correct location in heatmap.
            const iSample = Math.round((timestamp - tFirstSample) / heatmapMinTimeStepMs)
            channel.heatmapSeries2D.invalidateIntensityValues({
                iSample,
                values: [sample],
            })
            channel.surfaceSeries3D.invalidateValues({
                iSample,
                yValues: [sample],
            })
        }

        // Setup infinite streaming from static data set.
        let iData = 0
        let tPrev = Date.now()
        let dModulus = 0
        const streamData = () => {
            const tNow = Date.now()
            let addDataPointCount = ((tNow - tPrev) * sampleRateHz) / 1000 + dModulus
            dModulus = addDataPointCount % 1
            addDataPointCount = Math.floor(addDataPointCount)
            channelList.forEach((channel) => {
                for (let i = 0; i < addDataPointCount; i += 1) {
                    const timestamp = tPrev + ((i + 1) / addDataPointCount) * (tNow - tPrev)
                    const sample = channel.data[(iData + i) % channel.data.length]
                    handleIncomingData(channel, timestamp, sample)
                }
            })
            iData += addDataPointCount
            tPrev = tNow
            requestAnimationFrame(streamData)
        }
        streamData()
    })
