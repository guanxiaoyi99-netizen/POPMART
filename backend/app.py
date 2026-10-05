import os
from flask import Flask,send_from_directory, jsonify
import csv

app = Flask(__name__)

FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")


def read_csv_file(filename):
    """Reads a CSV file and returns its contents as a list of dictionaries."""
    filepath = os.path.join(DATA_DIR, filename)
    try:
       rows = []
       with open(filepath, 'r', encoding='utf-8') as f:
          reader = csv.DictReader(f)
          for row in reader:
                rows.append(row)
       return rows
    except Exception:
        return []


@app.route('/')
def serve_frontend():
    return send_from_directory(FRONTEND_DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(FRONTEND_DIR, filename)

@app.route('/api/hotsearch')
def hotsearch():
    return jsonify(read_csv_file('hotsearch_trending.csv'))

@app.route('/api/comments')
def comments():
    return jsonify(read_csv_file('comments.csv'))

@app.route('/api/ip-performance')
def ip_performance():
    return jsonify(read_csv_file('ip_performance.csv'))

@app.route('/api/platform-distribution')
def platform_distribution():
    return jsonify(read_csv_file('platform_distribution.csv'))

@app.route('/api/sentiment')
def sentiment():
    return jsonify(read_csv_file('sentiment_analysis.csv'))

@app.route('/api/demographics')
def demographics():
    return jsonify(read_csv_file('user_demographics.csv'))

@app.route('/api/meta')
def meta():
    try:
        with open(os.path.join(DATA_DIR, 'retrieved.txt'), encoding='utf-8') as f:
            return jsonify({'retrieved': f.read().strip()})
    except Exception:
        return jsonify({'retrieved': ''})

if __name__ == '__main__':
    app.run(debug=True, port=8000)