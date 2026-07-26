import argparse
import json
import os
import pathlib
import subprocess
import tempfile
import unittest
from unittest import mock

from scripts import build_datapack, update_pack_release
from scripts.datapack_common import (
    conda_lock_fingerprint,
    is_safe_pack_segment,
    parse_conda_explicit_lock,
    read_conda_lock_contract,
    require_safe_pack_segment,
)


REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]


class SafePackSegmentTests(unittest.TestCase):
    def test_accepts_release_identifiers(self) -> None:
        for value in ["standard", "2026.03", "2026.03-beta_1"]:
            with self.subTest(value=value):
                self.assertTrue(is_safe_pack_segment(value))
                self.assertEqual(require_safe_pack_segment(value, "value"), value)

    def test_rejects_path_and_windows_edge_cases(self) -> None:
        for value in [
            "",
            ".",
            "..",
            "../outside",
            "2026/03",
            "2026\\03",
            "2026..03",
            "2026.03.",
            "C:",
            "CON",
            "con.txt",
            "LPT9",
            "a" * 65,
        ]:
            with self.subTest(value=value):
                self.assertFalse(is_safe_pack_segment(value))
                with self.assertRaises(ValueError):
                    require_safe_pack_segment(value, "value")

    def test_argparse_adapter_reports_invalid_version(self) -> None:
        parse = build_datapack.safe_segment_argument("Data pack version")
        with self.assertRaises(argparse.ArgumentTypeError):
            parse("../outside")

    def test_resolved_version_stays_below_output_root(self) -> None:
        root = REPO_ROOT / "geodata" / "packs" / "standard"
        self.assertEqual(
            build_datapack.resolve_version_root(root, "2026.03"),
            (root / "2026.03").resolve(),
        )
        with self.assertRaises(ValueError):
            build_datapack.resolve_version_root(root, "../outside")


class BuildEnvironmentTests(unittest.TestCase):
    def test_parses_gdal_version(self) -> None:
        completed = subprocess.CompletedProcess(
            args=["gdalwarp", "--version"],
            returncode=0,
            stdout='GDAL 3.11.4 "Eganville", released 2025/09/04\n',
            stderr="",
        )
        with mock.patch.object(build_datapack.subprocess, "run", return_value=completed):
            self.assertEqual(build_datapack.read_gdal_version("gdalwarp"), "3.11.4")

    def test_rejects_unparseable_gdal_output(self) -> None:
        completed = subprocess.CompletedProcess(
            args=["gdalwarp", "--version"],
            returncode=0,
            stdout="unknown tool\n",
            stderr="",
        )
        with mock.patch.object(build_datapack.subprocess, "run", return_value=completed):
            with self.assertRaisesRegex(RuntimeError, "Unable to parse GDAL version"):
                build_datapack.read_gdal_version("gdalwarp")

    def test_environment_file_matches_runtime_contract(self) -> None:
        environment = (REPO_ROOT / "environment.yml").read_text(encoding="utf-8")
        expected_dependencies = {
            "python": "python",
            "geopandas": "geopandas-base",
            "pyogrio": "pyogrio",
            "pyproj": "pyproj",
            "pillow": "pillow",
            "gdal": "gdal",
        }
        for key, dependency in expected_dependencies.items():
            version = build_datapack.EXPECTED_BUILD_ENVIRONMENT[key]
            self.assertIn(f"- {dependency}={version}", environment)

    def test_win_64_lock_is_explicit_and_matches_runtime_contract(self) -> None:
        lock_path = REPO_ROOT / "environment-win-64.lock.txt"
        lock = lock_path.read_text(encoding="utf-8")
        platform_name, package_lines = parse_conda_explicit_lock(lock)
        self.assertEqual(platform_name, "win-64")
        self.assertTrue(package_lines)
        for line in package_lines:
            self.assertTrue(
                line.startswith("https://conda.anaconda.org/conda-forge/"),
                line,
            )
            self.assertRegex(line, r"#[0-9a-f]{32}$")

        expected_packages = {
            "python": "python",
            "geopandas": "geopandas-base",
            "pyogrio": "pyogrio",
            "pyproj": "pyproj",
            "pillow": "pillow",
            "gdal": "gdal",
        }
        for key, package in expected_packages.items():
            version = build_datapack.EXPECTED_BUILD_ENVIRONMENT[key]
            self.assertTrue(
                any(f"/{package}-{version}-" in line for line in package_lines),
                f"{package} {version} is missing from the win-64 lock",
            )
        contract = read_conda_lock_contract(lock_path)
        self.assertEqual(contract["condaPlatform"], "win-64")
        self.assertEqual(
            contract["condaLockSha256"],
            conda_lock_fingerprint(platform_name, package_lines),
        )
        self.assertEqual(
            contract["condaLockSha256"],
            conda_lock_fingerprint(platform_name, reversed(package_lines)),
        )
        self.assertEqual(
            update_pack_release.expected_official_build_environment(),
            {
                **build_datapack.EXPECTED_BUILD_ENVIRONMENT,
                **contract,
            },
        )

    def test_accepts_an_environment_that_exactly_matches_the_lock(self) -> None:
        lock_path = REPO_ROOT / "environment-win-64.lock.txt"
        explicit = lock_path.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as prefix:
            (pathlib.Path(prefix) / "conda-meta").mkdir()
            results = [
                subprocess.CompletedProcess(
                    args=["conda", "list"],
                    returncode=0,
                    stdout=explicit,
                    stderr="",
                ),
                subprocess.CompletedProcess(
                    args=["conda", "list"],
                    returncode=0,
                    stdout=json.dumps([]),
                    stderr="",
                ),
            ]
            with (
                mock.patch.object(build_datapack.sys, "prefix", prefix),
                mock.patch.dict(os.environ, {"CONDA_EXE": "conda"}, clear=False),
                mock.patch.object(
                    build_datapack.subprocess,
                    "run",
                    side_effect=results,
                ),
            ):
                self.assertEqual(
                    build_datapack.validate_locked_conda_environment(lock_path),
                    read_conda_lock_contract(lock_path),
                )

    def test_rejects_an_environment_with_packages_outside_the_lock(self) -> None:
        lock_path = REPO_ROOT / "environment-win-64.lock.txt"
        explicit = lock_path.read_text(encoding="utf-8")
        explicit += (
            "https://repo.anaconda.com/pkgs/main/win-64/"
            "unexpected-1.0-0.conda#00000000000000000000000000000000\n"
        )
        with tempfile.TemporaryDirectory() as prefix:
            (pathlib.Path(prefix) / "conda-meta").mkdir()
            completed = subprocess.CompletedProcess(
                args=["conda", "list"],
                returncode=0,
                stdout=explicit,
                stderr="",
            )
            with (
                mock.patch.object(build_datapack.sys, "prefix", prefix),
                mock.patch.dict(os.environ, {"CONDA_EXE": "conda"}, clear=False),
                mock.patch.object(
                    build_datapack.subprocess,
                    "run",
                    return_value=completed,
                ),
            ):
                with self.assertRaisesRegex(
                    RuntimeError,
                    "1 unexpected package",
                ):
                    build_datapack.validate_locked_conda_environment(lock_path)

    def test_rejects_pip_packages_outside_the_lock(self) -> None:
        lock_path = REPO_ROOT / "environment-win-64.lock.txt"
        explicit = lock_path.read_text(encoding="utf-8")
        with tempfile.TemporaryDirectory() as prefix:
            (pathlib.Path(prefix) / "conda-meta").mkdir()
            results = [
                subprocess.CompletedProcess(
                    args=["conda", "list"],
                    returncode=0,
                    stdout=explicit,
                    stderr="",
                ),
                subprocess.CompletedProcess(
                    args=["conda", "list"],
                    returncode=0,
                    stdout=json.dumps(
                        [{"name": "extra-package", "channel": "pypi"}]
                    ),
                    stderr="",
                ),
            ]
            with (
                mock.patch.object(build_datapack.sys, "prefix", prefix),
                mock.patch.dict(os.environ, {"CONDA_EXE": "conda"}, clear=False),
                mock.patch.object(
                    build_datapack.subprocess,
                    "run",
                    side_effect=results,
                ),
            ):
                with self.assertRaisesRegex(
                    RuntimeError,
                    "extra-package",
                ):
                    build_datapack.validate_locked_conda_environment(lock_path)


if __name__ == "__main__":
    unittest.main()
