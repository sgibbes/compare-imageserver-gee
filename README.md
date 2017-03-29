# compare-imageserver-gee

This repo uses [loadtest](https://github.com/alexfernandez/loadtest) to fire analysis requests at esri and GEE servers for various geojson polygons. 

The basic syntax is as follows:

`node index.js gee geojson/drc.geojson 1`

This will send one request to the GEE server to compute loss by year for the drc.geojson polygon.

Another example is:
`node index.js esri geojson/brazil.geojson 30`

This will send thirty concurrent requests to the ArcGIS server to tabulate loss by year for brazil.geojson

Both gee and esri functions have their own response handlers, and the responses from the servers, in addition to the mean elapsed time (milliseconds) are logged to the console.

### Loss and 2D Histograms

In addition tabulating loss, this repo can also test the generation of 2D histograms. For this POC, we're intersecting loss year rasters with Globcover. These tests can be run with the above commands, substituting `overlay_rr.js` for `index.js`.

### Tricks

##### GeoJSON >> esriJSON
Given the desire to maintain only one set of polygons, the data in the geojson folder is converted to esriJSON in EPSG:3857 dynamically before each test. This is done using ogr2ogr for the projection, and arcgis-to-geojson-utils for geojson >> esrijson.

##### GEE caching
GEE will cache results for each particular polygon/raster combination. This is not good if one wants to repeat these tests every half hour. As such, index.js and overlay_rr.js modify the GeoJSON geometries slightly using random coordinates before sending to GEE.

### Deployment

1. `npm install`
2. test with the example commands above

### Logging results

If you'd like to log results of these tests, make sure mongo is installed and running on port 27017. Then add `log` as an addditonal parameter to your commands, like so:

`node index.js gee geojson/drc.geojson 1 log`

This will create a `results` database in mongo, and store results from each call there.

To automate this process, I add this to my crontab:

`0,30 * * * * /home/ubuntu/compare-imageserver-gee/cron_server_test.py`

To export this data after the test is complete, run:

`mongoexport --db results --collection datapoints --out out.json --jsonArray`


