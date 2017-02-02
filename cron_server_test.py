import os
import subprocess
import time

src_dir = os.path.dirname(os.path.abspath(__file__))
geojson_list = [x for x in os.listdir(src_dir) if os.path.splitext(x)[1] == '.geojson']

for server_type in ['esri', 'gee']:
    for geojson in geojson_list:
        for request_count in [10, 20, 30]:
        
            cmd = ['node', 'index.js', server_type, geojson, str(request_count)]
            print cmd

            subprocess.call(cmd)
            
            print 'sleeping . . . '
            time.sleep(20)