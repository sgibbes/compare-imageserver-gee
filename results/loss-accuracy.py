import os
import sys
import json
import pandas as pd

import geodesic_area


def main():

    df = load_data()
    zstats_df = load_zstats()
    lat_area_dict = build_area_dict()

    melted_df = pd.melt(df, id_vars=['server_type', 'geojson_name'], var_name='year', value_name='loss_server')
    grouped_df = melted_df.groupby(['server_type', 'geojson_name', 'year'])['loss_server'].mean().reset_index()
    
    # calculate esri area -- multiply the average area of the pixels at that latitude
    # by the number of pixels in the esri response
    grouped_df.ix[grouped_df.server_type == 'esri', 'loss_server'] = grouped_df['geojson_name'].map(lat_area_dict) * grouped_df['loss_server'] / 10000
    
    joined_df = pd.merge(zstats_df, grouped_df, how='left', on=['geojson_name', 'year'])
    joined_df['pct_diff'] = abs(((joined_df['loss_server'] - joined_df['loss_zstats'])) / joined_df['loss_zstats']) * 100
    print joined_df
    
    final_df = joined_df.groupby(['server_type', 'geojson_name'])['pct_diff'].mean().reset_index()
    final_df.to_csv('loss-accuracy.csv', index=False)
    print final_df
    
    
def load_data():

    with open('loss-results.json') as thefile:
        data = json.load(thefile)
        
    output_list = []
    
    # remove all ERROR responses
    data = [x for x in data if x['response'] != 'ERROR']
        
    for row in data:
        output_hist = [float(x) for x in row['response'].split(',')]
        year_vals = range(2001, 2015)
        
        # remove "no loss" pixel values from esri response
        if row['server_type'] == 'esri':
            output_hist.pop(0)
        
        # create a dictionary of {year: loss_value} for each year
        row_dict = {year: val for (year, val) in zip(year_vals, output_hist)}
        row_dict['geojson_name'] = row['geojson_name']
        row_dict['server_type'] = row['server_type']
        
        output_list.append(row_dict)
        
    # build a dataframe from the above, with each row being server_type, geojson, 2001, 2002, 2003, etc
    df = pd.DataFrame(output_list)    
    df['geojson_name'] = df['geojson_name'].apply(lambda x: os.path.splitext(os.path.basename(x))[0])

    return df
    
    
def build_area_dict():

    lat_dict = {'paraguay': -22.3355010247972,
                'wdpa_idn_complex': -3.06276815170764,
                'drc': -4.32550039144615}
        
    area_dict = {}
        
    for geojson_name, lat_val in lat_dict.iteritems():
        pixel_area = geodesic_area.get_area(lat_val)
        
        area_dict[geojson_name] = pixel_area
        
    return area_dict
    

def load_zstats():

    zstats_df = pd.read_csv('arcgis_zstats_loss_results.csv')
    del zstats_df['loss_m2']
    
    zstats_df = zstats_df.apply(pd.to_numeric, errors='ignore')    
    zstats_df.columns = ['geojson_name', 'year', 'loss_zstats']
    
    return zstats_df
    
    
if __name__ == '__main__':
    main()