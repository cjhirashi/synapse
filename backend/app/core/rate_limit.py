"""Limitador de peticiones por ventana deslizante (H-035)."""

import threading
import time
from collections import defaultdict


class RateLimiter:
    """Limitador de peticiones por clave usando ventana deslizante en memoria.

    Mantiene un registro de marcas de tiempo para cada clave y poda automáticamente
    las claves sin actividad reciente. Protegido con lock para multi-threading.
    """

    def __init__(self, limit: int, window_seconds: int, clock=None, max_keys: int = 10_000):
        """
        Args:
            limit: Máximo de peticiones permitidas en la ventana.
            window_seconds: Duración de la ventana deslizante en segundos.
            clock: Función que devuelve el tiempo (default: time.monotonic).
            max_keys: Máximo de claves en memoria antes de descartar las más antiguas.
        """
        self._limit = limit
        self._window = window_seconds
        self._clock = clock or time.monotonic
        self._max_keys = max_keys
        self._records = defaultdict(list)  # clave → lista de marcas de tiempo
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Verifica si la clave puede hacer una petición. Devuelve True si se permite."""
        now = self._clock()
        cutoff = now - self._window

        with self._lock:
            # Podar marcas antiguas de esta clave
            self._records[key] = [ts for ts in self._records[key] if ts > cutoff]

            # Si hemos alcanzado el límite de claves, eliminar las más antiguas
            if len(self._records) >= self._max_keys:
                # Encontrar la clave con la marca más antigua
                oldest_key = None
                oldest_time = float("inf")
                for k, timestamps in self._records.items():
                    if timestamps and timestamps[0] < oldest_time:
                        oldest_time = timestamps[0]
                        oldest_key = k

                if oldest_key is not None and oldest_key != key:
                    del self._records[oldest_key]

            # Verificar si está dentro del límite
            if len(self._records[key]) >= self._limit:
                return False

            # Registrar esta petición
            self._records[key].append(now)
            return True

    def reset(self) -> None:
        """Limpia todos los registros (para pruebas)."""
        with self._lock:
            self._records.clear()
