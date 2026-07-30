"""Metadata reader interface selected by validated physical format."""

from pathlib import Path
from typing import Protocol

from app.ingestion.types import DatasetMetadata


class DatasetMetadataReader(Protocol):
    def read_metadata(self, path: Path) -> DatasetMetadata: ...
