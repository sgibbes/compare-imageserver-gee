import os
import pandas as pd
import datetime
import json
import matplotlib, matplotlib.pyplot as plt
from dateutil.parser import parse

matplotlib.style.use('ggplot')

current_dir = os.path.dirname(os.path.abspath(__file__))
plot_dir = os.path.join(current_dir, 'plots')

def main():

    df = load_data()
    
    response_time_table = prep_response_time_table(df)
    error_count_table = prep_error_count_table(df)
    
    make_plots(response_time_table, 'response_time')
    make_plots(error_count_table, 'error_count')


def load_data():
    with open('compare-esri-gee-results.json') as thefile:
        data = json.load(thefile)
        
    for row in data:
        row['timestamp'] = row['datetime']['$date']
        del row['datetime'], row['__v'], row['_id']

    df = pd.DataFrame(data)
    df['timestamp'] = pd.to_datetime(df.timestamp)

    df['grouped_timestamp'] = df['timestamp'].apply(lambda dt: datetime.datetime(dt.year, dt.month, dt.day, dt.hour,30*(dt.minute // 30)))
    
    df['response_time'] = df['response_time_ms'] / 1000
    
    return df
    
def prep_response_time_table(df):

    # remove error values from this dataset
    no_error_df = df[df.response != 'ERROR']
    
    # calculate a combination of server type and test to pivot on
    no_error_df['server_test'] = no_error_df.server_type + '_' + no_error_df.num_requests_in_test.map(str)
    
    no_error_grouped = no_error_df.groupby(['geojson_name', 'grouped_timestamp', 'server_test'])['response_time'].mean().reset_index()

    # pivot to have multiple columns to graph (e.g. results for esri and results for gee)
    no_error_pivot = pd.pivot_table(no_error_grouped, index=['grouped_timestamp', 'geojson_name'], columns='server_test', values='response_time').reset_index()
    
    return no_error_pivot
            
def prep_error_count_table(df):

    error_df = df[df.response == 'ERROR']
    error_grouped = error_df.groupby(['geojson_name', 'grouped_timestamp', 'server_type']).size().reset_index()
    
    error_grouped.rename(columns={0:'error_count'}, inplace=True)
    
    success_df = df[df.response != 'ERROR']
    success_grouped = success_df.groupby(['geojson_name', 'grouped_timestamp', 'server_type']).size().reset_index()
    
    success_grouped.rename(columns={0:'success_count'}, inplace=True)
    
    # Make dataframe of all possible time stamps to represent 
    # where there were no errors in response
    all_timestamp_df = df.groupby(['grouped_timestamp', 'geojson_name', 'server_type']).size().reset_index()
    del all_timestamp_df[0]
    
    # Join the error count df to the all possible df
    joined = pd.merge(all_timestamp_df, error_grouped, on=['grouped_timestamp', 'geojson_name', 'server_type'], how='left')
    
    # join the success df to that
    joined = pd.merge(joined, success_grouped, on=['grouped_timestamp', 'geojson_name', 'server_type'], how='left')
    
    # for combinations of server_type/timestamp/geojson where success count == 60
    # clearly there were no errors
    # important to set this to 0, as opposed to NoData, where didn't collect data for some reason
    joined.loc[joined['success_count'] == 60, 'error_count'] = 0
    
    del joined['success_count']
    
    joined_pivot = pd.pivot_table(joined, index=['grouped_timestamp', 'geojson_name'], columns='server_type', values='error_count').reset_index()

    return joined_pivot

def make_plots(df, plot_type):
    
    for geojson in df.geojson_name.unique():
        plot_title = geojson.replace('.geojson', '_') + plot_type
        print 'plotting {}'.format(plot_title)
        
        plot_labels_dict = {'response_time': 'mean response time (seconds)', 'error_count': 'count of error responses'}
        
        filtered_df = df[df.geojson_name == geojson]
        
        # NB: important to set this if we want time to display on the x axis
        filtered_df.set_index(pd.DatetimeIndex(filtered_df['grouped_timestamp']), inplace=True)
        
        ax = filtered_df.plot(title=plot_title)
        ax.set_ylabel(plot_labels_dict[plot_type])
        
        fig = ax.get_figure()
        fig.autofmt_xdate()
        
        out_png = os.path.join(plot_dir, plot_title + '.png')
        fig.savefig(out_png)
    

if __name__ == '__main__':
    main()

