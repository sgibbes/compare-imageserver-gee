import os
import sys
import json
import pandas as pd
import numpy as np


globcover_vals = [11, 14, 20, 30, 40, 50, 60, 70, 90, 100, 110, 120, 
                  130, 140, 150, 160, 170, 180, 190, 200, 220, 230]

# overwrite values where we combined them on imageserver
globcover_dict = {x:x for x in globcover_vals}
globcover_dict[30] = 20
globcover_dict[60] = 50
globcover_dict[90] = 70
globcover_dict[120] = 110
globcover_dict[180] = 170
globcover_dict[230] = 220

esri_globcover_vals = sorted(list(set(globcover_dict.values())))


def main():

    df = load_data()
    result_df = read_zstats_results() 
    
    gee_zstats_df = load_zstats(result_df)
    esri_zstats_df = build_esri_df(result_df)
    zstats_combined = pd.concat([gee_zstats_df, esri_zstats_df])

    grouped_df = df.groupby(['server_type', 'globcover', 'geojson_name', 'year'])['pixel_count_server'].mean().reset_index()
    
    joined_df = pd.merge(zstats_combined, grouped_df, on=['geojson_name', 'year', 'server_type', 'globcover'])
    joined_df['pct_diff'] = abs(((joined_df['pixel_count_server'] - joined_df['pixel_count_zstats'])) / joined_df['pixel_count_zstats']) * 100
    
    by_globcover_df = joined_df.groupby(['globcover'])['pct_diff'].mean().reset_index()
    
    final_df = joined_df.groupby(['server_type', 'geojson_name'])['pct_diff'].mean().reset_index()
    final_df.to_csv('accuracy_histogram.csv', index=False)
    print final_df
    
    
def load_data():

    with open('hist-results.json') as thefile:
        data = json.load(thefile)
        
    output_list = []
    
    # remove all ERROR responses
    data = [x for x in data if x['response'] not in ('ERROR', '"ERROR"')]
            
    for row in data:
        server_type = row['server_type']
        geojson_name = os.path.splitext(os.path.basename(row['geojson_name']))[0]
    
        if server_type == 'gee':
            response = json.loads(row['response'])['result']
            
            for globcover, year_dict in response.iteritems():
                for year, pixel_count in year_dict.iteritems():
                
                    output_row = {'server_type': server_type, 'geojson_name': geojson_name,
                                  'globcover': int(globcover), 'year': int(year), 
                                  'pixel_count_server': int(pixel_count)}
                                  
                    output_list.append(output_row)
            
        else:
            # get response list and remove first item (for some reason)
            response_list = [int(x) for x in row['response'].split(',')]
            response_list.pop(0)
            
            # convert to numpy array
            output_hist = np.array(response_list)
            
            # number of loss years starting 2000 (=no loss)
            year_count = 15
            
            # check how many values are missing
            missing_values = year_count * len(esri_globcover_vals) - len(output_hist)
            
            # append missing values as 0s
            new_histogram = np.append(output_hist, np.zeros(missing_values, dtype=np.int))
            
            # convert histogram to 2d histogram (landcoverloss/year)
            histogram_2d = new_histogram.reshape((-1,len(esri_globcover_vals)))
          
            result = dict()
            for y in range(year_count):

                result[y + 2000] = dict(zip(esri_globcover_vals, histogram_2d.tolist()[y]))
                
            for year, globcover_dict in result.iteritems():
                for globcover, pixel_count in globcover_dict.iteritems():
            
                    output_row = {'server_type': server_type, 'geojson_name': geojson_name,
                                  'globcover': int(globcover), 'year': year, 
                                  'pixel_count_server': int(pixel_count)}
    
                    output_list.append(output_row)
            
     
    df = pd.DataFrame(output_list)
    print df

    return df
    

def load_zstats(result_df):
    
    gee_df = result_df[result_df.server_type == 'gee']
    
    return gee_df
    
def build_esri_df(result_df):
    
    esri_df = result_df[result_df.server_type == 'esri']

    esri_df['new_globcover'] = esri_df['globcover'].map(globcover_dict)
    
    # replace globcover field 
    del esri_df['globcover']
    esri_df.columns = ['geojson_name', 'pixel_count_zstats', 'year', 'server_type', 'globcover']
    
    # sum the newly looked-up values
    esri_df = esri_df.groupby(['server_type', 'geojson_name', 'year', 'globcover'])['pixel_count_zstats'].sum().reset_index()
    
    return esri_df
    
    
def read_zstats_results():

    df = pd.read_csv('arcgis_zstats_globcover_results.csv')
    df = df.apply(pd.to_numeric, errors='ignore')    
    df.columns = ['geojson_name', 'pixel_count_zstats', 'globcover', 'year', 'server_type']
    
    df = df.dropna()
    
    return df


    
    
if __name__ == '__main__':
    main()