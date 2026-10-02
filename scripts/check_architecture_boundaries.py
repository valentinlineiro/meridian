"""CI guard for architecture boundaries (Clean Architecture / Constitution §1, §24).

Rules:
1. Persistence (src/db, src/infrastructure) must not import from analytics or normalization.
2. Application (src/application) must not import from db, infrastructure, or api.
3. Domain (src/domain) must not import from application, ports, db, infrastructure, or api.
4. Infrastructure (src/infrastructure) must not import from src/db — adapters implement ports directly.
5. Domain and application must not import hono or zod.
"""
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
SRC_DIR = REPO_ROOT / "src"

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


def main() -> int:
    all_violations = []
    for file_path in SRC_DIR.glob("**/*.ts"):
        all_violations.extend(check_file(file_path))

    if not all_violations:
        print("check_architecture_boundaries: OK (all boundaries intact)")
        return 0

    print("check_architecture_boundaries: FAIL", file=sys.stderr)
    for v in all_violations:
        print(f"  {v}", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
