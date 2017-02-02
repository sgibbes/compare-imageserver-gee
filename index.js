var loadtest = require('loadtest');
var querystring = require('querystring');
var request = require('request');
var geojsonToArcGIS = require('arcgis-to-geojson-utils').geojsonToArcGIS;
var ogr2ogr = require('ogr2ogr')
var fs = require('fs');

var tcd = 30

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

    var geom = geojsonToArcGIS(geojson)[0].geometry.rings
	
    var renderingRule = {
        "rasterFunction": "Arithmetic",
        "rasterFunctionArguments": {
            "Raster": {
                "rasterFunction": "Remap",
                "rasterFunctionArguments": {
                    "InputRanges": [0, tcd + 1, tcd + 1, 101],
                    "OutputValues": [0, 1],
                    "Raster": "$2",
                    "AllowUnmatched": false
                }
            },
            "Raster2": "$1",
            "Operation": 3
        }
    }

	// Important: don't stringify the geometry-- do the entire object only
    var esri_data = {
        "geometryType": "esriGeometryPolygon",
        "geometry": JSON.stringify({"rings": geom, "spatialReference": {"wkid": 3857}}),
		"mosaicRule": "",
        "renderingRule": JSON.stringify(renderingRule),
		"pixelSize": "",
        "f": "pjson"
    }

    callback(querystring.stringify(esri_data))

}

function esriStatusCallback(error, result, latency) {

    //console.log('Mean latency %j', latency.meanLatencyMs);
    //console.log('histograms %j', JSON.parse(result.body).histograms[0].counts);
    //console.log('----');
    //console.log('Request elapsed milliseconds: ', result.requestElapsed);
	
	console.log('time: ' + new Date());
	console.log('test type: ' + process.argv[2])
	console.log('polygon: ' + process.argv[3])
	console.log('num_requests_in_test: ' + process.argv[4])
	console.log('elapsed time: ' + result.requestElapsed)
	console.log('result: ' + JSON.parse(result.body).histograms[0].counts)

}

function geeStatusCallback(error, result, latency) {

    console.log('Mean latency %j', latency.meanLatencyMs);
	try {
    console.log('%j', JSON.parse(result.body).result);
	} catch (e) {
		console.log(result)
	}
    console.log('----');
    console.log('Request elapsed milliseconds: ', result.requestElapsed);

}

function call_esri_api(qry_params) {

	loadTestConfig.url = "http://gis-gfw.wri.org/arcgis/rest/services/image_services/tree_cover_loss_year_wgs84/ImageServer/computeHistograms";
	loadTestConfig.method = "POST"
	loadTestConfig.body = qry_params

	loadTestConfig.contentType = "application/x-www-form-urlencoded";
	loadTestConfig.statusCallback = esriStatusCallback

	runLoadTest(loadTestConfig);
}

function modify_geojson(geojson) {
	
	var polyType = geojson.features[0].geometry.type
	
	if (polyType === 'MultiPolygon') {
		var numPolys = geojson.features[0].geometry.coordinates[0].length
	} else {
		var numPolys = geojson.features[0].geometry.coordinates.length
	}
	
	for (i=0; i < numPolys; i++) {
	  
	  if (polyType === 'MultiPolygon') {
		var second_lat = geojson.features[0].geometry.coordinates[0][i][1][0].toString()
	  } else {
		  var second_lat = geojson.features[0].geometry.coordinates[i][1][0].toString()
	  }
	  	
	  // bust the cache by modifying one value slightly
	  var second_lat_str = second_lat.substring(0,9)
	  var random_num = Math.floor(Math.random()*(5000000-1000000+1)+1000000)
	  var random_num_str = random_num.toString()
	  
	  var updated_second_lat = parseFloat(second_lat_str + random_num_str)
	  
	if (polyType === 'MultiPolygon') {
		geojson.features[0].geometry.coordinates[0][i][1][0] = updated_second_lat
	} else {
		geojson.features[0].geometry.coordinates[i][1][0] = updated_second_lat
	}
	
	}
		 
	return geojson
}

function gee() {
	
	console.log('starting gee request')
			  
	var gee_url = 'http://54.237.247.88/'
	
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
