from datetime import datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


FormulationType = Literal["Garden", "Braided", "Recycled"]
SeasonType = Literal["Summer", "Winter", "All Weather"]


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
    updated_at: datetime
    archived_at: Optional[datetime] = None
    is_archived: bool = False


class FormulationItemCreate(BaseModel):
    material_id: str = Field(..., min_length=1)
    quantity: float = Field(..., gt=0)


class FormulationCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)
    type: FormulationType
    season: SeasonType
    items: List[FormulationItemCreate] = Field(..., min_length=1)
    coating_percent: float = Field(default=0, ge=0, le=100)
    coating_items: List[FormulationItemCreate] = Field(default_factory=list)
    fixed_profit: float = Field(..., ge=0)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def validate_coating(self):
        has_coating_items = bool(self.coating_items)
        has_coating_percent = self.coating_percent > 0

        if has_coating_items != has_coating_percent:
            raise ValueError("Coating percent and coating materials must be provided together.")

        return self


class FormulationItemStored(BaseModel):
    material_id: str
    name: str
    quantity: float


class FormulationVersionRead(BaseModel):
    version: int
    created_at: datetime
    name: str
    type: FormulationType
    season: SeasonType
    items: List[FormulationItemStored]
    coating_percent: float = 0
    coating_items: List[FormulationItemStored] = Field(default_factory=list)
    fixed_profit: float


class FormulationRead(BaseModel):
    id: str
    name: str
    type: FormulationType
    season: SeasonType
    items: List[FormulationItemStored]
    coating_percent: float = 0
    coating_items: List[FormulationItemStored] = Field(default_factory=list)
    fixed_profit: float
    created_at: datetime
    updated_at: datetime
    archived_at: Optional[datetime] = None
    is_archived: bool = False
    version_count: int = 1
    versions: List[FormulationVersionRead] = Field(default_factory=list)
    total_qty: float
    total_amount: float
    price_per_kg: float
    misc: float
    final_cost: float
    sale_price: float
    profit: float
    profit_percent_cost: float
    profit_percent_sale: float


class FormulationDuplicateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=160)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return value.strip()


class FormulationPreviewRequest(BaseModel):
    type: FormulationType
    coating_percent: float = Field(default=0, ge=0, le=100)
    coating_items: List[FormulationItemCreate] = Field(default_factory=list)
    fixed_profit: float = Field(..., ge=0)
    items: List[FormulationItemCreate] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_coating(self):
        has_coating_items = bool(self.coating_items)
        has_coating_percent = self.coating_percent > 0

        if has_coating_items != has_coating_percent:
            raise ValueError("Coating percent and coating materials must be provided together.")

        return self


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
