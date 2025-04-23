import pandas as pd
import geopandas as gpd 
from flask import Flask, jsonify, request, render_template, send_from_directory
import os
import json
from datetime import datetime, timedelta

app = Flask(__name__)

DATA_DIR = os.path.join(app.root_path, 'static', 'data')

ORIGINAL_DATA_FILES = {
    'Major_Crimes_Trend': 'Crime_Major_Trend.csv',
    'Crime_Lockdown_Patterns': 'COVID_Crime_Data.csv'
}

ORIGINAL_COLUMN_MAPPINGS = {
    'Major_Crimes_Trend': {
        'x': 'Year',
        'y': 'Count',
        'label': 'Offence Group',
        'chart': 'line',
        'title': 'Trend of Major Crimes in London (2014–2024)'
     },
    'Crime_Lockdown_Patterns': {
        'x': 'Phase',
        'y': 'Count',
        'label': 'CrimeCategory',
        'chart': 'radial-bar',
        'title': 'Crime Counts across COVID Lockdown Phases (2014–2024)'
    }
}

BOROUGH_GEOJSON_FILE = os.path.join(DATA_DIR, 'london_boroughs.geojson')
MAP_CRIME_DATA_FILE = os.path.join(DATA_DIR, 'Crime_Data.csv') 
POPULATION_DATA_FILE = os.path.join(DATA_DIR, 'Population_Forecast.csv') 


MAP_START_YEAR = 2014
MAP_END_YEAR = 2024
MAP_START_DATE = datetime(MAP_START_YEAR, 1, 1)
MAP_END_DATE = datetime(MAP_END_YEAR, 12, 31)


# Loading Data
try:
    print("Loading GeoJSON...")
    if os.path.exists(BOROUGH_GEOJSON_FILE):
        borough_gdf = gpd.read_file(BOROUGH_GEOJSON_FILE)
        if 'name' not in borough_gdf.columns:
            name_col = next((col for col in borough_gdf.columns if 'name' in col.lower() or 'borough' in col.lower()), None)
            if name_col:
                borough_gdf.rename(columns={name_col: 'name'}, inplace=True)
                print(f"Renamed GeoJSON column '{name_col}' to 'name'")
            else:
                 print("Warning: Could not find a 'name' column in GeoJSON.")
        if 'name' in borough_gdf.columns:
             borough_gdf['name'] = borough_gdf['name'].str.strip().str.title()
        print(f"GeoJSON loaded with {len(borough_gdf)} boroughs.")
    else:
        print(f"Warning: GeoJSON file not found at {BOROUGH_GEOJSON_FILE}")
        borough_gdf = None

    print("Loading Detailed Crime Data for Map...")
    if os.path.exists(MAP_CRIME_DATA_FILE):
        map_crime_df = pd.read_csv(MAP_CRIME_DATA_FILE)

        print(f"Attempting to parse 'Month_Year' column (expecting DD/MM/YYYY)...")
        try:
            map_crime_df['Date'] = pd.to_datetime(map_crime_df['Month_Year'], format='%d/%m/%Y', errors='coerce')
        except Exception as e:
            print(f"Error during date parsing: {e}. Attempting generic parsing (might be slow/inaccurate).")
            map_crime_df['Date'] = pd.to_datetime(map_crime_df['Month_Year'], errors='coerce')

        failed_dates = map_crime_df['Date'].isnull().sum()
        if failed_dates > 0:
            print(f"Warning: {failed_dates} rows failed date parsing in 'Month_Year' column.")

        map_crime_df.dropna(subset=['Date'], inplace=True) 

        map_crime_df.rename(columns={
            'Borough': 'borough',
            'Offence Group': 'crime_type',
            'Count': 'count'
        }, inplace=True, errors='ignore')

        if 'borough' in map_crime_df.columns:
            map_crime_df['borough'] = map_crime_df['borough'].str.strip().str.title()
        else:
             print("Warning: 'Borough' column not found in map crime data.")

        print(f"Detailed crime data loaded: {len(map_crime_df)} records remaining after date processing.")
        if len(map_crime_df) == 0 and failed_dates > 0:
             print("CRITICAL WARNING: All records were dropped due to date parsing failures. Check the 'Month_Year' format in your CSV and the parsing logic in the code.")

    else:
        print(f"Warning: Detailed crime data file not found at {MAP_CRIME_DATA_FILE}")
        map_crime_df = None


    print("Loading Population Data...")
    if os.path.exists(POPULATION_DATA_FILE):
        pop_df_raw = pd.read_csv(POPULATION_DATA_FILE)
        pop_df_raw.rename(columns={
            'Borough': 'borough',
            'Year': 'year',
            'Population': 'population'
            }, inplace=True, errors='ignore')
        # Clean borough names
        if 'borough' in pop_df_raw.columns:
             pop_df_raw['borough'] = pop_df_raw['borough'].str.strip().str.title()
        else:
             print("Warning: 'Borough' column not found in population data.")
        if 'year' in pop_df_raw.columns:
            pop_df_raw['year'] = pd.to_numeric(pop_df_raw['year'], errors='coerce')
            pop_df_raw.dropna(subset=['year'], inplace=True)
            pop_df_raw['year'] = pop_df_raw['year'].astype(int)

            pop_df = pop_df_raw[
                (pop_df_raw['year'] >= MAP_START_YEAR) & (pop_df_raw['year'] <= MAP_END_YEAR)
            ].copy() # Use .copy()
            print(f"Population data loaded and filtered for years {MAP_START_YEAR}-{MAP_END_YEAR}.")
        else:
            print("Warning: 'Year' column not found in population data. Cannot filter by year.")
            pop_df = pop_df_raw
    else:
        print(f"Warning: Population data file not found at {POPULATION_DATA_FILE}")
        pop_df = None

except FileNotFoundError as e:
    print(f"Error loading data file: {e}. Make sure files exist in '{DATA_DIR}'.")
    borough_gdf = None
    map_crime_df = None
    pop_df = None
except Exception as e:
    print(f"An unexpected error occurred during data loading: {e}")
    import traceback
    traceback.print_exc()
    borough_gdf = None
    map_crime_df = None
    pop_df = None


def get_crime_aggregation(crime_type=None):
    if map_crime_df is None or map_crime_df.empty or 'borough' not in map_crime_df.columns or 'count' not in map_crime_df.columns:
        print("Error: Detailed crime data frame is not available, empty, or missing required columns ('borough', 'count').")
        return {}

    print(f"Filtering detailed crime data from {MAP_START_DATE.date()} to {MAP_END_DATE.date()}")
    # Ensure 'Date' column exists before filtering
    if 'Date' not in map_crime_df.columns:
        print("Error: 'Date' column not found in map_crime_df for filtering.")
        return {}

    filtered_crime = map_crime_df[
        (map_crime_df['Date'] >= MAP_START_DATE) & (map_crime_df['Date'] <= MAP_END_DATE)
    ].copy()

    if crime_type and crime_type != 'All' and 'crime_type' in filtered_crime.columns:
        print(f"Filtering by crime type: {crime_type}")
        filtered_crime = filtered_crime[filtered_crime['crime_type'] == crime_type]
    elif crime_type and crime_type != 'All':
         print(f"Warning: 'crime_type' column not found for filtering by {crime_type}.")

    if filtered_crime.empty:
        print("No crime data found within the specified date range.")
        return {}

    aggregation = filtered_crime.groupby('borough')['count'].sum().reset_index()
    print(f"Aggregated {len(aggregation)} boroughs for the period {MAP_START_YEAR}-{MAP_END_YEAR}.")

    if pop_df is not None and not pop_df.empty and 'borough' in pop_df.columns and 'population' in pop_df.columns and 'year' in pop_df.columns:
        pop_latest_year = pop_df[pop_df['year'] == MAP_END_YEAR][['borough', 'population']].copy()

        if pop_latest_year.empty:
             print(f"Warning: No population data found for the year {MAP_END_YEAR}. Cannot calculate rate.")
             result_dict = pd.Series(aggregation['count'].values, index=aggregation['borough']).to_dict()
        else:
            aggregation['borough_lower'] = aggregation['borough'].str.lower()
            pop_latest_year['borough_lower'] = pop_latest_year['borough'].str.lower()

            aggregation = pd.merge(
                aggregation,
                pop_latest_year[['borough_lower', 'population']],
                on='borough_lower',
                how='left' 
            )
            aggregation.drop(columns=['borough_lower'], inplace=True)

            result_dict = pd.Series(aggregation['count'].values, index=aggregation['borough']).to_dict()
    else:
         if pop_df is None or pop_df.empty: print("Population data not loaded or is empty, cannot calculate rate.")
         elif not all(c in pop_df.columns for c in ['borough', 'population', 'year']): print("Population data missing required columns ('borough', 'population', 'year').")
         result_dict = pd.Series(aggregation['count'].values, index=aggregation['borough']).to_dict()

    return {str(k): int(v) if pd.notna(v) else 0 for k, v in result_dict.items()}


def get_borough_time_series(borough_name, crime_type=None):
    if map_crime_df is None or map_crime_df.empty or 'borough' not in map_crime_df.columns or 'count' not in map_crime_df.columns:
        print("Error: Detailed crime data frame is not available, empty, or missing required columns ('borough', 'count').")
        return []
    borough_name_std = borough_name.strip().title()

    print(f"Getting time series for: {borough_name_std}, Type: {crime_type}, Period: {MAP_START_YEAR}-{MAP_END_YEAR}")

    borough_filtered = map_crime_df[map_crime_df['borough'] == borough_name_std].copy()

    if borough_filtered.empty:
        print(f"No data found for borough: {borough_name_std}")
        return []

    if 'Date' not in borough_filtered.columns:
        print("Error: 'Date' column not found in borough_filtered data for time filtering.")
        return []

    time_filtered = borough_filtered[
        (borough_filtered['Date'] >= MAP_START_DATE) &
        (borough_filtered['Date'] <= MAP_END_DATE)
    ]

    if crime_type and crime_type != 'All' and 'crime_type' in time_filtered.columns:
        final_filtered = time_filtered[time_filtered['crime_type'] == crime_type]
    elif crime_type and crime_type != 'All':
         print(f"Warning: 'crime_type' column not found for filtering by {crime_type}.")
         final_filtered = time_filtered
    else: # 'All' types
        final_filtered = time_filtered

    if final_filtered.empty:
        print(f"No data found for {borough_name_std} with specified filters in the period {MAP_START_YEAR}-{MAP_END_YEAR}.")
        return []
    if not pd.api.types.is_datetime64_any_dtype(final_filtered['Date']):
         print("Error: 'Date' column is not datetime type before grouping.")
         return []

    final_filtered['MonthDate'] = final_filtered['Date'].dt.to_period('M').dt.to_timestamp()
    time_series = final_filtered.groupby('MonthDate')['count'].sum().reset_index()

    result = time_series.apply(
        lambda row: {"date": row['MonthDate'].strftime('%Y-%m'), "count": int(row['count'])},
        axis=1
    ).tolist()

    result.sort(key=lambda x: x['date'])
    return result

@app.route('/')
def index():

    return render_template('home.html')

@app.route('/data/<dataset_name>', methods=['GET'])
def get_original_data(dataset_name):
    if dataset_name not in ORIGINAL_DATA_FILES:
        return jsonify({'error': f'Invalid dataset name for original charts: {dataset_name}'}), 404

    filepath = os.path.join(DATA_DIR, ORIGINAL_DATA_FILES[dataset_name])
    mapping = ORIGINAL_COLUMN_MAPPINGS.get(dataset_name)

    if not mapping:
        return jsonify({'error': f'Column mapping not defined for dataset: {dataset_name}'}), 400
    if not os.path.exists(filepath):
         return jsonify({'error': f'Data file not found: {ORIGINAL_DATA_FILES[dataset_name]}'}), 404

    # JSON data
    if filepath.endswith('.json'):
        try:
            with open(filepath, 'r') as f: data = json.load(f)
            return jsonify({'data': data, 'columns': mapping})
        except Exception as e:
            print(f"Error reading JSON file {filepath}: {e}")
            return jsonify({'error': 'Could not read JSON data file'}), 500

    # CSV data
    try:
        df = pd.read_csv(filepath)
        required_cols = [mapping['x'], mapping['y'], mapping['label']]
        if not all(col in df.columns for col in required_cols):
             missing = [col for col in required_cols if col not in df.columns]
             print(f"Error: Missing columns {missing} in {ORIGINAL_DATA_FILES[dataset_name]}")
             return jsonify({'error': f'Expected columns not found in dataset: {missing}'}), 400

        filtered = df[required_cols].copy()
        filtered.columns = ['x', 'y', 'label']
        filtered.dropna(inplace=True)
        return jsonify({'data': filtered.to_dict(orient='records'), 'columns': mapping})
    except KeyError as e:
         print(f"KeyError accessing columns for {dataset_name}: {e}")
         return jsonify({'error': f'Column configuration error for dataset: {e}'}), 400
    except Exception as e:
        print(f"Error processing CSV {filepath}: {e}")
        return jsonify({'error': 'Could not process CSV data'}), 500


@app.route('/charts')
def list_charts():
    return jsonify({key: ORIGINAL_COLUMN_MAPPINGS[key]['title'] for key in ORIGINAL_COLUMN_MAPPINGS})

@app.route('/geojson/london-boroughs')
def get_london_geojson():
    if borough_gdf is not None:
        try:
            if borough_gdf.crs and borough_gdf.crs != 'EPSG:4326':
                 print("Reprojecting GeoJSON to EPSG:4326 for response")
                 return jsonify(json.loads(borough_gdf.to_crs(epsg=4326).to_json()))
            else:
                 return jsonify(json.loads(borough_gdf.to_json()))
        except Exception as e:
            print(f"Error converting GeoDataFrame to JSON: {e}")
            return jsonify({"error": "Could not format GeoJSON data"}), 500
    else:
        return jsonify({"error": "GeoJSON data not loaded or available"}), 404


@app.route('/data/crime-types')
def get_crime_types():
    if map_crime_df is not None and not map_crime_df.empty and 'crime_type' in map_crime_df.columns:
        if 'Date' not in map_crime_df.columns:
             print("Warning: 'Date' column missing, cannot filter crime types by date.")
             types = ['All'] + sorted(map_crime_df['crime_type'].unique().tolist())
        else:
            # Filter crime types based on the fixed date range
            relevant_crime = map_crime_df[
                (map_crime_df['Date'] >= MAP_START_DATE) & (map_crime_df['Date'] <= MAP_END_DATE)
            ]
            types = ['All'] + sorted(relevant_crime['crime_type'].unique().tolist())
        return jsonify(types)
    else:
        print("Warning: Cannot get crime types, detailed crime data empty/missing or 'crime_type' column missing.")
        return jsonify(['All']) 

@app.route('/data/crime-choropleth')
def get_choropleth_data():
    crime_type = request.args.get('crime_type', default='All', type=str)
    print(f"Request for choropleth data: Type={crime_type}, Period={MAP_START_YEAR}-{MAP_END_YEAR}")
    data = get_crime_aggregation(crime_type=crime_type)
    if data:
        return jsonify(data)
    else:
        return jsonify({}) 


@app.route('/data/borough-details/<path:borough_name>')
def get_borough_data(borough_name):
    crime_type = request.args.get('crime_type', default='All', type=str)
    data = get_borough_time_series(borough_name, crime_type=crime_type) 
    return jsonify(data) 


if __name__ == '__main__':
    app.run(debug=False, port=8888) 
