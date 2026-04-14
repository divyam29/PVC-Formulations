from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from bson import ObjectId
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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


def build_formulation_response(document: dict, without_for: bool = True) -> FormulationRead:
    needs_material_lookup = any("amount_per_kg" not in item for item in document["items"]) or any(
        "amount_per_kg" not in item for item in document.get("coating_items", [])
    )
    materials_by_id = {}
    if needs_material_lookup:
        material_ids = [item["material_id"] for item in document["items"]]
        material_ids.extend(item["material_id"] for item in document.get("coating_items", []))
        materials_by_id = get_material_map_from_ids(material_ids)

    metrics = calculate_formulation_metrics(
        formulation_type=document["type"],
        fixed_profit=document["fixed_profit"],
        without_for=without_for,
        items=document["items"],
        coating_percent=document.get("coating_percent", 0),
        coating_items=document.get("coating_items", []),
        materials_by_id=materials_by_id,
    )
    return FormulationRead.model_validate(serialize_formulation(document, metrics))


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
