"""Reference-rate CNY display estimates; original accounting values stay intact."""

import json
import re
from datetime import date
from decimal import Decimal, InvalidOperation, localcontext
from threading import Lock
from time import monotonic

import httpx


class CnyConverter:
    def __init__(self, *, transport=None, clock=monotonic) -> None:
        self.transport = transport
        self.clock = clock
        self._cache: dict[str, tuple[float, dict | None]] = {}
        self._lock = Lock()

    def _rate(self, currency: str) -> dict | None:
        with self._lock:
            cached = self._cache.get(currency)
            if cached and self.clock() < cached[0]:
                return cached[1]
            try:
                # Only currency codes leave this server; no call or account data.
                with httpx.Client(timeout=2, transport=self.transport) as client:
                    response = client.get(
                        f"https://api.frankfurter.dev/v2/rate/{currency.lower()}/cny"
                    )
                    response.raise_for_status()
                body = json.loads(response.content, parse_float=Decimal)
                if (
                    body["base"] != currency
                    or body["quote"] != "CNY"
                    or isinstance(body["rate"], bool)
                ):
                    raise ValueError("Unexpected currency pair")
                rate = Decimal(body["rate"])
                if not rate.is_finite() or rate <= 0:
                    raise ValueError("Invalid reference rate")
                result = {
                    "rate": rate,
                    "rate_date": date.fromisoformat(body["date"]),
                    "source": "Frankfurter",
                }
            except (httpx.HTTPError, ValueError, TypeError, KeyError, InvalidOperation):
                result = None
            self._cache[currency] = (self.clock() + (3600 if result else 60), result)
            return result

    def enrich(self, record: dict) -> dict:
        converted = None
        amount, currency = record.get("total_price"), record.get("currency")
        if (
            isinstance(amount, Decimal)
            and amount.is_finite()
            and amount >= 0
            and isinstance(currency, str)
            and re.fullmatch(r"[A-Z]{3}", currency)
        ):
            reference = (
                {"rate": Decimal(1), "rate_date": None, "source": "original"}
                if currency == "CNY"
                else self._rate(currency)
            )
            if reference is not None:
                # Use sufficient precision for exact multiplication, even for tiny prices.
                with localcontext() as context:
                    context.prec = max(
                        28,
                        len(amount.as_tuple().digits)
                        + len(reference["rate"].as_tuple().digits),
                    )
                    converted = {**reference, "amount": amount * reference["rate"]}
        return {**record, "cny_conversion": converted}
