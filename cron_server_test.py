#!/usr/bin/python

import os
import subprocess
import time

src_dir = os.path.dirname(os.path.abspath(__file__))
geojson_dir = os.path.join(src_dir, 'geojson')
geojson_list = [x for x in os.listdir(geojson_dir) if os.path.splitext(x)[1] == '.geojson']

if os.name == 'posix':
    cwd = r'/home/ubuntu/compare-imageserver-gee'
else:
    cwd = os.getcwd()

print geojson_list

for geojson in geojson_list:
    for request_count in [10, 20, 30]:
        for server_type in ['esri', 'gee']:

            cmd = ['node', 'overlay_rr.js', server_type, geojson, str(request_count), 'log']
            print cmd

            subprocess.call(cmd, cwd=cwd)
