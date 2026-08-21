from __future__ import annotations

import hashlib
import json
import unicodedata
from typing import TypeAlias

JsonScalar: TypeAlias = str | int | float | bool | None
JsonValue: TypeAlias = JsonScalar | list["JsonValue"] | dict[str, "JsonValue"]


def normalize_json(value: JsonValue) -> JsonValue:
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, list):
        return [normalize_json(item) for item in value]
    if isinstance(value, dict):
        return {
            unicodedata.normalize("NFC", key): normalize_json(item)
            for key, item in value.items()
        }
    return value


def canonical_json(value: JsonValue) -> str:
    return json.dumps(
        normalize_json(value), ensure_ascii=False, sort_keys=True, separators=(",", ":")
    )


def calculate_hash(value: dict[str, JsonValue]) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()
