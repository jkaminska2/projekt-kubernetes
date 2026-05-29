import os
import redis
from flask import Flask, jsonify, request

app = Flask(__name__)
r = redis.Redis(host=os.getenv('REDIS_HOST', 'redis-service'), port=6379)

@app.route('/health')
def health():
    return jsonify({"status": "healthy"}), 200

@app.route('/ready')
def ready():
    try:
        r.ping()
        return jsonify({"status": "ready"}), 200
    except:
        return jsonify({"status": "not ready"}), 503

@app.route('/data', methods=['POST', 'GET'])
def data():
    if request.method == 'POST':
        item = request.json.get('item')
        r.lpush('my_queue', item)
        return jsonify({"message": f"Added {item} to queue"}), 201
    else:
        items = [i.decode('utf-8') for i in r.lrange('my_queue', 0, -1)]
        return jsonify({"items": items}), 200

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)