/* The app maps annual ERA5-Land snow persistence and reports the global area of each snow persistence zone.
 * The location inspector provides snow-covered days, annual snow persistence, monthly mean SWE, and glacier or ice cap information.
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

var DAILY_DATASET_ID = 'ECMWF/ERA5_LAND/DAILY_AGGR';
var MONTHLY_DATASET_ID = 'ECMWF/ERA5_LAND/MONTHLY_AGGR';
var STATIC_DATASET_ID = 'ECMWF/ERA5_LAND/STATIC';
var DAILY_SNOW_COVER = ee.ImageCollection(DAILY_DATASET_ID).select('snow_cover');
var MONTHLY_SWE = ee.ImageCollection(MONTHLY_DATASET_ID).select('snow_depth_water_equivalent');
var GLACIER_FRACTION = ee.Image(STATIC_DATASET_ID).select('glacier_mask').rename('glacier_fraction').unmask(0);
var FIRST_YEAR = 1951;
var LAST_YEAR = 2025;
var DEFAULT_YEAR = LAST_YEAR;
var INTERMITTENT_THRESHOLD = 7;
var SEASONAL_THRESHOLD = 30;
var PERSISTENT_THRESHOLD = 90;
var GLACIER_DOMINANT_THRESHOLD = 0.5;
var ERA5_SCALE_METRES = 11132;
var ERA5_PROJECTION = DAILY_SNOW_COVER.first().projection();
var WORLD = ee.Geometry.Rectangle([-180, -90, 180, 90], null, false);
var INSPECTOR_PROMPT = 'Click anywhere on the map to use the location inspector.';
var ZONE_NAMES = ['Little or no snow', 'Intermittent snow', 'Seasonal snow', 'Persistent snow'];
var ZONE_RANGES = ['< 7%', '7-30%', '30-90%', '> 90%'];
var ZONE_BAND_NAMES = ['little_or_no', 'intermittent', 'seasonal', 'persistent'];
var ZONE_COLORS = ['ffffd9', 'edf8b1', 'c7e9b4', '7fcdbb'];
var ZONE_VIS_PARAMS = {min: 1, max: 4, palette: ZONE_COLORS};

// =============================================================================
// SNOW METRICS AND AREA CALCULATIONS
// =============================================================================

// Calculate snow persistence
function periodMetrics(startDate, endDate) {
  var collection = DAILY_SNOW_COVER.filterDate(startDate, endDate);
  var snowDays = collection.map(function(image) {
    return image.gt(0).rename('snow_day');
  }).sum().rename('snow_days');
  var dayCount = ee.Number(collection.size());
  var persistence = snowDays
    .divide(dayCount)
    .multiply(100)
    .rename('persistence');
  return snowDays.addBands(persistence);
}
function annualMetrics(year) {
  year = ee.Number(year);
  return periodMetrics(
    ee.Date.fromYMD(year, 1, 1),
    ee.Date.fromYMD(year.add(1), 1, 1)
  ).set('year', year);
}
// Classify snow persistence zones
function classifyPersistence(metrics) {
  var persistence = metrics.select('persistence');
  return ee.Image(1)
    .where(persistence.gte(INTERMITTENT_THRESHOLD).and(persistence.lt(SEASONAL_THRESHOLD)), 2)
    .where(
      persistence.gte(SEASONAL_THRESHOLD).and(persistence.lte(PERSISTENT_THRESHOLD)), 3
    )
    .where(persistence.gt(PERSISTENT_THRESHOLD), 4)
    .updateMask(persistence.mask())
    .rename('zone')
    .toByte();
}
// Calculate global snow persistence zone areas
function zoneAreaBands(zones) {
  var pixelArea = ee.Image.pixelArea();
  return ee.Image.cat([
    pixelArea.multiply(zones.eq(1)).rename('little_or_no'),
    pixelArea.multiply(zones.eq(2)).rename('intermittent'),
    pixelArea.multiply(zones.eq(3)).rename('seasonal'),
    pixelArea.multiply(zones.eq(4)).rename('persistent')
  ]).updateMask(zones.mask());
}
function globalAreaDictionary(zones) {
  return zoneAreaBands(zones).reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: WORLD,
    crs: ERA5_PROJECTION,
    scale: ERA5_SCALE_METRES,
    maxPixels: 1e9,
    tileScale: 4
  });
}
// Prepare monthly SWE
function monthlySweMm(year) {
  year = ee.Number(year);
  return MONTHLY_SWE.filterDate(
    ee.Date.fromYMD(year, 1, 1), ee.Date.fromYMD(year.add(1), 1, 1)
  )
    .map(function(image) {
      return image
        .multiply(1000)
        .rename('SWE')
        .copyProperties(image, ['system:time_start']);
    });
}

// =============================================================================
// USER INTERFACE
// =============================================================================

var mainMap = ui.Map();
mainMap.setOptions('HYBRID');
mainMap.setCenter(0, 35, 2);
mainMap.style().set('stretch', 'both');
mainMap.layers().add(
  ui.Map.Layer(ee.Image(0).selfMask(), {}, 'Snow persistence zones')
);
mainMap.layers().add(
  ui.Map.Layer(ee.Image(0).selfMask(), {}, 'Selected location')
);
var sidebar = ui.Panel({style: {width: '380px', padding: '12px'}});
ui.root.clear();
ui.root.setLayout(ui.Panel.Layout.flow('horizontal'));
ui.root.add(sidebar);
ui.root.add(mainMap);
sidebar.add(ui.Label({
  value: 'Global Snow Persistence Explorer',
  style: {
    fontSize: '22px',
    fontWeight: 'bold',
    margin: '0 0 4px 0'
  }
}));
sidebar.add(ui.Label({
  value:
    'Explore annual snow persistence worldwide using daily ERA5-Land snow cover data. ' +
    'Snow persistence is calculated as the percentage of snow-covered days within a calendar year. ' +
    'Zones are classified using thresholds adapted from Saavedra et al. (2017). ' +
    'Click anywhere on the map to inspect local snow persistence characteristics and monthly snow water equivalent (SWE).',
  style: {color: '#666666', fontSize: '12px', margin: '0 0 12px 0'}
}));
// Year selector
sidebar.add(ui.Label({
  value: 'Year',
  style: {fontWeight: 'bold', margin: '4px 0 4px 0'}
}));
var yearItems = [];
for (var y = FIRST_YEAR; y <= LAST_YEAR; y++) {
  yearItems.push(String(y));
}
var yearSelect = ui.Select({
  items: yearItems,
  value: String(DEFAULT_YEAR),
  style: {stretch: 'horizontal', margin: '0 0 12px 0'}
});
sidebar.add(yearSelect);
// Legend
sidebar.add(ui.Label({
  value: 'Snow persistence zones',
  style: {fontWeight: 'bold', margin: '6px 0 5px 0'}
}));
for (var i = 0; i < ZONE_NAMES.length; i++) {
  var swatch = ui.Label({
    value: ' ',
    style: {
      backgroundColor: '#' + ZONE_COLORS[i],
      padding: '8px',
      margin: '0 7px 4px 0'
    }
  });
  var legendText = ui.Label({
    value: ZONE_NAMES[i] + '  (' + ZONE_RANGES[i] + ')',
    style: {fontSize: '12px', margin: '2px 0 4px 0'}
  });
  sidebar.add(ui.Panel({
    widgets: [swatch, legendText],
    layout: ui.Panel.Layout.flow('horizontal')
  }));
}
// Area calculator
sidebar.add(ui.Label({
  value: 'Global area by snow persistence zone',
  style: {fontWeight: 'bold', margin: '4px 0 5px 0'}
}));
var areaLabels = [];
for (var a = 0; a < ZONE_NAMES.length; a++) {
  var areaLabel = ui.Label({
    value: ZONE_NAMES[a] + ': calculating...',
    style: {fontSize: '12px', margin: '2px 0'}
  });
  areaLabels.push(areaLabel);
  sidebar.add(areaLabel);
}
var areaStatus = ui.Label({
  value: '',
  style: {color: '#777777', fontSize: '10px', margin: '4px 0 14px 0'}
});
sidebar.add(areaStatus);
// Location inspector
sidebar.add(ui.Label({
  value: 'Location inspector',
  style: {fontWeight: 'bold', margin: '4px 0 4px 0'}
}));
var inspector = ui.Label({
  value: INSPECTOR_PROMPT,
  style: {
    whiteSpace: 'pre',
    fontSize: '12px',
    margin: '0 0 14px 0'
  }
});
sidebar.add(inspector);
var sweChartPanel = ui.Panel({
  style: {stretch: 'horizontal', margin: '0 0 8px 0'}
});
sidebar.add(sweChartPanel);
var clearSelectionButton = ui.Button({
  label: 'Clear selection',
  onClick: function() {
    lastClickedPoint = null;
    inspectorRequestToken++;
    mainMap.layers().set(
      1,
      ui.Map.Layer(ee.Image(0).selfMask(), {}, 'Selected location')
    );
    inspector.setValue(INSPECTOR_PROMPT);
    sweChartPanel.clear();
  },
  style: {margin: '0 0 14px 0'}
});
sidebar.add(clearSelectionButton);

// =============================================================================
// INTERACTIVE STATE
// =============================================================================

// Track app state
var currentYear = DEFAULT_YEAR;
var currentMetrics = null;
var currentZones = null;
var lastClickedPoint = null;
var areaRequestToken = 0;
var inspectorRequestToken = 0;
// Update global zone areas
function formatAreaFromSquareMetres(value) {
  if (value === null || value === undefined || !isFinite(value)) {
    return 'No data';
  }
  var km2 = value / 1e6;
  if (km2 >= 1e6) {
    return (km2 / 1e6).toFixed(2) + ' million km²';
  }
  if (km2 >= 1000) {
    return (km2 / 1000).toFixed(1) + ' k km²';
  }
  return km2.toFixed(0) + ' km²';
}
function setAreaValues(areaDictionary) {
  for (var i = 0; i < ZONE_BAND_NAMES.length; i++) {
    var value = areaDictionary ? areaDictionary[ZONE_BAND_NAMES[i]] : null;
    areaLabels[i].setValue(
      ZONE_NAMES[i] + ': ' + formatAreaFromSquareMetres(value)
    );
  }
}
function setAreaLoading() {
  for (var i = 0; i < areaLabels.length; i++) {
    areaLabels[i].setValue(ZONE_NAMES[i] + ': calculating...');
  }
}
function updateAreaCalculator(zones, year) {
  var token = ++areaRequestToken;
  setAreaLoading();
  areaStatus.setValue('Calculating global area of each snow persistence zone for ' + year + '...');
  globalAreaDictionary(zones).evaluate(function(result, error) {
    if (token !== areaRequestToken) return;
    if (error) {
      areaStatus.setValue('Area calculation failed: ' + error);
      return;
    }
    setAreaValues(result);
    areaStatus.setValue('');
  });
}
// Build monthly SWE chart
function monthTicks(year) {
  var ticks = [];
  for (var month = 0; month < 12; month++) {
    ticks.push(new Date(year, month, 1));
  }
  return ticks;
}
function updateSweChart(point, year, glacierFraction, requestToken) {
  sweChartPanel.clear();
  var isGlacierDominated = glacierFraction >= GLACIER_DOMINANT_THRESHOLD;
  sweChartPanel.add(ui.Label({
    value: 'Loading monthly SWE...',
    style: {
      color: '#777777',
      fontSize: '10px',
      margin: '8px 0 8px 0'
    }
  }));
  var reductionTable = monthlySweMm(year).map(function(image) {
    var stats = image.reduceRegion({
      reducer: ee.Reducer.first(),
      geometry: point,
      scale: ERA5_SCALE_METRES
    });
    var date = ee.Date(image.get('system:time_start'));
    var dateValue = ee.String('Date(').cat(date.millis().format()).cat(')');
    var annotation = null;
    if (isGlacierDominated) {
      annotation = ee.Algorithms.If(
        ee.Number(date.get('month')).eq(7),
        (glacierFraction * 100).toFixed(0) +
          '% glacier or ice cap',
        null
      );
    }
    return ee.Feature(null, {
      row: ee.List([
        dateValue,
        stats.get('SWE'),
        annotation
      ])
    });
  });
  var columnHeader = ee.List([[
    {label: 'Month', role: 'domain', type: 'date'},
    {label: 'SWE', role: 'data', type: 'number'},
    {label: 'Glacier or ice cap', role: 'annotation', type: 'string'}
  ]]);
  var dataTableServer = columnHeader.cat(reductionTable.aggregate_array('row'));
  dataTableServer.evaluate(function(dataTableClient, error) {
    if (requestToken !== inspectorRequestToken) return;
    if (error) {
      sweChartPanel.clear();
      sweChartPanel.add(ui.Label('SWE chart failed: ' + error));
      return;
    }
    sweChartPanel.clear();

    if (isGlacierDominated) {
      sweChartPanel.add(ui.Label({
        value:
          'This is a glacier-dominated ERA5-Land grid cell. ' +
          'SWE values near 10,000 mm reflect ERA5-Land\'s prescribed ' +
          'glacier representation and should not be interpreted as ' +
          'seasonal snow accumulation.',
        style: {
          color: '#666666',
          fontSize: '10px',
          margin: '0 0 6px 0'
        }
      }));
    }

    var vAxisOptions = {
      title: 'SWE (mm)',
      viewWindow: {min: 0}
    };
    // Limit automatic y-axis stretching for zero or near-zero SWE values.
    var monthlyMaxSwe = 0;
    for (var i = 1; i < dataTableClient.length; i++) {
      var sweValue = dataTableClient[i][1];
      if (sweValue !== null && sweValue !== undefined) {
        monthlyMaxSwe = Math.max(monthlyMaxSwe, Number(sweValue));
      }
    }
    if (!isGlacierDominated && monthlyMaxSwe < 1) {
      vAxisOptions.viewWindow = {min: 0, max: 1};
    }
    if (isGlacierDominated) {
      // Use an 11,000 mm ceiling to show the 10 m glacier baseline and annotation.
      vAxisOptions.viewWindow = {min: 0, max: 11000};
    }
    var chartOptions = {
      title: 'Monthly mean SWE',
      legend: {position: 'none'},
      hAxis: {
        format: 'MMM',
        title: 'Month',
        gridlines: {count: 12},
        slantedText: true,
        slantedTextAngle: 45,
        ticks: monthTicks(year)
      },
      vAxis: vAxisOptions,
      lineWidth: 2,
      pointSize: 4,
      interpolateNulls: false,
      annotations: {
        highContrast: true,
        stem: {length: 8},
        textStyle: {
          fontSize: 10,
          bold: true
        }
      },
      chartArea: {
        left: 55,
        right: 12,
        top: 32,
        bottom: 38
      }
    };
    if (isGlacierDominated) {
      chartOptions.series = {
        0: {
          lineWidth: 2,
          pointSize: 4,
          lineDashStyle: [4, 4]
        }
      };
    }
    var chart = ui.Chart(dataTableClient)
      .setChartType('LineChart')
      .setOptions(chartOptions);
    chart.style().set({
      stretch: 'horizontal',
      height: '220px',
      margin: '0'
    });
    sweChartPanel.add(chart);
  });
}
// Inspect selected location
function inspectPoint(point) {
  if (!currentMetrics || !currentZones) return;
  var token = ++inspectorRequestToken;
  inspector.setValue('Reading ERA5-Land grid cell...');
  sweChartPanel.clear();
  var inspectImage = currentMetrics.addBands(GLACIER_FRACTION);
  inspectImage.reduceRegion({
    reducer: ee.Reducer.first(),
    geometry: point,
    crs: ERA5_PROJECTION,
    scale: ERA5_SCALE_METRES,
    maxPixels: 1e6
  }).evaluate(function(result, error) {
    if (token !== inspectorRequestToken) return;
    if (error) {
      inspector.setValue('Could not inspect this location: ' + error);
      return;
    }
    if (
      !result ||
      result.persistence === null ||
      result.persistence === undefined
    ) {
      inspector.setValue('No ERA5-Land snow cover value at this location.');
      return;
    }
    var days = Math.round(Number(result.snow_days));
    var persistence = Number(result.persistence);
    var glacierFraction = Number(result.glacier_fraction || 0);
    var inspectorText =
      'Snow-covered days: ' + days + '\n' +
      'Snow persistence: ' + persistence.toFixed(1) + '%';
    inspector.setValue(inspectorText);
    updateSweChart(point, currentYear, glacierFraction, token);
  });
}
// Update selected year and interactions
function updateSelectedYear(year) {
  currentYear = Number(year);
  currentMetrics = annualMetrics(currentYear);
  currentZones = classifyPersistence(currentMetrics);
  mainMap.layers().set(
    0,
    ui.Map.Layer(
      currentZones,
      ZONE_VIS_PARAMS,
      'Snow persistence zones - ' + currentYear,
      true,
      0.88
    )
  );
  updateAreaCalculator(currentZones, currentYear);
  if (lastClickedPoint) {
    inspectPoint(lastClickedPoint);
  }
}
yearSelect.onChange(function(value) {
  updateSelectedYear(parseInt(value, 10));
});
mainMap.onClick(function(coords) {
  lastClickedPoint = ee.Geometry.Point([coords.lon, coords.lat]);
  var pointStyle = ee.FeatureCollection([
    ee.Feature(lastClickedPoint)
  ]).style({
    color: 'd73027',
    pointSize: 7,
    width: 2
  });
  mainMap.layers().set(
    1,
    ui.Map.Layer(pointStyle, {}, 'Selected location', true, 1)
  );
  inspectPoint(lastClickedPoint);
});
// Initialize app
updateSelectedYear(DEFAULT_YEAR);
