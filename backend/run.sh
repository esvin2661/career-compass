#!/bin/bash
# Run script for Career Compass backend

cd "$(dirname "$0")"

# Activate virtual environment
source .venv/bin/activate

# Run the FastAPI server
uvicorn main:app --reload --port 8000