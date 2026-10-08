"""CI guard for architecture boundaries (Clean Architecture / Constitution §1, §24).

Rules:
1. Persistence (src/db, src/infrastructure) must not import from analytics or normalization.
2. Application (src/application) must not import from db, infrastructure, or api.
3. Domain (src/domain) must not import from application, ports, db, infrastructure, or api.
4. Infrastructure (src/infrastructure) must not import from src/db — adapters implement ports directly.
5. Domain and application must not import hono or zod.
"""
import posixpath
import re
import sys
from pathlib import Path

REPO_ROOT = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else Path(__file__).resolve().parent.parent
SRC_DIR = REPO_ROOT / "src"
TESTS_DIR = REPO_ROOT / "tests"

IMPORT_RE = re.compile(r'from\s+["\']([^"\']+)["\']')


def check_file(path: Path) -> list[str]:
    violations = []
    text = path.read_text(encoding="utf-8")
    rel_path = path.relative_to(SRC_DIR).as_posix()
    imports = IMPORT_RE.findall(text)

    for imp in imports:
        # Check Rule 1: persistence imports
        if rel_path.startswith("db/") or rel_path.startswith("infrastructure/"):
            if "analytics" in imp or "normalization" in imp:
                violations.append(f"{rel_path}: forbidden persistence import '{imp}' (persistence cannot depend on analytics/normalization)")

        # Check Rule 4: infrastructure must not delegate to the db layer
        if rel_path.startswith("infrastructure/") and ("../db" in imp or "src/db" in imp):
            violations.append(f"{rel_path}: forbidden infrastructure import '{imp}' (D1 adapters must implement ports directly, not delegate to src/db)")

        # Check Rule 2: application imports
        if rel_path.startswith("application/"):
            if "infrastructure" in imp or "src/db" in imp or "../db" in imp or "api" in imp:
                violations.append(f"{rel_path}: forbidden application import '{imp}' (application cannot depend on infrastructure or delivery)")

        # Check Rule 3: domain imports
        if rel_path.startswith("domain/"):
            if any(forbidden in imp for forbidden in ["application", "ports", "db", "infrastructure", "api"]):
                violations.append(f"{rel_path}: forbidden domain import '{imp}' (domain must remain pure)")

        # Check Rule 5: domain/application must stay framework-free (hono, zod)
        if rel_path.startswith("domain/") or rel_path.startswith("application/"):
            if imp == "hono" or imp.startswith("hono/") or imp == "zod" or imp.startswith("zod/"):
                violations.append(f"{rel_path}: forbidden framework import '{imp}' (domain/application must not depend on hono/zod)")

    return violations


# Vertical slices: src/slices/<slice>/{domain,ports,application,infrastructure,delivery} + module.ts (the slice's wiring).
# Whitelist of what each layer may import, as (area, layer). "same" = this slice; a bare area is a top-level src/ directory.
SLICE_ALLOWED = {
    "domain": {("same", "domain"), "kernel", "domain"},
    "ports": {("same", "domain"), ("same", "ports"), "kernel", "domain"},
    "application": {("same", "domain"), ("same", "ports"), ("same", "application"), "kernel", "domain", "application"},
    "infrastructure": {("same", "domain"), ("same", "ports"), ("same", "infrastructure"), "kernel", "domain"},
    "delivery": {("same", "domain"), ("same", "application"), ("same", "delivery"), ("same", "root"), "kernel", "domain", "application"},
    "root": {("same", "domain"), ("same", "ports"), ("same", "application"), ("same", "infrastructure"), ("same", "root"), "kernel", "domain", "composition"},
}
FRAMEWORK_FREE = {"domain", "ports", "application", "infrastructure"}


def locate(rel: str):
    parts = rel.split("/")
    if parts[0] == "slices" and len(parts) >= 3:
        return parts[1], (parts[2] if len(parts) > 3 else "root")
    return None, parts[0]


def check_slice_file(path: Path) -> list[str]:
    rel = path.relative_to(SRC_DIR).as_posix()
    slice_name, layer = locate(rel)
    violations = []
    for imp in IMPORT_RE.findall(path.read_text(encoding="utf-8")):
        if not imp.startswith("."):
            if imp.split("/")[0] in ("hono", "zod") and (slice_name is None and layer == "kernel" or layer in FRAMEWORK_FREE):
                violations.append(f"{rel}: forbidden framework import '{imp}' ({layer} must not depend on hono/zod)")
            continue
        target = posixpath.normpath(posixpath.join(posixpath.dirname(rel), imp))
        t_slice, t_layer = locate(target)
        if slice_name is None:
            if layer == "kernel" and not target.startswith("kernel/"):
                violations.append(f"{rel}: forbidden kernel import '{imp}' (the kernel depends on nothing else)")
            continue
        if layer not in SLICE_ALLOWED:
            continue
        if t_slice is not None and t_slice != slice_name:
            violations.append(f"{rel}: forbidden cross-slice import '{imp}' (slice '{slice_name}' must not import slice '{t_slice}')")
            continue
        key = ("same", t_layer) if t_slice == slice_name else t_layer
        if key not in SLICE_ALLOWED[layer]:
            violations.append(f"{rel}: forbidden import '{imp}' ({layer} of a slice cannot depend on {t_layer if t_slice else target.split('/')[0]})")
    return violations


TEST_TITLE_RE = re.compile(r"^\s*it(?:\.each\(.*\))?\(\s*[\"'`](.+?)[\"'`]")
SHOULD_RE = re.compile(r"^should[A-Z]")


def check_test_names(path: Path) -> list[str]:
    rel = path.relative_to(REPO_ROOT).as_posix()
    out = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        m = TEST_TITLE_RE.match(line)
        if m and not SHOULD_RE.match(m.group(1)):
            out.append(f"{rel}:{n}: test name '{m.group(1)}' must follow shouldDoWhateverWhenInputIsWhatever")
    return out


def main() -> int:
    all_violations = []
    for file_path in SRC_DIR.glob("**/*.ts"):
        all_violations.extend(check_file(file_path))
        if file_path.relative_to(SRC_DIR).parts[0] in ("slices", "kernel"):
            all_violations.extend(check_slice_file(file_path))
    for sub in ("slices", "kernel"):
        for file_path in (TESTS_DIR / sub).glob("**/*.test.ts"):
            all_violations.extend(check_test_names(file_path))

    if not all_violations:
        print("check_architecture_boundaries: OK (all boundaries intact)")
        return 0

    print("check_architecture_boundaries: FAIL", file=sys.stderr)
    for v in all_violations:
        print(f"  {v}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
