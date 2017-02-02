  var mongoose = require('mongoose');

  var dataPointSchema = mongoose.Schema({
    datetime: Date,
    server_type: String,
    geojson_name: String,
    num_requests_in_test: Number,
    response_time_ms: Number,
    response: String
  });

  var DataPoint = mongoose.model('DataPoint', dataPointSchema);

  module.exports = DataPoint;
