var loadtest = require('loadtest');
var querystring = require('querystring');
var request = require('request');
var geojsonToArcGIS = require('arcgis-to-geojson-utils').geojsonToArcGIS;
var ogr2ogr = require('ogr2ogr')
var fs = require('fs');

var tcd = 30

// if on linux, log to a mongodb
if (process.argv[5] === 'log') {
    var log = true;
    var saveCount = 0

    var mongoose = require('mongoose');
    var db = mongoose.connect('mongodb://localhost/results');

    mongoose.connection.on('error',function (err) {  
      console.log('Mongoose default connection error: ' + err);
    }); 

    var DataPoint = require('./datapoint');


} else { var log = false}

function saveToMongo(result) {

    var dataPoint = new DataPoint({
         datetime: new Date(),
         server_type: process.argv[2],
         geojson_name: process.argv[3],
         num_requests_in_test: process.argv[4],
         response_time_ms: result.requestElapsed,
         response: result.serverResponse
         });

       dataPoint.save(function (err, dataPoint) {
       if (err) return console.error(err);

       saveCount++

       if (saveCount === parseInt(process.argv[4])) {
         db.disconnect()
       }

       });

    console.log(dataPoint)
}


var loadTestConfig = {
	maxRequests: process.argv[4],
	concurrency: process.argv[4]
}

function toWebMerc(ogr, cb) {
    console.log('start toWebMerc')

    ogr.exec(function(er, data) {
        if (er) console.error(er)
        cb(data)
    })
}

function buildImageServerURL(geojson, callback) {
    console.log('starting prep data')

    var geom = geojsonToArcGIS(geojson)[0]['geometry']
    geom.spatialReference.wkid = 3857

    console.log(JSON.stringify(geom))

    var renderingRule = {"rasterFunction":"Arithmetic","rasterFunctionArguments":
		{"Raster":{"rasterFunction":"Remap","rasterFunctionArguments":
		{"InputRanges":[0,30,30,101],"OutputValues":[0,1],
		"Raster":"$2","AllowUnmatched":false}},"Raster2":
		{"rasterFunction":"Arithmetic","rasterFunctionArguments":
		{"Raster":{"rasterFunction":"Arithmetic","rasterFunctionArguments":
		{"Raster":{"rasterFunction":"Remap","rasterFunctionArguments":
		{"InputRanges":[1,16],"OutputValues":[16],"Raster":"$1","AllowUnmatched":false}},
		"Raster2":"$1","Operation":3}},"Raster2":"$5","Operation":1},"outputPixelType":"U8"},"Operation":3}}

    var esri_data = {
        "geometry": JSON.stringify(geom),
        "renderingRule": JSON.stringify(renderingRule),
        "geometryType": "esriGeometryPolygon",
        "f": "json"
    }

    callback(querystring.stringify(esri_data))

}

function esriStatusCallback(error, result, latency) {

    try {
        var serverResponse = JSON.parse(result.body).histograms[0].counts
    }
    catch (e) {
        var serverResponse = 'ERROR'}

    if (log) {
              result.serverResponse = serverResponse
              saveToMongo(result) 
      }  else {

    console.log('Mean latency %j', latency.meanLatencyMs);
    console.log('histograms %j', serverResponse);
    console.log('----');
    console.log('Request elapsed milliseconds: ', result.requestElapsed);
  }
}

function geeStatusCallback(error, result, latency) {

    try {
        var serverResponse = JSON.parse(result.body);
        } catch (e) {
           var serverResponse = 'ERROR'
        }

    if (log) { 
        result.serverResponse = JSON.stringify(serverResponse)
        saveToMongo(result)
   } else {

    console.log('Mean latency %j', latency.meanLatencyMs);
    console.log(serverResponse)
    console.log('----');
    console.log('Request elapsed milliseconds: ', result.requestElapsed);
  }
}


function call_esri_api(qry_params) {

	esri_api_url = 'http://gis-gfw.wri.org/arcgis/rest/services/image_services/tree_cover_loss_year_wgs84/ImageServer/computeHistograms?'

	loadTestConfig.url = esri_api_url + qry_params;
	loadTestConfig.statusCallback = esriStatusCallback

	runLoadTest(loadTestConfig);
}

function modify_geojson(geojson) {

	var type = geojson.features[0].geometry.type

	if (type === 'MultiPolygon') {
		var second_lat = geojson.features[0].geometry.coordinates[0][0][1][0].toString()
	} else {

	var second_lat = geojson.features[0].geometry.coordinates[0][1][0].toString()
	}

	// bust the cache by modifying one value slightly
	var second_lat_str = second_lat.substring(0,9)
	var random_num = Math.floor(Math.random()*(5000000-1000000+1)+1000000)
	var random_num_str = random_num.toString()

	var updated_second_lat = parseFloat(second_lat_str + random_num_str)

	// update geometry
	if (type === 'MultiPolygon') {
	geojson.features[0].geometry.coordinates[0][0][1][0] = updated_second_lat } else {
	geojson.features[0].geometry.coordinates[0][1][0] = updated_second_lat
	}

	return geojson
}

function gee() {

	console.log('starting gee request')

	//var gee_url = 'http://api.globalforestwatch.org/forest-change/umd-loss-gain/'
	var gee_url = 'http://localhost:5000/globecover'

	loadTestConfig.url = gee_url
	loadTestConfig.statusCallback = geeStatusCallback

	loadTestConfig.method = 'POST'

	loadTestConfig.requestGenerator = function(params, options, client, callback) {

		var geojson = modify_geojson(load_geojson())

		var data = JSON.stringify({'geojson': JSON.stringify(geojson.features[0].geometry),
		  'start': '2001',
		  'end': '2014',
		  'thresh': tcd.toString()})

		// source: http://stackoverflow.com/questions/9768192/sending-data-through-post-request-from-a-node-js-server-to-a-node-js-server
		options.headers['Content-Type'] = 'application/json';
		options.headers['Content-Length'] = Buffer.byteLength(data);

		var request = client(options, callback);
		request.write(data);
		request.end();

		return request;

	}

	runLoadTest(loadTestConfig);

}


function runLoadTest(config) {

	loadtest.loadTest(config, function(error) {
        if (error) {
            return console.error('Got an error: %s', error);
        }
        console.log('Tests run successfully');
});

}


function esri() {
    var ogr = ogr2ogr(load_geojson()).project('EPSG:3857')

    toWebMerc(ogr, function(projected) {

        buildImageServerURL(projected, function(query_params) {

            call_esri_api(query_params)
        })
    })
}

function load_geojson() {
	return JSON.parse(fs.readFileSync(process.argv[3], 'utf8'));
}

switch(process.argv[2]) {

	case 'esri':
	   esri();
	   break

	case 'gee':
	   gee()
	   break
}

//call script: node index.js esri gabon.geojson n
