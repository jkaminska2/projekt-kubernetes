FROM python:3.13-slim

RUN useradd -m appuser
WORKDIR /home/appuser

COPY app/requirements.txt .

RUN pip install --no-cache-dir -r requirements.txt

COPY app/ .

RUN chown -R appuser:appuser /home/appuser

USER appuser

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "app:app"]