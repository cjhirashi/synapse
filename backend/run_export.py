#!/usr/bin/env python3
"""Ejecutar export_openapi.py"""
import sys
from pathlib import Path

backend = Path(__file__).parent
sys.path.insert(0, str(backend))

from scripts.export_openapi import main
main()
