import pathlib
from typing import Dict, List


BASEMAP_LAYERS = [
    ("land", "ne_50m_land.shp"),
    ("ocean", "ne_50m_ocean.shp"),
    ("lakes", "ne_50m_lakes.shp"),
    ("rivers", "ne_50m_rivers_lake_centerlines.shp"),
    ("coastline", "ne_50m_coastline.shp"),
]


def try_import_geopandas():
    try:
        import geopandas  # type: ignore

        return geopandas, None
    except Exception as exc:
        return None, str(exc)


def try_import_shapely():
    try:
        from shapely.geometry import LineString  # type: ignore
        from shapely.ops import split  # type: ignore

        return LineString, split, None
    except Exception as exc:
        return None, None, str(exc)


def split_antimeridian(
    geometry,
    splitter_180,
    splitter_neg_180,
    split_fn,
):
    try:
        if geometry is None:
            return []
        parts = split_fn(geometry, splitter_180)
        output = []
        for part in (
            parts.geoms if hasattr(parts, "geoms") else [parts]
        ):
            subparts = split_fn(part, splitter_neg_180)
            if hasattr(subparts, "geoms"):
                output.extend(list(subparts.geoms))
            else:
                output.append(subparts)
        return output
    except Exception:
        return [geometry] if geometry is not None else []


def build_basemap(
    geopandas_module,
    source_dir: pathlib.Path,
    out_dir: pathlib.Path,
) -> List[Dict[str, str]]:
    layers: List[Dict[str, str]] = []
    LineString, split_fn, _shapely_error = try_import_shapely()
    splitter_180 = None
    splitter_neg_180 = None
    if LineString and split_fn:
        splitter_180 = LineString([(180, -90), (180, 90)])
        splitter_neg_180 = LineString(
            [(-180, -90), (-180, 90)]
        )
    for layer_id, shp_name in BASEMAP_LAYERS:
        shp_path = source_dir / shp_name
        if not shp_path.exists():
            continue
        gdf = geopandas_module.read_file(shp_path)
        if splitter_180 and splitter_neg_180 and split_fn:
            crs = gdf.crs
            gdf["geometry"] = gdf["geometry"].apply(
                lambda geom: split_antimeridian(
                    geom,
                    splitter_180,
                    splitter_neg_180,
                    split_fn,
                )
            )
            gdf = gdf.explode(
                index_parts=False,
                ignore_index=True,
            )
            gdf = geopandas_module.GeoDataFrame(
                gdf,
                geometry="geometry",
                crs=crs,
            )
            gdf = gdf[gdf.geometry.notnull()]
        out_path = out_dir / f"{layer_id}.geojson"
        gdf.to_file(out_path, driver="GeoJSON")
        layers.append({
            "id": layer_id,
            "path": f"basemap/{layer_id}.geojson",
        })
    return layers
