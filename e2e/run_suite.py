#!/usr/bin/env python3
"""Run the Data Dimension Disabler end-to-end suite against one DHIS2 instance.

    DHIS2_URL=http://dhis2-example:8080 python3 e2e/run_suite.py

Configuration (environment only — no arguments, no hard-coded hosts):

    DHIS2_URL     required, e.g. http://dhis2-agent-cdd-sl43:8080
    DHIS2_USER    default admin
    DHIS2_PASS    default district
    E2E_LABEL     label used in the results and screenshot names
                  (default: the server version reported by the instance)
    E2E_OUT_DIR   where results and screenshots go (default e2e/results)
    E2E_FLOWS     comma-separated subset of flow ids (default: all)
    E2E_HEADED    set to 1 to watch the browser
    E2E_SUPERUSER / E2E_SUPERPASS
                  an ALL-authority account used only to create the throwaway
                  limited user of the permission-error flow. Needed when
                  DHIS2_USER is a demo `admin` without ALL (broker instances
                  ship `local_admin` / `district`).

The app must already be installed on the instance
(`yarn build` then `POST /api/apps` with the bundle — see e2e/README.md).
"""

import json
import os
import sys
import traceback
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from playwright.sync_api import sync_playwright  # noqa: E402

import app_driver as ui  # noqa: E402
import flows  # noqa: E402
from dhis2_api import Dhis2Client, hostname_of  # noqa: E402

DEFAULT_USER = "admin"
VIEWPORT = {"width": 1400, "height": 1000}
BROWSER_ARGS = ["--no-sandbox", "--disable-dev-shm-usage"]


def read_settings():
    base_url = os.environ.get("DHIS2_URL")
    if not base_url:
        raise SystemExit("DHIS2_URL is not set")
    out_dir = Path(
        os.environ.get("E2E_OUT_DIR", str(Path(__file__).resolve().parent / "results"))
    )
    # No fallback: a password belongs in the environment, not in the repo.
    password = os.environ.get("DHIS2_PASS")
    if not password:
        raise SystemExit("DHIS2_PASS is not set")
    selected = os.environ.get("E2E_FLOWS", "")
    return {
        "base_url": base_url.rstrip("/"),
        "user": os.environ.get("DHIS2_USER", DEFAULT_USER),
        "password": password,
        "label": os.environ.get("E2E_LABEL"),
        "out_dir": out_dir,
        "flow_ids": [name for name in selected.split(",") if name],
        "headed": os.environ.get("E2E_HEADED") == "1",
        "superuser": os.environ.get("E2E_SUPERUSER"),
        "superpass": os.environ.get("E2E_SUPERPASS"),
    }


def minor_version(version):
    parts = version.split(".")
    return int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 0


def provisioning_client(settings):
    """Client used to create the throwaway limited user (see e2e/README.md)."""
    if not settings["superuser"]:
        return None
    return Dhis2Client(
        settings["base_url"], settings["superuser"], settings["superpass"]
    )


def build_context(page, client, settings, version, browser):
    return flows.Context(
        page=page,
        client=client,
        recorder=ui.ConsoleRecorder(page),
        base_url=settings["base_url"],
        label=settings["label"] or version,
        minor=minor_version(version),
        out_dir=settings["out_dir"],
        browser=browser,
        provisioner=provisioning_client(settings),
    )


def selected_flows(flow_ids):
    if not flow_ids:
        return flows.FLOWS
    return [entry for entry in flows.FLOWS if entry[0] in flow_ids]


def run_flow(context, flow_id, flow):
    try:
        return [
            {"flow": flow_id, "step": step, "status": status, "detail": detail}
            for step, status, detail in flow(context)
        ]
    except Exception:  # noqa: BLE001 - a broken flow must not stop the suite
        detail = traceback.format_exc(limit=4).strip().splitlines()[-1]
        ui.screenshot(context.page, context.out_dir, f"{context.label}-error-{flow_id}")
        return [
            {
                "flow": flow_id,
                "step": "flow raised an exception",
                "status": flows.FAIL,
                "detail": detail,
            }
        ]


def write_results(out_dir, label, results):
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"results-{label}.json").write_text(
        json.dumps(results, indent=2), encoding="utf-8"
    )
    lines = ["| Flow | Step | Status | Detail |", "|---|---|---|---|"]
    lines += [
        f"| {row['flow']} | {row['step']} | {row['status']} | {row['detail']} |"
        for row in results
    ]
    (out_dir / f"results-{label}.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def summarise(results):
    counts = {}
    for row in results:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    return counts


def main():
    settings = read_settings()
    client = Dhis2Client(settings["base_url"], settings["user"], settings["password"])
    version = client.server_version()
    settings["label"] = settings["label"] or version
    cookie_name, cookie_value = client.session_cookie()

    results = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=not settings["headed"], args=BROWSER_ARGS
        )
        context = browser.new_context(viewport=VIEWPORT)
        context.add_cookies(
            [
                {
                    "name": cookie_name,
                    "value": cookie_value,
                    "domain": hostname_of(settings["base_url"]),
                    "path": "/",
                }
            ]
        )
        page = context.new_page()
        suite_context = build_context(page, client, settings, version, browser)
        try:
            for flow_id, flow in selected_flows(settings["flow_ids"]):
                results.extend(run_flow(suite_context, flow_id, flow))
        finally:
            results.extend(run_flow(suite_context, "re-enable", flows.flow_reenable))
            context.close()
            browser.close()

    write_results(settings["out_dir"], settings["label"], results)
    counts = summarise(results)
    print(f"{settings['label']} ({version}): {counts}")
    for row in results:
        print(f"  [{row['status']}] {row['flow']} / {row['step']} — {row['detail']}")
    return 1 if counts.get(flows.FAIL) else 0


if __name__ == "__main__":
    sys.exit(main())
