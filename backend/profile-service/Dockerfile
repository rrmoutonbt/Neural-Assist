FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN groupadd -g 1001 appuser && useradd -u 1001 -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser
EXPOSE 8004
CMD ["python", "main.py"]
