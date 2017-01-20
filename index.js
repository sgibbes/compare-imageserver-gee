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

    var geom = geojsonToArcGIS(geojson)[0]['geometry']
    geom.spatialReference.wkid = 3857

    //console.log(JSON.stringify(geom))

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

    var esri_data = {
        "geometry": JSON.stringify(geom),
        "renderingRule": JSON.stringify(renderingRule),
        "geometryType": "esriGeometryPolygon",
        "f": "json"
    }

    callback(querystring.stringify(esri_data))

}

function esriStatusCallback(error, result, latency) {

    console.log('Mean latency %j', latency.meanLatencyMs);
    console.log('histograms %j', JSON.parse(result.body).histograms[0].counts);
    console.log('----');
    console.log('Request elapsed milliseconds: ', result.requestElapsed);

}

function gfwStatusCallback(error, result, latency) {

    console.log('Mean latency %j', latency.meanLatencyMs);
	try {
    console.log('%j', JSON.parse(result.body).data.attributes.loss);
	} catch (e) {
		console.log(result)
	}
    console.log('----');
    console.log('Request elapsed milliseconds: ', result.requestElapsed);

}

function geeStatusCallback(error, result, latency) {

    console.log('Mean latency %j', latency.meanLatencyMs);
	try {
    console.log('%j', JSON.parse(result.body).loss);
	} catch (e) {
		console.log(result)
	}
    console.log('----');
    console.log('Request elapsed milliseconds: ', result.requestElapsed);

}

function create_geostore(data, callback) {
    url = "https://production-api.globalforestwatch.org/geostore/"

    //console.log(JSON.stringify({'geojson': data}))
	console.log(JSON.stringify(data.features[0].geometry))

    var headers = {
        'Content-Type': 'application/json'
    }
    var options = {
        url: 'https://production-api.globalforestwatch.org/geostore/',
        method: 'POST',
        headers: headers,
        body: JSON.stringify({'geojson': data})
    }

    request(options, function(error, response, body) {
        if (!error && response.statusCode == 200) {		
			callback(JSON.parse(body).data.id)
        } else {
            console.log(response)
        }
    })
}

function call_esri_api(qry_params) {
	
	esri_api_url = 'http://gis-gfw.wri.org/arcgis/rest/services/image_services/tree_cover_loss_year_wgs84/ImageServer/computeHistograms?'

	loadTestConfig.url = esri_api_url + qry_params;
	loadTestConfig.statusCallback = esriStatusCallback
	
	runLoadTest(loadTestConfig);
}

function modify_geojson(geojson) {
	
	var second_lat = geojson.features[0].geometry.coordinates[0][1][0].toString()
		
	// bust the cache by modifying one value slightly
	var second_lat_str = second_lat.substring(0,9)
	var random_num = Math.floor(Math.random()*(5000000-1000000+1)+1000000)
	var random_num_str = random_num.toString()
	
	var updated_second_lat = parseFloat(second_lat_str + random_num_str)
	
	// update geometry
	geojson.features[0].geometry.coordinates[0][1][0] = updated_second_lat
		 
	return geojson
}

function gee() {
	
	console.log('starting gee request')
			  
	var gee_url = 'http://api.globalforestwatch.org/forest-change/umd-loss-gain/'
	
	loadTestConfig.url = gee_url
	loadTestConfig.statusCallback = geeStatusCallback
	
	// increment by 15 because that's how many requests we'll need
	// assuming we want to generate a year-to-year histogram
	loadTestConfig.maxRequests = loadTestConfig.maxRequests * 15
	loadTestConfig.concurrency = loadTestConfig.concurrency * 15
	
	loadTestConfig.method = 'POST'
	
	loadTestConfig.requestGenerator = function(params, options, client, callback) {
		
		var minYear = 2000
		var maxYear = 2014
		
		var randomYear = Math.floor(Math.random()*(maxYear-minYear+1)+minYear);		
		var geojson = modify_geojson(load_geojson())
		
		var data = querystring.stringify({'geojson': JSON.stringify(geojson.features[0].geometry),
		  'period': randomYear + '-01-01,' + (randomYear + 1) + '-01-01',
		  'threshold': tcd})
		  
		var request = client(options, callback);
		request.write(data);
		request.end();
		
		return request;
	}
	
	runLoadTest(loadTestConfig);
	
}

function gfw_request(geostoreID) {
	
	console.log('starting gee_request')
			  
	var gfw_url = 'https://production-api.globalforestwatch.org/umd-loss-gain?'
	
	loadTestConfig.url = gfw_url
	loadTestConfig.statusCallback = gfwStatusCallback
	
	// increment by 15 because that's how many requests we'll need
	// assuming we want to generate a year-to-year histogram
	loadTestConfig.maxRequests = loadTestConfig.maxRequests * 15
	loadTestConfig.concurrency = loadTestConfig.concurrency * 15
	
	loadTestConfig.requestGenerator = function(params, options, client, callback) {
		
		var minYear = 2000
		var maxYear = 2014
		
		var randomYear = Math.floor(Math.random()*(maxYear-minYear+1)+minYear);
		
		qry_params = {'geostore': geostoreID,
		  'period': randomYear + '-01-01,' + (randomYear + 1) + '-01-01',
		  'thresh': tcd}
		
		options.path += querystring.stringify(qry_params);
				
		var request = client(options, callback);
		
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

function gfw() {
	
	var geojson = modify_geojson(load_geojson())
	
	create_geostore(geojson, function(geostoreID) {
		console.log('Geostore ID %j', geostoreID)
		gfw_request(geostoreID)
	})

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
	case 'gfw':
	  gfw();
	  break
	  
	case 'esri':
	   esri();
	   break
	   
	case 'gee':
	   gee()
	   break   
}