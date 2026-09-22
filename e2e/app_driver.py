"""Browser-side helpers: locating the app, its widgets, and its console output.

The app is driven as installed on the instance
(`<base>/api/apps/data-dimension-disabler/index.html`). From DHIS2 2.42 the
server wraps that URL in the global-shell iframe, while 2.40/2.41 serve it at
top level, so every locator goes through `app_frame()`.
"""

import re
import time

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError

APP_PATH = "/api/apps/data-dimension-disabler/index.html"

# Selectors (module constants: they repeat across flows)
HEADING = "h1"
HEADING_TEXT = "Data Dimension Disabler"
NOTICE_BOX = "[data-test='dhis2-uicore-noticebox']"
MUTATION_ERROR = "[data-test='sql-view-mutation-error']"
USAGE_TABLE = "[data-test='usage-table']"
USAGE_ROW = "[data-test='usage-row']"
USAGE_COUNT = "[data-test='usage-count']"
DISABLE_DIALOG = "[data-test='disable-dialog']"
REMOVE_DIALOG = "[data-test='remove-view-dialog']"
ALERT_BAR = "[data-test='dhis2-uicore-alertbar']"
SELECT_INPUT = "[data-test='dhis2-uicore-select-input']"
SELECT_MENU = "[data-test='dhis2-uicore-select-menu-menuwrapper']"
SORT_BUTTON = "[data-test='dhis2-uicore-tableheadercellaction']"

CREATE_BUTTON = "Create SQL view"
UPDATE_BUTTON = "Update SQL view"
REMOVE_BUTTON = "Remove SQL view"
DISABLE_BUTTON = "Disable"

DEFAULT_TIMEOUT_MS = 30_000

# Console noise that is not the app's doing: the platform's PWA/offline layer
# complains on plain http, and the shell probes optional endpoints.
BENIGN_CONSOLE = (
    re.compile(r"not a secure context", re.I),
    re.compile(r"PWA features will not work", re.I),
    re.compile(r"Failed to load resource", re.I),
)
BENIGN_HTTP_404 = (
    re.compile(r"/staticContent/logo_banner"),
    re.compile(r"/dataStore/custom-translations/"),
    re.compile(r"/sqlViews/GOLswS44mh8"),  # expected while the view is missing
)


class ConsoleRecorder:
    """Collects console errors, page errors and HTTP failures for one page."""

    def __init__(self, page):
        self.console_errors = []
        self.page_errors = []
        self.http_errors = []
        page.on("console", self._on_console)
        page.on("pageerror", lambda error: self.page_errors.append(str(error)))
        page.on("response", self._on_response)

    def _on_console(self, message):
        if message.type == "error":
            self.console_errors.append(message.text)

    def _on_response(self, response):
        if response.status >= 400:
            self.http_errors.append(f"{response.status} {response.url}")

    def significant_console_errors(self):
        return [
            text
            for text in self.console_errors
            if not any(pattern.search(text) for pattern in BENIGN_CONSOLE)
        ]

    def react_key_warnings(self):
        return [
            text
            for text in self.console_errors + self.page_errors
            if "unique \"key\"" in text or 'unique "key"' in text
        ]

    def significant_http_errors(self):
        return [
            entry
            for entry in self.http_errors
            if not any(pattern.search(entry) for pattern in BENIGN_HTTP_404)
        ]


def open_app(page, base_url):
    """Navigate to the installed app and return its frame."""
    page.goto(f"{base_url.rstrip('/')}{APP_PATH}", wait_until="domcontentloaded")
    return app_frame(page)


def app_frame(page, timeout_ms=DEFAULT_TIMEOUT_MS):
    """The frame holding the app: the top document, or the global-shell iframe."""
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        for frame in page.frames:
            try:
                heading = frame.locator(HEADING).first
                if heading.count() > 0 and HEADING_TEXT in (
                    heading.text_content() or ""
                ):
                    return frame
            except PlaywrightTimeoutError:
                continue
            except Exception:  # noqa: BLE001 - frame detached mid-scan
                continue
        page.wait_for_timeout(250)
    raise AssertionError("App frame with the expected heading never appeared")


def in_global_shell(page):
    """True when the instance wrapped the app in the global-shell iframe."""
    return len(page.frames) > 1


VISIBLE_HEADERS_JS = """() => Array.from(document.querySelectorAll('header'))
    .filter((element) => element.getBoundingClientRect().height > 0).length"""


def header_bar_count(page):
    """Visible DHIS2 header bars across all frames (expected: exactly 1).

    From 2.42 the app still renders its own header bar inside the global-shell
    iframe, but the shell hides it with `display: none` - so counting elements
    rather than visible ones reports a false double header.
    """
    return sum(frame.evaluate(VISIBLE_HEADERS_JS) for frame in page.frames)


def notice_title(frame):
    box = frame.locator(NOTICE_BOX).first
    box.wait_for(state="visible", timeout=DEFAULT_TIMEOUT_MS)
    return box.text_content() or ""


def click_button(frame, name):
    frame.get_by_role("button", name=name, exact=True).first.click()


def wait_for_table(frame, timeout_ms=DEFAULT_TIMEOUT_MS):
    frame.locator(USAGE_TABLE).first.wait_for(state="visible", timeout=timeout_ms)


def wait_for_notice(frame, expected_title, timeout_ms=DEFAULT_TIMEOUT_MS):
    frame.get_by_text(expected_title, exact=False).first.wait_for(
        state="visible", timeout=timeout_ms
    )


def table_rows(frame):
    """Visible rows as dicts of the app's rendered cell values."""
    rows = []
    row_locators = frame.locator(USAGE_ROW)
    for index in range(row_locators.count()):
        cells = row_locators.nth(index).locator("td")
        values = [cells.nth(i).inner_text().strip() for i in range(cells.count())]
        rows.append(
            {
                "type": values[0],
                "name": values[1],
                "uid": values[2],
                "views": values[3],
                "percent": values[4],
                "percent_of_views": values[5],
            }
        )
    return rows


def count_label(frame):
    """The "<n> enabled dimensions" line above the table."""
    return (frame.locator(USAGE_COUNT).first.text_content() or "").strip()


def select_type_filter(frame, option_label):
    frame.locator(SELECT_INPUT).first.click()
    menu = frame.locator(SELECT_MENU).first
    menu.wait_for(state="visible", timeout=DEFAULT_TIMEOUT_MS)
    menu.get_by_text(option_label, exact=True).first.click()
    menu.wait_for(state="detached", timeout=DEFAULT_TIMEOUT_MS)


def sort_by(frame, column):
    frame.locator(f"[data-test='usage-header-{column}'] {SORT_BUTTON}").first.click()


def column_values(frame, key):
    return [row[key] for row in table_rows(frame)]


def alert_text_for(frame, expected_text, timeout_ms=DEFAULT_TIMEOUT_MS):
    """Text of the alert bar mentioning `expected_text`, or None if none appears.

    Alerts stack and auto-hide, so an earlier alert can still be the first in
    the DOM when the next one arrives.
    """
    alert = frame.locator(ALERT_BAR).filter(has_text=expected_text).first
    try:
        alert.wait_for(state="visible", timeout=timeout_ms)
    except PlaywrightTimeoutError:
        return None
    return alert.text_content() or ""


def screenshot(page, directory, name):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    return path
