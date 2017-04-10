import os
import sys
import json
import pandas as pd


def main():

    df = load_data(sys.argv[1])
    zstats_df = load_zstats()
    
    melted_df = pd.melt(df, id_vars=['server_type', 'geojson_name'], var_name='year', value_name='loss_server')
    
    grouped_df = melted_df.groupby(['server_type', 'geojson_name', 'year'])['loss_server'].mean().reset_index()
    
    joined_df = pd.merge(zstats_df, grouped_df, how='left', on=['geojson_name', 'year'])
    
    joined_df['loss_zstats'] = pd.to_numeric(joined_df['loss_zstats'], errors='coerce')
    
    joined_df['pct_diff'] = ((joined_df['loss_server'] - joined_df['loss_zstats']) / joined_df['loss_zstats']) * 100
    
    print joined_df[(joined_df['server_type'] == 'gee') & (joined_df['geojson_name'] == 'brazil')]

    final_df = joined_df.groupby(['server_type', 'geojson_name'])['pct_diff'].mean().reset_index()
    
    print final_df
    
    
def load_data(datafile):
    with open(datafile) as thefile:
        data = json.load(thefile)
        
    output_list = []
    
    data = [x for x in data if x['response'] != 'ERROR']
        
    for row in data:
        output_hist = [float(x) for x in row['response'].split(',')]
        year_vals = range(2001, 2016)
        
        row_dict = {year: val for (year, val) in zip(year_vals, output_hist)}
        row_dict['geojson_name'] = row['geojson_name']
        row_dict['server_type'] = row['server_type']
        
        output_list.append(row_dict)
        
    df = pd.DataFrame(output_list)    
    df['geojson_name'] = df['geojson_name'].apply(lambda x: os.path.splitext(os.path.basename(x))[0])

    return df
    
    
def load_zstats():

    zstats_df = pd.read_csv('arcgis_zstats_loss_results.csv')
    
    # remove no loss areas
    zstats_df = zstats_df[zstats_df['year'] != "no loss"]
    del zstats_df['loss_m2']
    
    zstats_df = zstats_df.apply(pd.to_numeric, errors='ignore')    
    zstats_df.columns = ['geojson_name', 'year', 'loss_zstats']
    
    return zstats_df
    
    
if __name__ == '__main__':
    main()