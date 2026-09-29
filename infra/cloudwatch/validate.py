import json
import re
from pathlib import Path


def validate():
    directory = Path(__file__).resolve().parent
    config = json.loads((directory / "agent.json").read_text())
    if config["agent"]["metrics_collection_interval"] != 60:
        raise ValueError("Use the agreed 60-second collection interval")
    prometheus = config["logs"]["metrics_collected"]["prometheus"]
    if prometheus["log_group_name"] != "/jarihana/current/prometheus":
        raise ValueError("Unexpected log group")
    processor = prometheus["emf_processor"]
    if config["metrics"]["namespace"] != "Jarihana/prod" or processor["metric_namespace"] != "Jarihana/prod":
        raise ValueError("Use Jarihana/prod for both host and application metrics")
    allowed_dimensions = {
        "application", "environment", "status_class", "area", "id", "state", "pool"
    }
    metric_names = list(processor["metric_unit"])
    for declaration in processor["metric_declaration"]:
        for dimensions in declaration["dimensions"]:
            if not set(dimensions) <= allowed_dimensions:
                raise ValueError(f"Unexpected metric dimensions: {dimensions}")
        for selector in declaration["metric_selectors"]:
            if not selector.startswith("^") or not selector.endswith("$"):
                raise ValueError(f"Unbounded metric selector: {selector}")
            re.compile(selector)
    for name in metric_names:
        matches = [
            d for d in processor["metric_declaration"]
            if any(re.fullmatch(selector, name) for selector in d["metric_selectors"])
        ]
        if len(matches) != 1:
            raise ValueError(f"Metric needs exactly one declaration: {name}")
    measurements = config["metrics"]["metrics_collected"]
    if measurements["disk"]["resources"] != ["/"]:
        raise ValueError("Collect only the root disk")
    if "resources" in measurements["cpu"]:
        raise ValueError("Do not emit a separate metric for each CPU core")
    print(f"Agent JSON checks passed: {len(metric_names)} selected application metric names")


if __name__ == "__main__":
    validate()
