from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


FormulationType = Literal["Garden", "Braided", "Recycled"]
SeasonType = Literal["Summer", "Winter"]


class MaterialCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    unit_price: float = Field(..., ge=0)
    gst: float = Field(..., ge=0)
    extra: float

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class MaterialRead(BaseModel):
    id: str
    name: str
    unit_price: float
    gst: float
    extra: float
    amount_per_kg: float
    created_at: datetime


class FormulationItemCreate(BaseModel):
    material_id: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)


class FormulationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    type: FormulationType
    season: SeasonType
    items: List[FormulationItemCreate] = Field(..., min_length=1)
    fixed_profit: float = Field(..., ge=0)
    is_for: bool = True

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class FormulationItemStored(BaseModel):
    material_id: str
    name: str
    quantity: float


class FormulationRead(BaseModel):
    id: str
    name: str
    type: FormulationType
    season: SeasonType
    items: List[FormulationItemStored]
    fixed_profit: float
    is_for: bool
    created_at: datetime
    total_qty: float
    total_amount: float
    price_per_kg: float
    misc: float
    final_cost: float
    sale_price: float
    profit: float
    profit_percent_cost: float
    profit_percent_sale: float


class FormulationPreviewRequest(BaseModel):
    type: FormulationType
    fixed_profit: float = Field(..., ge=0)
    is_for: bool = True
    items: List[FormulationItemCreate] = Field(..., min_length=1)


class FormulationSummary(BaseModel):
    name: Optional[str] = None
    type: FormulationType
    season: Optional[SeasonType] = None
    total_qty: float
    total_amount: float
    price_per_kg: float
    misc: float
    final_cost: float
    sale_price: float
    profit: float
    profit_percent_cost: float
    profit_percent_sale: float
