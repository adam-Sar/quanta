"""Format-to-reader dispatch with explicit supported strategies."""

from pathlib import Path

from app.ingestion.exceptions import UnsupportedFileFormatError
from app.ingestion.readers.base import DatasetMetadataReader
from app.ingestion.types import DatasetFormat, DatasetMetadata


class MetadataReaderRegistry:
    def __init__(self, readers: dict[DatasetFormat, DatasetMetadataReader]) -> None:
        self._readers = dict(readers)

    def read(self, dataset_format: DatasetFormat, path: Path) -> DatasetMetadata:
        reader = self._readers.get(dataset_format)
        if reader is None:
            raise UnsupportedFileFormatError
        return reader.read_metadata(path)
