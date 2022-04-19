/**
 * Example showcasing the Surface Scrolling Grid Series feature of LightningChart JS.
 */

const lcjs = require("@arction/lcjs");
const {
  lightningChart,
  LUT,
  ColorHSV,
  PalettedFill,
  emptyLine,
  AxisScrollStrategies,
  AxisTickStrategies,
  Themes,
} = lcjs;

const historyMs = 27 * 1000;
// Sampling rate as samples per second.
const sampleRateHz = 35
const sampleIntervalMs = 1000 / sampleRateHz

// Create empty dashboard and charts.
const dashboard = lightningChart()
  .Dashboard({
    numberOfColumns: 2,
    numberOfRows: 2,
    // theme: Themes.darkGold
  })
  .setRowHeight(0, 1)
  .setRowHeight(1, 2);

let labelLoading = dashboard.addUIElement().setText("Loading example data ...");

// Load example data from file.
fetch(
  document.head.baseURI +
    "examples/assets/0913/audio2ch.json"
)
  .then((r) => r.json())
  .then((data) => {
    labelLoading.dispose();
    labelLoading = undefined;

    // Define value -> color lookup table.
    const lut = new LUT({
      steps: [
        {
          value: 0,
          color: ColorHSV(0, 1, 0),
          label: `-100`,
        },
        {
          value: 255 * (1 / 6),
          color: ColorHSV(270, 0.84, 0.2),
          label: `-88`,
        },
        {
          value: 255 * (2 / 6),
          color: ColorHSV(289, 0.86, 0.35),
          label: `-77`,
        },
        {
          value: 255 * (3 / 6),
          color: ColorHSV(324, 0.97, 0.56),
          label: `-65`,
        },
        {
          value: 255 * (4 / 6),
          color: ColorHSV(1, 1, 1),
          label: `-53`,
        },
        {
          value: 255 * (5 / 6),
          color: ColorHSV(44, 0.64, 1),
          label: `-42`,
        },
        {
          value: 255,
          color: ColorHSV(62, 0.32, 1),
          label: `-30`,
        },
      ],
      units: "dB",
      interpolate: true,
    });

    const rowStep = 40;
    const intensityValueToDb = (value) => -100 + (value / 255) * (-30 - -100);

    let channelList = [
      {
        name: "Channel 1",
        data: data.ch1,
        columnIndex: 0,
      },
      {
        name: "Channel 2",
        data: data.ch2,
        columnIndex: 1,
      },
    ];

    channelList = channelList.map((channel) => {
      const rows = channel.data[0].length;
      const chart2D = dashboard
        .createChartXY({
          columnIndex: channel.columnIndex,
          rowIndex: 0,
        })
        .setTitle(`${channel.name} | 2D audio spectrogram`);
      chart2D
        .getDefaultAxisX()
        .setTickStrategy(AxisTickStrategies.Time)
        .setScrollStrategy(AxisScrollStrategies.progressive)
        .setInterval(-historyMs, 0);
      chart2D.getDefaultAxisY().setTitle("Frequency (Hz)");

      const chart3D = dashboard
        .createChart3D({
          columnIndex: channel.columnIndex,
          rowIndex: 1,
        })
        .setTitle(`${channel.name} | 3D audio spectrogram`)

      chart3D
        .getDefaultAxisX()
        .setTickStrategy(AxisTickStrategies.Time)
        .setScrollStrategy(AxisScrollStrategies.progressive)
        .setInterval(-historyMs, 0);
      chart3D
        .getDefaultAxisY()
        .setTitle("Intensity (Db)")
        .setTickStrategy(AxisTickStrategies.Numeric, (ticks) =>
          ticks.setFormattingFunction((y) => intensityValueToDb(y).toFixed(0))
        );
      chart3D.getDefaultAxisZ().setTitle("Frequency (Hz)");

      const heatmapSeries2D = chart2D
        .addHeatmapScrollingGridSeries({
          scrollDimension: "columns",
          resolution: rows,
          step: { x: sampleIntervalMs, y: rowStep },
        })
        .setFillStyle(new PalettedFill({ lut }))
        .setWireframeStyle(emptyLine)
        .setDataCleaning({ maxDataPointCount: 10000 });

      const surfaceSeries3D = chart3D
        .addSurfaceScrollingGridSeries({
          scrollDimension: "columns",
          columns: Math.ceil(historyMs / sampleIntervalMs),
          rows,
          step: { x: sampleIntervalMs, z: rowStep },
        })
        .setFillStyle(new PalettedFill({ lut, lookUpProperty: "y" }))
        .setWireframeStyle(emptyLine);

      return { ...channel, chart2D, chart3D, heatmapSeries2D, surfaceSeries3D };
    });

    // Setup infinite streaming from static data set.
    let iSample = 0;
    setInterval(() => {
      // Push 1 new sample to all channels and series.
      const samples = channelList.map(channel => channel.data[iSample % channel.data.length])
      iSample += 1
      bufferIncomingSamples(samples, (appendSamples) => {
        channelList.forEach((channel, i) => {
          channel.heatmapSeries2D.addIntensityValues([appendSamples[i]]);
          channel.surfaceSeries3D.addValues({ yValues: [appendSamples[i]] });
        });
      })
    }, sampleIntervalMs)

    // The following logic ensures a static sampling rate, even if input data might vary.
    // This is done by skipping too frequent samples and duplicating too far apart samples.
    // The precision can be configured by simply changing value of `sampleRateHz`
    let lastSample
    let tFirstSample = 0
    const bufferIncomingSamples = (sample, clbk) => {
      const tNow = performance.now()
      if (lastSample === undefined) {
          clbk(sample)
          lastSample = { sample, time: tNow, i: 0 }
          tFirstSample = tNow
          return
      }

      let nextSampleIndex = lastSample.i + 1
      let nextSampleTimeExact = tFirstSample + nextSampleIndex * sampleIntervalMs
      let nextSampleTimeRangeMin = nextSampleTimeExact - sampleIntervalMs / 2
      let nextSampleTimeRangeMax = nextSampleTimeExact + sampleIntervalMs / 2
      if (tNow < nextSampleTimeRangeMin) {
          // Too frequent samples must be scrapped. If this results in visual problems then sample rate must be increased.
          // console.warn(`Skipped too frequent sample`)
          return
      }
      if (tNow > nextSampleTimeRangeMax) {
          // At least 1 sample was skipped. In this case, the missing sample slots are filled with the values of the last sample.
          let repeatedSamplesCount = 0
          do {
              clbk(lastSample.sample)
              repeatedSamplesCount += 1
              nextSampleIndex += 1
              nextSampleTimeExact = tFirstSample + nextSampleIndex * sampleIntervalMs
              nextSampleTimeRangeMin = nextSampleTimeExact - sampleIntervalMs / 2
              nextSampleTimeRangeMax = nextSampleTimeExact + sampleIntervalMs / 2
          } while (tNow > nextSampleTimeRangeMax)

          clbk(sample)
          lastSample = { sample, time: tNow, i: nextSampleIndex }
          // console.warn(`Filled ${repeatedSamplesCount} samples`)
          return
      }
      // Sample arrived within acceptable, expected time range.
      clbk(sample)
      lastSample = { sample, time: tNow, i: nextSampleIndex }
    }
  });
