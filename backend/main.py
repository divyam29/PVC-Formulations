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


def serialize_material(document: dict) -> dict:
    return {
        "id": str(document["_id"]),
        "name": document["name"],
        "unit_price": document["unit_price"],
        "gst": document["gst"],
        "extra": document["extra"],
        "amount_per_kg": document["amount_per_kg"],
        "created_at": document["created_at"],
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
        **metrics,
    }


def parse_object_id(value: str, field_name: str = "id") -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}.")
    return ObjectId(value)


def get_material_map_from_ids(material_ids: list[str]) -> dict[str, dict]:
    collection = get_materials_collection()
    object_ids = [parse_object_id(material_id, "material_id") for material_id in material_ids]
    materials = list(collection.find({"_id": {"$in": object_ids}}))
    materials_by_id = {str(material["_id"]): material for material in materials}

    missing_ids = [material_id for material_id in material_ids if material_id not in materials_by_id]
    if missing_ids:
        raise HTTPException(
            status_code=404,
            detail=f"Materials not found: {', '.join(missing_ids)}",
        )

    return materials_by_id


def build_formulation_response(document: dict, without_for: bool = True) -> FormulationRead:
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
    amount_per_kg = calculate_material_amount_per_kg(
        unit_price=payload.unit_price,
        gst=payload.gst,
        extra=payload.extra,
    )
    document = {
        "name": payload.name,
        "unit_price": payload.unit_price,
        "gst": payload.gst,
        "extra": payload.extra,
        "amount_per_kg": amount_per_kg,
        "created_at": datetime.now(timezone.utc),
    }
    result = collection.insert_one(document)
    document["_id"] = result.inserted_id
    return MaterialRead.model_validate(serialize_material(document))


@app.get("/materials", response_model=list[MaterialRead])
def list_materials():
    collection = get_materials_collection()
    materials = collection.find().sort("created_at", 1)
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
            }
        },
    )

    # Keep stored item labels in formulations aligned with the material master.
    get_formulations_collection().update_many(
        {"items.material_id": material_id},
        {"$set": {"items.$[item].name": payload.name}},
        array_filters=[{"item.material_id": material_id}],
    )

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
    material_ids = [item.material_id for item in payload.items]
    material_ids.extend(item.material_id for item in payload.coating_items)
    materials_by_id = get_material_map_from_ids(material_ids)
    stored_items = []
    stored_coating_items = []

    for item in payload.items:
        material = materials_by_id[item.material_id]
        stored_items.append(
            {
                "material_id": item.material_id,
                "name": material["name"],
                "quantity": item.quantity,
            }
        )

    for item in payload.coating_items:
        material = materials_by_id[item.material_id]
        stored_coating_items.append(
            {
                "material_id": item.material_id,
                "name": material["name"],
                "quantity": item.quantity,
            }
        )

    document = {
        "name": payload.name,
        "type": payload.type,
        "season": payload.season,
        "items": stored_items,
        "coating_percent": payload.coating_percent,
        "coating_items": stored_coating_items,
        "fixed_profit": payload.fixed_profit,
        "created_at": datetime.now(timezone.utc),
    }
    result = collection.insert_one(document)
    document["_id"] = result.inserted_id
    return build_formulation_response(document)


@app.get("/formulations", response_model=list[FormulationRead])
def list_formulations(
    type: Optional[str] = Query(default=None),
    season: Optional[str] = Query(default=None),
    without_for: bool = Query(default=True),
):
    collection = get_formulations_collection()
    query = {}

    if type:
        query["type"] = type
    if season:
        query["season"] = season

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

    material_ids = [item.material_id for item in payload.items]
    material_ids.extend(item.material_id for item in payload.coating_items)
    materials_by_id = get_material_map_from_ids(material_ids)
    stored_items = []
    stored_coating_items = []

    for item in payload.items:
        material = materials_by_id[item.material_id]
        stored_items.append(
            {
                "material_id": item.material_id,
                "name": material["name"],
                "quantity": item.quantity,
            }
        )

    for item in payload.coating_items:
        material = materials_by_id[item.material_id]
        stored_coating_items.append(
            {
                "material_id": item.material_id,
                "name": material["name"],
                "quantity": item.quantity,
            }
        )

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
            },
            "$unset": {"is_for": ""},
        },
    )

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
