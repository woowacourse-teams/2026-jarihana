#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["PyYAML>=6,<7"]
# ///
"""Check the original YAML before Compose can load external inputs."""

import sys
from pathlib import Path
from typing import Final

import yaml


class InvalidSource(ValueError):
    """The release source cannot be represented as one self-contained model."""


class SourceLoader(yaml.SafeLoader):
    """Reject duplicate keys, including ambiguous YAML merge overrides."""

    def construct_mapping(self, node: yaml.MappingNode, deep: bool = False):
        self.flatten_mapping(node)
        keys: set[str] = set()
        for key_node, _ in node.value:
            if key_node.tag != "tag:yaml.org,2002:str" or key_node.value in keys:
                raise InvalidSource
            keys.add(key_node.value)
        return super().construct_mapping(node, deep=deep)


EXTERNAL_SERVICE_KEYS: Final = {"extends", "env_file", "label_file"}


def main() -> int:
    """Validate source structure without rewriting values or logging secrets."""
    try:
        with Path(sys.argv[1]).open(encoding="utf-8") as source:
            model = yaml.load(source, Loader=SourceLoader)
        if not isinstance(model, dict) or set(model) - {"name", "services", "networks"}:
            raise InvalidSource
        services = model.get("services")
        if not isinstance(services, dict) or set(services) != {"backend"}:
            raise InvalidSource
        backend = services["backend"]
        if not isinstance(backend, dict) or EXTERNAL_SERVICE_KEYS.intersection(backend):
            raise InvalidSource
    except (
        OSError, UnicodeError, yaml.YAMLError, ValueError, TypeError, RecursionError,
    ):
        print(
            "Release Compose must be one unambiguous file without external inputs",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
