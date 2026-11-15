from decimal import Decimal

import httpx
import pytest

from app.schemas.dify_call_logs import CnyConversion
from app.services.cny_conversion import CnyConverter


def response(rate="6.6646", **changes):
    return httpx.Response(
        200,
        json={
            "base": "USD",
            "quote": "CNY",
            "date": "2026-11-15",
            "rate": rate,
            **changes,
        },
    )


def test_conversion_preserves_original_amount_and_caches_rates():
    requests = []

    def handler(request):
        requests.append(request)
        return response()

    converter = CnyConverter(transport=httpx.MockTransport(handler))
    record = {"total_price": Decimal("0.001"), "currency": "USD"}
    result = converter.enrich(record)
    assert result["total_price"] == record["total_price"]
    assert result["currency"] == "USD"
    assert "cny_conversion" not in record
    converted = result["cny_conversion"]
    assert converted["amount"] == Decimal("0.0066646")
    assert converted["rate"] == Decimal("6.6646")
    assert str(converted["rate_date"]) == "2026-11-15"
    assert converted["source"] == "Frankfurter"
    assert converter.enrich(record) == result
    assert len(requests) == 1
    assert str(requests[0].url) == "https://api.frankfurter.dev/v2/rate/usd/cny"
    assert requests[0].url.query == b""
    assert "Authorization" not in requests[0].headers


@pytest.mark.parametrize(
    "amount,currency",
    [
        (None, "USD"),
        (Decimal(1), None),
        (Decimal(1), "invalid"),
        (Decimal("NaN"), "USD"),
    ],
)
def test_unknown_or_invalid_cost_does_not_request_rates(amount, currency):
    def handler(request):
        pytest.fail("Unknown usage must not trigger rate requests")

    converter = CnyConverter(transport=httpx.MockTransport(handler))
    assert (
        converter.enrich({"total_price": amount, "currency": currency})[
            "cny_conversion"
        ]
        is None
    )


def test_native_cny_needs_no_exchange_request():
    def handler(request):
        pytest.fail("CNY must not be converted again")

    converter = CnyConverter(transport=httpx.MockTransport(handler))
    for amount in [Decimal(0), Decimal("0.1234567890123456789")]:
        result = converter.enrich({"total_price": amount, "currency": "CNY"})[
            "cny_conversion"
        ]
        assert result == {
            "amount": amount,
            "rate": Decimal(1),
            "source": "original",
            "rate_date": None,
        }


def test_decimal_conversion_is_exact_and_tiny_values_are_not_rounded_to_zero():
    converter = CnyConverter(transport=httpx.MockTransport(lambda request: response(7)))
    result = converter.enrich(
        {
            "total_price": Decimal("0.123456789012345678901234567890123456789"),
            "currency": "USD",
        }
    )
    assert result["cny_conversion"]["amount"] == Decimal(
        "0.864197523086419752308641975230864197523"
    )
    tiny = converter.enrich({"total_price": Decimal("1E-30"), "currency": "USD"})
    payload = CnyConversion(**tiny["cny_conversion"]).model_dump(mode="json")
    assert payload["amount"] == "0." + "0" * 29 + "7"
    zero = converter.enrich({"total_price": Decimal(0), "currency": "USD"})
    assert zero["cny_conversion"]["amount"] == 0


@pytest.mark.parametrize(
    "rate,changes",
    [
        (0, {}),
        (-1, {}),
        (True, {}),
        ("NaN", {}),
        ("Infinity", {}),
        ("invalid", {}),
        (7, {"quote": "EUR"}),
        (7, {"base": "EUR"}),
        (7, {"date": "invalid"}),
    ],
)
def test_invalid_reference_data_does_not_invent_cny_amounts(rate, changes):
    converter = CnyConverter(
        transport=httpx.MockTransport(lambda request: response(rate, **changes))
    )
    result = converter.enrich({"total_price": Decimal("0.001"), "currency": "USD"})
    assert result["cny_conversion"] is None
    assert result["total_price"] == Decimal("0.001")


def test_outage_is_cached_briefly_and_recovers_without_changing_original_cost():
    clock = [0]
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ReadTimeout("offline")
        return response()

    converter = CnyConverter(
        transport=httpx.MockTransport(handler), clock=lambda: clock[0]
    )
    record = {"total_price": Decimal("0.001"), "currency": "USD"}
    assert converter.enrich(record)["cny_conversion"] is None
    assert converter.enrich(record)["cny_conversion"] is None
    assert len(calls) == 1
    clock[0] = 61
    assert converter.enrich(record)["cny_conversion"]["amount"] == Decimal("0.0066646")
    assert len(calls) == 2
    clock[0] += 3601
    converter.enrich(record)
    assert len(calls) == 3


def test_unsupported_currency_falls_back_to_original():
    converter = CnyConverter(
        transport=httpx.MockTransport(lambda request: httpx.Response(404))
    )
    result = converter.enrich({"total_price": Decimal("0.001"), "currency": "XYZ"})
    assert result["cny_conversion"] is None
    assert result["currency"] == "XYZ"
