import argparse
import os
import pathlib
import platform
import subprocess
import tempfile


REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_ENVIRONMENT = REPO_ROOT / "environment.yml"
DEFAULT_LOCK = REPO_ROOT / "environment-win-64.lock.txt"


def run(command: list[str]) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            cwd=REPO_ROOT,
            check=True,
            text=True,
            capture_output=True,
        )
    except subprocess.CalledProcessError as error:
        detail = (error.stderr or error.stdout or str(error)).strip()
        raise RuntimeError(
            f"Command failed ({error.returncode}): {' '.join(command)}\n{detail}"
        ) from error


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Resolve environment.yml into a reproducible win-64 Conda lock."
    )
    parser.add_argument(
        "--environment",
        type=pathlib.Path,
        default=DEFAULT_ENVIRONMENT,
        help="Source Conda environment YAML",
    )
    parser.add_argument(
        "--out",
        type=pathlib.Path,
        default=DEFAULT_LOCK,
        help="Explicit win-64 lock output",
    )
    args = parser.parse_args()

    if platform.system() != "Windows":
        raise SystemExit("The win-64 lock must be generated on Windows")
    environment_path = args.environment.resolve()
    if not environment_path.is_file():
        raise SystemExit(f"Environment file not found: {environment_path}")

    conda = os.getenv("CONDA_EXE", "conda")
    with tempfile.TemporaryDirectory(prefix="mapschem-conda-lock-") as temp_dir:
        prefix = pathlib.Path(temp_dir) / "environment"
        run(
            [
                conda,
                "env",
                "create",
                "--prefix",
                str(prefix),
                "--file",
                str(environment_path),
            ]
        )
        explicit = run(
            [
                conda,
                "list",
                "--prefix",
                str(prefix),
                "--explicit",
                "--md5",
            ]
        ).stdout

    if "# platform: win-64" not in explicit or "@EXPLICIT" not in explicit:
        raise SystemExit("Conda did not produce a valid win-64 explicit lock")
    output_path = args.out.resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_output = output_path.with_name(f".{output_path.name}.writing")
    temp_output.write_text(explicit, encoding="utf-8", newline="\n")
    os.replace(temp_output, output_path)
    print(f"Updated Conda lock: {output_path}")


if __name__ == "__main__":
    main()
