import argparse
import pathlib
import subprocess
import unittest
from unittest import mock

from scripts import build_datapack
from scripts.datapack_common import is_safe_pack_segment, require_safe_pack_segment


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
            "pillow": "pillow",
            "gdal": "gdal",
        }
        for key, dependency in expected_dependencies.items():
            version = build_datapack.EXPECTED_BUILD_ENVIRONMENT[key]
            self.assertIn(f"- {dependency}={version}", environment)

    def test_win_64_lock_is_explicit_and_matches_runtime_contract(self) -> None:
        lock = (
            REPO_ROOT / "environment-win-64.lock.txt"
        ).read_text(encoding="utf-8")
        self.assertIn("# platform: win-64", lock)
        self.assertIn("@EXPLICIT", lock)

        package_lines = [
            line for line in lock.splitlines()
            if line and not line.startswith(("#", "@"))
        ]
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
            "pillow": "pillow",
            "gdal": "gdal",
        }
        for key, package in expected_packages.items():
            version = build_datapack.EXPECTED_BUILD_ENVIRONMENT[key]
            self.assertTrue(
                any(f"/{package}-{version}-" in line for line in package_lines),
                f"{package} {version} is missing from the win-64 lock",
            )


if __name__ == "__main__":
    unittest.main()
