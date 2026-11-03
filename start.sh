#!/bin/bash

PROJECT_DIR="/home/moodscope/Desktop/Speed_Ocr/speed_ocr"
VENV="$PROJECT_DIR/venv"

# Activate virtual environment
source "$VENV/bin/activate"

# Start FastAPI
cd "$PROJECT_DIR/backend" || exit 1

"$VENV/bin/uvicorn" app.main:app \
    --host 0.0.0.0 \
    --port 8001 &

# Start highway detection orchestrator
cd "$PROJECT_DIR/highway-detection" || exit 1

"$VENV/bin/python" orchestrator.py &

# Wait for background process
wait
