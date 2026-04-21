from datetime import datetime, timezone
import csv
import io
from pathlib import Path
from typing import Optional

from bson import ObjectId
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

from backend.database import get_formulations_collection, get_materials_collection
from backend.models import (
    FormulationCreate,
    FormulationDuplicateRequest,
    FormulationPreviewRequest,
    FormulationRead,
    FormulationSummary,
    MaterialCreate,
    MaterialRead,
)
from backend.services.calculation import (
    calculate_formulation_metrics,
    calculate_material_amount_per_kg,
)


app = FastAPI(title="PVC Formulation ERP", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent.parent
FRONTEND_DIR = BASE_DIR / "frontend"
STATIC_DIR = FRONTEND_DIR


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def serialize_material(document: dict) -> dict:
    return {
        "id": str(document["_id"]),
        "name": document["name"],
        "unit_price": document["unit_price"],
        "gst": document["gst"],
        "extra": document["extra"],
        "amount_per_kg": document["amount_per_kg"],
        "created_at": document["created_at"],
        "updated_at": document.get("updated_at", document["created_at"]),
        "archived_at": document.get("archived_at"),
        "is_archived": bool(document.get("archived_at")),
    }


def serialize_formulation(document: dict, metrics: dict) -> dict:
    return {
        "id": str(document["_id"]),
        "name": document["name"],
        "type": document["type"],
        "season": document["season"],
        "items": document["items"],
        "coating_percent": document.get("coating_percent", 0),
        "coating_items": document.get("coating_items", []),
        "fixed_profit": document["fixed_profit"],
        "created_at": document["created_at"],
        "updated_at": document.get("updated_at", document["created_at"]),
        "archived_at": document.get("archived_at"),
        "is_archived": bool(document.get("archived_at")),
        "version_count": len(document.get("versions", [])) or 1,
        "versions": document.get("versions", []),
        **metrics,
    }


def parse_object_id(value: str, field_name: str = "id") -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}.")
    return ObjectId(value)


def get_material_map_from_ids(material_ids: list[str]) -> dict[str, dict]:
    collection = get_materials_collection()
    object_ids = [parse_object_id(material_id, "material_id") for material_id in material_ids]
    materials = list(collection.find({"_id": {"$in": object_ids}, "archived_at": None}))
    materials_by_id = {str(material["_id"]): material for material in materials}

    missing_ids = [material_id for material_id in material_ids if material_id not in materials_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Materials not found: {', '.join(missing_ids)}",
        )

    return materials_by_id


def build_stored_formulation_items(items, materials_by_id: dict[str, dict]) -> list[dict]:
    stored_items = []
    for item in items:
        material = materials_by_id[item.material_id]
        stored_items.append(
            {
                "material_id": item.material_id,
                "name": material["name"],
                "quantity": item.quantity,
                "unit_price": material["unit_price"],
                "gst": material["gst"],
                "extra": material["extra"],
                "amount_per_kg": material["amount_per_kg"],
            }
        )
    return stored_items


def build_formulation_version(document: dict, version: int) -> dict:
    return {
        "version": version,
        "created_at": document["updated_at"],
        "name": document["name"],
        "type": document["type"],
        "season": document["season"],
        "items": document["items"],
        "coating_percent": document.get("coating_percent", 0),
        "coating_items": document.get("coating_items", []),
        "fixed_profit": document["fixed_profit"],
    }


def item_needs_material_enrichment(item: dict) -> bool:
    return any(field not in item for field in ("unit_price", "gst", "extra", "amount_per_kg"))


def collect_material_ids_from_items(items: list[dict]) -> list[str]:
    material_ids: list[str] = []
    for item in items:
        material_id = item.get("material_id")
        if material_id and material_id not in material_ids:
            material_ids.append(material_id)
    return material_ids


def enrich_formulation_items(items: list[dict], materials_by_id: dict[str, dict]) -> list[dict]:
    enriched = []
    for item in items:
        if "amount_per_kg" in item and "unit_price" in item and "gst" in item and "extra" in item:
            enriched.append(item)
            continue

        material = materials_by_id.get(item["material_id"])
        if not material:
            enriched.append(
                {
                    **item,
                    "unit_price": item.get("unit_price", 0),
                    "gst": item.get("gst", 0),
                    "extra": item.get("extra", 0),
                    "amount_per_kg": item.get("amount_per_kg", 0),
                }
            )
            continue

        enriched.append(
            {
                **item,
                "unit_price": material["unit_price"],
                "gst": material["gst"],
                "extra": material["extra"],
                "amount_per_kg": material["amount_per_kg"],
            }
        )

    return enriched


def build_formulation_response(document: dict, without_for: bool = True) -> FormulationRead:
    versions = document.get("versions", [])
    current_material_ids = collect_material_ids_from_items(document["items"])
    current_material_ids.extend(
        material_id
        for material_id in collect_material_ids_from_items(document.get("coating_items", []))
        if material_id not in current_material_ids
    )

    needs_material_lookup = bool(current_material_ids) or any(
        item_needs_material_enrichment(item)
        for version in versions
        for item in [*version.get("items", []), *version.get("coating_items", [])]
    )
    materials_by_id = {}
    if needs_material_lookup:
        material_ids = list(current_material_ids)
        for version in versions:
            for material_id in collect_material_ids_from_items(version.get("items", [])):
                if material_id not in material_ids:
                    material_ids.append(material_id)
            for material_id in collect_material_ids_from_items(version.get("coating_items", [])):
                if material_id not in material_ids:
                    material_ids.append(material_id)
        materials_by_id = get_material_map_from_ids(material_ids)

    enriched_document = {
        **document,
        "items": [
            {
                **item,
                "unit_price": materials_by_id[item["material_id"]]["unit_price"],
                "gst": materials_by_id[item["material_id"]]["gst"],
                "extra": materials_by_id[item["material_id"]]["extra"],
                "amount_per_kg": materials_by_id[item["material_id"]]["amount_per_kg"],
            }
            for item in document["items"]
        ],
        "coating_items": [
            {
                **item,
                "unit_price": materials_by_id[item["material_id"]]["unit_price"],
                "gst": materials_by_id[item["material_id"]]["gst"],
                "extra": materials_by_id[item["material_id"]]["extra"],
                "amount_per_kg": materials_by_id[item["material_id"]]["amount_per_kg"],
            }
            for item in document.get("coating_items", [])
        ],
        "versions": [
            {
                **version,
                "items": enrich_formulation_items(version.get("items", []), materials_by_id),
                "coating_items": enrich_formulation_items(version.get("coating_items", []), materials_by_id),
            }
            for version in versions
        ],
    }

    metrics = calculate_formulation_metrics(
        formulation_type=enriched_document["type"],
        fixed_profit=enriched_document["fixed_profit"],
        without_for=without_for,
        items=enriched_document["items"],
        coating_percent=enriched_document.get("coating_percent", 0),
        coating_items=enriched_document.get("coating_items", []),
        materials_by_id=materials_by_id,
    )
    return FormulationRead.model_validate(serialize_formulation(enriched_document, metrics))


def csv_response(filename: str, rows: list[list]):
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerows(rows)
    return Response(
        content=buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/materials", response_model=MaterialRead, status_code=201)
def create_material(payload: MaterialCreate):
    collection = get_materials_collection()
    existing = collection.find_one({"name": payload.name, "archived_at": None})
    if existing:
        raise HTTPException(status_code=400, detail="Material with this name already exists.")

    amount_per_kg = calculate_material_amount_per_kg(
        unit_price=payload.unit_price,
        gst=payload.gst,
        extra=payload.extra,
    )
    now = utc_now()
    document = {
        "name": payload.name,
        "unit_price": payload.unit_price,
        "gst": payload.gst,
        "extra": payload.extra,
        "amount_per_kg": amount_per_kg,
        "created_at": now,
        "updated_at": now,
        "archived_at": None,
    }
    result = collection.insert_one(document)
    document["_id"] = result.inserted_id
    return MaterialRead.model_validate(serialize_material(document))


@app.get("/materials", response_model=list[MaterialRead])
def list_materials(include_archived: bool = Query(default=False)):
    collection = get_materials_collection()
    query = {} if include_archived else {"archived_at": None}
    materials = collection.find(query).sort("created_at", 1)
    return [MaterialRead.model_validate(serialize_material(material)) for material in materials]


@app.get("/exports/materials.csv")
def export_materials_csv(include_archived: bool = Query(default=False)):
    materials = list_materials(include_archived=include_archived)
    rows = [[
        "Name",
        "Unit Price",
        "GST",
        "Extra",
        "Amount / Kg",
        "Created At",
        "Updated At",
        "Archived",
    ]]
    for material in materials:
        rows.append([
            material.name,
            material.unit_price,
            material.gst,
            material.extra,
            material.amount_per_kg,
            material.created_at.isoformat(),
            material.updated_at.isoformat(),
            "Yes" if material.is_archived else "No",
        ])
    return csv_response("materials.csv", rows)


@app.get("/materials/{material_id}", response_model=MaterialRead)
def get_material(material_id: str):
    collection = get_materials_collection()
    material = collection.find_one({"_id": parse_object_id(material_id, "material_id")})
    if not material:
        raise HTTPException(status_code=404, detail="Material not found.")
    return MaterialRead.model_validate(serialize_material(material))


@app.put("/materials/{material_id}", response_model=MaterialRead)
def update_material(material_id: str, payload: MaterialCreate):
    collection = get_materials_collection()
    object_id = parse_object_id(material_id, "material_id")
    existing = collection.find_one({"_id": object_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Material not found.")
    duplicate = collection.find_one(
        {"_id": {"$ne": object_id}, "name": payload.name, "archived_at": None}
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Material with this name already exists.")

    amount_per_kg = calculate_material_amount_per_kg(
        unit_price=payload.unit_price,
        gst=payload.gst,
        extra=payload.extra,
    )
    collection.update_one(
        {"_id": object_id},
        {
            "$set": {
                "name": payload.name,
                "unit_price": payload.unit_price,
                "gst": payload.gst,
                "extra": payload.extra,
                "amount_per_kg": amount_per_kg,
                "updated_at": utc_now(),
            }
        },
    )

    updated = collection.find_one({"_id": object_id})
    return MaterialRead.model_validate(serialize_material(updated))


@app.post("/materials/{material_id}/archive", response_model=MaterialRead)
def archive_material(material_id: str):
    collection = get_materials_collection()
    object_id = parse_object_id(material_id, "material_id")
    existing = collection.find_one({"_id": object_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Material not found.")

    now = utc_now()
    collection.update_one({"_id": object_id}, {"$set": {"archived_at": now, "updated_at": now}})
    updated = collection.find_one({"_id": object_id})
    return MaterialRead.model_validate(serialize_material(updated))


@app.post("/materials/{material_id}/restore", response_model=MaterialRead)
def restore_material(material_id: str):
    collection = get_materials_collection()
    object_id = parse_object_id(material_id, "material_id")
    existing = collection.find_one({"_id": object_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Material not found.")

    collection.update_one({"_id": object_id}, {"$set": {"archived_at": None, "updated_at": utc_now()}})
    updated = collection.find_one({"_id": object_id})
    return MaterialRead.model_validate(serialize_material(updated))


@app.post("/formulations/preview", response_model=FormulationSummary)
def preview_formulation(payload: FormulationPreviewRequest):
    material_ids = [item.material_id for item in payload.items]
    material_ids.extend(item.material_id for item in payload.coating_items)
    materials_by_id = get_material_map_from_ids(material_ids)
    metrics = calculate_formulation_metrics(
        formulation_type=payload.type,
        fixed_profit=payload.fixed_profit,
        without_for=True,
        items=[item.model_dump() for item in payload.items],
        coating_percent=payload.coating_percent,
        coating_items=[item.model_dump() for item in payload.coating_items],
        materials_by_id=materials_by_id,
    )
    return FormulationSummary.model_validate(
        {
            "type": payload.type,
            **metrics,
        }
    )


@app.post("/formulations", response_model=FormulationRead, status_code=201)
def create_formulation(payload: FormulationCreate):
    collection = get_formulations_collection()
    existing = collection.find_one({"name": payload.name, "archived_at": None})
    if existing:
        raise HTTPException(status_code=400, detail="Formulation with this name already exists.")

    material_ids = [item.material_id for item in payload.items]
    material_ids.extend(item.material_id for item in payload.coating_items)
    materials_by_id = get_material_map_from_ids(material_ids)
    stored_items = build_stored_formulation_items(payload.items, materials_by_id)
    stored_coating_items = build_stored_formulation_items(payload.coating_items, materials_by_id)
    now = utc_now()
    document = {
        "name": payload.name,
        "type": payload.type,
        "season": payload.season,
        "items": stored_items,
        "coating_percent": payload.coating_percent,
        "coating_items": stored_coating_items,
        "fixed_profit": payload.fixed_profit,
        "created_at": now,
        "updated_at": now,
        "archived_at": None,
    }
    document["versions"] = [build_formulation_version(document, version=1)]
    result = collection.insert_one(document)
    document["_id"] = result.inserted_id
    return build_formulation_response(document)


@app.get("/formulations", response_model=list[FormulationRead])
def list_formulations(
    type: Optional[str] = Query(default=None),
    season: Optional[str] = Query(default=None),
    without_for: bool = Query(default=True),
    name: Optional[str] = Query(default=None),
    include_archived: bool = Query(default=False),
):
    return fetch_formulations(
        type=type,
        season=season,
        without_for=without_for,
        name=name,
        include_archived=include_archived,
    )


def fetch_formulations(
    type: Optional[str] = None,
    season: Optional[str] = None,
    without_for: bool = True,
    name: Optional[str] = None,
    include_archived: bool = False,
):
    collection = get_formulations_collection()
    query = {} if include_archived else {"archived_at": None}

    if type:
        query["type"] = type
    if season:
        query["season"] = season
    if name:
        query["name"] = {"$regex": name, "$options": "i"}

    formulations = collection.find(query).sort("created_at", -1)
    return [build_formulation_response(formulation, without_for=without_for) for formulation in formulations]


@app.get("/exports/formulations.csv")
def export_formulations_csv(
    type: Optional[str] = Query(default=None),
    season: Optional[str] = Query(default=None),
    without_for: bool = Query(default=True),
    name: Optional[str] = Query(default=None),
    include_archived: bool = Query(default=False),
    all: bool = Query(default=False),
):
    formulations = fetch_formulations(
        type=None if all else type,
        season=None if all else season,
        without_for=without_for,
        name=None if all else name,
        include_archived=True if all else include_archived,
    )
    rows = [[
        "Name",
        "Type",
        "Season",
        "Final Cost",
        "Sale Price",
        "Profit",
        "Profit % Cost",
        "Profit % Sale",
        "Created At",
        "Updated At",
        "Archived",
    ]]
    for formulation in formulations:
        rows.append([
            formulation.name,
            formulation.type,
            formulation.season,
            formulation.final_cost,
            formulation.sale_price,
            formulation.profit,
            formulation.profit_percent_cost,
            formulation.profit_percent_sale,
            formulation.created_at.isoformat(),
            formulation.updated_at.isoformat(),
            "Yes" if formulation.is_archived else "No",
        ])
    return csv_response("formulations.csv", rows)


@app.get("/exports/formulations/{formulation_id}.csv")
def export_formulation_detail_csv(
    formulation_id: str,
    without_for: bool = Query(default=True),
):
    formulation = get_formulation(formulation_id=formulation_id, without_for=without_for)
    rows = [
        ["Name", formulation.name],
        ["Type", formulation.type],
        ["Season", formulation.season],
        ["Final Cost", formulation.final_cost],
        ["Sale Price", formulation.sale_price],
        ["Profit", formulation.profit],
        ["Profit % Cost", formulation.profit_percent_cost],
        ["Profit % Sale", formulation.profit_percent_sale],
        ["Fixed Profit", formulation.fixed_profit],
        [],
        ["Base Materials"],
        ["Material", "Quantity", "Unit Price", "GST", "Extra", "Amount / Kg"],
    ]
    for item in formulation.items:
        rows.append([item.name, item.quantity, item.unit_price, item.gst, item.extra, item.amount_per_kg])

    if formulation.coating_items:
        rows.extend([
            [],
            [f"Coating Materials ({formulation.coating_percent}%)"],
            ["Material", "Quantity", "Unit Price", "GST", "Extra", "Amount / Kg"],
        ])
        for item in formulation.coating_items:
            rows.append([item.name, item.quantity, item.unit_price, item.gst, item.extra, item.amount_per_kg])

    return csv_response(f"{formulation.name}.csv", rows)


@app.get("/exports/formulations-details.csv")
def export_all_formulation_details_csv(
    without_for: bool = Query(default=True),
):
    formulations = fetch_formulations(without_for=without_for)
    rows: list[list] = []

    for index, formulation in enumerate(formulations, start=1):
        rows.extend(
            [
                [f"Formulation {index}", formulation.name],
                ["Type", formulation.type],
                ["Season", formulation.season],
                ["Total Qty", formulation.total_qty],
                ["Total Amount", formulation.total_amount],
                ["Price / Kg", formulation.price_per_kg],
                ["Misc", formulation.misc],
                ["Final Cost", formulation.final_cost],
                ["Sale Price", formulation.sale_price],
                ["Profit", formulation.profit],
                ["Profit % Cost", formulation.profit_percent_cost],
                ["Profit % Sale", formulation.profit_percent_sale],
                ["Fixed Profit", formulation.fixed_profit],
                ["Created At", formulation.created_at.isoformat()],
                ["Updated At", formulation.updated_at.isoformat()],
                ["Archived", "Yes" if formulation.is_archived else "No"],
                [],
                ["Base Materials"],
                ["Material", "Quantity", "Unit Price", "GST", "Extra", "Amount / Kg"],
            ]
        )
        for item in formulation.items:
            rows.append([item.name, item.quantity, item.unit_price, item.gst, item.extra, item.amount_per_kg])

        if formulation.coating_items:
            rows.extend(
                [
                    [],
                    [f"Coating Materials ({formulation.coating_percent}%)"],
                    ["Material", "Quantity", "Unit Price", "GST", "Extra", "Amount / Kg"],
                ]
            )
            for item in formulation.coating_items:
                rows.append([item.name, item.quantity, item.unit_price, item.gst, item.extra, item.amount_per_kg])

        rows.extend([[], []])

    return csv_response("formulations-details.csv", rows)


@app.get("/formulations/{formulation_id}", response_model=FormulationRead)
def get_formulation(
    formulation_id: str,
    without_for: bool = Query(default=True),
):
    collection = get_formulations_collection()
    formulation = collection.find_one({"_id": parse_object_id(formulation_id, "formulation_id")})
    if not formulation:
        raise HTTPException(status_code=404, detail="Formulation not found.")
    return build_formulation_response(formulation, without_for=without_for)


@app.put("/formulations/{formulation_id}", response_model=FormulationRead)
def update_formulation(formulation_id: str, payload: FormulationCreate):
    collection = get_formulations_collection()
    object_id = parse_object_id(formulation_id, "formulation_id")
    existing = collection.find_one({"_id": object_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Formulation not found.")
    duplicate = collection.find_one(
        {"_id": {"$ne": object_id}, "name": payload.name, "archived_at": None}
    )
    if duplicate:
        raise HTTPException(status_code=400, detail="Formulation with this name already exists.")

    material_ids = [item.material_id for item in payload.items]
    material_ids.extend(item.material_id for item in payload.coating_items)
    materials_by_id = get_material_map_from_ids(material_ids)
    stored_items = build_stored_formulation_items(payload.items, materials_by_id)
    stored_coating_items = build_stored_formulation_items(payload.coating_items, materials_by_id)
    updated_at = utc_now()
    version_document = {
        "name": payload.name,
        "type": payload.type,
        "season": payload.season,
        "items": stored_items,
        "coating_percent": payload.coating_percent,
        "coating_items": stored_coating_items,
        "fixed_profit": payload.fixed_profit,
        "updated_at": updated_at,
    }
    version_count = len(existing.get("versions", [])) + 1

    collection.update_one(
        {"_id": object_id},
        {
            "$set": {
                "name": payload.name,
                "type": payload.type,
                "season": payload.season,
                "items": stored_items,
                "coating_percent": payload.coating_percent,
                "coating_items": stored_coating_items,
                "fixed_profit": payload.fixed_profit,
                "updated_at": updated_at,
            },
            "$push": {"versions": build_formulation_version(version_document, version=version_count)},
            "$unset": {"is_for": ""},
        },
    )

    updated = collection.find_one({"_id": object_id})
    return build_formulation_response(updated)


@app.post("/formulations/{formulation_id}/duplicate", response_model=FormulationRead, status_code=201)
def duplicate_formulation(formulation_id: str, payload: FormulationDuplicateRequest):
    collection = get_formulations_collection()
    original = collection.find_one({"_id": parse_object_id(formulation_id, "formulation_id")})
    if not original:
        raise HTTPException(status_code=404, detail="Formulation not found.")
    existing = collection.find_one({"name": payload.name, "archived_at": None})
    if existing:
        raise HTTPException(status_code=400, detail="Formulation with this name already exists.")

    now = utc_now()
    document = {
        "name": payload.name,
        "type": original["type"],
        "season": original["season"],
        "items": original["items"],
        "coating_percent": original.get("coating_percent", 0),
        "coating_items": original.get("coating_items", []),
        "fixed_profit": original["fixed_profit"],
        "created_at": now,
        "updated_at": now,
        "archived_at": None,
    }
    document["versions"] = [build_formulation_version(document, version=1)]
    result = collection.insert_one(document)
    document["_id"] = result.inserted_id
    return build_formulation_response(document)


@app.post("/formulations/{formulation_id}/archive", response_model=FormulationRead)
def archive_formulation(formulation_id: str):
    collection = get_formulations_collection()
    object_id = parse_object_id(formulation_id, "formulation_id")
    formulation = collection.find_one({"_id": object_id})
    if not formulation:
        raise HTTPException(status_code=404, detail="Formulation not found.")

    now = utc_now()
    collection.update_one({"_id": object_id}, {"$set": {"archived_at": now, "updated_at": now}})
    updated = collection.find_one({"_id": object_id})
    return build_formulation_response(updated)


@app.post("/formulations/{formulation_id}/restore", response_model=FormulationRead)
def restore_formulation(formulation_id: str):
    collection = get_formulations_collection()
    object_id = parse_object_id(formulation_id, "formulation_id")
    formulation = collection.find_one({"_id": object_id})
    if not formulation:
        raise HTTPException(status_code=404, detail="Formulation not found.")

    collection.update_one({"_id": object_id}, {"$set": {"archived_at": None, "updated_at": utc_now()}})
    updated = collection.find_one({"_id": object_id})
    return build_formulation_response(updated)


@app.get("/")
def serve_dashboard():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/materials-page")
def serve_materials_page():
    return FileResponse(FRONTEND_DIR / "materials.html")


@app.get("/add-formulation")
def serve_add_formulation_page():
    return FileResponse(FRONTEND_DIR / "add_formulation.html")


app.mount("/frontend", StaticFiles(directory=STATIC_DIR), name="frontend")
